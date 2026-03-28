import json
import os
import sqlite3
from abc import ABC, abstractmethod
from contextvars import ContextVar, Token
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from calendar_adapters import get_calendar_adapter, get_calendar_provider_catalog
from mail_adapters import get_mail_adapter, get_provider_catalog

DEFAULT_TENANT_ID = "tenant-primary"
CURRENT_TENANT_ID: ContextVar[str | None] = ContextVar("current_tenant_id", default=None)
MAIL_OAUTH_PROVIDERS = {"gmail-oauth", "microsoft365-oauth"}
CALENDAR_OAUTH_PROVIDERS = {"google-calendar-oauth", "microsoft365-calendar"}
AUTH_FAILURE_MARKERS = (
    "invalid_grant",
    "invalid_client",
    "unauthorized",
    "authoriz",
    "token exchange",
    "access token",
    "refresh token",
    "refresh_token",
    "oauth",
    "expired",
    "revoked",
    "forbidden",
    "401",
    "403",
)


def utcnow() -> str:
    return datetime.now(UTC).isoformat()


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def json_loads(value: str | None, default: Any) -> Any:
    if not value:
        return default
    return json.loads(value)


def json_dumps(value: Any) -> str:
    return json.dumps(value or {})


def slugify(value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value.strip())
    compact = "-".join(part for part in normalized.split("-") if part)
    return compact or "thread"


def field_key(field: dict[str, Any]) -> str:
    if field.get("name"):
        return str(field["name"])
    if field.get("label"):
        return slugify(str(field["label"])).replace("-", "_")
    if field.get("id"):
        return str(field["id"])
    return f"field_{unique_suffix()}"


def unique_suffix() -> str:
    return uuid4().hex[:10]


def normalize_text_content(value: str | None) -> str:
    raw = str(value or "").replace("\r", "\n")
    lines = [" ".join(line.split()) for line in raw.split("\n")]
    compact = "\n".join(line for line in lines if line)
    return compact.strip()


def summarize_excerpt(value: str | None, limit: int = 220) -> str:
    compact = " ".join(normalize_text_content(value).split())
    if len(compact) <= limit:
        return compact
    return compact[: max(0, limit - 3)].rstrip() + "..."


def build_thread_report_text(thread: dict[str, Any], kind: str = "operator") -> str:
    contact = thread.get("contact") or {}
    company = thread.get("company") or {}
    brief = thread.get("brief") or {}
    flags = thread.get("aiFlags") or {}
    cues = brief.get("reasoning_cues") or []
    lines = [
        "Executive Thread Report" if kind == "executive" else "Operator Thread Report",
        f"Thread: {thread.get('subject') or thread.get('generated_title') or 'Untitled thread'}",
        f"Priority: {thread.get('ai_priority') or 'medium'}",
        f"Contact: {' '.join(part for part in [contact.get('first_name'), contact.get('last_name')] if part).strip() or 'No linked contact'}",
        f"Company: {company.get('name') or 'No linked company'}",
        f"Stage: {contact.get('pipeline_stage') or 'Unlinked'}",
        f"Owner: {thread.get('owner') or 'Unassigned'}",
        f"Assignee: {thread.get('assignee') or 'Unassigned'}",
        "",
        "Executive Summary" if kind == "executive" else "Operating Summary",
        brief.get("summary") or thread.get("preview") or "No summary available.",
        "",
        "Recommended Next Step",
        brief.get("recommended_next_step") or "Review the active thread and send the clearest next move.",
        "",
        "Signals",
    ]
    active_flags = [key.replace("_", " ") for key, enabled in flags.items() if enabled]
    lines.append(f"- {'; '.join(active_flags)}" if active_flags else "- No active AI flags")
    lines.extend(["", "Reasoning Cues"])
    lines.append("\n".join(f"- {cue}" for cue in cues) if cues else "- No reasoning cues logged")
    return "\n".join(lines)


def chunk_text_content(value: str | None, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    text = normalize_text_content(value)
    if not text:
        return []
    words = text.split()
    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for word in words:
        additional = len(word) + (1 if current else 0)
        if current and current_len + additional > chunk_size:
            chunk = " ".join(current).strip()
            if chunk:
                chunks.append(chunk)
            if overlap > 0:
                overlap_words: list[str] = []
                overlap_len = 0
                for existing in reversed(current):
                    extra = len(existing) + (1 if overlap_words else 0)
                    if overlap_words and overlap_len + extra > overlap:
                        break
                    overlap_words.insert(0, existing)
                    overlap_len += extra
                current = overlap_words
                current_len = len(" ".join(current))
            else:
                current = []
                current_len = 0
        current.append(word)
        current_len += additional
    final_chunk = " ".join(current).strip()
    if final_chunk:
        chunks.append(final_chunk)
    return chunks


def score_text_match(query: str, values: list[str]) -> tuple[int, list[str]]:
    terms = [term for term in " ".join(str(query or "").lower().split()).split(" ") if term]
    haystacks = [str(value or "").lower() for value in values if str(value or "").strip()]
    if not terms or not haystacks:
        return 0, []
    score = 0
    matched: list[str] = []
    for term in terms:
        term_hits = 0
        for haystack in haystacks:
            term_hits += haystack.count(term)
        if term_hits:
            matched.append(term)
            score += term_hits
    return score, matched


def set_request_tenant_id(tenant_id: str | None) -> Token:
    return CURRENT_TENANT_ID.set(tenant_id or DEFAULT_TENANT_ID)


def reset_request_tenant(token: Token) -> None:
    CURRENT_TENANT_ID.reset(token)


def get_request_tenant_id() -> str:
    return CURRENT_TENANT_ID.get() or DEFAULT_TENANT_ID


def source_config_value(source: dict[str, Any], key: str, default: Any) -> Any:
    config = source.get("config") or {}
    return config.get(key, default)


def sync_selected_calendar_metadata(config: dict[str, Any] | None) -> dict[str, Any]:
    next_config = dict(config or {})
    selected_calendar_id = str(next_config.get("calendar_id") or "").strip()
    if not selected_calendar_id:
        next_config.pop("connected_calendar", None)
        return next_config
    available_calendars = next_config.get("available_calendars")
    if isinstance(available_calendars, list):
        selected = next(
            (
                item
                for item in available_calendars
                if str((item or {}).get("id") or "").strip() == selected_calendar_id
            ),
            None,
        )
        if selected:
            next_config["connected_calendar"] = selected.get("label") or selected_calendar_id
        else:
            next_config.pop("connected_calendar", None)
    return next_config


def disconnected_provider_config(provider: str | None, config: dict[str, Any] | None = None) -> dict[str, Any]:
    next_config = dict(config or {})
    for key in ["refresh_token", "access_token", "last_error", "connected_identity", "connected_calendar", "available_calendars"]:
        next_config.pop(key, None)
    if provider in {"microsoft365-calendar", "google-calendar-oauth"}:
        next_config.pop("user_id", None)
        next_config.pop("calendar_id", None)
    return next_config


def events_overlap(start_a: str | None, end_a: str | None, start_b: str | None, end_b: str | None) -> bool:
    parsed_start_a = parse_utc(start_a)
    parsed_end_a = parse_utc(end_a)
    parsed_start_b = parse_utc(start_b)
    parsed_end_b = parse_utc(end_b)
    if not parsed_start_a or not parsed_end_a or not parsed_start_b or not parsed_end_b:
        return False
    return parsed_start_a < parsed_end_b and parsed_end_a > parsed_start_b


PIPELINE_STAGES = ["New", "Qualified", "Discovery", "Negotiating", "Closed Won"]


def next_pipeline_stage(current: str | None) -> str:
    if current not in PIPELINE_STAGES:
        return PIPELINE_STAGES[0]
    index = PIPELINE_STAGES.index(current)
    return PIPELINE_STAGES[min(index + 1, len(PIPELINE_STAGES) - 1)]


def next_meeting_slot() -> str:
    return (datetime.now(UTC) + timedelta(days=1)).replace(minute=0, second=0, microsecond=0).isoformat()


def default_queue_definitions() -> list[dict[str, Any]]:
    return [
        {"id": "now", "label": "Now"},
        {"id": "needs-reply", "label": "Needs Reply"},
        {"id": "waiting", "label": "Waiting"},
        {"id": "hot-leads", "label": "Hot Leads"},
        {"id": "at-risk", "label": "At Risk"},
        {"id": "scheduled", "label": "Scheduled Follow-ups"},
        {"id": "automated", "label": "Automated"},
        {"id": "closed", "label": "Closed"},
        {"id": "archived", "label": "Archived"},
    ]


class BaseProvider(ABC):
    provider_name = "base"

    @abstractmethod
    def health(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_contacts(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_contact(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_contact(self, contact_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_companies(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list_tags(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_brain_profile(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_brain_profile(self, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_brain_sources(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_brain_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_brain_source(self, source_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_brain_items(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_brain_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_brain_item(self, item_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_brain_item(self, item_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_brain_links(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_brain_link(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_brain_link(self, link_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_brain_ingests(self, source_id: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def ingest_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def search_brain_memory(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_form_by_slug(self, slug: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    def get_form_by_id(self, form_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    def list_form_folders(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_form_folder(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_form_folder(self, folder_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_forms(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_form(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_form(self, form_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_form(self, form_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_cms_tables(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list_cms_table_data(self, slug: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def submit_form(self, form_id: str, form_data: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_contact_activities(self, contact_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_contact_activity(self, contact_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_flows(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_flow(self, flow_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    def save_flow(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def save_flow_draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_flow_draft(self, draft_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    def delete_flow_draft(self, draft_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_form_submissions(self, contact_id: str | None = None) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list_orders(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list_mailboxes(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_mailbox(
        self,
        name: str,
        address: str,
        provider: str = "local-stub",
        inbound_enabled: bool = True,
        outbound_enabled: bool = True,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_mailbox(
        self,
        mailbox_id: str,
        updates: dict[str, Any],
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_mailbox(self, mailbox_id: str, fallback_mailbox_id: str | None = None) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def disconnect_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_mail_events(self, mailbox_id: str | None = None, thread_id: str | None = None) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list_calendar_events(self, thread_id: str | None = None) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_calendar_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_calendar_event(self, event_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_calendar_event(self, event_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_calendars(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def list_booking_types(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_booking_type(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_booking_type(self, booking_type_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_booking_type(self, booking_type_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def list_calendar_sources(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_calendar_provider_catalog(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def create_calendar_source(
        self,
        name: str,
        provider: str = "local-stub",
        sync_direction: str = "two-way",
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_calendar_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def delete_calendar_source(self, source_id: str, fallback_source_id: str | None = None) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def disconnect_calendar_source(self, source_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def test_calendar_source(self, source_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_calendar_source_calendars(self, source_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def sync_calendar_source(self, source_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def push_calendar_event(self, event_id: str, source_id: str | None = None) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def import_calendar_source(self, source_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def reconcile_calendar_event(self, event_id: str, strategy: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_mail_provider_catalog(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def test_mailbox_connection(self, mailbox_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def sync_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def ingest_mail_message(
        self,
        mailbox_id: str,
        subject: str,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def send_thread_via_mailbox(
        self,
        thread_id: str,
        body: str,
        mailbox_id: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str | None = None,
        recipients: list[str] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_comms_snapshot(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def create_thread(
        self,
        subject: str,
        channel_type: str = "email",
        contact_id: str | None = None,
        company_id: str | None = None,
        body: str = "",
        status: str = "new",
        assignee: str = "ECHO",
        mailbox_id: str | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def open_thread_for_contact(
        self,
        contact_id: str,
        channel_type: str = "email",
        subject: str | None = None,
        body: str = "",
        force_new: bool = False,
        mailbox_id: str | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def send_thread_message(
        self,
        thread_id: str,
        body: str,
        channel_type: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str = "mission@aiocrm.local",
        recipients: list[str] | None = None,
        direction: str = "outbound",
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_thread_status(self, thread_id: str, status: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def assign_thread(self, thread_id: str, assignee_name: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def update_thread_mailbox(self, thread_id: str, mailbox_id: str) -> dict[str, Any]:
        raise NotImplementedError

    def _mailbox_health_summary(self, mailbox: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
        latest_event = events[0] if events else None
        latest_test = next((event for event in events if event["event_type"] == "mailbox.tested"), None)
        latest_failure = next((event for event in events if event["event_type"] == "mail.failed"), None)
        synced_at = parse_utc(mailbox.get("last_synced_at"))
        state = "healthy"
        label = "Healthy"
        detail = "Inbound and outbound flows look ready."

        if mailbox.get("status") in {"disconnected"}:
            state = "limited"
            label = "Not Connected"
            detail = "No live mailbox is connected for this workspace."
        elif mailbox.get("status") in {"needs_config", "error"}:
            state = "attention"
            label = "Needs Config"
            detail = latest_test.get("payload", {}).get("message") if latest_test else "Mailbox configuration needs attention."
        elif not mailbox.get("inbound_enabled") and not mailbox.get("outbound_enabled"):
            state = "limited"
            label = "Paused"
            detail = "Inbound and outbound are disabled."
        elif not mailbox.get("inbound_enabled") or not mailbox.get("outbound_enabled"):
            state = "limited"
            label = "Partial"
            detail = "Only part of this mailbox is enabled."
        elif mailbox.get("status") == "ready":
            state = "limited"
            label = "Ready to Test"
            detail = "Configuration is present, but no connection test has completed yet."
        elif latest_failure:
            state = "attention"
            label = "Delivery Risk"
            detail = latest_failure.get("payload", {}).get("message") or "A recent outbound delivery failed."
        elif synced_at and (datetime.now(UTC) - synced_at).total_seconds() > 172800:
            state = "attention"
            label = "Sync Stale"
            detail = "No mailbox sync has completed in the last 48 hours."
        elif latest_test:
            detail = latest_test.get("payload", {}).get("message") or detail

        return {
            "state": state,
            "label": label,
            "detail": detail,
            "last_event_at": latest_event.get("created_at") if latest_event else None,
            "last_tested_at": latest_test.get("created_at") if latest_test else None,
        }

    @staticmethod
    def _has_config_value(config: dict[str, Any] | None, key: str) -> bool:
        return bool(str((config or {}).get(key) or "").strip())

    @staticmethod
    def _last_error_text(record: dict[str, Any]) -> str:
        config = record.get("config") or {}
        return str(config.get("last_error") or record.get("last_error") or "").strip()

    def _is_auth_failure_error(self, message: str | None) -> bool:
        lowered = str(message or "").strip().lower()
        return bool(lowered) and any(marker in lowered for marker in AUTH_FAILURE_MARKERS)

    def _canonical_mailbox_status(self, mailbox: dict[str, Any]) -> str:
        provider = str(mailbox.get("provider") or "").strip()
        raw_status = str(mailbox.get("status") or "").strip().lower()
        config = mailbox.get("config") or {}

        if provider in {"", "local-stub", "not-connected"} or raw_status == "disconnected":
            return "disconnected"
        if raw_status == "unauthorized":
            return "unauthorized"
        if provider in MAIL_OAUTH_PROVIDERS and not self._has_config_value(config, "refresh_token"):
            return "reconnect_required"
        if self._is_auth_failure_error(self._last_error_text(mailbox)):
            return "unauthorized"

        validation = get_mail_adapter(provider).validate_mailbox(
            {
                "provider": provider,
                "config": config,
                "address": mailbox.get("address"),
                "inbound_enabled": mailbox.get("inbound_enabled", True),
                "outbound_enabled": mailbox.get("outbound_enabled", True),
            }
        )
        if not validation["ok"] or raw_status in {"needs_config", "error", "invalid"}:
            return "needs_config"
        return "connected"

    def _canonical_calendar_source_status(self, source: dict[str, Any]) -> str:
        provider = str(source.get("provider") or "").strip()
        raw_status = str(source.get("status") or "").strip().lower()
        config = source.get("config") or {}

        if provider in {"", "local-stub", "not-connected"} or raw_status == "disconnected":
            return "disconnected"
        if raw_status == "unauthorized":
            return "unauthorized"
        if provider in CALENDAR_OAUTH_PROVIDERS and not self._has_config_value(config, "refresh_token"):
            return "reconnect_required"
        if self._is_auth_failure_error(self._last_error_text(source)):
            return "unauthorized"

        validation = get_calendar_adapter(provider).validate_source(
            {
                "provider": provider,
                "config": config,
                "name": source.get("name"),
                "sync_direction": source.get("sync_direction"),
            }
        )
        if not validation["ok"] or raw_status in {"needs_config", "error", "invalid"}:
            return "needs_config"
        return "connected"

    def _annotate_mailbox_status_canonical(self, mailbox: dict[str, Any]) -> dict[str, Any]:
        return {**mailbox, "status_canonical": self._canonical_mailbox_status(mailbox)}

    def _annotate_calendar_source_status_canonical(self, source: dict[str, Any]) -> dict[str, Any]:
        return {**source, "status_canonical": self._canonical_calendar_source_status(source)}

    def _summarize_mailboxes(
        self,
        mailboxes: list[dict[str, Any]],
        threads: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        queue_ids = [queue["id"] for queue in default_queue_definitions()]
        threads_by_mailbox: dict[str, list[dict[str, Any]]] = {}
        events_by_mailbox: dict[str, list[dict[str, Any]]] = {}

        for thread in threads:
            threads_by_mailbox.setdefault(thread["mailbox_id"], []).append(thread)
        for event in events:
            events_by_mailbox.setdefault(event["mailbox_id"], []).append(event)

        summaries: list[dict[str, Any]] = []
        for mailbox in sorted(mailboxes, key=lambda item: (item.get("name") or "").lower()):
            effective_mailbox = dict(mailbox)
            if effective_mailbox.get("provider") == "local-stub":
                effective_mailbox["provider"] = "not-connected"
                effective_mailbox["status"] = "disconnected"
            mailbox_threads = threads_by_mailbox.get(mailbox["id"], [])
            queue_counts = {
                queue_id: sum(1 for thread in mailbox_threads if queue_id in (thread.get("queueIds") or []))
                for queue_id in queue_ids
            }
            stats = {
                "thread_count": len(mailbox_threads),
                "active_count": sum(1 for thread in mailbox_threads if thread.get("status") != "closed"),
                "new_count": sum(1 for thread in mailbox_threads if thread.get("status") == "new"),
                "action_required_count": queue_counts.get("now", 0),
                "needs_reply_count": queue_counts.get("needs-reply", 0),
                "waiting_count": queue_counts.get("waiting", 0),
                "hot_lead_count": queue_counts.get("hot-leads", 0),
                "at_risk_count": queue_counts.get("at-risk", 0),
                "scheduled_count": queue_counts.get("scheduled", 0),
                "automated_count": queue_counts.get("automated", 0),
                "closed_count": queue_counts.get("closed", 0),
            }
            latest_thread = max(mailbox_threads, key=lambda item: item.get("last_activity_at") or "", default=None)
            summaries.append(
                self._annotate_mailbox_status_canonical(
                    self.mail_adapter.describe_mailbox(
                        {
                            **effective_mailbox,
                            "stats": stats,
                            "queue_counts": queue_counts,
                            "health": self._mailbox_health_summary(effective_mailbox, events_by_mailbox.get(mailbox["id"], [])),
                            "latest_thread_at": latest_thread.get("last_activity_at") if latest_thread else None,
                        }
                    )
                )
            )
        return summaries

    def _summarize_calendar_sources(
        self,
        sources: list[dict[str, Any]],
        events: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        summaries: list[dict[str, Any]] = []
        for source in sorted(sources, key=lambda item: (item.get("name") or "").lower()):
            effective_source = dict(source)
            if effective_source.get("provider") == "local-stub":
                effective_source["provider"] = "not-connected"
                effective_source["status"] = "disconnected"
            source_events = [event for event in events if (event.get("source_id") or "calendar-source-local") == source["id"]]
            synced_count = sum(1 for event in source_events if event.get("sync_status") in {"synced", "local"})
            imported_count = sum(1 for event in source_events if event.get("sync_status") == "imported")
            conflict_count = sum(1 for event in source_events if event.get("conflict_state") == "review")
            authority_mode = source_config_value(source, "authority_mode", "local-first")
            import_policy = source_config_value(source, "import_policy", "review")
            summaries.append(
                self._annotate_calendar_source_status_canonical(
                    {
                        **get_calendar_adapter(source.get("provider")).describe_source(source),
                        **({"provider": "not-connected"} if source.get("provider") == "local-stub" else {}),
                        "authority_mode": authority_mode,
                        "import_policy": import_policy,
                        "event_counts": {
                            "total": len(source_events),
                            "synced": synced_count,
                            "imported": imported_count,
                            "conflicts": conflict_count,
                            "pending": max(len(source_events) - synced_count, 0),
                        },
                        "health": {
                            "state": "healthy" if effective_source.get("status") == "connected" else "attention" if effective_source.get("status") == "needs_config" else "limited",
                            "label": "Connected" if effective_source.get("status") == "connected" else "Needs Config" if effective_source.get("status") == "needs_config" else "Not Connected",
                            "detail": (
                                f"Authority {authority_mode}. Import policy {import_policy}. {conflict_count} conflicts awaiting review."
                                if conflict_count
                                else f"Authority {authority_mode}. Import policy {import_policy}. Calendar source is ready for export."
                                if effective_source.get("status") == "connected"
                                else "Complete configuration and run a test."
                                if effective_source.get("status") == "needs_config"
                                else "No calendar source is connected yet."
                            ),
                        },
                    }
                )
            )
        return summaries

    def _calendar_import_metadata(
        self,
        source: dict[str, Any],
        imported_event: dict[str, Any],
        existing_events: list[dict[str, Any]],
        *,
        event_id: str | None = None,
    ) -> dict[str, Any]:
        authority_mode = source_config_value(source, "authority_mode", "local-first")
        import_policy = source_config_value(source, "import_policy", "review")
        has_overlap = any(
            candidate.get("id") != event_id
            and candidate.get("status") not in {"cancelled", "completed"}
            and events_overlap(
                imported_event.get("start_time"),
                imported_event.get("end_time"),
                candidate.get("start_time"),
                candidate.get("end_time"),
            )
            for candidate in existing_events
        )
        if authority_mode == "mirror":
            return {
                "authority_mode": authority_mode,
                "conflict_state": "mirrored",
                "sync_status": "imported",
                "sync_note": "Imported as a mirrored external hold; local schedule stays authoritative.",
            }
        if has_overlap or import_policy == "review":
            return {
                "authority_mode": authority_mode,
                "conflict_state": "review",
                "sync_status": "conflict",
                "sync_note": "Imported event needs review before it can influence the local schedule.",
            }
        return {
            "authority_mode": authority_mode,
            "conflict_state": "clear",
            "sync_status": "imported",
            "sync_note": "Imported event is staged locally with no active conflicts.",
        }

    @abstractmethod
    def summarize_thread(self, thread_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def create_thread_draft(self, thread_id: str, mode: str = "reply") -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def apply_thread_ai_result(
        self,
        thread_id: str,
        mode: str,
        suggestion: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def create_deal_from_thread(self, thread_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def advance_thread_stage(self, thread_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def schedule_thread_meeting(self, thread_id: str, scheduled_at: str | None = None) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def save_ai_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_ai_run(self, run_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    def update_ai_run(self, run_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def list_ai_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def claim_due_ai_runs(self, pause_reason: str = "delay", limit: int = 10, lock_seconds: int = 60) -> list[dict[str, Any]]:
        raise NotImplementedError



class MockProvider(BaseProvider):
    provider_name = "mock"

    def __init__(self) -> None:
        self.mail_adapter = get_mail_adapter(self.provider_name)
        self.calendar_adapter = get_calendar_adapter("local-stub")
        now = utcnow()
        self.tags = [
            {"id": "tag-vip", "name": "VIP", "color": "#8b5cf6", "type": "contact", "usage_count": 5, "created_at": now},
            {"id": "tag-hot", "name": "Hot Lead", "color": "#ef4444", "type": "contact", "usage_count": 8, "created_at": now},
            {"id": "tag-customer", "name": "Customer", "color": "#10b981", "type": "contact", "usage_count": 12, "created_at": now},
        ]
        self.companies = [
            {"id": "company-techcorp", "name": "TechCorp Solutions", "industry": "Technology", "size": "51-200", "website": "https://techcorp.com", "owner": "AIO Flow"},
            {"id": "company-finserve", "name": "FinServe Inc", "industry": "Finance", "size": "201-500", "website": "https://finserve.com", "owner": "AIO Flow"},
            {"id": "company-edulearn", "name": "EduLearn Platform", "industry": "Education", "size": "51-200", "website": "https://edulearn.com", "owner": "Adam B."},
        ]
        self.contacts = [
            {
                "id": "contact-jenna",
                "contact_id": "CNT-001",
                "organization_id": "org-1",
                "first_name": "Jenna",
                "last_name": "Best",
                "email": "jennalarinbest@gmail.com",
                "phone": "+1 (555) 123-4567",
                "company": "TechCorp Solutions",
                "company_id": "company-techcorp",
                "title": "Marketing Director",
                "department": "Marketing",
                "owner": "AIO Flow",
                "source": "Website Form",
                "status": "customer",
                "lead_score": 92,
                "quality": "hot",
                "engagement": "high",
                "tags": ["VIP", "Customer"],
                "last_contacted_at": now,
                "pipeline_stage": "Closed Won",
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
            },
            {
                "id": "contact-sarah",
                "contact_id": "CNT-002",
                "organization_id": "org-1",
                "first_name": "Sarah",
                "last_name": "Chen",
                "email": "sarah.chen@finserve.com",
                "phone": "+1 (555) 111-2222",
                "company": "FinServe Inc",
                "company_id": "company-finserve",
                "title": "VP of Operations",
                "department": "Operations",
                "owner": "AIO Flow",
                "source": "Conference",
                "status": "customer",
                "lead_score": 95,
                "quality": "hot",
                "engagement": "high",
                "tags": ["VIP", "Customer"],
                "last_contacted_at": now,
                "pipeline_stage": "Closed Won",
                "created_at": now,
                "updated_at": now,
                "deleted_at": None,
            },
        ]
        self.forms = [
            {
                "id": "form-contact",
                "name": "Contact Form",
                "folder_id": "form-folder-default",
                "slug": "contact_form",
                "description": "Get in touch with us for any questions or inquiries",
                "schema": [
                    {"id": "f1", "name": "full_name", "label": "Full Name", "type": "text", "required": True, "placeholder": "John Doe", "map_to_contact": "first_name", "is_identifier": False},
                    {"id": "f2", "name": "email", "label": "Email Address", "type": "email", "required": True, "placeholder": "john@example.com", "map_to_contact": "email", "is_identifier": True},
                    {"id": "f3", "name": "phone", "label": "Phone Number", "type": "phone", "required": False, "placeholder": "+1 (555) 000-0000", "map_to_contact": "phone", "is_identifier": False},
                    {"id": "f4", "name": "message", "label": "Message", "type": "textarea", "required": True, "placeholder": "How can we help you?", "map_to_contact": None, "is_identifier": False},
                ],
                "settings": {
                    "create_contact": True,
                    "update_contact": True,
                    "webhook_url": "",
                    "notification_email": "contact@aioagency.com",
                    "redirect_url": "",
                    "thank_you_message": "Thank you for contacting us! We'll get back to you within 24 hours.",
                },
                "is_active": True,
                "responses_count": 0,
                "last_response_at": None,
                "created_at": now,
                "updated_at": now,
            }
        ]
        self.brain_profile = {
            "id": "brain-profile-primary",
            "tenant_id": DEFAULT_TENANT_ID,
            "company_name": "AIO CRM Workspace",
            "website": "https://aiocrm.local",
            "industry": "AI operations",
            "overview": "Central memory layer for company context, operating procedures, and AI-ready knowledge.",
            "mission": "Turn daily operations into a reusable intelligence system.",
            "brand_voice": "Direct, pragmatic, and operator-friendly.",
            "ideal_customer": "Owner-operators and lean teams using AI to run service businesses.",
            "created_at": now,
            "updated_at": now,
        }
        self.brain_sources = [
            {
                "id": "brain-source-profile",
                "tenant_id": DEFAULT_TENANT_ID,
                "label": "Company Profile Intake",
                "source_type": "profile",
                "status": "ready",
                "location": "Internal workspace memory",
                "notes": "Core business identity and positioning.",
                "graph_x": 28.0,
                "graph_y": 24.0,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "brain-source-ops",
                "tenant_id": DEFAULT_TENANT_ID,
                "label": "Ops Playbook",
                "source_type": "document",
                "status": "draft",
                "location": "Upload or author internally",
                "notes": "Planned SOP source for agents and flows.",
                "graph_x": 24.0,
                "graph_y": 58.0,
                "created_at": now,
                "updated_at": now,
            },
        ]
        self.brain_items = [
            {
                "id": "brain-item-positioning",
                "tenant_id": DEFAULT_TENANT_ID,
                "title": "Core positioning",
                "category": "strategy",
                "content": "AIO CRM is the local-first operator console where CRM, Comms, workflows, and AI agents share one memory layer.",
                "source_id": "brain-source-profile",
                "status": "active",
                "tags": ["positioning", "ai", "local-first"],
                "graph_x": 72.0,
                "graph_y": 26.0,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "brain-item-agent-rule",
                "tenant_id": DEFAULT_TENANT_ID,
                "title": "Agent guidance",
                "category": "operations",
                "content": "Named agents should pull from workspace memory before drafting, summarizing, or recommending next steps.",
                "source_id": "brain-source-ops",
                "status": "draft",
                "tags": ["agents", "memory", "rules"],
                "graph_x": 76.0,
                "graph_y": 58.0,
                "created_at": now,
                "updated_at": now,
            },
        ]
        self.brain_links = [
            {
                "id": "brain-link-positioning-agents",
                "tenant_id": DEFAULT_TENANT_ID,
                "from_type": "item",
                "from_id": "brain-item-positioning",
                "to_type": "item",
                "to_id": "brain-item-agent-rule",
                "relationship_type": "supports",
                "created_at": now,
                "updated_at": now,
            },
        ]
        self.brain_ingests: list[dict[str, Any]] = []
        self.brain_chunks: list[dict[str, Any]] = []
        self.form_folders = [
            {"id": "form-folder-default", "name": "My Forms", "user_id": "1", "created_at": now, "expanded": True}
        ]
        self.form_submissions: list[dict[str, Any]] = []
        self.contact_activities: list[dict[str, Any]] = []
        self.flows: dict[str, dict[str, Any]] = {}
        self.flow_drafts: dict[str, dict[str, Any]] = {}
        self.mailboxes = [
            {"id": "mailbox-primary", "name": "Relationship HQ", "address": "mission@aiocrm.local", "provider": "local-stub", "status": "connected", "inbound_enabled": True, "outbound_enabled": True, "last_synced_at": now, "config": {"adapter": "local-stub"}},
            {"id": "mailbox-growth", "name": "Growth Desk", "address": "growth@aiocrm.local", "provider": "local-stub", "status": "connected", "inbound_enabled": True, "outbound_enabled": True, "last_synced_at": now, "config": {"adapter": "local-stub"}},
        ]
        self.mail_events: list[dict[str, Any]] = []
        self.calendar_sources = [
            {"id": "calendar-source-local", "name": "Local Command Calendar", "provider": "local-stub", "status": "connected", "sync_direction": "two-way", "config": {"adapter": "local-stub", "authority_mode": "local-first", "import_policy": "review"}, "last_synced_at": now},
            {"id": "calendar-source-google", "name": "Google Calendar", "provider": "google-calendar-oauth", "status": "needs_config", "sync_direction": "two-way", "config": {"authority_mode": "local-first", "import_policy": "review"}, "last_synced_at": None},
        ]
        self.calendars = [
            {"id": "calendar-primary", "user_id": "1", "name": "AIO Calendar", "color": "#3b82f6", "is_default": True, "is_visible": True},
            {"id": "calendar-booking", "user_id": "1", "name": "AIO Booking", "color": "#10b981", "is_default": False, "is_visible": True},
        ]
        self.booking_types = [
            {"id": "booking-type-demo", "user_id": "1", "name": "Discovery Call", "slug": "discovery-call", "duration_minutes": 30, "location": "Google Meet", "description": "Introductory discovery meeting.", "color": "#10b981", "is_active": True},
        ]
        follow_up_start = next_meeting_slot()
        self.calendar_events = [
            {
                "id": "calendar-event-emily-followup",
                "calendar_id": "calendar-comms",
                "source_id": "calendar-source-local",
                "thread_id": "thread-emily-internal",
                "contact_id": "contact-emily",
                "company_id": "company-edulearn",
                "title": "EduLearn conversion strategy review",
                "description": "Internal follow-up generated from Comms scheduling.",
                "start_time": follow_up_start,
                "end_time": (parse_utc(follow_up_start) + timedelta(minutes=30)).isoformat(),
                "status": "scheduled",
                "location_type": "other",
                "location": "Comms command room",
                "meeting_url": "",
                "sync_status": "local",
                "external_event_ref": "",
                "last_synced_at": now,
                "authority_mode": "local-first",
                "conflict_state": "clear",
                "sync_note": "Created locally from the Comms workspace.",
                "imported_at": None,
                "source_payload": {},
                "source": "comms",
                "created_at": now,
                "updated_at": now,
            }
        ]
        self.threads = [
            {
                "id": "thread-jenna-launch",
                "mailbox_id": "mailbox-primary",
                "channel_type": "email",
                "subject": "Launch sequencing and executive narrative",
                "generated_title": "Jenna wants a tighter launch story.",
                "status": "waiting_on_us",
                "ai_flags": {"high_intent": True, "hot_lead": True, "needs_human": True},
                "ai_priority": "critical",
                "priority_score": 96,
                "owner": "ECHO",
                "assignee": "STRIKER",
                "contact_id": "contact-jenna",
                "company_id": "company-techcorp",
                "automation_state": "manual",
                "last_activity_at": now,
                "next_follow_up_at": now,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "thread-sarah-demo",
                "mailbox_id": "mailbox-growth",
                "channel_type": "email",
                "subject": "Enterprise demo follow-up",
                "generated_title": "Sarah is aligned on value but waiting on procurement.",
                "status": "waiting_on_them",
                "ai_flags": {"high_intent": True, "hot_lead": True, "follow_up_due": True},
                "ai_priority": "high",
                "priority_score": 84,
                "owner": "STRIKER",
                "assignee": "STRIKER",
                "contact_id": "contact-sarah",
                "company_id": "company-finserve",
                "automation_state": "automated",
                "last_activity_at": now,
                "next_follow_up_at": now,
                "created_at": now,
                "updated_at": now,
            },
            {
                "id": "thread-emily-internal",
                "mailbox_id": "mailbox-primary",
                "channel_type": "internal",
                "subject": "Trial expansion plan",
                "generated_title": "Internal planning around Emily’s conversion path.",
                "status": "scheduled",
                "ai_flags": {"follow_up_due": True},
                "ai_priority": "medium",
                "priority_score": 68,
                "owner": "ALPHA",
                "assignee": "ECHO",
                "contact_id": "contact-emily",
                "company_id": "company-edulearn",
                "automation_state": "automated",
                "last_activity_at": now,
                "next_follow_up_at": now,
                "created_at": now,
                "updated_at": now,
            },
        ]
        self.messages = [
            {"id": "msg-jenna-1", "thread_id": "thread-jenna-launch", "channel_type": "email", "direction": "inbound", "sender_name": "Jenna Best", "sender_email": "jennalarinbest@gmail.com", "recipients": ["mission@aiocrm.local"], "body": "We are close. I need a tighter rollout plan and a clearer story for leadership before I approve the next phase.", "plain_text": "We are close. I need a tighter rollout plan and a clearer story for leadership before I approve the next phase.", "delivery_status": "received", "created_at": now, "updated_at": now},
            {"id": "msg-sarah-1", "thread_id": "thread-sarah-demo", "channel_type": "email", "direction": "inbound", "sender_name": "Sarah Chen", "sender_email": "sarah.chen@finserve.com", "recipients": ["growth@aiocrm.local"], "body": "This looks solid. I need to line up procurement and security review timing.", "plain_text": "This looks solid. I need to line up procurement and security review timing.", "delivery_status": "received", "created_at": now, "updated_at": now},
            {"id": "msg-emily-1", "thread_id": "thread-emily-internal", "channel_type": "internal", "direction": "system", "sender_name": "ALPHA", "sender_email": "system@aiocrm.local", "recipients": ["Internal"], "body": "Create a follow-up pack for EduLearn focused on active feature adoption and a 30-day conversion path.", "plain_text": "Create a follow-up pack for EduLearn focused on active feature adoption and a 30-day conversion path.", "delivery_status": "logged", "created_at": now, "updated_at": now},
        ]
        self.thread_ai_briefs = {
            "thread-jenna-launch": {"summary": "Jenna is close to approving the next phase but wants a sharper launch plan.", "disposition": "Active relationship signal", "recommended_next_step": "Send a milestone-based rollout and leadership summary.", "confidence": 0.94, "unresolved_questions": ["Confirm launch date", "Confirm approvers"], "crm_implications": ["Enterprise upsell potential"], "reasoning_cues": ["High intent signal", "Human intervention advised"]},
            "thread-sarah-demo": {"summary": "The demo landed. Procurement timing is the only blocker.", "disposition": "Active relationship signal", "recommended_next_step": "Send a concise procurement-forward follow-up with booking option.", "confidence": 0.88, "unresolved_questions": ["Security review owner"], "crm_implications": ["Possible flagship finance account"], "reasoning_cues": ["High intent signal", "AI-assisted response is viable"]},
            "thread-emily-internal": {"summary": "The trial is healthy but the buying trigger is still vague.", "disposition": "Active relationship signal", "recommended_next_step": "Prepare a tailored follow-up tied to active usage.", "confidence": 0.78, "unresolved_questions": ["Decision timeline"], "crm_implications": ["Could become an education playbook"], "reasoning_cues": ["Stable thread", "Follow-up due"]},
        }
        self.thread_actions = {
            "thread-jenna-launch": [{"label": "Summarize"}, {"label": "Reply with AI"}, {"label": "Schedule follow-up"}],
            "thread-sarah-demo": [{"label": "Summarize"}, {"label": "Reply with AI"}],
            "thread-emily-internal": [{"label": "Summarize"}, {"label": "Run workflow"}],
        }
        self.thread_artifacts = {
            "thread-jenna-launch": [],
            "thread-sarah-demo": [],
            "thread-emily-internal": [],
        }
        self.thread_links = {
            "thread-jenna-launch": [{"source_type": "contact", "source_id": "contact-jenna", "label": "Jenna Best"}, {"source_type": "company", "source_id": "company-techcorp", "label": "TechCorp Solutions"}],
            "thread-sarah-demo": [{"source_type": "contact", "source_id": "contact-sarah", "label": "Sarah Chen"}, {"source_type": "company", "source_id": "company-finserve", "label": "FinServe Inc"}],
            "thread-emily-internal": [{"source_type": "contact", "source_id": "contact-emily", "label": "Emily Watson"}, {"source_type": "company", "source_id": "company-edulearn", "label": "EduLearn Platform"}],
        }

    def health(self) -> dict[str, Any]:
        return {"provider": self.provider_name, "status": "ready"}

    def list_contacts(self) -> list[dict[str, Any]]:
        return [contact for contact in self.contacts if not contact.get("deleted_at")]

    def create_contact(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        contact = {
            "id": payload.get("id") or f"contact-{unique_suffix()}",
            "contact_id": payload.get("contact_id") or f"CNT-{unique_suffix().upper()}",
            "organization_id": payload.get("organization_id") or "org-1",
            "first_name": payload.get("first_name"),
            "last_name": payload.get("last_name"),
            "email": payload.get("email"),
            "phone": payload.get("phone"),
            "company": payload.get("company"),
            "company_id": payload.get("company_id"),
            "title": payload.get("title"),
            "department": payload.get("department"),
            "owner": payload.get("owner") or "AIO Flow",
            "source": payload.get("source") or "Manual Entry",
            "status": payload.get("status") or "contact",
            "lead_score": payload.get("lead_score") or 50,
            "quality": payload.get("quality") or "warm",
            "engagement": payload.get("engagement") or "medium",
            "tags": payload.get("tags") or [],
            "last_contacted_at": payload.get("last_contacted_at"),
            "pipeline_stage": payload.get("pipeline_stage") or "New",
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
            "deleted_at": payload.get("deleted_at"),
            "website": payload.get("website"),
            "dob": payload.get("dob"),
            "owner_id": payload.get("owner_id"),
            "address": payload.get("address") or {},
            "custom_fields": payload.get("custom_fields") or {},
            "opt_in_email": payload.get("opt_in_email", True),
            "opt_in_sms": payload.get("opt_in_sms", True),
            "opt_in_calls": payload.get("opt_in_calls", True),
            "opt_in_flows": payload.get("opt_in_flows", True),
            "ai_employee": payload.get("ai_employee"),
        }
        self.contacts.append(contact)
        return contact

    def update_contact(self, contact_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        if not contact:
            raise ValueError("Contact not found")
        for key, value in updates.items():
            if key in {"id", "contact_id"}:
                continue
            contact[key] = value
        contact["updated_at"] = utcnow()
        return contact

    def list_companies(self) -> list[dict[str, Any]]:
        return self.companies

    def list_tags(self) -> list[dict[str, Any]]:
        return self.tags

    def get_brain_profile(self) -> dict[str, Any]:
        return dict(self.brain_profile)

    def update_brain_profile(self, updates: dict[str, Any]) -> dict[str, Any]:
        for key in ["company_name", "website", "industry", "overview", "mission", "brand_voice", "ideal_customer"]:
            if key in updates and updates[key] is not None:
                self.brain_profile[key] = updates[key]
        self.brain_profile["updated_at"] = utcnow()
        return dict(self.brain_profile)

    def list_brain_sources(self) -> list[dict[str, Any]]:
        return sorted((dict(item) for item in self.brain_sources), key=lambda item: (item.get("label") or "").lower())

    def create_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        source = {
            "id": payload.get("id") or f"brain-source-{unique_suffix()}",
            "tenant_id": DEFAULT_TENANT_ID,
            "label": payload.get("label") or "New Source",
            "source_type": payload.get("source_type") or "document",
            "status": payload.get("status") or "draft",
            "location": payload.get("location") or "",
            "notes": payload.get("notes") or "",
            "graph_x": payload.get("graph_x"),
            "graph_y": payload.get("graph_y"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        self.brain_sources.append(source)
        return dict(source)

    def update_brain_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        source = next((item for item in self.brain_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Brain source not found")
        for key in ["label", "source_type", "status", "location", "notes", "graph_x", "graph_y"]:
            if key in updates and updates[key] is not None:
                source[key] = updates[key]
        source["updated_at"] = utcnow()
        return dict(source)

    def delete_brain_source(self, source_id: str) -> None:
        self.brain_sources = [item for item in self.brain_sources if item["id"] != source_id]
        for item in self.brain_items:
            if item.get("source_id") == source_id:
                item["source_id"] = None
                item["updated_at"] = utcnow()
        self.brain_links = [
            link
            for link in self.brain_links
            if not (
                (link["from_type"] == "source" and link["from_id"] == source_id)
                or (link["to_type"] == "source" and link["to_id"] == source_id)
            )
        ]
        self.brain_ingests = [ingest for ingest in self.brain_ingests if ingest.get("source_id") != source_id]
        self.brain_chunks = [chunk for chunk in self.brain_chunks if chunk.get("source_id") != source_id]

    def list_brain_items(self) -> list[dict[str, Any]]:
        return sorted((dict(item) for item in self.brain_items), key=lambda item: item.get("updated_at") or "", reverse=True)

    def create_brain_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        item = {
            "id": payload.get("id") or f"brain-item-{unique_suffix()}",
            "tenant_id": DEFAULT_TENANT_ID,
            "title": payload.get("title") or "New Knowledge Item",
            "category": payload.get("category") or "note",
            "content": payload.get("content") or "",
            "source_id": payload.get("source_id"),
            "status": payload.get("status") or "draft",
            "tags": payload.get("tags") or [],
            "graph_x": payload.get("graph_x"),
            "graph_y": payload.get("graph_y"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        self.brain_items.append(item)
        return dict(item)

    def update_brain_item(self, item_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = next((entry for entry in self.brain_items if entry["id"] == item_id), None)
        if not item:
            raise ValueError("Brain item not found")
        for key in ["title", "category", "content", "source_id", "status", "tags", "graph_x", "graph_y"]:
            if key in updates and updates[key] is not None:
                item[key] = updates[key]
        item["updated_at"] = utcnow()
        return dict(item)

    def delete_brain_item(self, item_id: str) -> None:
        self.brain_items = [entry for entry in self.brain_items if entry["id"] != item_id]
        self.brain_links = [
            link
            for link in self.brain_links
            if not (
                (link["from_type"] == "item" and link["from_id"] == item_id)
                or (link["to_type"] == "item" and link["to_id"] == item_id)
            )
        ]

    def list_brain_links(self) -> list[dict[str, Any]]:
        return sorted((dict(link) for link in self.brain_links), key=lambda item: item.get("updated_at") or "", reverse=True)

    def create_brain_link(self, payload: dict[str, Any]) -> dict[str, Any]:
        from_type = payload.get("from_type") or "item"
        to_type = payload.get("to_type") or "item"
        from_id = payload.get("from_id")
        to_id = payload.get("to_id")
        if not from_id or not to_id:
            raise ValueError("Brain link endpoints are required")
        if from_type == to_type and from_id == to_id:
            raise ValueError("Brain links cannot point to the same node")
        existing = next(
            (
                link for link in self.brain_links
                if link["from_type"] == from_type
                and link["from_id"] == from_id
                and link["to_type"] == to_type
                and link["to_id"] == to_id
            ),
            None,
        )
        if existing:
            return dict(existing)
        now = utcnow()
        link = {
            "id": payload.get("id") or f"brain-link-{unique_suffix()}",
            "tenant_id": DEFAULT_TENANT_ID,
            "from_type": from_type,
            "from_id": from_id,
            "to_type": to_type,
            "to_id": to_id,
            "relationship_type": payload.get("relationship_type") or "supports",
            "created_at": now,
            "updated_at": now,
        }
        self.brain_links.append(link)
        return dict(link)

    def delete_brain_link(self, link_id: str) -> None:
        self.brain_links = [link for link in self.brain_links if link["id"] != link_id]

    def list_brain_ingests(self, source_id: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        rows = [
            dict(ingest)
            for ingest in self.brain_ingests
            if not source_id or ingest.get("source_id") == source_id
        ]
        rows.sort(key=lambda item: item.get("created_at") or "", reverse=True)
        return rows[: max(1, limit)]

    def ingest_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = normalize_text_content(payload.get("content"))
        if not content:
            raise ValueError("No extracted text was available to ingest.")
        source_id = payload.get("source_id")
        now = utcnow()
        source = next((item for item in self.brain_sources if item["id"] == source_id), None) if source_id else None
        if source:
            for key in ["label", "source_type", "location", "notes"]:
                if key in payload and payload.get(key) is not None:
                    source[key] = payload.get(key)
            source["status"] = payload.get("status") or "ready"
            source["updated_at"] = now
        else:
            source = self.create_brain_source(
                {
                    "label": payload.get("label") or payload.get("title") or "Ingested Source",
                    "source_type": payload.get("source_type") or "document",
                    "status": payload.get("status") or "ready",
                    "location": payload.get("location") or "",
                    "notes": payload.get("notes") or "",
                }
            )
            source_id = source["id"]
        chunks = chunk_text_content(content)
        if not chunks:
            raise ValueError("Unable to create Brain chunks from this ingest.")
        ingest = {
            "id": payload.get("id") or f"brain-ingest-{unique_suffix()}",
            "tenant_id": DEFAULT_TENANT_ID,
            "source_id": source_id,
            "ingest_type": payload.get("ingest_type") or "text",
            "title": payload.get("title") or payload.get("label") or source.get("label") or "Brain ingest",
            "location": payload.get("location") or source.get("location") or "",
            "content_excerpt": summarize_excerpt(content),
            "content_length": len(content),
            "chunk_count": len(chunks),
            "status": "ready",
            "error": "",
            "created_at": now,
            "updated_at": now,
        }
        self.brain_ingests.append(ingest)
        self.brain_chunks = [chunk for chunk in self.brain_chunks if chunk.get("source_id") != source_id]
        self.brain_chunks.extend(
            [
                {
                    "id": f"brain-chunk-{unique_suffix()}",
                    "tenant_id": DEFAULT_TENANT_ID,
                    "source_id": source_id,
                    "ingest_id": ingest["id"],
                    "ordinal": index,
                    "title": ingest["title"],
                    "content": chunk,
                    "content_excerpt": summarize_excerpt(chunk),
                    "created_at": now,
                    "updated_at": now,
                }
                for index, chunk in enumerate(chunks, start=1)
            ]
        )
        return {"source": dict(source), "ingest": dict(ingest)}

    def search_brain_memory(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        resolved_query = normalize_text_content(query)
        if not resolved_query:
            return []
        source_lookup = {source["id"]: source for source in self.brain_sources}
        candidates: list[dict[str, Any]] = []
        for chunk in self.brain_chunks:
            score, matched = score_text_match(resolved_query, [chunk.get("title"), chunk.get("content")])
            if score:
                source = source_lookup.get(chunk.get("source_id"))
                candidates.append(
                    {
                        "id": chunk["id"],
                        "kind": "chunk",
                        "title": chunk.get("title") or (source or {}).get("label") or "Brain source",
                        "excerpt": chunk.get("content_excerpt") or summarize_excerpt(chunk.get("content")),
                        "source_id": chunk.get("source_id"),
                        "source_label": (source or {}).get("label") or "",
                        "score": score + 2,
                        "matched_terms": matched,
                    }
                )
        for item in self.brain_items:
            score, matched = score_text_match(resolved_query, [item.get("title"), item.get("content"), " ".join(item.get("tags") or [])])
            if score:
                source = source_lookup.get(item.get("source_id"))
                candidates.append(
                    {
                        "id": item["id"],
                        "kind": "item",
                        "title": item.get("title") or "Knowledge item",
                        "excerpt": summarize_excerpt(item.get("content")),
                        "source_id": item.get("source_id"),
                        "source_label": (source or {}).get("label") or "",
                        "score": score + 3,
                        "matched_terms": matched,
                    }
                )
        profile = self.brain_profile
        profile_score, profile_terms = score_text_match(
            resolved_query,
            [
                profile.get("company_name"),
                profile.get("overview"),
                profile.get("mission"),
                profile.get("brand_voice"),
                profile.get("ideal_customer"),
            ],
        )
        if profile_score:
            candidates.append(
                {
                    "id": profile["id"],
                    "kind": "profile",
                    "title": profile.get("company_name") or "Workspace profile",
                    "excerpt": summarize_excerpt(profile.get("overview") or profile.get("mission")),
                    "source_id": "profile",
                    "source_label": "Workspace profile",
                    "score": profile_score + 1,
                    "matched_terms": profile_terms,
                }
            )
        candidates.sort(key=lambda item: (item.get("score") or 0, item.get("title") or ""), reverse=True)
        return candidates[: max(1, limit)]

    def get_form_by_slug(self, slug: str) -> dict[str, Any] | None:
        return next((form for form in self.forms if form["slug"] == slug or form["id"] == slug), None)

    def get_form_by_id(self, form_id: str) -> dict[str, Any] | None:
        return next((form for form in self.forms if form["id"] == form_id), None)

    def list_form_folders(self) -> list[dict[str, Any]]:
        return sorted(self.form_folders, key=lambda folder: folder["name"].lower())

    def create_form_folder(self, payload: dict[str, Any]) -> dict[str, Any]:
        folder = {
            "id": payload.get("id") or f"form-folder-{unique_suffix()}",
            "name": payload.get("name") or "New Folder",
            "user_id": payload.get("user_id") or "1",
            "created_at": payload.get("created_at") or utcnow(),
            "expanded": payload.get("expanded", True),
        }
        self.form_folders.append(folder)
        return folder

    def update_form_folder(self, folder_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        folder = next((item for item in self.form_folders if item["id"] == folder_id), None)
        if not folder:
            raise ValueError("Form folder not found")
        folder.update({key: value for key, value in updates.items() if value is not None})
        return folder

    def list_forms(self) -> list[dict[str, Any]]:
        return sorted(self.forms, key=lambda form: (form.get("name") or "").lower())

    def create_form(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        form = {
            "id": payload.get("id") or f"form-{unique_suffix()}",
            "name": payload.get("name") or "New Untitled Form",
            "folder_id": payload.get("folder_id"),
            "slug": payload.get("slug") or f"form_{unique_suffix()}",
            "description": payload.get("description") or "",
            "schema": payload.get("schema") or [],
            "settings": payload.get("settings") or {"create_contact": True, "update_contact": True, "webhook_url": "", "notification_email": "", "redirect_url": "", "thank_you_message": "Thank you."},
            "status": payload.get("status") or "Draft",
            "is_active": bool(payload.get("is_active", False)),
            "responses_count": payload.get("responses_count", 0),
            "last_active": payload.get("last_active") or "Just now",
            "last_modified_by": payload.get("last_modified_by") or "AIO Flow",
            "last_modified_at": payload.get("last_modified_at") or now,
            "creator": payload.get("creator") or "AIO Flow",
            "triggers": payload.get("triggers"),
            "automation": payload.get("automation"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        self.forms.append(form)
        return form

    def update_form(self, form_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        form = next((item for item in self.forms if item["id"] == form_id), None)
        if not form:
            raise ValueError("Form not found")
        for key, value in updates.items():
            if value is not None:
                form[key] = value
        form["updated_at"] = utcnow()
        form["last_modified_at"] = form["updated_at"]
        return form

    def delete_form(self, form_id: str) -> None:
        self.forms = [form for form in self.forms if form["id"] != form_id]

    def list_cms_tables(self) -> list[dict[str, Any]]:
        return [
            {
                "id": f"cms-{form['id']}",
                "name": form["name"],
                "slug": form["slug"],
                "description": form.get("description") or "",
                "record_count": sum(1 for submission in self.form_submissions if submission.get("form_id") == form["id"]),
            }
            for form in self.forms
        ]

    def list_cms_table_data(self, slug: str) -> list[dict[str, Any]]:
        form = self.get_form_by_slug(slug)
        if not form:
            return []
        rows = []
        for submission in self.form_submissions:
            if submission.get("form_id") != form["id"]:
                continue
            row = {
                "submission_id": submission["id"],
                "contact_id": submission.get("contact_id"),
                "created_contact": submission.get("created_contact"),
                "submitted_at": submission.get("submitted_at"),
            }
            submission_data = submission.get("submission_data") or submission.get("submission_json") or {}
            row.update(submission_data)
            rows.append(row)
        return sorted(rows, key=lambda row: row.get("submitted_at") or "", reverse=True)

    def list_orders(self) -> list[dict[str, Any]]:
        return []

    def submit_form(self, form_id: str, form_data: dict[str, Any]) -> dict[str, Any]:
        form = self.get_form_by_id(form_id)
        if not form:
            raise ValueError("Form not found")

        identifier_field = next((field for field in form["schema"] if field.get("is_identifier")), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("map_to_contact") == "email"), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("type") == "email"), None)

        identifier_key = (identifier_field or {}).get("map_to_contact") or "email"
        identifier_value = form_data.get(field_key(identifier_field)) if identifier_field else None
        contact = next((item for item in self.contacts if item.get(identifier_key) == identifier_value), None)

        if contact is None and form["settings"].get("create_contact"):
            contact = {
                "id": f"contact-{len(self.contacts) + 1}",
                "contact_id": f"CNT-{len(self.contacts) + 1:03d}",
                "organization_id": "org-1",
                "source": f"Form: {form['name']}",
                "status": "lead",
                "lead_score": 50,
                "quality": "warm",
                "engagement": "medium",
                "tags": ["Form Submission"],
                "created_at": utcnow(),
                "updated_at": utcnow(),
                "deleted_at": None,
            }
            for field in form["schema"]:
                mapped = field.get("map_to_contact")
                current_value = form_data.get(field_key(field))
                if mapped and current_value:
                    contact[mapped] = current_value
            self.contacts.append(contact)

        if contact and form["settings"].get("update_contact"):
            for field in form["schema"]:
                mapped = field.get("map_to_contact")
                current_value = form_data.get(field_key(field))
                if mapped and current_value:
                    contact[mapped] = current_value
            contact["updated_at"] = utcnow()

        submission = {
            "id": f"submission-{len(self.form_submissions) + 1}",
            "form_id": form_id,
            "contact_id": contact["id"] if contact else None,
            "submission_data": form_data,
            "created_contact": bool(contact),
            "submitted_at": utcnow(),
        }
        self.form_submissions.append(submission)
        form["responses_count"] += 1
        form["last_response_at"] = utcnow()
        if submission["contact_id"]:
            self.open_thread_for_contact(
                submission["contact_id"],
                channel_type="email",
                subject=f"Form submission: {form['name']}",
                body=", ".join(f"{key}: {value}" for key, value in form_data.items()),
                force_new=True,
            )
        return {"success": True, "contactId": submission["contact_id"], "created": bool(contact), "submissionId": submission["id"]}

    def list_contact_activities(self, contact_id: str) -> list[dict[str, Any]]:
        activities: list[dict[str, Any]] = []
        activities.extend([dict(activity) for activity in self.contact_activities if activity.get("contact_id") == contact_id])
        for thread in self._hydrate_threads():
            if thread["contact_id"] != contact_id:
                continue
            for message in thread["messages"]:
                direction = message.get("direction")
                title = f"{thread['channel_type'].upper()} {'received' if direction == 'inbound' else 'sent' if direction == 'outbound' else 'logged'}"
                activities.append(
                    {
                        "id": f"thread-activity-{message['id']}",
                        "contact_id": contact_id,
                        "user_id": "user-1",
                        "activity_type": "email" if thread["channel_type"] == "email" else "sms" if thread["channel_type"] == "sms" else "note",
                        "title": title,
                        "description": message.get("plain_text") or message.get("body") or "",
                        "metadata": {
                            "thread_id": thread["id"],
                            "channel_type": thread["channel_type"],
                            "subject": thread["subject"],
                            "ai_priority": thread.get("ai_priority"),
                        },
                        "created_at": message["created_at"],
                    }
                )
            for action in thread.get("actions", []):
                if action.get("status") not in {None, "completed"}:
                    continue
                if action.get("action_type") not in {"create-deal", "advance-stage", "schedule-meeting", "calendar-event-updated"}:
                    continue
                activities.append(
                    {
                        "id": f"thread-action-{thread['id']}-{action.get('action_type') or slugify(action.get('label', 'action'))}",
                        "contact_id": contact_id,
                        "user_id": "user-1",
                        "activity_type": "workflow",
                        "title": action.get("label") or "Workflow action",
                        "description": f"Comms workflow executed on thread {thread['subject']}.",
                        "metadata": {
                            "thread_id": thread["id"],
                            "channel_type": thread["channel_type"],
                            "subject": thread["subject"],
                            "status": action.get("status"),
                        },
                        "created_at": action.get("created_at") or thread["updated_at"],
                    }
                )
            for event in thread.get("calendarEvents", []):
                activities.append(
                    {
                        "id": f"calendar-activity-{event['id']}",
                        "contact_id": contact_id,
                        "user_id": "user-1",
                        "activity_type": "meeting",
                        "title": event.get("title") or "Meeting scheduled",
                        "description": event.get("description") or f"Scheduled for {event.get('start_time')}.",
                        "metadata": {
                            "thread_id": thread["id"],
                            "meeting_url": event.get("meeting_url"),
                            "location": event.get("location"),
                            "status": event.get("status"),
                        },
                        "created_at": event.get("start_time") or event.get("created_at") or thread["updated_at"],
                    }
                )
        return sorted(activities, key=lambda item: item["created_at"], reverse=True)

    def create_contact_activity(self, contact_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        if not contact:
            raise ValueError("Contact not found.")
        now = utcnow()
        activity = {
            "id": payload.get("id") or f"contact-activity-{unique_suffix()}",
            "contact_id": contact_id,
            "user_id": str(payload.get("user_id") or "user-1"),
            "activity_type": str(payload.get("activity_type") or "note"),
            "title": str(payload.get("title") or "Note"),
            "description": str(payload.get("description") or "").strip(),
            "metadata": payload.get("metadata") or {},
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        if not activity["description"]:
            raise ValueError("Activity description is required.")
        self.contact_activities.append(activity)
        contact["updated_at"] = now
        return dict(activity)

    def list_flows(self) -> list[dict[str, Any]]:
        return sorted([dict(flow) for flow in self.flows.values()], key=lambda item: item.get("updatedAt") or "", reverse=True)

    def get_flow(self, flow_id: str) -> dict[str, Any] | None:
        flow = self.flows.get(flow_id)
        return dict(flow) if flow else None

    def save_flow(self, payload: dict[str, Any]) -> dict[str, Any]:
        flow_id = payload.get("id") or f"flow-{unique_suffix()}"
        flow = {
            **payload,
            "id": flow_id,
            "updatedAt": payload.get("updatedAt") or utcnow(),
        }
        self.flows[flow_id] = flow
        return dict(flow)

    def save_flow_draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        draft_id = payload.get("id") or f"flow-draft-{unique_suffix()}"
        draft = {
            **payload,
            "id": draft_id,
            "updatedAt": payload.get("updatedAt") or utcnow(),
        }
        self.flow_drafts[draft_id] = draft
        return dict(draft)

    def get_flow_draft(self, draft_id: str) -> dict[str, Any] | None:
        draft = self.flow_drafts.get(draft_id)
        return dict(draft) if draft else None

    def delete_flow_draft(self, draft_id: str) -> None:
        self.flow_drafts.pop(draft_id, None)

    def list_form_submissions(self, contact_id: str | None = None) -> list[dict[str, Any]]:
        submissions = self.form_submissions
        if contact_id:
            submissions = [submission for submission in submissions if submission.get("contact_id") == contact_id]
        return sorted(submissions, key=lambda item: item["submitted_at"], reverse=True)

    def list_mailboxes(self) -> list[dict[str, Any]]:
        return self._summarize_mailboxes(self.mailboxes, self._hydrate_threads(), self.list_mail_events())

    def create_mailbox(
        self,
        name: str,
        address: str,
        provider: str = "local-stub",
        inbound_enabled: bool = True,
        outbound_enabled: bool = True,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resolved_config = config or ({"adapter": "local-stub"} if provider == "local-stub" else {})
        validation = self.mail_adapter.validate_mailbox({"provider": provider, "config": resolved_config})
        mailbox = {
            "id": f"mailbox-{slugify(name)}-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "name": name,
            "address": address,
            "provider": provider,
            "status": "connected" if provider == "local-stub" else "ready" if validation["ok"] else "needs_config",
            "inbound_enabled": inbound_enabled,
            "outbound_enabled": outbound_enabled,
            "last_synced_at": None,
            "config": resolved_config,
        }
        self.mailboxes.append(mailbox)
        return self._annotate_mailbox_status_canonical(self.mail_adapter.describe_mailbox(mailbox))

    def update_mailbox(self, mailbox_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        for key in ["name", "address", "provider", "status", "last_synced_at"]:
            if key in updates and updates[key] is not None:
                mailbox[key] = updates[key]
        for key in ["inbound_enabled", "outbound_enabled"]:
            if key in updates and updates[key] is not None:
                mailbox[key] = bool(updates[key])
        if "config" in updates and isinstance(updates["config"], dict):
            mailbox["config"] = updates["config"]
        if "status" not in updates:
            adapter = get_mail_adapter(mailbox.get("provider"))
            validation = adapter.validate_mailbox(mailbox)
            mailbox["status"] = "connected" if mailbox.get("provider") == "local-stub" else "ready" if validation["ok"] else "needs_config"
        return self._annotate_mailbox_status_canonical(get_mail_adapter(mailbox.get("provider")).describe_mailbox(mailbox))

    def delete_mailbox(self, mailbox_id: str, fallback_mailbox_id: str | None = None) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        remaining_mailboxes = [item for item in self.mailboxes if item["id"] != mailbox_id]
        if not remaining_mailboxes:
            raise ValueError("Cannot delete the last mailbox")
        fallback = None
        if fallback_mailbox_id:
            fallback = next((item for item in remaining_mailboxes if item["id"] == fallback_mailbox_id), None)
            if not fallback:
                raise ValueError("Fallback mailbox not found")
        if not fallback:
            fallback = next((item for item in remaining_mailboxes if item.get("provider") != "local-stub"), None) or remaining_mailboxes[0]
        reassigned_threads = 0
        reassigned_events = 0
        for thread in self.threads:
            if thread.get("mailbox_id") == mailbox_id:
                thread["mailbox_id"] = fallback["id"]
                thread["updated_at"] = utcnow()
                reassigned_threads += 1
        for event in self.mail_events:
            if event.get("mailbox_id") == mailbox_id:
                event["mailbox_id"] = fallback["id"]
                reassigned_events += 1
        self.mailboxes = remaining_mailboxes
        self._record_mail_event(
            fallback["id"],
            "mailbox.deleted",
            {
                "deleted_mailbox_id": mailbox_id,
                "deleted_mailbox_name": mailbox.get("name"),
                "fallback_mailbox_id": fallback["id"],
                "fallback_mailbox_name": fallback.get("name"),
                "reassigned_threads": reassigned_threads,
                "reassigned_events": reassigned_events,
            },
            source_provider=fallback.get("provider"),
        )
        return {
            "deleted_mailbox_id": mailbox_id,
            "deleted_mailbox_name": mailbox.get("name"),
            "fallback_mailbox_id": fallback["id"],
            "fallback_mailbox_name": fallback.get("name"),
            "reassigned_threads": reassigned_threads,
            "reassigned_events": reassigned_events,
        }

    def disconnect_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        if mailbox.get("provider") == "local-stub":
            raise ValueError("Local stub mailboxes do not need disconnect.")
        mailbox["config"] = disconnected_provider_config(mailbox.get("provider"), mailbox.get("config"))
        mailbox["status"] = "needs_config"
        mailbox["last_synced_at"] = None
        self._record_mail_event(
            mailbox_id,
            "mailbox.disconnected",
            {"message": f"{mailbox.get('name')} was disconnected and must reconnect before use."},
            source_provider=mailbox.get("provider"),
        )
        return self._annotate_mailbox_status_canonical(self.mail_adapter.describe_mailbox(mailbox))

    def list_mail_events(self, mailbox_id: str | None = None, thread_id: str | None = None) -> list[dict[str, Any]]:
        events = self.mail_events
        if mailbox_id:
            events = [event for event in events if event["mailbox_id"] == mailbox_id]
        if thread_id:
            events = [event for event in events if event.get("thread_id") == thread_id]
        return sorted(events, key=lambda item: item["created_at"], reverse=True)

    def list_calendars(self) -> list[dict[str, Any]]:
        return self.calendars

    def list_calendar_events(self, thread_id: str | None = None) -> list[dict[str, Any]]:
        events = self.calendar_events
        if thread_id:
            events = [event for event in events if event.get("thread_id") == thread_id]
        return sorted(events, key=lambda item: item.get("start_time") or item.get("created_at") or "")

    def create_calendar_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        event = {
            "id": payload.get("id") or f"calendar-event-{unique_suffix()}",
            "calendar_id": payload.get("calendar_id") or self.calendars[0]["id"],
            "source_id": payload.get("source_id") or "calendar-source-local",
            "thread_id": payload.get("thread_id"),
            "contact_id": payload.get("contact_id"),
            "company_id": payload.get("company_id"),
            "title": payload.get("title") or "New Event",
            "description": payload.get("description") or "",
            "start_time": payload.get("start_time") or now,
            "end_time": payload.get("end_time") or now,
            "status": payload.get("status") or "scheduled",
            "location_type": payload.get("location_type") or "other",
            "location": payload.get("location") or "",
            "meeting_url": payload.get("meeting_url") or "",
            "sync_status": payload.get("sync_status") or "local",
            "external_event_ref": payload.get("external_event_ref") or "",
            "last_synced_at": payload.get("last_synced_at") or now,
            "authority_mode": payload.get("authority_mode") or "local-first",
            "conflict_state": payload.get("conflict_state") or "clear",
            "sync_note": payload.get("sync_note") or "Created locally.",
            "imported_at": payload.get("imported_at"),
            "source_payload": payload.get("source_payload") or {},
            "source": payload.get("source") or "calendar-local",
            "guest_name": payload.get("guest_name"),
            "guest_email": payload.get("guest_email"),
            "guest_phone": payload.get("guest_phone"),
            "booking_type_id": payload.get("booking_type_id"),
            "all_day": bool(payload.get("all_day", False)),
            "created_at": now,
            "updated_at": now,
        }
        self.calendar_events.append(event)
        return event

    def update_calendar_event(self, event_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        event = next((item for item in self.calendar_events if item["id"] == event_id), None)
        if not event:
            raise ValueError("Calendar event not found")
        for key in ["title", "description", "start_time", "end_time", "status", "location_type", "location", "meeting_url", "source_id", "sync_status", "external_event_ref", "last_synced_at", "authority_mode", "conflict_state", "sync_note", "imported_at", "source_payload"]:
            if key in updates and updates[key] is not None:
                event[key] = updates[key]
        event["updated_at"] = utcnow()
        thread_id = event.get("thread_id")
        if thread_id:
            thread = next((item for item in self.threads if item["id"] == thread_id), None)
            if thread:
                if event.get("start_time"):
                    thread["next_follow_up_at"] = event["start_time"]
                if event.get("status") in {"scheduled", "confirmed"}:
                    thread["status"] = "scheduled"
                elif event.get("status") in {"completed", "cancelled", "no_show"}:
                    thread["status"] = "waiting_on_us"
                thread["updated_at"] = event["updated_at"]
            label = f"Meeting {str(event.get('status') or 'updated').replace('_', ' ').title()}"
            self.thread_actions.setdefault(thread_id, []).append(
                {
                    "id": f"thread-action-{thread_id}-calendar-{unique_suffix()}",
                    "label": label,
                    "action_type": "calendar-event-updated",
                    "source": "system",
                    "status": "completed",
                    "created_at": event["updated_at"],
                    "updated_at": event["updated_at"],
                }
            )
        return dict(event)

    def delete_calendar_event(self, event_id: str) -> None:
        self.calendar_events = [event for event in self.calendar_events if event["id"] != event_id]

    def list_booking_types(self) -> list[dict[str, Any]]:
        return self.booking_types

    def create_booking_type(self, payload: dict[str, Any]) -> dict[str, Any]:
        booking_type = {
            "id": payload.get("id") or f"booking-type-{unique_suffix()}",
            "user_id": payload.get("user_id") or "1",
            "name": payload.get("name") or "Meeting Type",
            "slug": payload.get("slug") or slugify(payload.get("name") or f"booking-{unique_suffix()}"),
            "duration_minutes": payload.get("duration_minutes") or 30,
            "location": payload.get("location") or "Google Meet",
            "description": payload.get("description") or "",
            "color": payload.get("color") or "#10b981",
            "is_active": bool(payload.get("is_active", True)),
        }
        self.booking_types.append(booking_type)
        return booking_type

    def update_booking_type(self, booking_type_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        booking_type = next((item for item in self.booking_types if item["id"] == booking_type_id), None)
        if not booking_type:
            raise ValueError("Booking type not found")
        booking_type.update({key: value for key, value in updates.items() if value is not None})
        return booking_type

    def delete_booking_type(self, booking_type_id: str) -> None:
        self.booking_types = [item for item in self.booking_types if item["id"] != booking_type_id]

    def list_calendar_sources(self) -> list[dict[str, Any]]:
        return self._summarize_calendar_sources(self.calendar_sources, self.calendar_events)

    def get_calendar_provider_catalog(self) -> list[dict[str, Any]]:
        return get_calendar_provider_catalog()

    def create_calendar_source(
        self,
        name: str,
        provider: str = "local-stub",
        sync_direction: str = "two-way",
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resolved_config = {
            "authority_mode": "local-first",
            "import_policy": "review",
            **({"adapter": "local-stub"} if provider == "local-stub" else {}),
            **(config or {}),
        }
        adapter = get_calendar_adapter(provider)
        validation = adapter.validate_source({"provider": provider, "config": resolved_config})
        source = {
            "id": f"calendar-source-{slugify(name)}-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "name": name,
            "provider": provider,
            "status": "connected" if provider == "local-stub" else "ready" if validation["ok"] else "needs_config",
            "sync_direction": sync_direction,
            "config": resolved_config,
            "last_synced_at": None,
        }
        self.calendar_sources.append(source)
        return self._summarize_calendar_sources([source], self.calendar_events)[0]

    def update_calendar_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        for key in ["name", "provider", "status", "sync_direction", "last_synced_at"]:
            if key in updates and updates[key] is not None:
                source[key] = updates[key]
        if "config" in updates and isinstance(updates["config"], dict):
            source["config"] = sync_selected_calendar_metadata(updates["config"])
        if "status" not in updates:
            adapter = get_calendar_adapter(source.get("provider"))
            validation = adapter.validate_source(source)
            if source.get("provider") == "local-stub":
                source["status"] = "connected"
            elif validation["ok"]:
                source["status"] = "connected" if source.get("status") == "connected" else "ready"
            else:
                source["status"] = "needs_config"
        return self._summarize_calendar_sources([source], self.calendar_events)[0]

    def delete_calendar_source(self, source_id: str, fallback_source_id: str | None = None) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        remaining_sources = [item for item in self.calendar_sources if item["id"] != source_id]
        fallback = None
        if fallback_source_id:
            fallback = next((item for item in remaining_sources if item["id"] == fallback_source_id), None)
            if not fallback:
                raise ValueError("Fallback calendar source not found")
        reassigned_events = 0
        cleared_events = 0
        for event in self.calendar_events:
            if event.get("source_id") == source_id:
                if fallback:
                    event["source_id"] = fallback["id"]
                    reassigned_events += 1
                else:
                    event["source_id"] = None
                    cleared_events += 1
                event["updated_at"] = utcnow()
        self.calendar_sources = remaining_sources
        return {
            "deleted_source_id": source_id,
            "deleted_source_name": source.get("name"),
            "fallback_source_id": fallback.get("id") if fallback else None,
            "fallback_source_name": fallback.get("name") if fallback else None,
            "reassigned_events": reassigned_events,
            "cleared_events": cleared_events,
        }

    def disconnect_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        if source.get("provider") == "local-stub":
            raise ValueError("Local stub calendar sources do not need disconnect.")
        source["config"] = disconnected_provider_config(source.get("provider"), source.get("config"))
        source["status"] = "needs_config"
        source["last_synced_at"] = None
        return self._summarize_calendar_sources([source], self.list_calendar_events())[0]

    def test_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        result = adapter.test_connection(source)
        source["status"] = "connected" if result["status"] == "ok" else "needs_config"
        return {"source": self._summarize_calendar_sources([source], self.calendar_events)[0], "result": result}

    def list_calendar_source_calendars(self, source_id: str) -> list[dict[str, Any]]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        calendars = adapter.list_available_calendars(source)
        selected_calendar_id = source_config_value(source, "calendar_id", None)
        return [
            {
                **item,
                "selected": str(item.get("id") or "") == str(selected_calendar_id or ""),
            }
            for item in calendars
        ]

    def sync_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        result = adapter.sync_source(source)
        source["last_synced_at"] = utcnow()
        if result.get("config_updates"):
            source["config"] = {**(source.get("config") or {}), **result["config_updates"]}
        return {"source": self._summarize_calendar_sources([source], self.calendar_events)[0], "result": result}

    def push_calendar_event(self, event_id: str, source_id: str | None = None) -> dict[str, Any]:
        event = next((item for item in self.calendar_events if item["id"] == event_id), None)
        if not event:
            raise ValueError("Calendar event not found")
        resolved_source = next((item for item in self.calendar_sources if item["id"] == (source_id or event.get("source_id") or "calendar-source-local")), None)
        if not resolved_source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(resolved_source.get("provider"))
        pushed = adapter.push_event(resolved_source, event)
        now = utcnow()
        event["source_id"] = resolved_source["id"]
        event["sync_status"] = "local" if resolved_source.get("provider") == "local-stub" else "synced"
        event["external_event_ref"] = pushed.get("external_event_ref", "")
        event["last_synced_at"] = now
        event["authority_mode"] = source_config_value(resolved_source, "authority_mode", "local-first")
        event["conflict_state"] = "resolved"
        event["sync_note"] = "Pushed outward from the local schedule."
        event["updated_at"] = now
        resolved_source["last_synced_at"] = now
        return {"event": dict(event), "source": self._summarize_calendar_sources([resolved_source], self.calendar_events)[0], "result": pushed}

    def import_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        result = adapter.import_events(source)
        now = utcnow()
        if result.get("config_updates"):
            source["config"] = {**(source.get("config") or {}), **result["config_updates"]}
        imported: list[dict[str, Any]] = []
        for payload in result.get("events", []):
            existing = next(
                (
                    item for item in self.calendar_events
                    if item.get("source_id") == source_id and item.get("external_event_ref") == payload.get("external_event_ref")
                ),
                None,
            )
            metadata = self._calendar_import_metadata(source, payload, self.calendar_events, event_id=existing.get("id") if existing else None)
            base_payload = {
                "calendar_id": "calendar-comms",
                "source_id": source_id,
                "thread_id": None,
                "contact_id": None,
                "company_id": None,
                "title": payload.get("title") or f"{source['name']} imported event",
                "description": payload.get("description") or "Imported from an external calendar source.",
                "start_time": payload.get("start_time") or next_meeting_slot(),
                "end_time": payload.get("end_time") or (parse_utc(payload.get("start_time") or next_meeting_slot()) + timedelta(minutes=45)).isoformat(),
                "status": payload.get("status") or "scheduled",
                "location_type": payload.get("location_type") or "other",
                "location": payload.get("location") or source.get("name"),
                "meeting_url": payload.get("meeting_url") or "",
                "external_event_ref": payload.get("external_event_ref") or f"{source_id}-{unique_suffix()}",
                "last_synced_at": now,
                "authority_mode": metadata["authority_mode"],
                "conflict_state": metadata["conflict_state"],
                "sync_status": metadata["sync_status"],
                "sync_note": metadata["sync_note"],
                "imported_at": now,
                "source_payload": payload.get("source_payload") or {},
                "source": "external-import",
                "updated_at": now,
            }
            if existing:
                existing.update(base_payload)
                imported.append(dict(existing))
            else:
                event = {
                    "id": f"calendar-event-import-{unique_suffix()}",
                    "created_at": now,
                    **base_payload,
                }
                self.calendar_events.append(event)
                imported.append(dict(event))
        source["last_synced_at"] = now
        conflicted = sum(1 for event in imported if event.get("conflict_state") == "review")
        return {
            "source": self._summarize_calendar_sources([source], self.calendar_events)[0],
            "events": imported,
            "result": {
                **result,
                "imported_count": len(imported),
                "conflicted_count": conflicted,
                "message": result.get("message") or f"Imported {len(imported)} events from {source['name']}.",
            },
        }

    def reconcile_calendar_event(self, event_id: str, strategy: str) -> dict[str, Any]:
        event = next((item for item in self.calendar_events if item["id"] == event_id), None)
        if not event:
            raise ValueError("Calendar event not found")
        if strategy not in {"keep_local", "accept_import"}:
            raise ValueError("Invalid reconciliation strategy")
        updates = {
            "conflict_state": "resolved",
            "sync_note": "Local schedule kept after reconciliation." if strategy == "keep_local" else "Imported schedule accepted into the local operating calendar.",
            "sync_status": "local" if strategy == "keep_local" else "synced" if event.get("external_event_ref") else "imported",
            "last_synced_at": utcnow(),
        }
        if strategy == "accept_import":
            source_payload = event.get("source_payload") or {}
            for key in ["title", "description", "start_time", "end_time", "location", "meeting_url"]:
                if source_payload.get(key):
                    updates[key] = source_payload[key]
        updated = self.update_calendar_event(event_id, updates)
        return {"event": updated, "result": {"strategy": strategy, "message": updates["sync_note"]}}

    def get_mail_provider_catalog(self) -> list[dict[str, Any]]:
        return get_provider_catalog()

    def _record_mail_event(
        self,
        mailbox_id: str,
        event_type: str,
        payload: dict[str, Any],
        *,
        thread_id: str | None = None,
        message_id: str | None = None,
        source_provider: str | None = None,
    ) -> dict[str, Any]:
        event = {
            "id": f"mail-event-{unique_suffix()}",
            "mailbox_id": mailbox_id,
            "thread_id": thread_id,
            "message_id": message_id,
            "event_type": event_type,
            "source_provider": source_provider or self.mail_adapter.provider_name,
            "payload": payload,
            "created_at": utcnow(),
        }
        self.mail_events.append(event)
        return event

    def _ensure_contact_for_email(self, sender_name: str, sender_email: str) -> dict[str, Any]:
        existing = next((contact for contact in self.contacts if (contact.get("email") or "").lower() == sender_email.lower()), None)
        if existing:
            return existing
        name_parts = [part for part in sender_name.split(" ") if part]
        first_name = name_parts[0] if name_parts else sender_email.split("@")[0]
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
        contact = {
            "id": f"contact-{unique_suffix()}",
            "contact_id": f"CNT-{unique_suffix().upper()}",
            "organization_id": "org-1",
            "first_name": first_name,
            "last_name": last_name,
            "email": sender_email,
            "phone": None,
            "company": None,
            "company_id": None,
            "title": None,
            "department": None,
            "owner": "AIO Flow",
            "source": "Inbound Email",
            "status": "lead",
            "lead_score": 55,
            "quality": "warm",
            "engagement": "medium",
            "tags": ["Email Lead"],
            "last_contacted_at": utcnow(),
            "pipeline_stage": "New",
            "created_at": utcnow(),
            "updated_at": utcnow(),
            "deleted_at": None,
        }
        self.contacts.append(contact)
        return contact

    def sync_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        adapter = get_mail_adapter(mailbox.get("provider"))
        try:
            payload = adapter.build_sync_message(mailbox, self.contacts)
        except ValueError as error:
            self._record_mail_event(mailbox_id, "mailbox.sync_failed", {"message": str(error)}, source_provider=adapter.provider_name)
            raise
        mailbox["last_synced_at"] = utcnow()
        config_updates = (payload or {}).get("config_updates") or {}
        if config_updates:
            mailbox["config"] = {**(mailbox.get("config") or {}), **config_updates}
        if not payload:
            event = self._record_mail_event(mailbox_id, "mailbox.synced", {"status": "noop", "message": "No new messages found."}, source_provider=adapter.provider_name)
            return {
                "mailbox": self._annotate_mailbox_status_canonical(adapter.describe_mailbox(mailbox)),
                "result": {"status": "noop", "message": "No new messages found."},
                "event": event,
            }
        thread = self.ingest_mail_message(
            mailbox_id=mailbox_id,
            subject=payload["subject"],
            body=payload["body"],
            sender_name=payload["sender_name"],
            sender_email=payload["sender_email"],
            recipients=payload.get("recipients"),
        )
        event = self._record_mail_event(mailbox_id, "mailbox.synced", payload, thread_id=thread["id"], message_id=thread["latestMessage"]["id"] if thread.get("latestMessage") else None, source_provider=adapter.provider_name)
        return {
            "mailbox": self._annotate_mailbox_status_canonical(adapter.describe_mailbox(mailbox)),
            "thread": thread,
            "event": event,
        }

    def test_mailbox_connection(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        adapter = get_mail_adapter(mailbox.get("provider"))
        result = adapter.test_connection(mailbox)
        event = self._record_mail_event(mailbox_id, "mailbox.tested", result, source_provider=adapter.provider_name)
        if result["status"] == "ok":
            mailbox["status"] = "connected"
        else:
            mailbox["status"] = "needs_config"
        return {
            "mailbox": self._annotate_mailbox_status_canonical(adapter.describe_mailbox(mailbox)),
            "result": result,
            "event": event,
        }

    def ingest_mail_message(
        self,
        mailbox_id: str,
        subject: str,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str] | None = None,
    ) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        contact = self._ensure_contact_for_email(sender_name, sender_email)
        thread = self.open_thread_for_contact(
            contact_id=contact["id"],
            channel_type="email",
            subject=subject,
            force_new=False,
            mailbox_id=mailbox_id,
        )
        thread = self.send_thread_message(
            thread_id=thread["id"],
            body=body,
            channel_type="email",
            sender_name=sender_name,
            sender_email=sender_email,
            recipients=recipients or [mailbox["address"]],
            direction="inbound",
        )
        adapter = get_mail_adapter(mailbox.get("provider"))
        self._record_mail_event(mailbox_id, "mail.received", {"subject": subject, "sender_email": sender_email}, thread_id=thread["id"], message_id=thread["latestMessage"]["id"] if thread.get("latestMessage") else None, source_provider=adapter.provider_name)
        mailbox["last_synced_at"] = utcnow()
        return thread

    def send_thread_via_mailbox(
        self,
        thread_id: str,
        body: str,
        mailbox_id: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str | None = None,
        recipients: list[str] | None = None,
    ) -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        resolved_mailbox_id = mailbox_id or thread["mailbox_id"]
        mailbox = next((item for item in self.mailboxes if item["id"] == resolved_mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        resolved_recipients = recipients or ([thread.get("contact", {}).get("email")] if thread.get("contact") else [])
        adapter = get_mail_adapter(mailbox.get("provider"))
        try:
            delivery = adapter.deliver_outbound(
                mailbox,
                thread,
                body=body,
                sender_name=sender_name,
                sender_email=sender_email or mailbox.get("address") or "mission@aiocrm.local",
                recipients=[recipient for recipient in resolved_recipients if recipient],
            )
        except ValueError as error:
            self._record_mail_event(resolved_mailbox_id, "mail.failed", {"message": str(error), "thread_id": thread_id}, thread_id=thread_id, source_provider=adapter.provider_name)
            raise
        updated = self.send_thread_message(
            thread_id=thread_id,
            body=body,
            channel_type="email",
            sender_name=delivery["sender_name"],
            sender_email=delivery["sender_email"],
            recipients=delivery["recipients"],
            direction="outbound",
        )
        self._record_mail_event(
            resolved_mailbox_id,
            "mail.sent",
            delivery["provider_payload"],
            thread_id=thread_id,
            message_id=updated["latestMessage"]["id"] if updated.get("latestMessage") else None,
            source_provider=adapter.provider_name,
        )
        internal_message_id = updated["latestMessage"]["id"] if updated.get("latestMessage") else None
        if adapter.provider_name == "local-stub":
            return {
                **updated,
                "deliveryStatus": "simulated",
                "deliveryMode": "local_stub",
                "providerMessageId": None,
                "internalMessageId": internal_message_id,
                "simulatedMessageId": delivery.get("provider_message_id"),
            }
        return {
            **updated,
            "deliveryStatus": delivery.get("delivery_status") or "sent",
            "deliveryMode": "provider",
            "providerMessageId": delivery.get("provider_message_id"),
            "internalMessageId": internal_message_id,
            "simulatedMessageId": None,
        }

    def _hydrate_threads(self) -> list[dict[str, Any]]:
        contact_map = {contact["id"]: contact for contact in self.contacts}
        company_map = {company["id"]: company for company in self.companies}
        mailbox_map = {mailbox["id"]: mailbox for mailbox in self.mailboxes}
        hydrated = []
        for thread in self.threads:
            messages = sorted([message for message in self.messages if message["thread_id"] == thread["id"]], key=lambda item: item["created_at"])
            ai_flags = thread["ai_flags"]
            hydrated.append(
                {
                    **thread,
                    "aiFlags": ai_flags,
                    "brief": self.thread_ai_briefs.get(thread["id"], {}),
                    "actions": self.thread_actions.get(thread["id"], []),
                    "artifacts": self.thread_artifacts.get(thread["id"], []),
                    "links": self.thread_links.get(thread["id"], []),
                    "calendarEvents": [event for event in self.calendar_events if event.get("thread_id") == thread["id"]],
                    "mailbox": mailbox_map.get(thread["mailbox_id"]),
                    "contact": contact_map.get(thread["contact_id"]),
                    "company": company_map.get(thread["company_id"]),
                    "messages": messages,
                    "latestMessage": messages[-1] if messages else None,
                    "preview": (messages[-1]["plain_text"] if messages else self.thread_ai_briefs.get(thread["id"], {}).get("summary")) or thread["generated_title"],
                    "queueIds": self._queue_ids({**thread, "aiFlags": ai_flags}),
                }
            )
        return sorted(hydrated, key=lambda item: item["last_activity_at"], reverse=True)

    @staticmethod
    def _queue_ids(thread: dict[str, Any]) -> list[str]:
        flags = thread.get("aiFlags") or thread.get("ai_flags") or {}
        if thread["status"] == "archived":
            return ["archived"]
        if thread["status"] == "closed":
            return ["closed"]
        queue_ids = []
        if thread["status"] == "new" or flags.get("needs_human") or thread.get("priority_score", 0) >= 88:
            queue_ids.append("now")
        if thread["status"] == "waiting_on_us":
            queue_ids.append("needs-reply")
        if thread["status"] == "waiting_on_them":
            queue_ids.append("waiting")
        if flags.get("hot_lead") or flags.get("high_intent"):
            queue_ids.append("hot-leads")
        if flags.get("at_risk"):
            queue_ids.append("at-risk")
        if thread["status"] == "scheduled" or flags.get("follow_up_due"):
            queue_ids.append("scheduled")
        if thread.get("automation_state") == "automated":
            queue_ids.append("automated")
        return queue_ids

    def get_comms_snapshot(self) -> dict[str, Any]:
        threads = self._hydrate_threads()
        queue_counts = []
        for queue in default_queue_definitions():
            queue_counts.append({**queue, "count": sum(1 for thread in threads if queue["id"] in thread["queueIds"])})
        return {
            "queues": queue_counts,
            "threads": threads,
            "allThreads": threads,
            "mailboxes": self.list_mailboxes(),
            "calendarEvents": self.list_calendar_events(),
            "agents": [
                {"name": "ALPHA"},
                {"name": "BRAVO"},
                {"name": "CHARLIE"},
                {"name": "DELTA"},
                {"name": "ECHO"},
                {"name": "FORGE"},
                {"name": "GHOST"},
                {"name": "ARCHER"},
                {"name": "ATLAS"},
                {"name": "RANGER"},
                {"name": "SCOUT"},
                {"name": "STRIKER"},
                {"name": "VECTOR"},
            ],
        }

    def create_thread(
        self,
        subject: str,
        channel_type: str = "email",
        contact_id: str | None = None,
        company_id: str | None = None,
        body: str = "",
        status: str = "new",
        assignee: str = "ECHO",
        mailbox_id: str | None = None,
    ) -> dict[str, Any]:
        now = utcnow()
        thread_id = f"thread-{slugify(subject)}-{len(self.threads) + 1}"
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        thread = {
            "id": thread_id,
            "mailbox_id": mailbox_id or "mailbox-primary",
            "channel_type": channel_type,
            "subject": subject,
            "generated_title": subject,
            "status": status,
            "ai_flags": {"needs_human": True},
            "ai_priority": "medium",
            "priority_score": 70,
            "owner": assignee,
            "assignee": assignee,
            "contact_id": contact_id,
            "company_id": company_id or (contact.get("company_id") if contact else None),
            "automation_state": "manual",
            "last_activity_at": now,
            "next_follow_up_at": None,
            "created_at": now,
            "updated_at": now,
        }
        self.threads.append(thread)
        self.thread_ai_briefs[thread_id] = {
            "summary": "Fresh thread awaiting triage.",
            "disposition": "New signal",
            "recommended_next_step": "Review context and send a clear next step.",
            "confidence": 0.64,
            "unresolved_questions": ["Confirm best next action"],
            "crm_implications": [],
            "reasoning_cues": ["Thread created manually"],
        }
        self.thread_actions[thread_id] = [{"label": "Summarize"}, {"label": "Reply with AI"}]
        self.thread_links[thread_id] = []
        if contact:
            self.thread_links[thread_id].append({"source_type": "contact", "source_id": contact_id, "label": f"{contact.get('first_name', '')} {contact.get('last_name', '')}".strip()})
        if body:
            self.send_thread_message(thread_id, body, channel_type=channel_type)
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def open_thread_for_contact(
        self,
        contact_id: str,
        channel_type: str = "email",
        subject: str | None = None,
        body: str = "",
        force_new: bool = False,
        mailbox_id: str | None = None,
    ) -> dict[str, Any]:
        if not force_new:
            for thread in self._hydrate_threads():
                if thread["contact_id"] == contact_id and thread["channel_type"] == channel_type and thread["status"] != "closed":
                    return thread
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        resolved_subject = subject or f"{channel_type.upper()} follow-up for {contact.get('first_name', 'contact')} {contact.get('last_name', '')}".strip()
        return self.create_thread(resolved_subject, channel_type=channel_type, contact_id=contact_id, company_id=contact.get("company_id") if contact else None, body=body, assignee="STRIKER" if channel_type == "email" else "ECHO", mailbox_id=mailbox_id)

    def send_thread_message(
        self,
        thread_id: str,
        body: str,
        channel_type: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str = "mission@aiocrm.local",
        recipients: list[str] | None = None,
        direction: str = "outbound",
    ) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        created_at = utcnow()
        message = {
            "id": f"msg-{thread_id}-{len(self.messages) + 1}",
            "thread_id": thread_id,
            "channel_type": channel_type or thread["channel_type"],
            "direction": direction,
            "sender_name": sender_name,
            "sender_email": sender_email,
            "recipients": recipients or [],
            "body": body,
            "plain_text": body,
            "delivery_status": "sent" if direction == "outbound" else "logged" if direction == "system" else "received",
            "created_at": created_at,
            "updated_at": created_at,
        }
        self.messages.append(message)
        thread["last_activity_at"] = created_at
        thread["updated_at"] = created_at
        if direction == "outbound":
            thread["status"] = "waiting_on_them"
            thread["ai_flags"]["follow_up_due"] = True
        elif direction == "inbound":
            thread["status"] = "waiting_on_us"
            thread["ai_flags"]["needs_human"] = True
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def update_thread_status(self, thread_id: str, status: str) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        thread["status"] = status
        thread["updated_at"] = utcnow()
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def assign_thread(self, thread_id: str, assignee_name: str) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        previous_assignee = thread.get("assignee") or "Unassigned"
        thread["assignee"] = assignee_name
        thread["owner"] = assignee_name
        thread["updated_at"] = utcnow()
        self.thread_actions.setdefault(thread_id, []).append(
            {
                "label": f"Assigned to {assignee_name}",
                "action_type": "assign-thread",
                "source": "system",
                "status": "completed",
                "created_at": thread["updated_at"],
                "updated_at": thread["updated_at"],
            }
        )
        self.send_thread_message(
            thread_id,
            f"Routing update: ownership moved from {previous_assignee} to {assignee_name}.",
            channel_type="internal",
            sender_name="ALPHA",
            sender_email="system@aiocrm.local",
            recipients=["Internal"],
            direction="system",
        )
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def update_thread_mailbox(self, thread_id: str, mailbox_id: str) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not thread:
            raise ValueError("Thread not found")
        if not mailbox:
            raise ValueError("Mailbox not found")
        thread["mailbox_id"] = mailbox_id
        thread["updated_at"] = utcnow()
        self._record_mail_event(mailbox_id, "thread.mailbox_updated", {"thread_id": thread_id, "mailbox_name": mailbox["name"]}, thread_id=thread_id)
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def summarize_thread(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        latest_message = thread["latestMessage"]
        if latest_message:
            self.thread_ai_briefs[thread_id]["summary"] = f"{latest_message['sender_name']} is focused on {latest_message['plain_text'].lower().rstrip('.') }."
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def create_thread_draft(self, thread_id: str, mode: str = "reply") -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        summary = thread["brief"].get("summary") or thread["preview"]
        first_name = thread.get("contact", {}).get("first_name") or "there"
        if mode == "rewrite":
            draft = f"Refined version: {summary} Next move: {thread['brief'].get('recommended_next_step', 'reply with clarity and confidence.')}"
        elif mode == "extract":
            draft = "Task extract:\n- Confirm owner for " + thread["subject"]
        else:
            draft = f"Hi {first_name},\n\nI reviewed your message. {summary}\n\nNext step from our side: {thread['brief'].get('recommended_next_step', 'I will get this moving and send the next update shortly.')}\n\nBest,\n{thread.get('assignee') or 'ECHO'}"
        return {"draft": draft}

    def apply_thread_ai_result(
        self,
        thread_id: str,
        mode: str,
        suggestion: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        brief = self.thread_ai_briefs.setdefault(thread_id, {})
        details = metadata or {}
        action_labels = {
            "summary": "AI Brief Refreshed",
            "reply": "Reply Drafted",
            "rewrite": "Rewrite Drafted",
            "extract": "Tasks Extracted",
        }
        if mode == "summary":
            brief["summary"] = suggestion
        if details.get("recommended_next_step"):
            brief["recommended_next_step"] = details["recommended_next_step"]
        if details.get("disposition"):
            brief["disposition"] = details["disposition"]
        if details.get("confidence") is not None:
            brief["confidence"] = details["confidence"]
        if details.get("unresolved_questions"):
            brief["unresolved_questions"] = details["unresolved_questions"]
        if details.get("crm_implications"):
            brief["crm_implications"] = details["crm_implications"]
        if details.get("reasoning_cues"):
            brief["reasoning_cues"] = details["reasoning_cues"]
        self.thread_actions.setdefault(thread_id, []).append({
            "label": action_labels.get(mode, "AI Updated"),
            "action_type": f"ai-{mode}",
            "source": "ai",
            "status": "completed",
            "created_at": utcnow(),
            "updated_at": utcnow(),
        })
        refreshed = next(item for item in self._hydrate_threads() if item["id"] == thread_id)
        return {"thread": refreshed, "draft": suggestion}

    def create_deal_from_thread(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        if not thread.get("contact_id"):
            raise ValueError("Thread must be linked to a contact before creating a deal.")
        contact = next((item for item in self.contacts if item["id"] == thread["contact_id"]), None)
        if not contact:
            raise ValueError("Contact not found")
        contact["pipeline_stage"] = "Qualified" if contact.get("pipeline_stage") == "New" else contact.get("pipeline_stage") or "Qualified"
        contact["updated_at"] = utcnow()
        links = self.thread_links.setdefault(thread_id, [])
        if not any(link.get("source_type") == "deal" for link in links):
            deal_label = f"{thread.get('company', {}).get('name') or contact.get('company') or contact.get('first_name') or 'Relationship'} Opportunity"
            links.append({"source_type": "deal", "source_id": f"deal-{thread_id}", "label": deal_label})
        self.thread_actions.setdefault(thread_id, []).append({"label": "Create Deal", "action_type": "create-deal", "source": "system", "status": "completed"})
        self.send_thread_message(thread_id, "CRM action: created a deal shell from this conversation and set the contact to Qualified.", channel_type="internal", sender_name="ALPHA", sender_email="system@aiocrm.local", recipients=["Internal"], direction="system")
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def advance_thread_stage(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        if not thread.get("contact_id"):
            raise ValueError("Thread must be linked to a contact before advancing stage.")
        contact = next((item for item in self.contacts if item["id"] == thread["contact_id"]), None)
        if not contact:
            raise ValueError("Contact not found")
        stage = next_pipeline_stage(contact.get("pipeline_stage"))
        contact["pipeline_stage"] = stage
        contact["updated_at"] = utcnow()
        self.thread_actions.setdefault(thread_id, []).append({"label": f"Advance Stage: {stage}", "action_type": "advance-stage", "source": "system", "status": "completed"})
        self.send_thread_message(thread_id, f"CRM action: advanced the relationship to {stage}.", channel_type="internal", sender_name="STRIKER", sender_email="system@aiocrm.local", recipients=["Internal"], direction="system")
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def schedule_thread_meeting(self, thread_id: str, scheduled_at: str | None = None) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        follow_up_at = scheduled_at or next_meeting_slot()
        start_time = parse_utc(follow_up_at)
        if not start_time:
            raise ValueError("Invalid meeting time")
        now = utcnow()
        thread["next_follow_up_at"] = follow_up_at
        thread["status"] = "scheduled"
        thread["updated_at"] = now
        existing_event = next((event for event in self.calendar_events if event.get("thread_id") == thread_id), None)
        if existing_event:
            existing_event.update(
                {
                    "title": f"{thread.get('subject')} meeting",
                    "description": f"Scheduled from Comms for {thread['subject']}.",
                    "start_time": follow_up_at,
                    "end_time": (start_time + timedelta(minutes=30)).isoformat(),
                    "status": "scheduled",
                    "location_type": existing_event.get("location_type") or "other",
                    "location": existing_event.get("location") or "Comms command room",
                    "source_id": existing_event.get("source_id") or "calendar-source-local",
                    "sync_status": existing_event.get("sync_status") or "local",
                    "authority_mode": existing_event.get("authority_mode") or "local-first",
                    "conflict_state": "clear",
                    "sync_note": "Scheduled locally from the Comms workspace.",
                    "updated_at": now,
                }
            )
            calendar_event_id = existing_event["id"]
        else:
            calendar_event_id = f"calendar-event-{thread_id}-{unique_suffix()}"
            self.calendar_events.append(
                {
                    "id": calendar_event_id,
                    "calendar_id": "calendar-comms",
                    "thread_id": thread_id,
                    "contact_id": thread.get("contact_id"),
                    "company_id": thread.get("company_id"),
                    "title": f"{thread.get('subject')} meeting",
                    "description": f"Scheduled from Comms for {thread['subject']}.",
                    "start_time": follow_up_at,
                    "end_time": (start_time + timedelta(minutes=30)).isoformat(),
                    "status": "scheduled",
                    "location_type": "other",
                    "location": "Comms command room",
                    "meeting_url": "",
                    "source_id": "calendar-source-local",
                    "sync_status": "local",
                    "external_event_ref": "",
                    "last_synced_at": now,
                    "authority_mode": "local-first",
                    "conflict_state": "clear",
                    "sync_note": "Scheduled locally from the Comms workspace.",
                    "imported_at": None,
                    "source_payload": {},
                    "source": "comms",
                    "created_at": now,
                    "updated_at": now,
                }
            )
        links = self.thread_links.setdefault(thread_id, [])
        if not any(link.get("source_type") == "calendar-event" and link.get("source_id") == calendar_event_id for link in links):
            links.append({"source_type": "calendar-event", "source_id": calendar_event_id, "label": "Scheduled meeting"})
        self.thread_actions.setdefault(thread_id, []).append({"label": "Schedule Meeting", "action_type": "schedule-meeting", "source": "system", "status": "completed"})
        self.send_thread_message(thread_id, f"CRM action: scheduled a meeting follow-up for {follow_up_at}.", channel_type="internal", sender_name="ALPHA", sender_email="system@aiocrm.local", recipients=["Internal"], direction="system")
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def create_thread_report(self, thread_id: str, kind: str = "operator") -> dict[str, Any]:
        thread = next((item for item in self._hydrate_threads() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        now = utcnow()
        artifact = {
            "id": f"thread-artifact-{unique_suffix()}",
            "thread_id": thread_id,
            "tenant_id": DEFAULT_TENANT_ID,
            "artifact_type": "report",
            "kind": kind,
            "title": "Executive Thread Report" if kind == "executive" else "Operator Thread Report",
            "body": build_thread_report_text(thread, kind=kind),
            "created_by": thread.get("assignee") or "AIO Flow",
            "created_at": now,
            "updated_at": now,
        }
        self.thread_artifacts.setdefault(thread_id, []).insert(0, artifact)
        self.thread_actions.setdefault(thread_id, []).append({
            "label": artifact["title"],
            "action_type": f"{kind}-report",
            "source": "system",
            "status": "completed",
            "created_at": now,
            "updated_at": now,
        })
        return {"artifact": artifact, "thread": next(item for item in self._hydrate_threads() if item["id"] == thread_id)}

    def delete_thread(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        self.threads = [item for item in self.threads if item["id"] != thread_id]
        self.messages = [item for item in self.messages if item["thread_id"] != thread_id]
        self.thread_ai_briefs.pop(thread_id, None)
        self.thread_actions.pop(thread_id, None)
        self.thread_artifacts.pop(thread_id, None)
        self.thread_links.pop(thread_id, None)
        self.calendar_events = [
            {**event, "thread_id": None} if event.get("thread_id") == thread_id else event
            for event in self.calendar_events
        ]
        return {"deleted_thread_id": thread_id}

    def save_ai_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Not implemented for mock")

    def get_ai_run(self, run_id: str) -> dict[str, Any] | None:
        raise NotImplementedError("Not implemented for mock")

    def update_ai_run(self, run_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Not implemented for mock")

    def list_ai_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        raise NotImplementedError("Not implemented for mock")

    def claim_due_ai_runs(self, pause_reason: str = "delay", limit: int = 10, lock_seconds: int = 60) -> list[dict[str, Any]]:
        raise NotImplementedError("Not implemented for mock")


class SQLiteProvider(BaseProvider):
    provider_name = "sqlite"

    def __init__(self, db_path: str) -> None:
        self.mail_adapter = get_mail_adapter(self.provider_name)
        self.calendar_adapter = get_calendar_adapter("local-stub")
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _default_tenant_id() -> str:
        return DEFAULT_TENANT_ID

    def _tenant_id(self) -> str:
        return get_request_tenant_id()

    def _tenant_rows(self, query: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._connect() as conn:
            cursor = conn.execute(query, (*params, self._tenant_id()))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def _backfill_tenant_ids(self, conn: sqlite3.Connection) -> None:
        tenant_id = self._default_tenant_id()
        for table in [
            "contacts",
            "email_verifier_configs",
            "email_verification_tasks",
            "companies",
            "tags",
            "brain_profiles",
            "brain_sources",
            "brain_items",
            "brain_links",
            "brain_ingests",
            "brain_chunks",
            "forms",
            "form_folders",
            "form_submissions",
            "orders",
            "mailboxes",
            "threads",
            "messages",
            "thread_ai_briefs",
            "thread_actions",
            "thread_links",
            "thread_artifacts",
            "calendar_events",
            "calendars",
            "booking_types",
            "calendar_sources",
            "mail_events",
            "help_tickets",
            "broadcast_messages",
            "ai_runs",
        ]:
            conn.execute(f"UPDATE {table} SET tenant_id = COALESCE(tenant_id, ?)", (tenant_id,))

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS contacts (
                    id TEXT PRIMARY KEY,
                    contact_id TEXT NOT NULL,
                    organization_id TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    email TEXT UNIQUE,
                    phone TEXT,
                    company TEXT,
                    company_id TEXT,
                    title TEXT,
                    department TEXT,
                    owner TEXT,
                    source TEXT,
                    status TEXT,
                    lead_score INTEGER,
                    quality TEXT,
                    engagement TEXT,
                    tags_json TEXT,
                    last_contacted_at TEXT,
                    pipeline_stage TEXT,
                    email_verified INTEGER,
                    email_verified_at TEXT,
                    email_verification_status TEXT,
                    email_verification_score REAL,
                    created_at TEXT,
                    updated_at TEXT,
                    deleted_at TEXT
                );

                CREATE TABLE IF NOT EXISTS email_verifier_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL UNIQUE,
                    provider TEXT NOT NULL DEFAULT 'reoon',
                    api_key TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    auto_verify_contacts INTEGER NOT NULL DEFAULT 1,
                    default_mode TEXT NOT NULL DEFAULT 'quick',
                    last_tested_at TEXT,
                    status TEXT,
                    last_error TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS email_verification_tasks (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    provider_task_id TEXT,
                    status TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    submitted_count INTEGER NOT NULL DEFAULT 0,
                    completed_count INTEGER NOT NULL DEFAULT 0,
                    valid_count INTEGER NOT NULL DEFAULT 0,
                    risky_count INTEGER NOT NULL DEFAULT 0,
                    invalid_count INTEGER NOT NULL DEFAULT 0,
                    unknown_count INTEGER NOT NULL DEFAULT 0,
                    targets_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT,
                    updated_at TEXT,
                    completed_at TEXT,
                    last_error TEXT
                );

                CREATE TABLE IF NOT EXISTS companies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    industry TEXT,
                    size TEXT,
                    website TEXT,
                    owner TEXT
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    prefix TEXT,
                    label TEXT,
                    description TEXT,
                    type TEXT NOT NULL DEFAULT 'user',
                    is_locked INTEGER NOT NULL DEFAULT 0,
                    color TEXT,
                    usage_count INTEGER DEFAULT 0,
                    tenant_id TEXT,
                    created_at TEXT,
                    UNIQUE(name, tenant_id)
                );

                CREATE TABLE IF NOT EXISTS brain_item_tags (
                    item_id TEXT NOT NULL,
                    tag_id TEXT NOT NULL,
                    tenant_id TEXT,
                    PRIMARY KEY(item_id, tag_id, tenant_id)
                );

                CREATE TABLE IF NOT EXISTS brain_profiles (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    company_name TEXT,
                    website TEXT,
                    industry TEXT,
                    overview TEXT,
                    mission TEXT,
                    brand_voice TEXT,
                    ideal_customer TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_sources (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    label TEXT NOT NULL,
                    source_type TEXT,
                    status TEXT,
                    location TEXT,
                    notes TEXT,
                    graph_x REAL,
                    graph_y REAL,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_items (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    title TEXT NOT NULL,
                    category TEXT,
                    content TEXT,
                    source_id TEXT,
                    status TEXT,
                    tags_json TEXT,
                    graph_x REAL,
                    graph_y REAL,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_links (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    from_type TEXT NOT NULL,
                    from_id TEXT NOT NULL,
                    to_type TEXT NOT NULL,
                    to_id TEXT NOT NULL,
                    relationship_type TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_ingests (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    source_id TEXT NOT NULL,
                    ingest_type TEXT,
                    status TEXT,
                    title TEXT,
                    location TEXT,
                    content_excerpt TEXT,
                    content_length INTEGER,
                    chunk_count INTEGER,
                    error TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );
                -- Phase 16: Learning & Outcome persistence
                CREATE TABLE IF NOT EXISTS ai_step_outcomes (
                    id TEXT PRIMARY KEY,
                    run_id TEXT,
                    intent TEXT,
                    agent_name TEXT,
                    agent_id TEXT,
                    tool_name TEXT,
                    status TEXT,
                    error_category TEXT,
                    recovery_attempted INTEGER DEFAULT 0,
                    recovery_success INTEGER DEFAULT 0,
                    duration_ms INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS brain_chunks (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    source_id TEXT NOT NULL,
                    ingest_id TEXT NOT NULL,
                    ordinal INTEGER,
                    title TEXT,
                    content TEXT NOT NULL,
                    content_excerpt TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_embeddings (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    chunk_id TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    model TEXT,
                    created_at TEXT
                );

                CREATE TABLE IF NOT EXISTS forms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    folder_id TEXT,
                    slug TEXT UNIQUE NOT NULL,
                    description TEXT,
                    schema_json TEXT NOT NULL,
                    settings_json TEXT NOT NULL,
                    status TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    responses_count INTEGER NOT NULL DEFAULT 0,
                    last_active TEXT,
                    last_modified_by TEXT,
                    creator TEXT,
                    triggers_json TEXT,
                    automation_json TEXT,
                    last_response_at TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS form_folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    user_id TEXT,
                    created_at TEXT,
                    expanded INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS form_submissions (
                    id TEXT PRIMARY KEY,
                    form_id TEXT NOT NULL,
                    contact_id TEXT,
                    submission_json TEXT NOT NULL,
                    created_contact INTEGER NOT NULL DEFAULT 0,
                    submitted_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS contact_activities (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    user_id TEXT,
                    activity_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS flows (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    nodes_json TEXT NOT NULL,
                    edges_json TEXT NOT NULL,
                    spec_json TEXT,
                    metadata_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    created_by TEXT,
                    last_edited_by TEXT
                );

                CREATE TABLE IF NOT EXISTS flow_drafts (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    draft_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    contact_id TEXT,
                    form_submission_id TEXT,
                    reference_code TEXT,
                    status TEXT,
                    total_amount REAL,
                    currency TEXT,
                    payment_status TEXT,
                    payment_provider TEXT,
                    payment_id TEXT,
                    items_json TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS mailboxes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    address TEXT,
                    provider TEXT,
                    status TEXT,
                    inbound_enabled INTEGER,
                    outbound_enabled INTEGER,
                    last_synced_at TEXT,
                    config_json TEXT
                );

                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    mailbox_id TEXT NOT NULL,
                    channel_type TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    generated_title TEXT,
                    status TEXT NOT NULL,
                    ai_flags_json TEXT NOT NULL,
                    ai_priority TEXT,
                    priority_score INTEGER,
                    owner TEXT,
                    assignee TEXT,
                    contact_id TEXT,
                    company_id TEXT,
                    automation_state TEXT,
                    last_activity_at TEXT,
                    next_follow_up_at TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    channel_type TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    sender_name TEXT,
                    sender_email TEXT,
                    recipients_json TEXT NOT NULL,
                    body TEXT NOT NULL,
                    plain_text TEXT NOT NULL,
                    quoted_history TEXT,
                    delivery_status TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_ai_briefs (
                    thread_id TEXT PRIMARY KEY,
                    summary TEXT,
                    disposition TEXT,
                    recommended_next_step TEXT,
                    confidence REAL,
                    unresolved_questions_json TEXT NOT NULL,
                    crm_implications_json TEXT NOT NULL,
                    reasoning_cues_json TEXT NOT NULL,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_actions (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    action_type TEXT NOT NULL,
                    source TEXT,
                    status TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_links (
                    id TEXT PRIMARY KEY,
                    thread_id TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    label TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_artifacts (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    thread_id TEXT NOT NULL,
                    artifact_type TEXT NOT NULL,
                    kind TEXT,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    created_by TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS calendar_events (
                    id TEXT PRIMARY KEY,
                    calendar_id TEXT NOT NULL,
                    source_id TEXT,
                    thread_id TEXT,
                    contact_id TEXT,
                    company_id TEXT,
                    title TEXT NOT NULL,
                    description TEXT,
                    start_time TEXT NOT NULL,
                    end_time TEXT NOT NULL,
                    status TEXT,
                    location_type TEXT,
                    location TEXT,
                    meeting_url TEXT,
                    sync_status TEXT,
                    external_event_ref TEXT,
                    last_synced_at TEXT,
                    authority_mode TEXT,
                    conflict_state TEXT,
                    sync_note TEXT,
                    imported_at TEXT,
                    source_payload_json TEXT,
                    guest_name TEXT,
                    guest_email TEXT,
                    guest_phone TEXT,
                    booking_type_id TEXT,
                    all_day INTEGER,
                    source TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS calendars (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    name TEXT NOT NULL,
                    color TEXT,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    is_visible INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS booking_types (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    name TEXT NOT NULL,
                    slug TEXT,
                    duration_minutes INTEGER,
                    location TEXT,
                    location_type TEXT,
                    description TEXT,
                    color TEXT,
                    buffer_before_minutes INTEGER,
                    buffer_after_minutes INTEGER,
                    is_active INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS calendar_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    status TEXT,
                    sync_direction TEXT,
                    config_json TEXT NOT NULL,
                    last_synced_at TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS mail_events (
                    id TEXT PRIMARY KEY,
                    mailbox_id TEXT NOT NULL,
                    thread_id TEXT,
                    message_id TEXT,
                    event_type TEXT NOT NULL,
                    source_provider TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS help_tickets (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    user_id TEXT,
                    subject TEXT NOT NULL,
                    content TEXT,
                    status TEXT NOT NULL DEFAULT 'open',
                    priority TEXT,
                    category TEXT,
                    created_at TEXT,
                    updated_at TEXT
                );

                CREATE TABLE IF NOT EXISTS broadcast_messages (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    type TEXT NOT NULL DEFAULT 'info',
                    message TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT,
                    expires_at TEXT
                );

                CREATE TABLE IF NOT EXISTS ai_engine_runs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    command TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    pause_reason TEXT,
                    resume_at TEXT,
                    next_node_id TEXT,
                    current_node_id TEXT,
                    locked_until TEXT,
                    last_error TEXT,
                    steps_json TEXT NOT NULL,
                    artifacts_json TEXT NOT NULL,
                    pending_approvals_json TEXT NOT NULL,
                    routing_json TEXT NOT NULL,
                    trace_json TEXT NOT NULL DEFAULT '[]',
                    actor_json TEXT NOT NULL,
                    context_json TEXT NOT NULL,
                    created_at TEXT,
                    updated_at TEXT
                );
                
                CREATE TABLE IF NOT EXISTS ai_audit_logs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    run_id TEXT NOT NULL,
                    step_id TEXT NOT NULL,
                    agent TEXT,
                    agent_id TEXT,
                    action TEXT NOT NULL,
                    result TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                );
                """
            )

            self._ensure_column(conn, "mailboxes", "status", "TEXT")
            self._ensure_column(conn, "mailboxes", "inbound_enabled", "INTEGER")
            self._ensure_column(conn, "mailboxes", "outbound_enabled", "INTEGER")
            self._ensure_column(conn, "mailboxes", "last_synced_at", "TEXT")
            self._ensure_column(conn, "mailboxes", "config_json", "TEXT")
            self._ensure_column(conn, "contacts", "tenant_id", "TEXT")
            self._ensure_column(conn, "companies", "tenant_id", "TEXT")
            self._ensure_column(conn, "tags", "prefix", "TEXT")
            self._ensure_column(conn, "tags", "label", "TEXT")
            self._ensure_column(conn, "tags", "description", "TEXT")
            self._ensure_column(conn, "tags", "type", "TEXT DEFAULT 'user'")
            self._ensure_column(conn, "tags", "is_locked", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "tags", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_profiles", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_sources", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_items", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_links", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_ingests", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_chunks", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_embeddings", "tenant_id", "TEXT")
            self._ensure_column(conn, "brain_sources", "graph_x", "REAL")
            self._ensure_column(conn, "brain_sources", "graph_y", "REAL")
            self._ensure_column(conn, "brain_items", "graph_x", "REAL")
            self._ensure_column(conn, "brain_items", "graph_y", "REAL")
            self._ensure_column(conn, "contacts", "website", "TEXT")
            self._ensure_column(conn, "contacts", "dob", "TEXT")
            self._ensure_column(conn, "contacts", "owner_id", "TEXT")
            self._ensure_column(conn, "contacts", "address_json", "TEXT")
            self._ensure_column(conn, "contacts", "custom_fields_json", "TEXT")
            self._ensure_column(conn, "contacts", "opt_in_email", "INTEGER")
            self._ensure_column(conn, "contacts", "opt_in_sms", "INTEGER")
            self._ensure_column(conn, "contacts", "opt_in_calls", "INTEGER")
            self._ensure_column(conn, "contacts", "opt_in_flows", "INTEGER")
            self._ensure_column(conn, "contacts", "ai_employee", "TEXT")
            self._ensure_column(conn, "contacts", "email_verified", "INTEGER")
            self._ensure_column(conn, "contacts", "email_verified_at", "TEXT")
            self._ensure_column(conn, "contacts", "email_verification_status", "TEXT")
            self._ensure_column(conn, "contacts", "email_verification_score", "REAL")
            self._ensure_column(conn, "email_verifier_configs", "tenant_id", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "provider", "TEXT DEFAULT 'reoon'")
            self._ensure_column(conn, "email_verifier_configs", "api_key", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "enabled", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verifier_configs", "auto_verify_contacts", "INTEGER DEFAULT 1")
            self._ensure_column(conn, "email_verifier_configs", "default_mode", "TEXT DEFAULT 'quick'")
            self._ensure_column(conn, "email_verifier_configs", "last_tested_at", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "status", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "last_error", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "created_at", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "updated_at", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "tenant_id", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "provider_task_id", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "status", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "mode", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "submitted_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "completed_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "valid_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "risky_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "invalid_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "unknown_count", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "targets_json", "TEXT DEFAULT '[]'")
            self._ensure_column(conn, "email_verification_tasks", "created_at", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "updated_at", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "completed_at", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "last_error", "TEXT")
            self._ensure_column(conn, "forms", "tenant_id", "TEXT")
            self._ensure_column(conn, "form_folders", "tenant_id", "TEXT")
            self._ensure_column(conn, "form_submissions", "tenant_id", "TEXT")
            self._ensure_column(conn, "forms", "folder_id", "TEXT")
            self._ensure_column(conn, "forms", "status", "TEXT")
            self._ensure_column(conn, "forms", "last_active", "TEXT")
            self._ensure_column(conn, "forms", "last_modified_by", "TEXT")
            self._ensure_column(conn, "forms", "creator", "TEXT")
            self._ensure_column(conn, "forms", "triggers_json", "TEXT")
            self._ensure_column(conn, "forms", "automation_json", "TEXT")
            self._ensure_column(conn, "forms", "pages_json", "TEXT")
            self._ensure_column(conn, "mailboxes", "tenant_id", "TEXT")
            self._ensure_column(conn, "threads", "tenant_id", "TEXT")
            self._ensure_column(conn, "messages", "tenant_id", "TEXT")
            self._ensure_column(conn, "thread_ai_briefs", "tenant_id", "TEXT")
            self._ensure_column(conn, "thread_actions", "tenant_id", "TEXT")
            self._ensure_column(conn, "thread_links", "tenant_id", "TEXT")
            self._ensure_column(conn, "thread_artifacts", "tenant_id", "TEXT")
            self._ensure_column(conn, "calendars", "tenant_id", "TEXT")
            self._ensure_column(conn, "booking_types", "tenant_id", "TEXT")
            self._ensure_column(conn, "calendar_sources", "tenant_id", "TEXT")
            self._ensure_column(conn, "calendar_events", "tenant_id", "TEXT")
            self._ensure_column(conn, "mail_events", "tenant_id", "TEXT")
            self._ensure_column(conn, "calendar_events", "source_id", "TEXT")
            self._ensure_column(conn, "calendar_events", "sync_status", "TEXT")
            self._ensure_column(conn, "calendar_events", "external_event_ref", "TEXT")
            self._ensure_column(conn, "calendar_events", "last_synced_at", "TEXT")
            self._ensure_column(conn, "calendar_events", "authority_mode", "TEXT")
            self._ensure_column(conn, "calendar_events", "conflict_state", "TEXT")
            self._ensure_column(conn, "calendar_events", "sync_note", "TEXT")
            self._ensure_column(conn, "calendar_events", "imported_at", "TEXT")
            self._ensure_column(conn, "calendar_events", "source_payload_json", "TEXT")
            self._ensure_column(conn, "calendar_events", "guest_name", "TEXT")
            self._ensure_column(conn, "calendar_events", "guest_email", "TEXT")
            self._ensure_column(conn, "calendar_events", "guest_phone", "TEXT")
            self._ensure_column(conn, "calendar_events", "booking_type_id", "TEXT")
            self._ensure_column(conn, "calendar_events", "all_day", "INTEGER")
            self._ensure_column(conn, "booking_types", "location_type", "TEXT")
            self._ensure_column(conn, "booking_types", "buffer_before_minutes", "INTEGER")
            self._ensure_column(conn, "booking_types", "buffer_after_minutes", "INTEGER")
            self._ensure_column(conn, "calendar_sources", "status", "TEXT")
            self._ensure_column(conn, "calendar_sources", "sync_direction", "TEXT")
            self._ensure_column(conn, "calendar_sources", "config_json", "TEXT")
            self._ensure_column(conn, "calendar_sources", "last_synced_at", "TEXT")
            self._ensure_column(conn, "calendar_sources", "created_at", "TEXT")
            self._ensure_column(conn, "calendar_sources", "updated_at", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "tenant_id", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "pause_reason", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "resume_at", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "next_node_id", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "current_node_id", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "locked_until", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "last_error", "TEXT")
            self._ensure_column(conn, "ai_engine_runs", "trace_json", "TEXT DEFAULT '[]'")
            self._ensure_column(conn, "ai_audit_logs", "tenant_id", "TEXT")
            conn.execute(
                """
                UPDATE mailboxes
                SET
                    status = COALESCE(status, 'connected'),
                    inbound_enabled = COALESCE(inbound_enabled, 1),
                    outbound_enabled = COALESCE(outbound_enabled, 1),
                    provider = CASE WHEN provider IS NULL OR provider = 'sqlite' OR provider = 'mock-email' THEN 'local-stub' ELSE provider END,
                    config_json = COALESCE(config_json, '{}')
                """
            )
            conn.execute(
                """
                UPDATE contacts
                SET
                    address_json = COALESCE(address_json, '{}'),
                    custom_fields_json = COALESCE(custom_fields_json, '{}'),
                    opt_in_email = COALESCE(opt_in_email, 1),
                    opt_in_sms = COALESCE(opt_in_sms, 1),
                    opt_in_calls = COALESCE(opt_in_calls, 1),
                    opt_in_flows = COALESCE(opt_in_flows, 1)
                """
            )
            conn.execute(
                """
                UPDATE forms
                SET
                    status = COALESCE(status, CASE WHEN is_active = 1 THEN 'Active' ELSE 'Draft' END),
                    folder_id = COALESCE(folder_id, 'form-folder-default'),
                    last_active = COALESCE(last_active, last_response_at, 'Just now'),
                    last_modified_by = COALESCE(last_modified_by, 'AIO Flow'),
                    creator = COALESCE(creator, 'AIO Flow'),
                    triggers_json = COALESCE(triggers_json, 'null'),
                    automation_json = COALESCE(automation_json, 'null')
                """
            )
            conn.execute(
                """
                UPDATE calendar_events
                SET
                    source_id = COALESCE(source_id, 'calendar-source-local'),
                    sync_status = COALESCE(sync_status, 'local'),
                    external_event_ref = COALESCE(external_event_ref, ''),
                    last_synced_at = COALESCE(last_synced_at, updated_at),
                    authority_mode = COALESCE(authority_mode, 'local-first'),
                    conflict_state = COALESCE(conflict_state, 'clear'),
                    sync_note = COALESCE(sync_note, 'Created locally.'),
                    source_payload_json = COALESCE(source_payload_json, '{}'),
                    all_day = COALESCE(all_day, 0)
                """
            )
            self._backfill_tenant_ids(conn)
            existing_form_folders = conn.execute("SELECT COUNT(*) AS count FROM form_folders").fetchone()["count"]
            if not existing_form_folders:
                conn.execute(
                    "INSERT INTO form_folders (id, tenant_id, name, user_id, created_at, expanded) VALUES (?, ?, ?, ?, ?, ?)",
                    ("form-folder-default", self._default_tenant_id(), "My Forms", "1", utcnow(), 1),
                )
            existing_calendars = conn.execute("SELECT COUNT(*) AS count FROM calendars").fetchone()["count"]
            if not existing_calendars:
                conn.executemany(
                    "INSERT INTO calendars (id, tenant_id, user_id, name, color, is_default, is_visible) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [
                        ("calendar-primary", self._default_tenant_id(), "1", "AIO Calendar", "#3b82f6", 1, 1),
                        ("calendar-booking", self._default_tenant_id(), "1", "AIO Booking", "#10b981", 0, 1),
                        ("calendar-comms", self._default_tenant_id(), "system", "Comms", "#f59e0b", 0, 1),
                    ],
                )
            existing_booking_types = conn.execute("SELECT COUNT(*) AS count FROM booking_types").fetchone()["count"]
            if not existing_booking_types:
                conn.execute(
                    "INSERT INTO booking_types (id, tenant_id, user_id, name, slug, duration_minutes, location, description, color, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("booking-type-demo", self._default_tenant_id(), "1", "Discovery Call", "discovery-call", 30, "Google Meet", "Introductory discovery meeting.", "#10b981", 1),
                )
            existing_sources = conn.execute("SELECT COUNT(*) AS count FROM calendar_sources").fetchone()["count"]
            if not existing_sources:
                seeded_now = utcnow()
                conn.executemany(
                    "INSERT INTO calendar_sources (id, tenant_id, name, provider, status, sync_direction, config_json, last_synced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        ("calendar-source-local", self._default_tenant_id(), "Local Command Calendar", "local-stub", "connected", "two-way", json.dumps({"adapter": "local-stub", "authority_mode": "local-first", "import_policy": "review"}), seeded_now, seeded_now, seeded_now),
                    ],
                )
            existing_brain_profiles = conn.execute("SELECT COUNT(*) AS count FROM brain_profiles").fetchone()["count"]
            if not existing_brain_profiles:
                conn.execute(
                    """
                    INSERT INTO brain_profiles (
                        id, tenant_id, company_name, website, industry, overview, mission, brand_voice, ideal_customer, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "brain-profile-primary",
                        self._default_tenant_id(),
                        "AIO CRM Workspace",
                        "https://aiocrm.local",
                        "AI operations",
                        "Central memory layer for company context, operating procedures, and AI-ready knowledge.",
                        "Turn daily operations into a reusable intelligence system.",
                        "Direct, pragmatic, and operator-friendly.",
                        "Owner-operators and lean teams using AI to run service businesses.",
                        utcnow(),
                        utcnow(),
                    ),
                )
            existing_brain_sources = conn.execute("SELECT COUNT(*) AS count FROM brain_sources").fetchone()["count"]
            if not existing_brain_sources:
                seeded_now = utcnow()
                conn.executemany(
                    """
                    INSERT INTO brain_sources (
                        id, tenant_id, label, source_type, status, location, notes, graph_x, graph_y, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            "brain-source-profile",
                            self._default_tenant_id(),
                            "Company Profile Intake",
                            "profile",
                            "ready",
                            "Internal workspace memory",
                            "Core business identity and positioning.",
                            28.0,
                            24.0,
                            seeded_now,
                            seeded_now,
                        ),
                        (
                            "brain-source-ops",
                            self._default_tenant_id(),
                            "Ops Playbook",
                            "document",
                            "draft",
                            "Upload or author internally",
                            "Planned SOP source for agents and flows.",
                            24.0,
                            58.0,
                            seeded_now,
                            seeded_now,
                        ),
                    ],
                )
            existing_brain_items = conn.execute("SELECT COUNT(*) AS count FROM brain_items").fetchone()["count"]
            if not existing_brain_items:
                seeded_now = utcnow()
                conn.executemany(
                    """
                    INSERT INTO brain_items (
                        id, tenant_id, title, category, content, source_id, status, tags_json, graph_x, graph_y, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            "brain-item-positioning",
                            self._default_tenant_id(),
                            "Core positioning",
                            "strategy",
                            "AIO CRM is the local-first operator console where CRM, Comms, workflows, and AI agents share one memory layer.",
                            "brain-source-profile",
                            "active",
                            json.dumps(["positioning", "ai", "local-first"]),
                            72.0,
                            26.0,
                            seeded_now,
                            seeded_now,
                        ),
                        (
                            "brain-item-agent-rule",
                            self._default_tenant_id(),
                            "Agent guidance",
                            "operations",
                            "Named agents should pull from workspace memory before drafting, summarizing, or recommending next steps.",
                            "brain-source-ops",
                            "draft",
                            json.dumps(["agents", "memory", "rules"]),
                            76.0,
                            58.0,
                            seeded_now,
                            seeded_now,
                        ),
                    ],
                )
            self.seed_canonical_tags(conn)

            existing = conn.execute("SELECT COUNT(*) AS count FROM contacts").fetchone()["count"]
            if existing:
                return

            now = utcnow()
            contacts = [
                (
                    "contact-jenna", "CNT-001", "org-1", "Jenna", "Best", "jennalarinbest@gmail.com",
                    "+1 (555) 123-4567", "TechCorp Solutions", "company-techcorp", "Marketing Director", "Marketing",
                    "AIO Flow", "Website Form", "customer", 92, "hot", "high",
                    json.dumps(["VIP", "Customer"]), now, "Closed Won", now, now, None,
                ),
                (
                    "contact-sarah", "CNT-002", "org-1", "Sarah", "Chen", "sarah.chen@finserve.com",
                    "+1 (555) 111-2222", "FinServe Inc", "company-finserve", "VP of Operations", "Operations",
                    "AIO Flow", "Conference", "customer", 95, "hot", "high",
                    json.dumps(["VIP", "Customer"]), now, "Closed Won", now, now, None,
                ),
                (
                    "contact-emily", "CNT-003", "org-1", "Emily", "Watson", "emily.watson@edulearn.com",
                    "+1 (555) 333-4444", "EduLearn Platform", "company-edulearn", "Product Manager", "Product",
                    "Adam B.", "Website Form", "lead", 64, "warm", "medium",
                    json.dumps(["Trial", "Prospect"]), now, "Discovery", now, now, None,
                ),
            ]
            companies = [
                ("company-techcorp", "TechCorp Solutions", "Technology", "51-200", "https://techcorp.com", "AIO Flow"),
                ("company-finserve", "FinServe Inc", "Finance", "201-500", "https://finserve.com", "AIO Flow"),
                ("company-edulearn", "EduLearn Platform", "Education", "51-200", "https://edulearn.com", "Adam B."),
            ]
            tags = [
                ("tag-vip", "VIP", "#8b5cf6", "contact", 5, now),
                ("tag-hot", "Hot Lead", "#ef4444", "contact", 8, now),
                ("tag-customer", "Customer", "#10b981", "contact", 12, now),
            ]
            forms = [
                (
                    "form-contact",
                    "Contact Form",
                    "contact_form",
                    "Get in touch with us for any questions or inquiries",
                    json.dumps([
                        {"id": "f1", "name": "full_name", "label": "Full Name", "type": "text", "required": True, "placeholder": "John Doe", "map_to_contact": "first_name", "is_identifier": False},
                        {"id": "f2", "name": "email", "label": "Email Address", "type": "email", "required": True, "placeholder": "john@example.com", "map_to_contact": "email", "is_identifier": True},
                        {"id": "f3", "name": "phone", "label": "Phone Number", "type": "phone", "required": False, "placeholder": "+1 (555) 000-0000", "map_to_contact": "phone", "is_identifier": False},
                        {"id": "f4", "name": "message", "label": "Message", "type": "textarea", "required": True, "placeholder": "How can we help you?", "map_to_contact": None, "is_identifier": False},
                    ]),
                    json.dumps({
                        "create_contact": True,
                        "update_contact": True,
                        "webhook_url": "",
                        "notification_email": "contact@aioagency.com",
                        "redirect_url": "",
                        "thank_you_message": "Thank you for contacting us! We'll get back to you within 24 hours.",
                    }),
                    1,
                    0,
                    None,
                    now,
                    now,
                )
            ]
            mailboxes = [
                ("mailbox-primary", "Relationship HQ", "mission@aiocrm.local", "local-stub", "connected", 1, 1, now, json.dumps({"adapter": "local-stub"})),
                ("mailbox-growth", "Growth Desk", "growth@aiocrm.local", "local-stub", "connected", 1, 1, now, json.dumps({"adapter": "local-stub"})),
            ]
            threads = [
                (
                    "thread-jenna-launch", "mailbox-primary", "email", "Launch sequencing and executive narrative",
                    "Jenna wants a tighter launch story.", "waiting_on_us", json.dumps({"high_intent": True, "hot_lead": True, "needs_human": True}),
                    "critical", 96, "ECHO", "STRIKER", "contact-jenna", "company-techcorp", "manual", now, now, now, now,
                ),
                (
                    "thread-sarah-demo", "mailbox-growth", "email", "Enterprise demo follow-up",
                    "Sarah is aligned on value but waiting on procurement.", "waiting_on_them", json.dumps({"high_intent": True, "hot_lead": True, "follow_up_due": True}),
                    "high", 84, "STRIKER", "STRIKER", "contact-sarah", "company-finserve", "automated", now, now, now, now,
                ),
                (
                    "thread-emily-internal", "mailbox-primary", "internal", "Trial expansion plan",
                    "Internal planning around Emily’s conversion path.", "scheduled", json.dumps({"follow_up_due": True}),
                    "medium", 68, "ALPHA", "ECHO", "contact-emily", "company-edulearn", "automated", now, now, now, now,
                ),
            ]
            messages = [
                ("msg-jenna-1", "thread-jenna-launch", "email", "inbound", "Jenna Best", "jennalarinbest@gmail.com", json.dumps(["mission@aiocrm.local"]), "We are close. I need a tighter rollout plan and a clearer story for leadership before I approve the next phase.", "We are close. I need a tighter rollout plan and a clearer story for leadership before I approve the next phase.", "", "received", now, now),
                ("msg-sarah-1", "thread-sarah-demo", "email", "inbound", "Sarah Chen", "sarah.chen@finserve.com", json.dumps(["growth@aiocrm.local"]), "This looks solid. I need to line up procurement and security review timing.", "This looks solid. I need to line up procurement and security review timing.", "", "received", now, now),
                ("msg-emily-1", "thread-emily-internal", "internal", "system", "ALPHA", "system@aiocrm.local", json.dumps(["Internal"]), "Create a follow-up pack for EduLearn focused on active feature adoption and a 30-day conversion path.", "Create a follow-up pack for EduLearn focused on active feature adoption and a 30-day conversion path.", "", "logged", now, now),
            ]
            thread_briefs = [
                ("thread-jenna-launch", "Jenna is close to approving the next phase but wants a sharper launch plan.", "Active relationship signal", "Send a milestone-based rollout and leadership summary.", 0.94, json.dumps(["Confirm launch date", "Confirm approvers"]), json.dumps(["Enterprise upsell potential"]), json.dumps(["High intent signal", "Human intervention advised"]), now),
                ("thread-sarah-demo", "The demo landed. Procurement timing is the only blocker.", "Active relationship signal", "Send a concise procurement-forward follow-up with booking option.", 0.88, json.dumps(["Security review owner"]), json.dumps(["Possible flagship finance account"]), json.dumps(["High intent signal", "AI-assisted response is viable"]), now),
                ("thread-emily-internal", "The trial is healthy but the buying trigger is still vague.", "Active relationship signal", "Prepare a tailored follow-up tied to active usage.", 0.78, json.dumps(["Decision timeline"]), json.dumps(["Could become an education playbook"]), json.dumps(["Stable thread", "Follow-up due"]), now),
            ]
            thread_actions = [
                ("thread-action-1", "thread-jenna-launch", "Summarize", "summarize", "ai", "suggested", now, now),
                ("thread-action-2", "thread-jenna-launch", "Reply with AI", "reply-with-ai", "ai", "suggested", now, now),
                ("thread-action-3", "thread-sarah-demo", "Reply with AI", "reply-with-ai", "ai", "suggested", now, now),
            ]
            thread_links = [
                ("thread-link-1", "thread-jenna-launch", "contact", "contact-jenna", "Jenna Best"),
                ("thread-link-2", "thread-jenna-launch", "company", "company-techcorp", "TechCorp Solutions"),
                ("thread-link-3", "thread-sarah-demo", "contact", "contact-sarah", "Sarah Chen"),
                ("thread-link-4", "thread-sarah-demo", "company", "company-finserve", "FinServe Inc"),
                ("thread-link-5", "thread-emily-internal", "contact", "contact-emily", "Emily Watson"),
                ("thread-link-6", "thread-emily-internal", "company", "company-edulearn", "EduLearn Platform"),
            ]
            calendar_events = [
                (
                    "calendar-event-emily-followup",
                    "calendar-comms",
                    "calendar-source-local",
                    "thread-emily-internal",
                    "contact-emily",
                    "company-edulearn",
                    "EduLearn conversion strategy review",
                    "Internal follow-up generated from Comms scheduling.",
                    now,
                    (datetime.now(UTC) + timedelta(minutes=30)).isoformat(),
                    "scheduled",
                    "other",
                    "Comms command room",
                    "",
                    "local",
                    "",
                    now,
                    "local-first",
                    "clear",
                    "Created locally from the Comms workspace.",
                    None,
                    json.dumps({}),
                    "comms",
                    now,
                    now,
                )
            ]

            conn.executemany(
                """
                INSERT INTO contacts (
                    id, contact_id, organization_id, tenant_id, first_name, last_name, email, phone, company, company_id,
                    title, department, owner, source, status, lead_score, quality, engagement, tags_json,
                    last_contacted_at, pipeline_stage, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], row[1], row[2], self._default_tenant_id(), *row[3:]) for row in contacts],
            )
            conn.executemany("INSERT INTO companies (id, tenant_id, name, industry, size, website, owner) VALUES (?, ?, ?, ?, ?, ?, ?)", [(row[0], self._default_tenant_id(), *row[1:]) for row in companies])
            conn.executemany("INSERT INTO tags (id, tenant_id, name, color, type, usage_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [(row[0], self._default_tenant_id(), *row[1:]) for row in tags])
            conn.executemany(
                """
                INSERT INTO forms (
                    id, tenant_id, name, slug, description, schema_json, settings_json, is_active,
                    responses_count, last_response_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], self._default_tenant_id(), *row[1:]) for row in forms],
            )
            conn.executemany(
                "INSERT INTO mailboxes (id, tenant_id, name, address, provider, status, inbound_enabled, outbound_enabled, last_synced_at, config_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(row[0], self._default_tenant_id(), *row[1:]) for row in mailboxes],
            )
            conn.executemany(
                """
                INSERT INTO threads (
                    id, tenant_id, mailbox_id, channel_type, subject, generated_title, status, ai_flags_json,
                    ai_priority, priority_score, owner, assignee, contact_id, company_id,
                    automation_state, last_activity_at, next_follow_up_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], self._default_tenant_id(), *row[1:]) for row in threads],
            )
            conn.executemany(
                """
                INSERT INTO messages (
                    id, tenant_id, thread_id, channel_type, direction, sender_name, sender_email, recipients_json,
                    body, plain_text, quoted_history, delivery_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], self._default_tenant_id(), *row[1:]) for row in messages],
            )
            conn.executemany(
                """
                INSERT INTO thread_ai_briefs (
                    thread_id, tenant_id, summary, disposition, recommended_next_step, confidence,
                    unresolved_questions_json, crm_implications_json, reasoning_cues_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], self._default_tenant_id(), *row[1:]) for row in thread_briefs],
            )
            conn.executemany(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(row[0], self._default_tenant_id(), *row[1:]) for row in thread_actions],
            )
            conn.executemany(
                "INSERT INTO thread_links (id, tenant_id, thread_id, source_type, source_id, label) VALUES (?, ?, ?, ?, ?, ?)",
                [(row[0], self._default_tenant_id(), *row[1:]) for row in thread_links],
            )
            conn.executemany(
                """
                INSERT INTO calendar_events (
                    id, tenant_id, calendar_id, source_id, thread_id, contact_id, company_id, title, description,
                    start_time, end_time, status, location_type, location, meeting_url, sync_status,
                    external_event_ref, last_synced_at, authority_mode, conflict_state, sync_note, imported_at,
                    source_payload_json, source, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], self._default_tenant_id(), *row[1:]) for row in calendar_events],
            )
            self._backfill_tenant_ids(conn)

    def _rows(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def _tenant_rows(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return self._rows(query, (self._tenant_id(), *params))

    def _calendar_event_from_row(self, row: dict[str, Any]) -> dict[str, Any]:
        event = dict(row)
        event["source_payload"] = json_loads(event.pop("source_payload_json", None), {})
        event["authority_mode"] = event.get("authority_mode") or "local-first"
        event["conflict_state"] = event.get("conflict_state") or "clear"
        event["sync_note"] = event.get("sync_note") or ""
        event["all_day"] = bool(event.get("all_day", 0))
        return event

    def _contact_from_row(self, row: dict[str, Any]) -> dict[str, Any]:
        contact = dict(row)
        contact["tags"] = json_loads(contact.pop("tags_json", None), [])
        contact["address"] = json_loads(contact.pop("address_json", None), {})
        contact["custom_fields"] = json_loads(contact.pop("custom_fields_json", None), {})
        contact["opt_in_email"] = bool(contact.get("opt_in_email", 1))
        contact["opt_in_sms"] = bool(contact.get("opt_in_sms", 1))
        contact["opt_in_calls"] = bool(contact.get("opt_in_calls", 1))
        contact["opt_in_flows"] = bool(contact.get("opt_in_flows", 1))
        if contact.get("email_verified") is None:
            contact["email_verified"] = None
        else:
            contact["email_verified"] = bool(contact.get("email_verified"))
        return contact

    def _email_verifier_config_from_row(self, row: dict[str, Any] | None, *, include_secret: bool = False) -> dict[str, Any]:
        if not row:
            return {
                "id": None,
                "tenant_id": self._tenant_id(),
                "provider": "reoon",
                "enabled": False,
                "auto_verify_contacts": True,
                "default_mode": "quick",
                "last_tested_at": None,
                "status": "unconfigured",
                "last_error": None,
                "has_api_key": False,
                "api_key": "" if include_secret else None,
                "created_at": None,
                "updated_at": None,
            }
        config = dict(row)
        api_key = str(config.get("api_key") or "").strip()
        config["enabled"] = bool(config.get("enabled"))
        config["auto_verify_contacts"] = bool(config.get("auto_verify_contacts", 1))
        config["provider"] = config.get("provider") or "reoon"
        config["default_mode"] = config.get("default_mode") or "quick"
        config["status"] = config.get("status") or ("active" if api_key else "unconfigured")
        config["last_error"] = str(config.get("last_error") or "").strip() or None
        config["has_api_key"] = bool(api_key)
        config["api_key"] = api_key if include_secret else None
        return config

    def get_email_verifier_config(self, *, include_secret: bool = False) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM email_verifier_configs WHERE tenant_id = ? LIMIT 1",
                (self._tenant_id(),),
            ).fetchone()
        return self._email_verifier_config_from_row(dict(row) if row else None, include_secret=include_secret)

    def upsert_email_verifier_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        current = self.get_email_verifier_config(include_secret=True)
        api_key = str(payload.get("api_key") if "api_key" in payload else current.get("api_key") or "").strip()
        enabled = bool(payload.get("enabled", current.get("enabled", False)) and api_key)
        auto_verify_contacts = bool(payload.get("auto_verify_contacts", current.get("auto_verify_contacts", True)))
        next_status = payload.get("status")
        if next_status is None:
            if not api_key:
                next_status = "unconfigured"
            elif enabled:
                next_status = "active"
            else:
                next_status = "disabled"
        record = {
            "id": current.get("id") or f"email-verifier-config-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "provider": "reoon",
            "api_key": api_key,
            "enabled": int(enabled),
            "auto_verify_contacts": int(auto_verify_contacts),
            "default_mode": "power" if str(payload.get("default_mode") or current.get("default_mode") or "quick").strip().lower() == "power" else "quick",
            "last_tested_at": payload.get("last_tested_at") if "last_tested_at" in payload else current.get("last_tested_at"),
            "status": next_status,
            "last_error": str(payload.get("last_error") if "last_error" in payload else current.get("last_error") or "").strip() or None,
            "created_at": current.get("created_at") or now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO email_verifier_configs (
                    id, tenant_id, provider, api_key, enabled, auto_verify_contacts, default_mode, last_tested_at, status, last_error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenant_id) DO UPDATE SET
                    provider = excluded.provider,
                    api_key = excluded.api_key,
                    enabled = excluded.enabled,
                    auto_verify_contacts = excluded.auto_verify_contacts,
                    default_mode = excluded.default_mode,
                    last_tested_at = excluded.last_tested_at,
                    status = excluded.status,
                    last_error = excluded.last_error,
                    updated_at = excluded.updated_at
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["provider"],
                    record["api_key"],
                    record["enabled"],
                    record["auto_verify_contacts"],
                    record["default_mode"],
                    record["last_tested_at"],
                    record["status"],
                    record["last_error"],
                    record["created_at"],
                    record["updated_at"],
                ),
            )
            conn.commit()
        return self.get_email_verifier_config(include_secret=False)

    def mark_email_verifier_config_status(self, *, status: str, last_tested_at: str | None = None, last_error: str | None = None) -> dict[str, Any]:
        current = self.get_email_verifier_config(include_secret=True)
        updates: dict[str, Any] = {
            "status": status,
            "last_tested_at": last_tested_at or utcnow(),
        }
        if last_error:
            updates["last_error"] = last_error
        elif status != "error":
            updates["last_error"] = None
        if last_error and "error" in status:
            updates["status"] = "error"
        return self.upsert_email_verifier_config({
            **updates,
            "api_key": current.get("api_key") or "",
            "enabled": current.get("enabled", False),
            "auto_verify_contacts": current.get("auto_verify_contacts", True),
            "default_mode": current.get("default_mode", "quick"),
        })

    def delete_email_verifier_config(self) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM email_verifier_configs WHERE tenant_id = ?",
                (self._tenant_id(),),
            )
            conn.commit()
        return self.get_email_verifier_config(include_secret=False)

    def _contact_rows_by_ids(self, conn: sqlite3.Connection, contact_ids: list[str]) -> list[sqlite3.Row]:
        normalized_ids = [str(item).strip() for item in contact_ids if str(item).strip()]
        if not normalized_ids:
            return []
        rows: list[sqlite3.Row] = []
        chunk_size = 400
        for start in range(0, len(normalized_ids), chunk_size):
            chunk = normalized_ids[start:start + chunk_size]
            placeholders = ", ".join("?" for _ in chunk)
            rows.extend(
                conn.execute(
                    f"SELECT * FROM contacts WHERE tenant_id = ? AND id IN ({placeholders})",
                    (self._tenant_id(), *chunk),
                ).fetchall()
            )
        return rows

    def resolve_email_verification_targets(self, *, contact_ids: list[str] | None = None, emails: list[str] | None = None) -> list[dict[str, Any]]:
        normalized_emails = {str(item or "").strip().lower() for item in (emails or []) if str(item or "").strip()}
        targets: dict[str, dict[str, Any]] = {}
        with self._connect() as conn:
            if contact_ids:
                for row in self._contact_rows_by_ids(conn, contact_ids):
                    email = str(row["email"] or "").strip().lower()
                    if not email:
                        continue
                    targets[email] = {"contact_id": row["id"], "email": email}
            for email in normalized_emails:
                targets.setdefault(email, {"contact_id": None, "email": email})
        return list(targets.values())

    def _email_verification_task_from_row(self, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if not row:
            return None
        task = dict(row)
        task["targets"] = json_loads(task.pop("targets_json", None), [])
        return task

    def create_email_verification_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"email-verify-task-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "provider_task_id": str(payload.get("provider_task_id") or "").strip() or None,
            "status": payload.get("status") or "queued",
            "mode": payload.get("mode") or "power",
            "submitted_count": int(payload.get("submitted_count") or 0),
            "completed_count": int(payload.get("completed_count") or 0),
            "valid_count": int(payload.get("valid_count") or 0),
            "risky_count": int(payload.get("risky_count") or 0),
            "invalid_count": int(payload.get("invalid_count") or 0),
            "unknown_count": int(payload.get("unknown_count") or 0),
            "targets_json": json.dumps(payload.get("targets") or []),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
            "completed_at": payload.get("completed_at"),
            "last_error": payload.get("last_error"),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO email_verification_tasks (
                    id, tenant_id, provider_task_id, status, mode, submitted_count, completed_count,
                    valid_count, risky_count, invalid_count, unknown_count, targets_json,
                    created_at, updated_at, completed_at, last_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["provider_task_id"],
                    record["status"],
                    record["mode"],
                    record["submitted_count"],
                    record["completed_count"],
                    record["valid_count"],
                    record["risky_count"],
                    record["invalid_count"],
                    record["unknown_count"],
                    record["targets_json"],
                    record["created_at"],
                    record["updated_at"],
                    record["completed_at"],
                    record["last_error"],
                ),
            )
            conn.commit()
        return self.get_email_verification_task(record["id"])

    def get_email_verification_task(self, task_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM email_verification_tasks WHERE id = ? AND tenant_id = ? LIMIT 1",
                (task_id, self._tenant_id()),
            ).fetchone()
        return self._email_verification_task_from_row(dict(row) if row else None)

    def update_email_verification_task(self, task_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = dict(updates or {})
        if "targets" in payload:
            payload["targets_json"] = json.dumps(payload.pop("targets") or [])
        payload["updated_at"] = utcnow()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM email_verification_tasks WHERE id = ? AND tenant_id = ? LIMIT 1",
                (task_id, self._tenant_id()),
            ).fetchone()
            if not existing:
                raise ValueError("Email verification task not found")
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(
                f"UPDATE email_verification_tasks SET {assignments} WHERE id = ? AND tenant_id = ?",
                (*payload.values(), task_id, self._tenant_id()),
            )
            conn.commit()
        return self.get_email_verification_task(task_id)

    def apply_email_verification_result(self, contact_id: str, result: dict[str, Any], *, expected_email: str | None = None) -> dict[str, Any]:
        normalized_status = str(result.get("status") or "unknown").strip().lower() or "unknown"
        verified_at = result.get("verifiedAt") or utcnow()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1",
                (contact_id, self._tenant_id()),
            ).fetchone()
            if not existing:
                raise ValueError("Contact not found")
            if expected_email and str(existing["email"] or "").strip().lower() != str(expected_email).strip().lower():
                return self._contact_from_row(dict(existing))
            conn.execute(
                """
                UPDATE contacts
                SET email_verified = ?, email_verified_at = ?, email_verification_status = ?, email_verification_score = ?, updated_at = ?
                WHERE id = ? AND tenant_id = ?
                """,
                (
                    int(bool(result.get("is_safe_to_send"))),
                    verified_at,
                    normalized_status,
                    result.get("score"),
                    utcnow(),
                    contact_id,
                    self._tenant_id(),
                ),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1",
                (contact_id, self._tenant_id()),
            ).fetchone()
        return self._contact_from_row(dict(refreshed))

    def apply_email_verification_task_results(self, task_id: str, results: dict[str, dict[str, Any]]) -> dict[str, Any]:
        task = self.get_email_verification_task(task_id)
        if not task:
            raise ValueError("Email verification task not found")

        targets = task.get("targets") if isinstance(task.get("targets"), list) else []
        target_by_email = {
            str(item.get("email") or "").strip().lower(): item
            for item in targets
            if isinstance(item, dict) and str(item.get("email") or "").strip()
        }
        now = utcnow()
        updates: list[tuple[Any, ...]] = []

        with self._connect() as conn:
            for email, result in (results or {}).items():
                normalized_email = str(email or "").strip().lower()
                if not normalized_email:
                    continue
                target = target_by_email.get(normalized_email)
                contact_row = None
                if target and target.get("contact_id"):
                    contact_row = conn.execute(
                        "SELECT id, email FROM contacts WHERE id = ? AND tenant_id = ? LIMIT 1",
                        (target["contact_id"], self._tenant_id()),
                    ).fetchone()
                    if contact_row and str(contact_row["email"] or "").strip().lower() != normalized_email:
                        continue
                if contact_row is None:
                    contact_row = conn.execute(
                        "SELECT id, email FROM contacts WHERE tenant_id = ? AND LOWER(email) = LOWER(?) LIMIT 1",
                        (self._tenant_id(), normalized_email),
                    ).fetchone()
                if not contact_row:
                    continue
                updates.append(
                    (
                        int(bool(result.get("is_safe_to_send"))),
                        result.get("verifiedAt") or now,
                        str(result.get("status") or "unknown").strip().lower() or "unknown",
                        result.get("score"),
                        now,
                        contact_row["id"],
                        self._tenant_id(),
                    )
                )

            if updates:
                conn.executemany(
                    """
                    UPDATE contacts
                    SET email_verified = ?, email_verified_at = ?, email_verification_status = ?, email_verification_score = ?, updated_at = ?
                    WHERE id = ? AND tenant_id = ?
                    """,
                    updates,
                )
                conn.commit()
        return self.update_email_verification_task(task_id, {"completed_at": now, "last_error": None})

    def _form_from_row(self, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "folder_id": row.get("folder_id"),
            "slug": row["slug"],
            "description": row["description"],
            "schema": json_loads(row["schema_json"], []),
            "settings": json_loads(row["settings_json"], {}),
            "status": row.get("status") or ("Active" if row.get("is_active") else "Draft"),
            "is_active": bool(row["is_active"]),
            "responses_count": row["responses_count"],
            "last_active": row.get("last_active"),
            "last_modified_by": row.get("last_modified_by"),
            "creator": row.get("creator"),
            "triggers": json_loads(row.get("triggers_json"), None),
            "automation": json_loads(row.get("automation_json"), None),
            "last_response_at": row["last_response_at"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_modified_at": row["updated_at"],
        }

    def _thread_queue_ids(self, thread: dict[str, Any]) -> list[str]:
        flags = thread.get("aiFlags") or thread.get("ai_flags") or {}
        if thread["status"] == "archived":
            return ["archived"]
        if thread["status"] == "closed":
            return ["closed"]
        queue_ids: list[str] = []
        if thread["status"] == "new" or flags.get("needs_human") or thread.get("priority_score", 0) >= 88:
            queue_ids.append("now")
        if thread["status"] == "waiting_on_us":
            queue_ids.append("needs-reply")
        if thread["status"] == "waiting_on_them":
            queue_ids.append("waiting")
        if flags.get("hot_lead") or flags.get("high_intent"):
            queue_ids.append("hot-leads")
        if flags.get("at_risk"):
            queue_ids.append("at-risk")
        if thread["status"] == "scheduled" or flags.get("follow_up_due"):
            queue_ids.append("scheduled")
        if thread.get("automation_state") == "automated":
            queue_ids.append("automated")
        return queue_ids

    def _get_thread_context(self) -> list[dict[str, Any]]:
        tenant_id = self._tenant_id()
        contacts = {contact["id"]: contact for contact in self.list_contacts()}
        companies = {company["id"]: company for company in self.list_companies()}
        with self._connect() as conn:
            mailboxes = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM mailboxes WHERE tenant_id = ?", (tenant_id,)).fetchall()}
            message_rows = [dict(row) for row in conn.execute("SELECT * FROM messages WHERE tenant_id = ? ORDER BY created_at ASC", (tenant_id,)).fetchall()]
            brief_rows = {row["thread_id"]: dict(row) for row in conn.execute("SELECT * FROM thread_ai_briefs WHERE tenant_id = ?", (tenant_id,)).fetchall()}
            action_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM thread_actions WHERE tenant_id = ? ORDER BY created_at ASC", (tenant_id,)).fetchall():
                payload = dict(row)
                action_rows.setdefault(payload["thread_id"], []).append(payload)
            link_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM thread_links WHERE tenant_id = ?", (tenant_id,)).fetchall():
                payload = dict(row)
                link_rows.setdefault(payload["thread_id"], []).append(payload)
            artifact_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM thread_artifacts WHERE tenant_id = ? ORDER BY created_at DESC", (tenant_id,)).fetchall():
                payload = dict(row)
                artifact_rows.setdefault(payload["thread_id"], []).append(payload)
            calendar_event_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM calendar_events WHERE tenant_id = ? ORDER BY start_time ASC", (tenant_id,)).fetchall():
                payload = dict(row)
                calendar_event_rows.setdefault(payload["thread_id"], []).append(payload)
            threads = [dict(row) for row in conn.execute("SELECT * FROM threads WHERE tenant_id = ? ORDER BY last_activity_at DESC", (tenant_id,)).fetchall()]

        hydrated = []
        for thread in threads:
            thread_messages = []
            for message in message_rows:
                if message["thread_id"] != thread["id"]:
                    continue
                thread_messages.append(
                    {
                        **message,
                        "recipients": json_loads(message.pop("recipients_json"), []),
                    }
                )
            brief_row = brief_rows.get(thread["id"])
            brief = {
                "summary": brief_row["summary"],
                "disposition": brief_row["disposition"],
                "recommended_next_step": brief_row["recommended_next_step"],
                "confidence": brief_row["confidence"],
                "unresolved_questions": json_loads(brief_row["unresolved_questions_json"], []),
                "crm_implications": json_loads(brief_row["crm_implications_json"], []),
                "reasoning_cues": json_loads(brief_row["reasoning_cues_json"], []),
            } if brief_row else {}
            ai_flags = json_loads(thread.pop("ai_flags_json"), {})
            latest_message = thread_messages[-1] if thread_messages else None
            hydrated.append(
                {
                    **thread,
                    "aiFlags": ai_flags,
                    "brief": brief,
                    "actions": action_rows.get(thread["id"], []),
                    "artifacts": artifact_rows.get(thread["id"], []),
                    "links": link_rows.get(thread["id"], []),
                    "calendarEvents": calendar_event_rows.get(thread["id"], []),
                    "mailbox": mailboxes.get(thread["mailbox_id"]),
                    "contact": contacts.get(thread["contact_id"]),
                    "company": companies.get(thread["company_id"]),
                    "messages": thread_messages,
                    "latestMessage": latest_message,
                    "preview": (latest_message["plain_text"] if latest_message else brief.get("summary")) or thread["generated_title"],
                    "queueIds": self._thread_queue_ids({**thread, "aiFlags": ai_flags}),
                }
            )
        return hydrated

    def health(self) -> dict[str, Any]:
        return {"provider": self.provider_name, "status": "ready", "db_path": str(self.db_path)}

    def list_contacts(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM contacts WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC")
        return [self._contact_from_row(row) for row in rows]

    def create_contact(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"contact-{unique_suffix()}",
            "contact_id": payload.get("contact_id") or f"CNT-{unique_suffix().upper()}",
            "organization_id": payload.get("organization_id") or "org-1",
            "tenant_id": self._tenant_id(),
            "first_name": payload.get("first_name"),
            "last_name": payload.get("last_name"),
            "email": payload.get("email"),
            "phone": payload.get("phone"),
            "company": payload.get("company"),
            "company_id": payload.get("company_id"),
            "title": payload.get("title"),
            "department": payload.get("department"),
            "owner": payload.get("owner") or "AIO Flow",
            "source": payload.get("source") or "Manual Entry",
            "status": payload.get("status") or "contact",
            "lead_score": payload.get("lead_score") or 50,
            "quality": payload.get("quality") or "warm",
            "engagement": payload.get("engagement") or "medium",
            "tags_json": json.dumps(payload.get("tags") or []),
            "last_contacted_at": payload.get("last_contacted_at"),
            "pipeline_stage": payload.get("pipeline_stage") or "New",
            "email_verified": None if "email_verified" not in payload else (None if payload.get("email_verified") is None else int(bool(payload.get("email_verified")))),
            "email_verified_at": payload.get("email_verified_at"),
            "email_verification_status": payload.get("email_verification_status"),
            "email_verification_score": payload.get("email_verification_score"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
            "deleted_at": payload.get("deleted_at"),
            "website": payload.get("website"),
            "dob": payload.get("dob"),
            "owner_id": payload.get("owner_id"),
            "address_json": json.dumps(payload.get("address") or {}),
            "custom_fields_json": json.dumps(payload.get("custom_fields") or {}),
            "opt_in_email": int(payload.get("opt_in_email", True)),
            "opt_in_sms": int(payload.get("opt_in_sms", True)),
            "opt_in_calls": int(payload.get("opt_in_calls", True)),
            "opt_in_flows": int(payload.get("opt_in_flows", True)),
            "ai_employee": payload.get("ai_employee"),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO contacts (
                    id, contact_id, organization_id, tenant_id, first_name, last_name, email, phone, company, company_id,
                    title, department, owner, source, status, lead_score, quality, engagement, tags_json,
                    last_contacted_at, pipeline_stage, email_verified, email_verified_at, email_verification_status, email_verification_score,
                    created_at, updated_at, deleted_at, website, dob, owner_id,
                    address_json, custom_fields_json, opt_in_email, opt_in_sms, opt_in_calls, opt_in_flows, ai_employee
                ) VALUES (
                    :id, :contact_id, :organization_id, :tenant_id, :first_name, :last_name, :email, :phone, :company, :company_id,
                    :title, :department, :owner, :source, :status, :lead_score, :quality, :engagement, :tags_json,
                    :last_contacted_at, :pipeline_stage, :email_verified, :email_verified_at, :email_verification_status, :email_verification_score,
                    :created_at, :updated_at, :deleted_at, :website, :dob, :owner_id,
                    :address_json, :custom_fields_json, :opt_in_email, :opt_in_sms, :opt_in_calls, :opt_in_flows, :ai_employee
                )
                """,
                record,
            )
            conn.commit()
        return self._contact_from_row(record)

    def update_contact(self, contact_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        allowed_scalar = {
            "first_name", "last_name", "email", "phone", "company", "company_id", "title", "department",
            "owner", "source", "status", "lead_score", "quality", "engagement", "last_contacted_at",
            "pipeline_stage", "deleted_at", "website", "dob", "owner_id", "ai_employee",
            "email_verified", "email_verified_at", "email_verification_status", "email_verification_score"
        }
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM contacts WHERE id = ? AND tenant_id = ?", (contact_id, self._tenant_id())).fetchone()
            if not existing:
                raise ValueError("Contact not found")
            payload = {}
            for key in allowed_scalar:
                if key in updates:
                    if key == "email_verified":
                        payload[key] = None if updates[key] is None else int(bool(updates[key]))
                    else:
                        payload[key] = updates[key]
            if "email" in updates:
                next_email = str(updates.get("email") or "").strip().lower()
                current_email = str(existing["email"] or "").strip().lower()
                if next_email != current_email:
                    payload["email_verified"] = None
                    payload["email_verified_at"] = None
                    payload["email_verification_status"] = None
                    payload["email_verification_score"] = None
            if "tags" in updates:
                payload["tags_json"] = json.dumps(updates.get("tags") or [])
            if "address" in updates:
                payload["address_json"] = json.dumps(updates.get("address") or {})
            if "custom_fields" in updates:
                payload["custom_fields_json"] = json.dumps(updates.get("custom_fields") or {})
            for key in ["opt_in_email", "opt_in_sms", "opt_in_calls", "opt_in_flows"]:
                if key in updates:
                    payload[key] = int(bool(updates[key]))
            if not payload:
                return self._contact_from_row(dict(existing))
            payload["updated_at"] = utcnow()
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(f"UPDATE contacts SET {assignments} WHERE id = ? AND tenant_id = ?", (*payload.values(), contact_id, self._tenant_id()))
            conn.commit()
            refreshed = conn.execute("SELECT * FROM contacts WHERE id = ? AND tenant_id = ?", (contact_id, self._tenant_id())).fetchone()
        return self._contact_from_row(dict(refreshed))

    def list_companies(self) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM companies WHERE tenant_id = ? ORDER BY name ASC")

    def list_tags(self) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM tags WHERE tenant_id = ? ORDER BY name ASC")

    def get_tag_by_name(self, name: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM tags WHERE UPPER(name) = UPPER(?) AND tenant_id = ?",
                (name, self._tenant_id()),
            ).fetchone()
        return dict(row) if row else None

    def create_tag(self, payload: dict[str, Any]) -> dict[str, Any]:
        name = str(payload.get("name", "")).strip().upper()
        if ":" not in name:
            raise ValueError("Tag must follow PREFIX:NAME format.")
        
        prefix = name.split(":", 1)[0]
        canonical_prefixes = {"AI", "AUT", "CRM", "CS", "MKT", "MKG", "MTG", "CP", "CD", "EVT", "OPS", "PM", "META", "ROLE"}
        if prefix not in canonical_prefixes:
            raise ValueError(f"Invalid prefix '{prefix}'. Allowed: {', '.join(sorted(canonical_prefixes))}")

        if self.get_tag_by_name(name):
            raise ValueError(f"Tag '{name}' already exists.")

        now = utcnow()
        tag_id = payload.get("id") or f"tag-{unique_suffix()}"
        prefix = name.split(":", 1)[0]
        tag_record = {
            "id": tag_id,
            "tenant_id": self._tenant_id(),
            "name": name,
            "prefix": prefix,
            "label": payload.get("label") or name.split(":", 1)[-1].title(),
            "description": payload.get("description") or "",
            "type": payload.get("type", "user"),
            "is_locked": 1 if payload.get("is_locked") else 0,
            "color": payload.get("color") or "#6b7280",
            "usage_count": 0,
            "created_at": now,
        }

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tags (id, tenant_id, name, prefix, label, description, type, is_locked, color, usage_count, created_at)
                VALUES (:id, :tenant_id, :name, :prefix, :label, :description, :type, :is_locked, :color, :usage_count, :created_at)
                """,
                tag_record,
            )
        return tag_record

    def update_tag(self, tag_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        tag = self._get_tag(tag_id)
        if not tag:
            raise ValueError("Tag not found")
        if tag.get("is_locked") and "name" in updates:
            raise ValueError("Cannot rename a locked system tag.")

        fields = ["label", "description", "color"]
        payload = {k: updates[k] for k in fields if k in updates and updates[k] is not None}
        if not payload:
            return tag

        set_clause = ", ".join([f"{k} = :{k}" for k in payload])
        with self._connect() as conn:
            conn.execute(f"UPDATE tags SET {set_clause} WHERE id = :id AND tenant_id = :tenant_id", {**payload, "id": tag_id, "tenant_id": self._tenant_id()})
        return self._get_tag(tag_id)

    def delete_tag(self, tag_id: str) -> None:
        tag = self._get_tag(tag_id)
        if not tag:
            return
        if tag.get("is_locked") or tag.get("type") == "system":
            raise ValueError("System tags cannot be deleted.")

        with self._connect() as conn:
            conn.execute("DELETE FROM tags WHERE id = ? AND tenant_id = ?", (tag_id, self._tenant_id()))
            conn.execute("DELETE FROM brain_item_tags WHERE tag_id = ? AND tenant_id = ?", (tag_id, self._tenant_id()))

    def _get_tag(self, tag_id: str) -> dict[str, Any] | None:
        # _tenant_rows appends tenant_id as last param; include it explicitly here
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM tags WHERE id = ? AND tenant_id = ?",
                (tag_id, self._tenant_id()),
            ).fetchone()
        return dict(row) if row else None

    def get_tags_by_prefix(self, prefix: str) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM tags WHERE prefix = ? AND tenant_id = ?", (prefix.upper(),))

    def seed_canonical_tags(self, conn: sqlite3.Connection = None) -> None:
        now = utcnow()
        tenant_id = self._default_tenant_id()
        seeds = [
            # META
            ("META:AGENT", "META", "Agent", "Meta agent tag.", "system", 1, "#888888"),
            ("META:ACCESS:INTERNAL", "META", "Internal Access", "Internal access level.", "system", 1, "#888888"),
            ("META:DOC:HELP", "META", "Help Documentation", "Help documentation.", "system", 1, "#888888"),
            # CRM
            ("CRM:HOT", "CRM", "Hot Lead", "High priority potential customer.", "system", 1, "#ef4444"),
            ("CRM:WARM", "CRM", "Warm Lead", "Medium priority lead.", "system", 1, "#f97316"),
            ("CRM:COLD", "CRM", "Cold Lead", "Low priority/initial contact.", "system", 1, "#3b82f6"),
            # AI
            ("AI:BOT", "AI", "AI Bot", "Interaction handled by autonomous agents.", "system", 1, "#8b5cf6"),
            ("AI:AUT", "AI", "AI Authoring Tool", "AI authoring/automation tool.", "system", 1, "#a855f7"),
            # Marketing
            ("MKG:EMAIL", "MKG", "Email Marketing", "Engagement via email campaigns.", "system", 1, "#10b981"),
            ("MKT:DIGITAL", "MKT", "Digital Marketing", "Digital marketing campaigns.", "system", 1, "#06b6d4"),
            # Meetings
            ("MTG:SCHEDULE", "MTG", "Meeting Scheduled", "Meeting has been scheduled.", "system", 1, "#f59e0b"),
            # Capture
            ("CP:LEAD", "CP", "Lead Capture", "Lead captured via form or other.", "system", 1, "#ec4899"),
            # Content
            ("CD:ASSET", "CD", "Content Asset", "Creative/content asset.", "system", 1, "#14b8a6"),
            # Events
            ("EVT:WEBINAR", "EVT", "Webinar Event", "Webinar event.", "system", 1, "#6366f1"),
            # Operations
            ("PM:PROJECT", "PM", "Project", "Project management.", "system", 1, "#84cc16"),
            # Roles
            ("ROLE:CMD", "ROLE", "Command", "Command access role.", "system", 1, "#64748b"),
            ("ROLE:BIZ", "ROLE", "Business", "Business role.", "system", 1, "#64748b"),
            ("ROLE:CS", "ROLE", "Customer Service", "Customer service role.", "system", 1, "#64748b"),
            ("ROLE:VIS", "ROLE", "Visitor", "Visitor role.", "system", 1, "#64748b"),
            ("ROLE:COM", "ROLE", "Commerce", "Commerce role.", "system", 1, "#64748b"),
            ("ROLE:CPY", "ROLE", "Copywriting", "Copywriting role.", "system", 1, "#64748b"),
            ("ROLE:DEV", "ROLE", "Developer", "Developer role.", "system", 1, "#64748b"),
            ("ROLE:FIN", "ROLE", "Finance", "Finance role.", "system", 1, "#64748b"),
            ("ROLE:OPS", "ROLE", "Operations", "Operations role.", "system", 1, "#64748b"),
            ("ROLE:SEO", "ROLE", "SEO", "SEO role.", "system", 1, "#64748b"),
            ("ROLE:HR", "ROLE", "Human Resources", "HR role.", "system", 1, "#64748b"),
            ("ROLE:SLS", "ROLE", "Sales", "Sales role.", "system", 1, "#64748b"),
            ("ROLE:DES", "ROLE", "Design", "Design role.", "system", 1, "#64748b"),
            ("ROLE:SYS", "ROLE", "System", "System role.", "system", 1, "#64748b"),
        ]
        
        def _seed(db_conn):
            for name, prefix, label, desc, ttype, locked, color in seeds:
                existing = db_conn.execute("SELECT id FROM tags WHERE name = ? AND tenant_id = ?", (name, tenant_id)).fetchone()
                if not existing:
                    db_conn.execute(
                        """
                        INSERT INTO tags (id, tenant_id, name, prefix, label, description, type, is_locked, color, usage_count, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (f"tag-{unique_suffix()}", tenant_id, name, prefix, label, desc, ttype, locked, color, 0, now),
                    )

        if conn:
            _seed(conn)
        else:
            with self._connect() as conn:
                _seed(conn)

    def save_step_outcome(self, outcome: dict):
        """Phase 16: Persist structured step outcome for learning."""
        with self._connect() as conn:
            conn.execute("""
                INSERT INTO ai_step_outcomes (
                    id, run_id, intent, agent_name, agent_id, tool_name, 
                    status, error_category, recovery_attempted, recovery_success, duration_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f"out-{uuid4().hex[:8]}",
                outcome.get("run_id"),
                outcome.get("intent"),
                outcome.get("agent_name"),
                outcome.get("agent_id"),
                outcome.get("tool_name"),
                outcome.get("status"),
                outcome.get("error_category"),
                1 if outcome.get("recovery_attempted") else 0,
                1 if outcome.get("recovery_success") else 0,
                outcome.get("duration_ms", 0)
            ))
            conn.commit()

    def get_intent_performance(self, intent: str) -> list[dict]:
        """Phase 16: Retrieve historical performance for an intent."""
        with self._connect() as conn:
            rows = conn.execute("""
                SELECT agent_name, status, recovery_success, duration_ms
                FROM ai_step_outcomes
                WHERE intent = ?
                ORDER BY created_at DESC
                LIMIT 50
            """, (intent,)).fetchall()
            return [
                {
                    "agent_name": r[0],
                    "status": r[1],
                    "recovery_success": bool(r[2]),
                    "duration_ms": r[3]
                } for r in rows
            ]

    def get_brain_profile(self) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM brain_profiles WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 1",
                (self._tenant_id(),),
            ).fetchone()
        if row:
            return dict(row)
        now = utcnow()
        profile = {
            "id": f"brain-profile-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "company_name": "",
            "website": "",
            "industry": "",
            "overview": "",
            "mission": "",
            "brand_voice": "",
            "ideal_customer": "",
            "created_at": now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brain_profiles (
                    id, tenant_id, company_name, website, industry, overview, mission, brand_voice, ideal_customer, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile["id"],
                    profile["tenant_id"],
                    profile["company_name"],
                    profile["website"],
                    profile["industry"],
                    profile["overview"],
                    profile["mission"],
                    profile["brand_voice"],
                    profile["ideal_customer"],
                    profile["created_at"],
                    profile["updated_at"],
                ),
            )
            conn.commit()
        return profile

    def update_brain_profile(self, updates: dict[str, Any]) -> dict[str, Any]:
        existing = self.get_brain_profile()
        payload = {}
        for key in ["company_name", "website", "industry", "overview", "mission", "brand_voice", "ideal_customer"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        if not payload:
            return existing
        payload["updated_at"] = utcnow()
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            conn.execute(
                f"UPDATE brain_profiles SET {assignments} WHERE id = ? AND tenant_id = ?",
                (*payload.values(), existing["id"], self._tenant_id()),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM brain_profiles WHERE id = ? AND tenant_id = ?",
                (existing["id"], self._tenant_id()),
            ).fetchone()
        return dict(refreshed)

    def list_brain_sources(self) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM brain_sources WHERE tenant_id = ? ORDER BY updated_at DESC")

    def create_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"brain-source-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "label": payload.get("label") or "New Source",
            "source_type": payload.get("source_type") or "document",
            "status": payload.get("status") or "draft",
            "location": payload.get("location") or "",
            "notes": payload.get("notes") or "",
            "graph_x": payload.get("graph_x"),
            "graph_y": payload.get("graph_y"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brain_sources (
                    id, tenant_id, label, source_type, status, location, notes, graph_x, graph_y, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["label"],
                    record["source_type"],
                    record["status"],
                    record["location"],
                    record["notes"],
                    record["graph_x"],
                    record["graph_y"],
                    record["created_at"],
                    record["updated_at"],
                ),
            )
            conn.commit()
        return record

    def update_brain_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["label", "source_type", "status", "location", "notes", "graph_x", "graph_y"]:
            if key in updates:
                payload[key] = updates[key]
        if not payload:
            existing = next((item for item in self.list_brain_sources() if item["id"] == source_id), None)
            if not existing:
                raise ValueError("Brain source not found")
            return existing
        payload["updated_at"] = utcnow()
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM brain_sources WHERE id = ? AND tenant_id = ?",
                (source_id, self._tenant_id()),
            ).fetchone()
            if not row:
                raise ValueError("Brain source not found")
            conn.execute(
                f"UPDATE brain_sources SET {assignments} WHERE id = ? AND tenant_id = ?",
                (*payload.values(), source_id, self._tenant_id()),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM brain_sources WHERE id = ? AND tenant_id = ?",
                (source_id, self._tenant_id()),
            ).fetchone()
        return dict(refreshed)

    def delete_brain_source(self, source_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE brain_items SET source_id = NULL, updated_at = ? WHERE tenant_id = ? AND source_id = ?",
                (utcnow(), self._tenant_id(), source_id),
            )
            conn.execute(
                "DELETE FROM brain_chunks WHERE tenant_id = ? AND source_id = ?",
                (self._tenant_id(), source_id),
            )
            conn.execute(
                "DELETE FROM brain_ingests WHERE tenant_id = ? AND source_id = ?",
                (self._tenant_id(), source_id),
            )
            conn.execute(
                "DELETE FROM brain_links WHERE tenant_id = ? AND ((from_type = 'source' AND from_id = ?) OR (to_type = 'source' AND to_id = ?))",
                (self._tenant_id(), source_id, source_id),
            )
            conn.execute(
                "DELETE FROM brain_sources WHERE id = ? AND tenant_id = ?",
                (source_id, self._tenant_id()),
            )
            conn.commit()

    def list_brain_items(self, limit: int | None = None, tenant_id: str | None = None) -> list[dict[str, Any]]:
        target_tenant = tenant_id or self._tenant_id()
        query = "SELECT * FROM brain_items WHERE tenant_id = ? ORDER BY updated_at DESC"
        if limit:
            query += f" LIMIT {limit}"
        rows = self._rows(query, (target_tenant,))
        return [{**row, "tags": json_loads(row.pop("tags_json"), [])} for row in rows]

    def create_brain_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"brain-item-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "title": payload.get("title") or "New Knowledge Item",
            "category": payload.get("category") or "note",
            "content": payload.get("content") or "",
            "source_id": payload.get("source_id"),
            "status": payload.get("status") or "draft",
            "tags_json": json.dumps(payload.get("tags") or []),
            "graph_x": payload.get("graph_x"),
            "graph_y": payload.get("graph_y"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brain_items (
                    id, tenant_id, title, category, content, source_id, status, tags_json, graph_x, graph_y, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["title"],
                    record["category"],
                    record["content"],
                    record["source_id"],
                    record["status"],
                    record["tags_json"],
                    record["graph_x"],
                    record["graph_y"],
                    record["created_at"],
                    record["updated_at"],
                ),
            )
            conn.commit()
        return {**record, "tags": json_loads(record.pop("tags_json"), [])}

    def update_brain_item(self, item_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["title", "category", "content", "source_id", "status", "graph_x", "graph_y"]:
            if key in updates:
                payload[key] = updates[key]
        if "tags" in updates:
            payload["tags_json"] = json.dumps(updates.get("tags") or [])
        if not payload:
            existing = next((item for item in self.list_brain_items() if item["id"] == item_id), None)
            if not existing:
                raise ValueError("Brain item not found")
            return existing
        payload["updated_at"] = utcnow()
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM brain_items WHERE id = ? AND tenant_id = ?",
                (item_id, self._tenant_id()),
            ).fetchone()
            if not row:
                raise ValueError("Brain item not found")
            conn.execute(
                f"UPDATE brain_items SET {assignments} WHERE id = ? AND tenant_id = ?",
                (*payload.values(), item_id, self._tenant_id()),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM brain_items WHERE id = ? AND tenant_id = ?",
                (item_id, self._tenant_id()),
            ).fetchone()
        item = dict(refreshed)
        item["tags"] = json_loads(item.pop("tags_json"), [])
        return item
    def delete_brain_item(self, item_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM brain_links WHERE tenant_id = ? AND ((from_type = 'item' AND from_id = ?) OR (to_type = 'item' AND to_id = ?))",
                (self._tenant_id(), item_id, item_id),
            )
            conn.execute(
                "DELETE FROM brain_items WHERE id = ? AND tenant_id = ?",
                (item_id, self._tenant_id()),
            )
            conn.commit()

    def save_brain_chunks(self, chunks: list[dict[str, Any]]) -> None:
        now = utcnow()
        with self._connect() as conn:
            for chunk in chunks:
                conn.execute(
                    """
                    INSERT INTO brain_chunks (
                        id, tenant_id, source_id, ingest_id, ordinal, title, content, content_excerpt, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk.get("id") or f"chunk-{unique_suffix()}",
                        self._tenant_id(),
                        chunk["source_id"],
                        chunk["ingest_id"],
                        chunk.get("ordinal", 0),
                        chunk.get("title"),
                        chunk["content"],
                        chunk.get("content_excerpt") or summarize_excerpt(chunk["content"]),
                        now,
                        now
                    )
                )
            conn.commit()

    def list_brain_chunks(self, ingest_id: str | None = None) -> list[dict[str, Any]]:
        if ingest_id:
            rows = self._tenant_rows("SELECT * FROM brain_chunks WHERE tenant_id = ? AND ingest_id = ?", (ingest_id,))
        else:
            rows = self._tenant_rows("SELECT * FROM brain_chunks WHERE tenant_id = ?")
        return [dict(row) for row in rows]

    # --- Help Desk Methods ---

    def list_help_tickets(self, user_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM help_tickets WHERE tenant_id = ?"
        params = []
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        query += " ORDER BY created_at DESC"
        return self._tenant_rows(query, tuple(params))

    def create_help_ticket(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": f"ticket-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "user_id": payload.get("user_id"),
            "subject": payload.get("subject") or "No Subject",
            "content": payload.get("content") or "",
            "status": payload.get("status") or "open",
            "priority": payload.get("priority") or "normal",
            "category": payload.get("category") or "general",
            "created_at": now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO help_tickets (
                    id, tenant_id, user_id, subject, content, status, priority, category, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["user_id"],
                    record["subject"],
                    record["content"],
                    record["status"],
                    record["priority"],
                    record["category"],
                    record["created_at"],
                    record["updated_at"],
                ),
            )
            conn.commit()
        return record

    def update_help_ticket(self, ticket_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        updates["updated_at"] = utcnow()
        keys = [k for k in updates.keys() if k in ["subject", "content", "status", "priority", "category", "updated_at"]]
        if not keys:
            return next((t for t in self.list_help_tickets() if t["id"] == ticket_id), {})
        assignments = ", ".join(f"{k} = ?" for k in keys)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE help_tickets SET {assignments} WHERE id = ? AND tenant_id = ?",
                (*[updates[k] for k in keys], ticket_id, self._tenant_id()),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM help_tickets WHERE id = ? AND tenant_id = ?",
                (ticket_id, self._tenant_id()),
            ).fetchone()
            return dict(row) if row else {}

    def list_broadcast_messages(self, active_only: bool = True) -> list[dict[str, Any]]:
        query = "SELECT * FROM broadcast_messages WHERE tenant_id = ?"
        if active_only:
            query += " AND is_active = 1"
        query += " ORDER BY created_at DESC"
        return self._tenant_rows(query)

    def create_broadcast_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": f"broadcast-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "type": payload.get("type") or "info",
            "message": payload.get("message") or "",
            "is_active": payload.get("is_active") if "is_active" in payload else 1,
            "created_at": now,
            "expires_at": payload.get("expires_at"),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO broadcast_messages (
                    id, tenant_id, type, message, is_active, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["type"],
                    record["message"],
                    record["is_active"],
                    record["created_at"],
                    record["expires_at"],
                ),
            )
            conn.commit()
        return record

    # --- End Help Desk Methods ---

    def list_brain_links(self, limit: int | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM brain_links WHERE tenant_id = ? ORDER BY updated_at DESC"
        if limit:
            query += f" LIMIT {limit}"
        return self._tenant_rows(query)

    def create_brain_link(self, payload: dict[str, Any]) -> dict[str, Any]:
        from_type = payload.get("from_type") or "item"
        from_id = payload.get("from_id")
        to_type = payload.get("to_type") or "item"
        to_id = payload.get("to_id")
        relationship_type = payload.get("relationship_type") or "supports"
        if not from_id or not to_id:
            raise ValueError("Brain link endpoints are required")
        if from_type == to_type and from_id == to_id:
            raise ValueError("Brain links cannot point to the same node")
        with self._connect() as conn:
            existing = conn.execute(
                """
                SELECT * FROM brain_links
                WHERE tenant_id = ? AND from_type = ? AND from_id = ? AND to_type = ? AND to_id = ?
                LIMIT 1
                """,
                (self._tenant_id(), from_type, from_id, to_type, to_id),
            ).fetchone()
            if existing:
                return dict(existing)
            now = utcnow()
            record = {
                "id": payload.get("id") or f"brain-link-{unique_suffix()}",
                "tenant_id": self._tenant_id(),
                "from_type": from_type,
                "from_id": from_id,
                "to_type": to_type,
                "to_id": to_id,
                "relationship_type": relationship_type,
                "created_at": now,
                "updated_at": now,
            }
            conn.execute(
                """
                INSERT INTO brain_links (
                    id, tenant_id, from_type, from_id, to_type, to_id, relationship_type, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenant_id"],
                    record["from_type"],
                    record["from_id"],
                    record["to_type"],
                    record["to_id"],
                    record["relationship_type"],
                    record["created_at"],
                    record["updated_at"],
                ),
            )
            conn.commit()
        return record

    def delete_brain_link(self, link_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM brain_links WHERE id = ? AND tenant_id = ?",
                (link_id, self._tenant_id()),
            )
            conn.commit()

    def list_brain_ingests(self, source_id: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if source_id:
                rows = conn.execute(
                    "SELECT * FROM brain_ingests WHERE tenant_id = ? AND source_id = ? ORDER BY created_at DESC LIMIT ?",
                    (self._tenant_id(), source_id, max(1, limit)),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM brain_ingests WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?",
                    (self._tenant_id(), max(1, limit)),
                ).fetchall()
        return [dict(row) for row in rows]

    def ingest_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = normalize_text_content(payload.get("content"))
        if not content:
            raise ValueError("No extracted text was available to ingest.")
        now = utcnow()
        with self._connect() as conn:
            source_id = payload.get("source_id")
            source_row = None
            if source_id:
                source_row = conn.execute(
                    "SELECT * FROM brain_sources WHERE id = ? AND tenant_id = ?",
                    (source_id, self._tenant_id()),
                ).fetchone()
                if not source_row:
                    raise ValueError("Brain source not found")
                updates = {}
                for key in ["label", "source_type", "location", "notes"]:
                    if key in payload and payload.get(key) is not None:
                        updates[key] = payload.get(key)
                updates["status"] = payload.get("status") or "ready"
                updates["updated_at"] = now
                assignments = ", ".join(f"{key} = ?" for key in updates.keys())
                conn.execute(
                    f"UPDATE brain_sources SET {assignments} WHERE id = ? AND tenant_id = ?",
                    (*updates.values(), source_id, self._tenant_id()),
                )
            else:
                source_id = payload.get("id") or f"brain-source-{unique_suffix()}"
                source_record = {
                    "id": source_id,
                    "tenant_id": self._tenant_id(),
                    "label": payload.get("label") or payload.get("title") or "Ingested Source",
                    "source_type": payload.get("source_type") or "document",
                    "status": payload.get("status") or "ready",
                    "location": payload.get("location") or "",
                    "notes": payload.get("notes") or "",
                    "graph_x": payload.get("graph_x"),
                    "graph_y": payload.get("graph_y"),
                    "created_at": now,
                    "updated_at": now,
                }
                conn.execute(
                    """
                    INSERT INTO brain_sources (
                        id, tenant_id, label, source_type, status, location, notes, graph_x, graph_y, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        source_record["id"],
                        source_record["tenant_id"],
                        source_record["label"],
                        source_record["source_type"],
                        source_record["status"],
                        source_record["location"],
                        source_record["notes"],
                        source_record["graph_x"],
                        source_record["graph_y"],
                        source_record["created_at"],
                        source_record["updated_at"],
                    ),
                )
            source = dict(
                conn.execute(
                    "SELECT * FROM brain_sources WHERE id = ? AND tenant_id = ?",
                    (source_id, self._tenant_id()),
                ).fetchone()
            )
            
            # --- Auto-Item Creation ---
            if payload.get("create_item"):
                item_id = f"brain-item-{unique_suffix()}"
                item_record = {
                    "id": item_id,
                    "tenant_id": self._tenant_id(),
                    "title": f"Summary: {source['label']}",
                    "category": payload.get("category") or ("brand" if source["source_type"] == "profile" else "note"),
                    "content": payload.get("item_content") or summarize_excerpt(content, limit=500),
                    "source_id": source_id,
                    "status": "ready",
                    "tags_json": json.dumps(payload.get("tags") or ["auto-ingest"]),
                    "graph_x": payload.get("graph_x") + 100 if payload.get("graph_x") else None,
                    "graph_y": payload.get("graph_y") + 100 if payload.get("graph_y") else None,
                    "created_at": now,
                    "updated_at": now,
                }
                conn.execute(
                    """
                    INSERT INTO brain_items (
                        id, tenant_id, title, category, content, source_id, status, tags_json, graph_x, graph_y, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item_record["id"],
                        item_record["tenant_id"],
                        item_record["title"],
                        item_record["category"],
                        item_record["content"],
                        item_record["source_id"],
                        item_record["status"],
                        item_record["tags_json"],
                        item_record["graph_x"],
                        item_record["graph_y"],
                        item_record["created_at"],
                        item_record["updated_at"],
                    ),
                )

            chunks = chunk_text_content(content)
            if not chunks:
                raise ValueError("Unable to create Brain chunks from this ingest.")
            ingest = {
                "id": payload.get("ingest_id") or f"brain-ingest-{unique_suffix()}",
                "tenant_id": self._tenant_id(),
                "source_id": source_id,
                "ingest_type": payload.get("ingest_type") or "text",
                "status": "ready",
                "title": payload.get("title") or payload.get("label") or source.get("label") or "Brain ingest",
                "location": payload.get("location") or source.get("location") or "",
                "content_excerpt": summarize_excerpt(content),
                "content_length": len(content),
                "chunk_count": len(chunks),
                "error": "",
                "created_at": now,
                "updated_at": now,
            }
            conn.execute(
                """
                INSERT INTO brain_ingests (
                    id, tenant_id, source_id, ingest_type, status, title, location, content_excerpt, content_length, chunk_count, error, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ingest["id"],
                    ingest["tenant_id"],
                    ingest["source_id"],
                    ingest["ingest_type"],
                    ingest["status"],
                    ingest["title"],
                    ingest["location"],
                    ingest["content_excerpt"],
                    ingest["content_length"],
                    ingest["chunk_count"],
                    ingest["error"],
                    ingest["created_at"],
                    ingest["updated_at"],
                ),
            )
            conn.execute(
                "DELETE FROM brain_chunks WHERE tenant_id = ? AND source_id = ?",
                (self._tenant_id(), source_id),
            )
            conn.executemany(
                """
                INSERT INTO brain_chunks (
                    id, tenant_id, source_id, ingest_id, chunk_index, content, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        f"chunk-{unique_suffix()}",
                        self._tenant_id(),
                        source_id,
                        ingest["id"],
                        idx,
                        chunk,
                        now,
                    )
                    for idx, chunk in enumerate(chunks)
                ],
            )
            conn.commit()
        return {"source": source, "ingest": ingest}

    def search_brain_memory(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        resolved_query = normalize_text_content(query)
        if not resolved_query:
            return []
        profile = self.get_brain_profile()
        sources = {source["id"]: source for source in self.list_brain_sources()}
        candidates: list[dict[str, Any]] = []
        with self._connect() as conn:
            chunk_rows = [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM brain_chunks WHERE tenant_id = ? ORDER BY updated_at DESC",
                    (self._tenant_id(),),
                ).fetchall()
            ]
        for chunk in chunk_rows:
            score, matched = score_text_match(resolved_query, [chunk.get("title"), chunk.get("content")])
            if not score:
                continue
            source = sources.get(chunk.get("source_id"))
            candidates.append(
                {
                    "id": chunk["id"],
                    "kind": "chunk",
                    "title": chunk.get("title") or (source or {}).get("label") or "Brain source",
                    "excerpt": chunk.get("content_excerpt") or summarize_excerpt(chunk.get("content")),
                    "source_id": chunk.get("source_id"),
                    "source_label": (source or {}).get("label") or "",
                    "score": score + 2,
                    "matched_terms": matched,
                }
            )
        for item in self.list_brain_items():
            score, matched = score_text_match(resolved_query, [item.get("title"), item.get("content"), " ".join(item.get("tags") or [])])
            if not score:
                continue
            source = sources.get(item.get("source_id"))
            candidates.append(
                {
                    "id": item["id"],
                    "kind": "item",
                    "title": item.get("title") or "Knowledge item",
                    "excerpt": summarize_excerpt(item.get("content")),
                    "source_id": item.get("source_id"),
                    "source_label": (source or {}).get("label") or "",
                    "score": score + 3,
                    "matched_terms": matched,
                }
            )
        profile_score, profile_terms = score_text_match(
            resolved_query,
            [
                profile.get("company_name"),
                profile.get("overview"),
                profile.get("mission"),
                profile.get("brand_voice"),
                profile.get("ideal_customer"),
            ],
        )
        if profile_score:
            candidates.append(
                {
                    "id": profile["id"],
                    "kind": "profile",
                    "title": profile.get("company_name") or "Workspace profile",
                    "excerpt": summarize_excerpt(profile.get("overview") or profile.get("mission")),
                    "source_id": "profile",
                    "source_label": "Workspace profile",
                    "score": profile_score + 1,
                    "matched_terms": profile_terms,
                }
            )
        candidates.sort(key=lambda item: (item.get("score") or 0, item.get("title") or ""), reverse=True)
        return candidates[: max(1, limit)]

    def get_form_by_slug(self, slug: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM forms WHERE tenant_id = ? AND (slug = ? OR id = ?)", (self._tenant_id(), slug, slug)).fetchone()
        return self._form_from_row(dict(row) if row else None)

    def get_form_by_id(self, form_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM forms WHERE tenant_id = ? AND id = ?", (self._tenant_id(), form_id)).fetchone()
        return self._form_from_row(dict(row) if row else None)

    def list_form_folders(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM form_folders WHERE tenant_id = ? ORDER BY name ASC")
        return [{**row, "expanded": bool(row.get("expanded", 1))} for row in rows]

    def create_form_folder(self, payload: dict[str, Any]) -> dict[str, Any]:
        folder = {
            "id": payload.get("id") or f"form-folder-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "name": payload.get("name") or "New Folder",
            "user_id": payload.get("user_id") or "1",
            "created_at": payload.get("created_at") or utcnow(),
            "expanded": int(bool(payload.get("expanded", True))),
        }
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO form_folders (id, tenant_id, name, user_id, created_at, expanded) VALUES (?, ?, ?, ?, ?, ?)",
                (folder["id"], folder["tenant_id"], folder["name"], folder["user_id"], folder["created_at"], folder["expanded"]),
            )
            conn.commit()
        return {**folder, "expanded": bool(folder["expanded"])}

    def update_form_folder(self, folder_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["name", "user_id"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        if "expanded" in updates:
            payload["expanded"] = int(bool(updates["expanded"]))
        if not payload:
            existing = next((folder for folder in self.list_form_folders() if folder["id"] == folder_id), None)
            if not existing:
                raise ValueError("Form folder not found")
            return existing
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM form_folders WHERE id = ? AND tenant_id = ?", (folder_id, self._tenant_id())).fetchone()
            if not row:
                raise ValueError("Form folder not found")
            conn.execute(f"UPDATE form_folders SET {assignments} WHERE id = ? AND tenant_id = ?", (*payload.values(), folder_id, self._tenant_id()))
            conn.commit()
        return next(folder for folder in self.list_form_folders() if folder["id"] == folder_id)

    def list_forms(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM forms WHERE tenant_id = ? ORDER BY updated_at DESC")
        return [self._form_from_row(row) for row in rows]

    def list_forms_summary(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT id, name, folder_id, slug, status, is_active, responses_count, last_active, last_modified_by, creator, created_at, updated_at, schema_json, pages_json FROM forms WHERE tenant_id = ? ORDER BY updated_at DESC")
        return [self._form_summary_from_row(row) for row in rows]

    def _form_summary_from_row(self, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        schema = json_loads(row.get("schema_json"), [])
        pages = json_loads(row.get("pages_json"), [])
        field_count = len(schema) + sum(len(p.get("fields", [])) for p in pages)
        return {
            "id": row["id"],
            "name": row["name"],
            "folder_id": row.get("folder_id"),
            "slug": row["slug"],
            "status": row.get("status") or ("Active" if row.get("is_active") else "Draft"),
            "is_active": bool(row["is_active"]),
            "responses_count": row["responses_count"],
            "last_active": row.get("last_active"),
            "last_modified_by": row.get("last_modified_by"),
            "creator": row.get("creator"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_modified_at": row["updated_at"],
            "field_count": field_count,
        }

    def create_form(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"form-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "name": payload.get("name") or "New Untitled Form",
            "folder_id": payload.get("folder_id") or "form-folder-default",
            "slug": payload.get("slug") or f"form_{unique_suffix()}",
            "description": payload.get("description") or "",
            "schema_json": json.dumps(payload.get("schema") or []),
            "pages_json": json.dumps(payload.get("pages") or [{"id": "page_1", "label": "Page 1", "fields": []}]),
            "settings_json": json.dumps(payload.get("settings") or {"create_contact": True, "update_contact": True, "webhook_url": "", "notification_email": "", "redirect_url": "", "thank_you_message": "Thank you."}),
            "status": payload.get("status") or "Draft",
            "is_active": int(bool(payload.get("is_active", False))),
            "responses_count": payload.get("responses_count", 0),
            "last_active": payload.get("last_active") or "Just now",
            "last_modified_by": payload.get("last_modified_by") or "AIO Flow",
            "creator": payload.get("creator") or "AIO Flow",
            "triggers_json": json.dumps(payload.get("triggers")),
            "automation_json": json.dumps(payload.get("automation")),
            "last_response_at": payload.get("last_response_at"),
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO forms (
                    id, tenant_id, name, folder_id, slug, description, schema_json, pages_json, settings_json, status, is_active,
                    responses_count, last_active, last_modified_by, creator, triggers_json, automation_json,
                    last_response_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"], record["tenant_id"], record["name"], record["folder_id"], record["slug"], record["description"],
                    record["schema_json"], record["pages_json"], record["settings_json"], record["status"], record["is_active"],
                    record["responses_count"], record["last_active"], record["last_modified_by"], record["creator"],
                    record["triggers_json"], record["automation_json"], record["last_response_at"],
                    record["created_at"], record["updated_at"],
                ),
            )
            conn.commit()
        return self._form_from_row(record)

    def update_form(self, form_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["name", "folder_id", "slug", "description", "status", "last_active", "last_modified_by", "creator", "last_response_at"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        if "schema" in updates:
            payload["schema_json"] = json.dumps(updates["schema"] or [])
        if "pages" in updates:
            payload["pages_json"] = json.dumps(updates["pages"] or [])
        if "settings" in updates:
            payload["settings_json"] = json.dumps(updates["settings"] or {})
        if "is_active" in updates:
            payload["is_active"] = int(bool(updates["is_active"]))
        if "responses_count" in updates and updates["responses_count"] is not None:
            payload["responses_count"] = updates["responses_count"]
        if "triggers" in updates:
            payload["triggers_json"] = json.dumps(updates["triggers"])
        if "automation" in updates:
            payload["automation_json"] = json.dumps(updates["automation"])
        if not payload:
            form = self.get_form_by_id(form_id)
            if not form:
                raise ValueError("Form not found")
            return form
        payload["updated_at"] = utcnow()
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM forms WHERE id = ? AND tenant_id = ?", (form_id, self._tenant_id())).fetchone()
            if not row:
                raise ValueError("Form not found")
            conn.execute(f"UPDATE forms SET {assignments} WHERE id = ? AND tenant_id = ?", (*payload.values(), form_id, self._tenant_id()))
            conn.commit()
        return self.get_form_by_id(form_id)

    def delete_form(self, form_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM forms WHERE id = ? AND tenant_id = ?", (form_id, self._tenant_id()))
            conn.commit()

    def list_cms_tables(self) -> list[dict[str, Any]]:
        forms = self.list_forms()
        submission_counts: dict[str, int] = {}
        for row in self._tenant_rows("SELECT form_id, COUNT(*) AS total FROM form_submissions WHERE tenant_id = ? GROUP BY form_id"):
            submission_counts[row["form_id"]] = row["total"]
        return [
            {
                "id": f"cms-{form['id']}",
                "name": form["name"],
                "slug": form["slug"],
                "description": form.get("description") or "",
                "record_count": submission_counts.get(form["id"], 0),
            }
            for form in forms
        ]

    def list_cms_table_data(self, slug: str) -> list[dict[str, Any]]:
        form = self.get_form_by_slug(slug)
        if not form:
            return []
        rows = self._tenant_rows("SELECT * FROM form_submissions WHERE tenant_id = ? AND form_id = ? ORDER BY submitted_at DESC", (form["id"],))
        data = []
        for row in rows:
            entry = {
                "submission_id": row["id"],
                "contact_id": row.get("contact_id"),
                "created_contact": bool(row.get("created_contact")),
                "submitted_at": row.get("submitted_at"),
            }
            entry.update(json_loads(row.get("submission_json"), {}))
            data.append(entry)
    def list_orders(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC")
        data = []
        for row in rows:
            entry = dict(row)
            entry["items"] = json_loads(row.get("items_json"), [])
            data.append(entry)
        return data

    def submit_form(self, form_id: str, form_data: dict[str, Any]) -> dict[str, Any]:
        form = self.get_form_by_id(form_id)
        if not form:
            raise ValueError("Form not found")

        identifier_field = next((field for field in form["schema"] if field.get("is_identifier")), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("map_to_contact") == "email"), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("type") == "email"), None)

        identifier_key = (identifier_field or {}).get("map_to_contact") or "email"
        identifier_value = form_data.get(field_key(identifier_field)) if identifier_field else None
        created_contact = False

        with self._connect() as conn:
            row = conn.execute(f"SELECT * FROM contacts WHERE tenant_id = ? AND {identifier_key} = ?", (self._tenant_id(), identifier_value)).fetchone()
            contact_id = None

            if row:
                contact_id = row["id"]
                if form["settings"].get("update_contact"):
                    updates = {}
                    for field in form["schema"]:
                        mapped = field.get("map_to_contact")
                        current_value = form_data.get(field_key(field))
                        if mapped and current_value:
                            updates[mapped] = current_value
                    if updates:
                        assignments = ", ".join(f"{key} = ?" for key in updates.keys())
                        params = tuple(updates.values()) + (utcnow(), contact_id, self._tenant_id())
                        conn.execute(f"UPDATE contacts SET {assignments}, updated_at = ? WHERE id = ? AND tenant_id = ?", params)
            elif form["settings"].get("create_contact"):
                contact_id = f"contact-{unique_suffix()}"
                payload = {
                    "id": contact_id,
                    "contact_id": f"CNT-{unique_suffix().upper()}",
                    "organization_id": "org-1",
                    "tenant_id": self._tenant_id(),
                    "first_name": None,
                    "last_name": None,
                    "email": None,
                    "phone": None,
                    "company": None,
                    "company_id": None,
                    "title": None,
                    "department": None,
                    "owner": "AIO Flow",
                    "source": f"Form: {form['name']}",
                    "status": "lead",
                    "lead_score": 50,
                    "quality": "warm",
                    "engagement": "medium",
                    "tags_json": json.dumps(["Form Submission"]),
                    "last_contacted_at": utcnow(),
                    "pipeline_stage": "New",
                    "created_at": utcnow(),
                    "updated_at": utcnow(),
                    "deleted_at": None,
                }
                for field in form["schema"]:
                    mapped = field.get("map_to_contact")
                    current_value = form_data.get(field_key(field))
                    if mapped and current_value:
                        payload[mapped] = current_value
                conn.execute(
                    """
                    INSERT INTO contacts (
                        id, contact_id, organization_id, tenant_id, first_name, last_name, email, phone, company, company_id,
                        title, department, owner, source, status, lead_score, quality, engagement, tags_json,
                        last_contacted_at, pipeline_stage, created_at, updated_at, deleted_at
                    ) VALUES (
                        :id, :contact_id, :organization_id, :tenant_id, :first_name, :last_name, :email, :phone, :company, :company_id,
                        :title, :department, :owner, :source, :status, :lead_score, :quality, :engagement, :tags_json,
                        :last_contacted_at, :pipeline_stage, :created_at, :updated_at, :deleted_at
                    )
                    """,
                    payload,
                )
                created_contact = True

            submission_id = f"submission-{unique_suffix()}"
            conn.execute(
                "INSERT INTO form_submissions (id, tenant_id, form_id, contact_id, submission_json, created_contact, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (submission_id, self._tenant_id(), form_id, contact_id, json_dumps(form_data), int(created_contact), utcnow()),
            )
            
            # Create Order if purchase fields are present
            has_purchase = any(field.get("type") == "purchase" for field in form["schema"])
            if has_purchase:
                order_id = f"order-{unique_suffix()}"
                payment_status = form_data.get("payment_status", "pending")
                total_amount = float(form_data.get("total_amount", 0.0))
                payment_id = form_data.get("payment_id")
                payment_provider = form_data.get("payment_provider", "unknown")
                items = form_data.get("order_items", [])
                
                conn.execute(
                    """
                    INSERT INTO orders (
                        id, tenant_id, contact_id, form_submission_id, reference_code,
                        status, total_amount, currency, payment_status, payment_provider,
                        payment_id, items_json, created_at, updated_at
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    (
                        order_id, self._tenant_id(), contact_id, submission_id, f"ORD-{unique_suffix().upper()}",
                        "active", total_amount, "USD", payment_status, payment_provider,
                        payment_id, json_dumps(items), utcnow(), utcnow()
                    )
                )

            conn.execute(
                "UPDATE forms SET responses_count = responses_count + 1, last_response_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                (utcnow(), utcnow(), form_id, self._tenant_id()),
            )
            conn.commit()

        if contact_id:
            self.open_thread_for_contact(
                contact_id,
                channel_type="email",
                subject=f"Form submission: {form['name']}",
                body=", ".join(f"{key}: {value}" for key, value in form_data.items()),
                force_new=True,
            )

        return {"success": True, "contactId": contact_id, "created": created_contact, "submissionId": submission_id}

    def list_contact_activities(self, contact_id: str) -> list[dict[str, Any]]:
        activities: list[dict[str, Any]] = []
        rows = self._rows(
            """
            SELECT * FROM contact_activities
            WHERE tenant_id = ? AND contact_id = ?
            ORDER BY created_at DESC
            """,
            (self._tenant_id(), contact_id),
        )
        for row in rows:
            activities.append(
                {
                    **row,
                    "metadata": json_loads(row.pop("metadata_json"), {}),
                }
            )
        for thread in self._get_thread_context():
            if thread["contact_id"] != contact_id:
                continue
            for message in thread["messages"]:
                direction = message.get("direction")
                title = f"{thread['channel_type'].upper()} {'received' if direction == 'inbound' else 'sent' if direction == 'outbound' else 'logged'}"
                activities.append(
                    {
                        "id": f"thread-activity-{message['id']}",
                        "contact_id": contact_id,
                        "user_id": "user-1",
                        "activity_type": "email" if thread["channel_type"] == "email" else "sms" if thread["channel_type"] == "sms" else "note",
                        "title": title,
                        "description": message.get("plain_text") or message.get("body") or "",
                        "metadata": {
                            "thread_id": thread["id"],
                            "channel_type": thread["channel_type"],
                            "subject": thread["subject"],
                            "ai_priority": thread.get("ai_priority"),
                        },
                        "created_at": message["created_at"],
                    }
                )
            for action in thread.get("actions", []):
                if action.get("status") != "completed":
                    continue
                if action.get("action_type") not in {"create-deal", "advance-stage", "schedule-meeting", "calendar-event-updated"}:
                    continue
                activities.append(
                    {
                        "id": action["id"],
                        "contact_id": contact_id,
                        "user_id": "user-1",
                        "activity_type": "workflow",
                        "title": action.get("label") or "Workflow action",
                        "description": f"Comms workflow executed on thread {thread['subject']}.",
                        "metadata": {
                            "thread_id": thread["id"],
                            "channel_type": thread["channel_type"],
                            "subject": thread["subject"],
                            "status": action.get("status"),
                        },
                        "created_at": action.get("created_at") or thread["updated_at"],
                    }
                )
            for event in thread.get("calendarEvents", []):
                activities.append(
                    {
                        "id": f"calendar-activity-{event['id']}",
                        "contact_id": contact_id,
                        "user_id": "user-1",
                        "activity_type": "meeting",
                        "title": event.get("title") or "Meeting scheduled",
                        "description": event.get("description") or f"Scheduled for {event.get('start_time')}.",
                        "metadata": {
                            "thread_id": thread["id"],
                            "meeting_url": event.get("meeting_url"),
                            "location": event.get("location"),
                            "status": event.get("status"),
                        },
                        "created_at": event.get("start_time") or event.get("created_at") or thread["updated_at"],
                    }
                )
        return sorted(activities, key=lambda item: item["created_at"], reverse=True)

    def create_contact_activity(self, contact_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        contact = next((item for item in self.list_contacts() if item["id"] == contact_id), None)
        if not contact:
            raise ValueError("Contact not found.")
        description = str(payload.get("description") or "").strip()
        if not description:
            raise ValueError("Activity description is required.")
        now = utcnow()
        activity = {
            "id": payload.get("id") or f"contact-activity-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "contact_id": contact_id,
            "user_id": str(payload.get("user_id") or "user-1"),
            "activity_type": str(payload.get("activity_type") or "note"),
            "title": str(payload.get("title") or "Note"),
            "description": description,
            "metadata": payload.get("metadata") or {},
            "created_at": payload.get("created_at") or now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO contact_activities (
                    id, tenant_id, contact_id, user_id, activity_type, title, description, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    activity["id"],
                    activity["tenant_id"],
                    activity["contact_id"],
                    activity["user_id"],
                    activity["activity_type"],
                    activity["title"],
                    activity["description"],
                    json.dumps(activity["metadata"]),
                    activity["created_at"],
                    activity["updated_at"],
                ),
            )
            conn.execute(
                "UPDATE contacts SET updated_at = ? WHERE id = ? AND tenant_id = ?",
                (now, contact_id, self._tenant_id()),
            )
            conn.commit()
        return activity

    def list_flows(self) -> list[dict[str, Any]]:
        rows = self._rows(
            """
            SELECT * FROM flows
            WHERE tenant_id = ?
            ORDER BY updated_at DESC, created_at DESC
            """,
            (self._tenant_id(),),
        )
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "status": row["status"],
                "nodes": json_loads(row["nodes_json"], []),
                "edges": json_loads(row["edges_json"], []),
                "spec": json_loads(row["spec_json"], None),
                "metadata": json_loads(row["metadata_json"], {}),
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "createdBy": row.get("created_by"),
                "lastEditedBy": row.get("last_edited_by"),
            }
            for row in rows
        ]

    def get_flow(self, flow_id: str) -> dict[str, Any] | None:
        row = next((item for item in self._rows("SELECT * FROM flows WHERE id = ? AND tenant_id = ? LIMIT 1", (flow_id, self._tenant_id(),))), None)
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "status": row["status"],
            "nodes": json_loads(row["nodes_json"], []),
            "edges": json_loads(row["edges_json"], []),
            "spec": json_loads(row["spec_json"], None),
            "metadata": json_loads(row["metadata_json"], {}),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "createdBy": row.get("created_by"),
            "lastEditedBy": row.get("last_edited_by"),
        }

    def save_flow(self, payload: dict[str, Any]) -> dict[str, Any]:
        flow_id = payload.get("id") or f"flow-{unique_suffix()}"
        now = utcnow()
        existing = self.get_flow(flow_id)
        record = {
            "id": flow_id,
            "name": payload.get("name") or "Untitled Flow",
            "status": payload.get("status") or "Draft",
            "nodes": payload.get("nodes") or [],
            "edges": payload.get("edges") or [],
            "spec": payload.get("spec"),
            "metadata": payload.get("metadata") or {},
            "createdAt": payload.get("createdAt") or (existing or {}).get("createdAt") or now,
            "updatedAt": payload.get("updatedAt") or now,
            "createdBy": payload.get("createdBy") or (existing or {}).get("createdBy") or "Current User",
            "lastEditedBy": payload.get("lastEditedBy") or "Current User",
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO flows (
                    id, tenant_id, name, status, nodes_json, edges_json, spec_json, metadata_json,
                    created_at, updated_at, created_by, last_edited_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    status = excluded.status,
                    nodes_json = excluded.nodes_json,
                    edges_json = excluded.edges_json,
                    spec_json = excluded.spec_json,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at,
                    last_edited_by = excluded.last_edited_by
                """,
                (
                    record["id"],
                    self._tenant_id(),
                    record["name"],
                    record["status"],
                    json.dumps(record["nodes"]),
                    json.dumps(record["edges"]),
                    json.dumps(record["spec"]) if record["spec"] is not None else None,
                    json.dumps(record["metadata"]),
                    record["createdAt"],
                    record["updatedAt"],
                    record["createdBy"],
                    record["lastEditedBy"],
                ),
            )
            conn.commit()
        return record

    def save_flow_draft(self, payload: dict[str, Any]) -> dict[str, Any]:
        draft_id = payload.get("id") or f"flow-draft-{unique_suffix()}"
        now = utcnow()
        draft = {
            **payload,
            "id": draft_id,
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": payload.get("updatedAt") or now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO flow_drafts (id, tenant_id, draft_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    draft_json = excluded.draft_json,
                    updated_at = excluded.updated_at
                """,
                (draft_id, self._tenant_id(), json.dumps(draft), draft["createdAt"], draft["updatedAt"]),
            )
            conn.commit()
        return draft

    def get_flow_draft(self, draft_id: str) -> dict[str, Any] | None:
        rows = self._rows("SELECT draft_json FROM flow_drafts WHERE id = ? AND tenant_id = ? LIMIT 1", (draft_id, self._tenant_id()))
        if not rows:
            return None
        return json_loads(rows[0]["draft_json"], None)

    def delete_flow_draft(self, draft_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM flow_drafts WHERE id = ? AND tenant_id = ?", (draft_id, self._tenant_id()))
            conn.commit()

    def list_form_submissions(self, contact_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM form_submissions WHERE tenant_id = ?"
        params: tuple[Any, ...] = (self._tenant_id(),)
        if contact_id:
            query += " AND contact_id = ?"
            params = (self._tenant_id(), contact_id)
        query += " ORDER BY submitted_at DESC"
        rows = self._rows(query, params)
        for row in rows:
            row["submission_data"] = json_loads(row.pop("submission_json"), {})
            row["created_contact"] = bool(row["created_contact"])
        return rows

    def list_mailboxes(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM mailboxes WHERE tenant_id = ? ORDER BY name ASC")
        mailboxes = [
            {
                **row,
                "inbound_enabled": bool(row.get("inbound_enabled", 1)),
                "outbound_enabled": bool(row.get("outbound_enabled", 1)),
                "config": json_loads(row.pop("config_json"), {}),
            }
            for row in rows
        ]
        return self._summarize_mailboxes(mailboxes, self._get_thread_context(), self.list_mail_events())

    def list_calendars(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM calendars WHERE tenant_id = ? ORDER BY is_default DESC, name ASC")
        return [
            {
                **row,
                "is_default": bool(row.get("is_default", 0)),
                "is_visible": bool(row.get("is_visible", 1)),
            }
            for row in rows
        ]

    def list_calendar_events(self, thread_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM calendar_events WHERE tenant_id = ?"
        params: tuple[Any, ...] = (self._tenant_id(),)
        if thread_id:
            query += " AND thread_id = ?"
            params = (self._tenant_id(), thread_id)
        query += " ORDER BY start_time ASC"
        return [self._calendar_event_from_row(row) for row in self._rows(query, params)]

    def create_calendar_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        calendars = self.list_calendars()
        default_calendar_id = next((calendar["id"] for calendar in calendars if calendar.get("is_default")), None) or (calendars[0]["id"] if calendars else "calendar-primary")
        record = {
            "id": payload.get("id") or f"calendar-event-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "calendar_id": payload.get("calendar_id") or default_calendar_id,
            "source_id": payload.get("source_id") or "calendar-source-local",
            "thread_id": payload.get("thread_id"),
            "contact_id": payload.get("contact_id"),
            "company_id": payload.get("company_id"),
            "title": payload.get("title") or "New Event",
            "description": payload.get("description") or "",
            "start_time": payload.get("start_time") or now,
            "end_time": payload.get("end_time") or now,
            "status": payload.get("status") or "scheduled",
            "location_type": payload.get("location_type") or "other",
            "location": payload.get("location") or "",
            "meeting_url": payload.get("meeting_url") or "",
            "sync_status": payload.get("sync_status") or "local",
            "external_event_ref": payload.get("external_event_ref") or "",
            "last_synced_at": payload.get("last_synced_at"),
            "authority_mode": payload.get("authority_mode") or "local-first",
            "conflict_state": payload.get("conflict_state") or "clear",
            "sync_note": payload.get("sync_note") or "Created locally.",
            "imported_at": payload.get("imported_at"),
            "source_payload_json": json.dumps(payload.get("source_payload") or {}),
            "guest_name": payload.get("guest_name"),
            "guest_email": payload.get("guest_email"),
            "guest_phone": payload.get("guest_phone"),
            "booking_type_id": payload.get("booking_type_id"),
            "all_day": int(bool(payload.get("all_day", False))),
            "source": payload.get("source") or "calendar-local",
            "created_at": now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO calendar_events (
                    id, tenant_id, calendar_id, source_id, thread_id, contact_id, company_id, title, description,
                    start_time, end_time, status, location_type, location, meeting_url, sync_status,
                    external_event_ref, last_synced_at, authority_mode, conflict_state, sync_note, imported_at,
                    source_payload_json, guest_name, guest_email, guest_phone, booking_type_id, all_day, source,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"], record["tenant_id"], record["calendar_id"], record["source_id"], record["thread_id"], record["contact_id"],
                    record["company_id"], record["title"], record["description"], record["start_time"], record["end_time"],
                    record["status"], record["location_type"], record["location"], record["meeting_url"], record["sync_status"],
                    record["external_event_ref"], record["last_synced_at"], record["authority_mode"], record["conflict_state"],
                    record["sync_note"], record["imported_at"], record["source_payload_json"], record["guest_name"],
                    record["guest_email"], record["guest_phone"], record["booking_type_id"], record["all_day"], record["source"],
                    record["created_at"], record["updated_at"],
                ),
            )
            conn.commit()
        return next((item for item in self.list_calendar_events() if item["id"] == record["id"]), self._calendar_event_from_row(record))

    def update_calendar_event(self, event_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM calendar_events WHERE id = ? AND tenant_id = ?", (event_id, self._tenant_id())).fetchone()
            if not existing:
                raise ValueError("Calendar event not found")
            event = self._calendar_event_from_row(dict(existing))
            allowed_keys = ["calendar_id", "title", "description", "start_time", "end_time", "status", "location_type", "location", "meeting_url", "source_id", "sync_status", "external_event_ref", "last_synced_at", "authority_mode", "conflict_state", "sync_note", "imported_at", "source_payload", "guest_name", "guest_email", "guest_phone", "booking_type_id", "all_day", "source"]
            payload = {key: updates[key] for key in allowed_keys if key in updates and updates[key] is not None}
            if not payload:
                return event
            if "source_payload" in payload:
                payload["source_payload_json"] = json.dumps(payload.pop("source_payload"))
            if "all_day" in payload:
                payload["all_day"] = int(bool(payload["all_day"]))
            payload["updated_at"] = utcnow()
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(
                f"UPDATE calendar_events SET {assignments} WHERE id = ? AND tenant_id = ?",
                (*payload.values(), event_id, self._tenant_id()),
            )
            refreshed = {**event, **payload}
            if refreshed.get("thread_id"):
                next_follow_up_at = refreshed.get("start_time")
                status = refreshed.get("status")
                thread_status = "scheduled" if status in {"scheduled", "confirmed"} else "waiting_on_us"
                conn.execute(
                    "UPDATE threads SET status = ?, next_follow_up_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                    (thread_status, next_follow_up_at, payload["updated_at"], refreshed["thread_id"], self._tenant_id()),
                )
                conn.execute(
                    "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        f"thread-action-{refreshed['thread_id']}-calendar-{unique_suffix()}",
                        self._tenant_id(),
                        refreshed["thread_id"],
                        f"Meeting {str(status or 'updated').replace('_', ' ').title()}",
                        "calendar-event-updated",
                        "system",
                        "completed",
                        payload["updated_at"],
                        payload["updated_at"],
                    ),
                )
            conn.commit()
        return next((item for item in self.list_calendar_events() if item["id"] == event_id), refreshed)

    def delete_calendar_event(self, event_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM calendar_events WHERE id = ? AND tenant_id = ?", (event_id, self._tenant_id()))
            conn.commit()

    def list_booking_types(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM booking_types WHERE tenant_id = ? ORDER BY name ASC")
        return [
            {
                **row,
                "duration_minutes": row.get("duration_minutes") or 30,
                "location_type": row.get("location_type") or "other",
                "buffer_before_minutes": row.get("buffer_before_minutes") or 0,
                "buffer_after_minutes": row.get("buffer_after_minutes") or 0,
                "is_active": bool(row.get("is_active", 1)),
            }
            for row in rows
        ]

    def create_booking_type(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {
            "id": payload.get("id") or f"booking-type-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "user_id": payload.get("user_id") or "1",
            "name": payload.get("name") or "Meeting Type",
            "slug": payload.get("slug") or slugify(payload.get("name") or f"booking-{unique_suffix()}"),
            "duration_minutes": payload.get("duration_minutes") or 30,
            "location": payload.get("location") or "",
            "location_type": payload.get("location_type") or "other",
            "description": payload.get("description") or "",
            "color": payload.get("color") or "#10b981",
            "buffer_before_minutes": payload.get("buffer_before_minutes") or 0,
            "buffer_after_minutes": payload.get("buffer_after_minutes") or 0,
            "is_active": int(bool(payload.get("is_active", True))),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO booking_types (
                    id, tenant_id, user_id, name, slug, duration_minutes, location, location_type, description, color,
                    buffer_before_minutes, buffer_after_minutes, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"], record["tenant_id"], record["user_id"], record["name"], record["slug"], record["duration_minutes"],
                    record["location"], record["location_type"], record["description"], record["color"],
                    record["buffer_before_minutes"], record["buffer_after_minutes"], record["is_active"],
                ),
            )
            conn.commit()
        return next((item for item in self.list_booking_types() if item["id"] == record["id"]), {**record, "is_active": bool(record["is_active"])})

    def update_booking_type(self, booking_type_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["name", "slug", "location", "location_type", "description", "color", "user_id"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        for key in ["duration_minutes", "buffer_before_minutes", "buffer_after_minutes"]:
            if key in updates and updates[key] is not None:
                payload[key] = int(updates[key])
        if "is_active" in updates and updates["is_active"] is not None:
            payload["is_active"] = int(bool(updates["is_active"]))
        if not payload:
            existing = next((item for item in self.list_booking_types() if item["id"] == booking_type_id), None)
            if not existing:
                raise ValueError("Booking type not found")
            return existing
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM booking_types WHERE id = ? AND tenant_id = ?", (booking_type_id, self._tenant_id())).fetchone()
            if not row:
                raise ValueError("Booking type not found")
            conn.execute(f"UPDATE booking_types SET {assignments} WHERE id = ? AND tenant_id = ?", (*payload.values(), booking_type_id, self._tenant_id()))
            conn.commit()
        return next(item for item in self.list_booking_types() if item["id"] == booking_type_id)

    def delete_booking_type(self, booking_type_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM booking_types WHERE id = ? AND tenant_id = ?", (booking_type_id, self._tenant_id()))
            conn.commit()

    def list_calendar_sources(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM calendar_sources WHERE tenant_id = ? ORDER BY name ASC")
        sources = [
            {
                **row,
                "config": json_loads(row.pop("config_json"), {}),
            }
            for row in rows
        ]
        return self._summarize_calendar_sources(sources, self.list_calendar_events())

    def get_calendar_provider_catalog(self) -> list[dict[str, Any]]:
        return get_calendar_provider_catalog()

    def create_calendar_source(
        self,
        name: str,
        provider: str = "local-stub",
        sync_direction: str = "two-way",
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resolved_config = {
            "authority_mode": "local-first",
            "import_policy": "review",
            **({"adapter": "local-stub"} if provider == "local-stub" else {}),
            **(config or {}),
        }
        adapter = get_calendar_adapter(provider)
        validation = adapter.validate_source({"provider": provider, "config": resolved_config})
        source = {
            "id": f"calendar-source-{slugify(name)}-{unique_suffix()}",
            "name": name,
            "provider": provider,
            "status": "connected" if provider == "local-stub" else "ready" if validation["ok"] else "needs_config",
            "sync_direction": sync_direction,
            "config": resolved_config,
            "last_synced_at": None,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO calendar_sources (id, tenant_id, name, provider, status, sync_direction, config_json, last_synced_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    source["id"],
                    source["tenant_id"],
                    source["name"],
                    source["provider"],
                    source["status"],
                    source["sync_direction"],
                    json.dumps(source["config"]),
                    source["last_synced_at"],
                    source["created_at"],
                    source["updated_at"],
                ),
            )
            conn.commit()
        return self._summarize_calendar_sources([source], self.list_calendar_events())[0]

    def update_calendar_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM calendar_sources WHERE id = ? AND tenant_id = ?", (source_id, self._tenant_id())).fetchone()
            if not existing:
                raise ValueError("Calendar source not found")
            source = dict(existing)
            payload = {}
            for key in ["name", "provider", "status", "sync_direction", "last_synced_at"]:
                if key in updates and updates[key] is not None:
                    payload[key] = updates[key]
            if "config" in updates and isinstance(updates["config"], dict):
                merged_config = {
                    "authority_mode": "local-first",
                    "import_policy": "review",
                    **json_loads(source.get("config_json"), {}),
                    **updates["config"],
                }
                merged_config = sync_selected_calendar_metadata(merged_config)
                payload["config_json"] = json.dumps(merged_config)
            if "status" not in updates:
                adapter = get_calendar_adapter(payload.get("provider", source.get("provider")))
                current_config = (
                    {
                        "authority_mode": "local-first",
                        "import_policy": "review",
                        **json_loads(source.get("config_json"), {}),
                        **updates.get("config", {}),
                    }
                    if isinstance(updates.get("config"), dict)
                    else json_loads(source.get("config_json"), {})
                )
                validation = adapter.validate_source(
                    {
                        "provider": payload.get("provider", source.get("provider")),
                        "config": current_config,
                    }
                )
                resolved_provider = payload.get("provider", source.get("provider"))
                if resolved_provider == "local-stub":
                    payload["status"] = "connected"
                elif validation["ok"]:
                    payload["status"] = "connected" if source.get("status") == "connected" else "ready"
                else:
                    payload["status"] = "needs_config"
            payload["updated_at"] = utcnow()
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(f"UPDATE calendar_sources SET {assignments} WHERE id = ? AND tenant_id = ?", (*payload.values(), source_id, self._tenant_id()))
            conn.commit()
        return next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)

    def delete_calendar_source(self, source_id: str, fallback_source_id: str | None = None) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM calendar_sources WHERE id = ? AND tenant_id = ?", (source_id, self._tenant_id())).fetchone()
            if not existing:
                raise ValueError("Calendar source not found")
            fallback_row = None
            if fallback_source_id:
                fallback_row = conn.execute("SELECT * FROM calendar_sources WHERE id = ? AND tenant_id = ?", (fallback_source_id, self._tenant_id())).fetchone()
                if not fallback_row:
                    raise ValueError("Fallback calendar source not found")
            reassigned_events = conn.execute(
                "SELECT COUNT(*) FROM calendar_events WHERE tenant_id = ? AND source_id = ?",
                (self._tenant_id(), source_id),
            ).fetchone()[0]
            now = utcnow()
            if fallback_row:
                conn.execute(
                    "UPDATE calendar_events SET source_id = ?, updated_at = ? WHERE tenant_id = ? AND source_id = ?",
                    (fallback_row["id"], now, self._tenant_id(), source_id),
                )
                cleared_events = 0
            else:
                conn.execute(
                    "UPDATE calendar_events SET source_id = NULL, updated_at = ? WHERE tenant_id = ? AND source_id = ?",
                    (now, self._tenant_id(), source_id),
                )
                cleared_events = reassigned_events
                reassigned_events = 0
            conn.execute("DELETE FROM calendar_sources WHERE id = ? AND tenant_id = ?", (source_id, self._tenant_id()))
            conn.commit()
        return {
            "deleted_source_id": source_id,
            "deleted_source_name": existing["name"],
            "fallback_source_id": fallback_row["id"] if fallback_row else None,
            "fallback_source_name": fallback_row["name"] if fallback_row else None,
            "reassigned_events": reassigned_events,
            "cleared_events": cleared_events,
        }

    def disconnect_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        if source.get("provider") == "local-stub":
            raise ValueError("Local stub calendar sources do not need disconnect.")
        next_config = {
            "authority_mode": source_config_value(source, "authority_mode", "local-first"),
            "import_policy": source_config_value(source, "import_policy", "review"),
            **disconnected_provider_config(source.get("provider"), source.get("config")),
        }
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE calendar_sources
                SET status = ?, last_synced_at = ?, config_json = ?, updated_at = ?
                WHERE id = ? AND tenant_id = ?
                """,
                ("needs_config", None, json.dumps(next_config), utcnow(), source_id, self._tenant_id()),
            )
            conn.commit()
        return next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)

    def test_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        result = adapter.test_connection(source)
        next_config = {
            **(source.get("config") or {}),
            "last_tested_at": utcnow(),
        }
        if result.get("connected_calendar"):
            next_config["connected_calendar"] = result["connected_calendar"]
        if result["status"] == "ok":
            next_config.pop("last_error", None)
        else:
            next_config["last_error"] = result.get("message")
        updated = self.update_calendar_source(
            source_id,
            {
                "status": "connected" if result["status"] == "ok" else "needs_config",
                "config": next_config,
            },
        )
        return {"source": updated, "result": result}

    def list_calendar_source_calendars(self, source_id: str) -> list[dict[str, Any]]:
        source = next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        calendars = adapter.list_available_calendars(source)
        selected_calendar_id = source_config_value(source, "calendar_id", None)
        return [
            {
                **item,
                "selected": str(item.get("id") or "") == str(selected_calendar_id or ""),
            }
            for item in calendars
        ]

    def sync_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        try:
            result = adapter.sync_source(source)
        except ValueError as error:
            self.update_calendar_source(
                source_id,
                {
                    "config": {**(source.get("config") or {}), "last_error": str(error)},
                },
            )
            raise
        updates: dict[str, Any] = {"last_synced_at": utcnow()}
        updates["config"] = {
            **(source.get("config") or {}),
            **(result.get("config_updates") or {}),
        }
        updates["config"].pop("last_error", None)
        updated = self.update_calendar_source(source_id, updates)
        return {"source": updated, "result": result}

    def push_calendar_event(self, event_id: str, source_id: str | None = None) -> dict[str, Any]:
        event = next((item for item in self.list_calendar_events() if item["id"] == event_id), None)
        if not event:
            raise ValueError("Calendar event not found")
        resolved_source_id = source_id or event.get("source_id") or "calendar-source-local"
        source = next((item for item in self.list_calendar_sources() if item["id"] == resolved_source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        try:
            result = adapter.push_event(source, event)
        except ValueError as error:
            self.update_calendar_source(
                source["id"],
                {
                    "config": {**(source.get("config") or {}), "last_error": str(error)},
                },
            )
            raise
        synced_at = utcnow()
        updated_event = self.update_calendar_event(
            event_id,
            {
                "source_id": source["id"],
                "sync_status": "local" if source.get("provider") == "local-stub" else "synced",
                "external_event_ref": result.get("external_event_ref", ""),
                "last_synced_at": synced_at,
                "authority_mode": source_config_value(source, "authority_mode", "local-first"),
                "conflict_state": "resolved",
                "sync_note": "Pushed outward from the local schedule.",
            },
        )
        updated_source = self.update_calendar_source(
            source["id"],
            {
                "last_synced_at": synced_at,
                "config": {**(source.get("config") or {}), "last_error": None},
            },
        )
        return {"event": updated_event, "source": updated_source, "result": result}

    def import_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        adapter = get_calendar_adapter(source.get("provider"))
        try:
            result = adapter.import_events(source)
        except ValueError as error:
            self.update_calendar_source(
                source_id,
                {
                    "config": {**(source.get("config") or {}), "last_error": str(error)},
                },
            )
            raise
        now = utcnow()
        source_updates: dict[str, Any] = {"last_synced_at": now}
        source_updates["config"] = {
            **(source.get("config") or {}),
            **(result.get("config_updates") or {}),
        }
        source_updates["config"].pop("last_error", None)
        imported: list[dict[str, Any]] = []
        existing_events = self.list_calendar_events()
        with self._connect() as conn:
            for payload in result.get("events", []):
                existing = conn.execute(
                    "SELECT * FROM calendar_events WHERE tenant_id = ? AND source_id = ? AND external_event_ref = ?",
                    (self._tenant_id(), source_id, payload.get("external_event_ref")),
                ).fetchone()
                existing_event = self._calendar_event_from_row(dict(existing)) if existing else None
                metadata = self._calendar_import_metadata(source, payload, existing_events, event_id=existing_event.get("id") if existing_event else None)
                normalized = {
                    "calendar_id": "calendar-comms",
                    "source_id": source_id,
                    "thread_id": None,
                    "contact_id": None,
                    "company_id": None,
                    "title": payload.get("title") or f"{source['name']} imported event",
                    "description": payload.get("description") or "Imported from an external calendar source.",
                    "start_time": payload.get("start_time") or next_meeting_slot(),
                    "end_time": payload.get("end_time") or (parse_utc(payload.get("start_time") or next_meeting_slot()) + timedelta(minutes=45)).isoformat(),
                    "status": payload.get("status") or "scheduled",
                    "location_type": payload.get("location_type") or "other",
                    "location": payload.get("location") or source.get("name"),
                    "meeting_url": payload.get("meeting_url") or "",
                    "sync_status": metadata["sync_status"],
                    "external_event_ref": payload.get("external_event_ref") or f"{source_id}-{unique_suffix()}",
                    "last_synced_at": now,
                    "authority_mode": metadata["authority_mode"],
                    "conflict_state": metadata["conflict_state"],
                    "sync_note": metadata["sync_note"],
                    "imported_at": now,
                    "source_payload_json": json.dumps(payload.get("source_payload") or {}),
                    "source": "external-import",
                    "updated_at": now,
                }
                if existing_event:
                    assignments = ", ".join(f"{key} = ?" for key in normalized.keys())
                    conn.execute(
                        f"UPDATE calendar_events SET {assignments} WHERE id = ?",
                        (*normalized.values(), existing_event["id"]),
                    )
                    imported.append(self._calendar_event_from_row({**existing_event, **normalized}))
                else:
                    event_id = f"calendar-event-import-{unique_suffix()}"
                    created_at = now
                    conn.execute(
                        """
                        INSERT INTO calendar_events (
                            id, tenant_id, calendar_id, source_id, thread_id, contact_id, company_id, title, description,
                            start_time, end_time, status, location_type, location, meeting_url, sync_status,
                            external_event_ref, last_synced_at, authority_mode, conflict_state, sync_note, imported_at,
                            source_payload_json, source, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            event_id,
                            self._tenant_id(),
                            normalized["calendar_id"],
                            normalized["source_id"],
                            normalized["thread_id"],
                            normalized["contact_id"],
                            normalized["company_id"],
                            normalized["title"],
                            normalized["description"],
                            normalized["start_time"],
                            normalized["end_time"],
                            normalized["status"],
                            normalized["location_type"],
                            normalized["location"],
                            normalized["meeting_url"],
                            normalized["sync_status"],
                            normalized["external_event_ref"],
                            normalized["last_synced_at"],
                            normalized["authority_mode"],
                            normalized["conflict_state"],
                            normalized["sync_note"],
                            normalized["imported_at"],
                            normalized["source_payload_json"],
                            normalized["source"],
                            created_at,
                            normalized["updated_at"],
                        ),
                    )
                    imported.append(
                        self._calendar_event_from_row(
                            {
                                "id": event_id,
                                "created_at": created_at,
                                **normalized,
                            }
                        )
                    )
            conn.commit()
        updated_source = self.update_calendar_source(source_id, source_updates)
        conflicted = sum(1 for event in imported if event.get("conflict_state") == "review")
        return {
            "source": updated_source,
            "events": imported,
            "result": {
                **result,
                "imported_count": len(imported),
                "conflicted_count": conflicted,
                "message": result.get("message") or f"Imported {len(imported)} events from {source['name']}.",
            },
        }

    def reconcile_calendar_event(self, event_id: str, strategy: str) -> dict[str, Any]:
        event = next((item for item in self.list_calendar_events() if item["id"] == event_id), None)
        if not event:
            raise ValueError("Calendar event not found")
        if strategy not in {"keep_local", "accept_import"}:
            raise ValueError("Invalid reconciliation strategy")
        updates = {
            "conflict_state": "resolved",
            "sync_note": "Local schedule kept after reconciliation." if strategy == "keep_local" else "Imported schedule accepted into the local operating calendar.",
            "sync_status": "local" if strategy == "keep_local" else "synced" if event.get("external_event_ref") else "imported",
            "last_synced_at": utcnow(),
        }
        if strategy == "accept_import":
            source_payload = event.get("source_payload") or {}
            for key in ["title", "description", "start_time", "end_time", "location", "meeting_url"]:
                if source_payload.get(key):
                    updates[key] = source_payload[key]
        updated = self.update_calendar_event(event_id, updates)
        return {"event": updated, "result": {"strategy": strategy, "message": updates["sync_note"]}}

    def create_mailbox(
        self,
        name: str,
        address: str,
        provider: str = "local-stub",
        inbound_enabled: bool = True,
        outbound_enabled: bool = True,
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resolved_config = config or ({"adapter": "local-stub"} if provider == "local-stub" else {})
        validation = self.mail_adapter.validate_mailbox({"provider": provider, "config": resolved_config})
        mailbox = {
            "id": f"mailbox-{slugify(name)}-{unique_suffix()}",
            "name": name,
            "address": address,
            "provider": provider,
            "status": "connected" if provider == "local-stub" else "ready" if validation["ok"] else "needs_config",
            "inbound_enabled": inbound_enabled,
            "outbound_enabled": outbound_enabled,
            "last_synced_at": None,
            "config": resolved_config,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO mailboxes (
                    id, tenant_id, name, address, provider, status, inbound_enabled, outbound_enabled, last_synced_at, config_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mailbox["id"],
                    mailbox["tenant_id"],
                    mailbox["name"],
                    mailbox["address"],
                    mailbox["provider"],
                    mailbox["status"],
                    int(mailbox["inbound_enabled"]),
                    int(mailbox["outbound_enabled"]),
                    mailbox["last_synced_at"],
                    json.dumps(mailbox["config"]),
                ),
            )
            conn.commit()
        return self._annotate_mailbox_status_canonical(self.mail_adapter.describe_mailbox(mailbox))

    def update_mailbox(self, mailbox_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        next_mailbox = {
            **mailbox,
            "name": updates.get("name", mailbox["name"]),
            "address": updates.get("address", mailbox["address"]),
            "provider": updates.get("provider", mailbox["provider"]),
            "status": updates.get("status", mailbox.get("status")),
            "inbound_enabled": mailbox["inbound_enabled"] if updates.get("inbound_enabled") is None else bool(updates["inbound_enabled"]),
            "outbound_enabled": mailbox["outbound_enabled"] if updates.get("outbound_enabled") is None else bool(updates["outbound_enabled"]),
            "last_synced_at": updates.get("last_synced_at", mailbox.get("last_synced_at")),
            "config": updates.get("config", mailbox.get("config", {})),
        }
        if "status" not in updates:
            adapter = get_mail_adapter(next_mailbox.get("provider"))
            validation = adapter.validate_mailbox(next_mailbox)
            next_mailbox["status"] = "connected" if next_mailbox.get("provider") == "local-stub" else "ready" if validation["ok"] else "needs_config"
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE mailboxes
                SET name = ?, address = ?, provider = ?, status = ?, inbound_enabled = ?, outbound_enabled = ?, last_synced_at = ?, config_json = ?
                WHERE id = ? AND tenant_id = ?
                """,
                (
                    next_mailbox["name"],
                    next_mailbox["address"],
                    next_mailbox["provider"],
                    next_mailbox["status"],
                    int(next_mailbox["inbound_enabled"]),
                    int(next_mailbox["outbound_enabled"]),
                    next_mailbox["last_synced_at"],
                    json.dumps(next_mailbox["config"]),
                    mailbox_id,
                    self._tenant_id(),
                ),
            )
            conn.commit()
        return self._annotate_mailbox_status_canonical(
            get_mail_adapter(next_mailbox.get("provider")).describe_mailbox(next_mailbox)
        )

    def delete_mailbox(self, mailbox_id: str, fallback_mailbox_id: str | None = None) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        with self._connect() as conn:
            remaining_rows = conn.execute(
                "SELECT * FROM mailboxes WHERE tenant_id = ? AND id != ? ORDER BY CASE WHEN provider = 'local-stub' THEN 1 ELSE 0 END, name ASC",
                (self._tenant_id(), mailbox_id),
            ).fetchall()
            if not remaining_rows:
                raise ValueError("Cannot delete the last mailbox")
            fallback_row = None
            if fallback_mailbox_id:
                fallback_row = next((row for row in remaining_rows if row["id"] == fallback_mailbox_id), None)
                if not fallback_row:
                    raise ValueError("Fallback mailbox not found")
            if not fallback_row:
                fallback_row = remaining_rows[0]
            reassigned_threads = conn.execute(
                "SELECT COUNT(*) FROM threads WHERE tenant_id = ? AND mailbox_id = ?",
                (self._tenant_id(), mailbox_id),
            ).fetchone()[0]
            reassigned_events = conn.execute(
                "SELECT COUNT(*) FROM mail_events WHERE tenant_id = ? AND mailbox_id = ?",
                (self._tenant_id(), mailbox_id),
            ).fetchone()[0]
            now = utcnow()
            conn.execute("UPDATE threads SET mailbox_id = ?, updated_at = ? WHERE tenant_id = ? AND mailbox_id = ?", (fallback_row["id"], now, self._tenant_id(), mailbox_id))
            conn.execute("UPDATE mail_events SET mailbox_id = ? WHERE tenant_id = ? AND mailbox_id = ?", (fallback_row["id"], self._tenant_id(), mailbox_id))
            conn.execute("DELETE FROM mailboxes WHERE id = ? AND tenant_id = ?", (mailbox_id, self._tenant_id()))
            conn.commit()
        fallback = self._get_mailbox_row(fallback_row["id"])
        self._record_mail_event(
            fallback_row["id"],
            "mailbox.deleted",
            {
                "deleted_mailbox_id": mailbox_id,
                "deleted_mailbox_name": mailbox.get("name"),
                "fallback_mailbox_id": fallback_row["id"],
                "fallback_mailbox_name": fallback_row["name"],
                "reassigned_threads": reassigned_threads,
                "reassigned_events": reassigned_events,
            },
            source_provider=(fallback or {}).get("provider") if fallback else fallback_row["provider"],
        )
        return {
            "deleted_mailbox_id": mailbox_id,
            "deleted_mailbox_name": mailbox.get("name"),
            "fallback_mailbox_id": fallback_row["id"],
            "fallback_mailbox_name": fallback_row["name"],
            "reassigned_threads": reassigned_threads,
            "reassigned_events": reassigned_events,
        }

    def disconnect_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        if mailbox.get("provider") == "local-stub":
            raise ValueError("Local stub mailboxes do not need disconnect.")
        updated = self.update_mailbox(
            mailbox_id,
            {
                "status": "needs_config",
                "last_synced_at": None,
                "config": disconnected_provider_config(mailbox.get("provider"), mailbox.get("config")),
            },
        )
        self._record_mail_event(
            mailbox_id,
            "mailbox.disconnected",
            {"message": f"{mailbox.get('name')} was disconnected and must reconnect before use."},
            source_provider=mailbox.get("provider"),
        )
        return updated

    def list_mail_events(self, mailbox_id: str | None = None, thread_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM mail_events"
        params: list[str] = [self._tenant_id()]
        clauses: list[str] = ["tenant_id = ?"]
        if mailbox_id:
            clauses.append("mailbox_id = ?")
            params.append(mailbox_id)
        if thread_id:
            clauses.append("thread_id = ?")
            params.append(thread_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC"
        rows = self._rows(query, tuple(params))
        for row in rows:
            row["payload"] = json_loads(row.pop("payload_json"), {})
        return rows

    def get_mail_provider_catalog(self) -> list[dict[str, Any]]:
        return get_provider_catalog()

    def _record_mail_event(
        self,
        mailbox_id: str,
        event_type: str,
        payload: dict[str, Any],
        *,
        thread_id: str | None = None,
        message_id: str | None = None,
        source_provider: str | None = None,
    ) -> dict[str, Any]:
        event = {
            "id": f"mail-event-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "mailbox_id": mailbox_id,
            "thread_id": thread_id,
            "message_id": message_id,
            "event_type": event_type,
            "source_provider": source_provider or self.mail_adapter.provider_name,
            "payload": payload,
            "created_at": utcnow(),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO mail_events (
                    id, tenant_id, mailbox_id, thread_id, message_id, event_type, source_provider, payload_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["id"],
                    event["tenant_id"],
                    event["mailbox_id"],
                    event["thread_id"],
                    event["message_id"],
                    event["event_type"],
                    event["source_provider"],
                    json.dumps(event["payload"]),
                    event["created_at"],
                ),
            )
            conn.commit()
        return event

    def _ensure_contact_for_email(self, sender_name: str, sender_email: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM contacts WHERE tenant_id = ? AND LOWER(email) = LOWER(?)", (self._tenant_id(), sender_email)).fetchone()
            if row:
                payload = dict(row)
                payload["tags"] = json_loads(payload.pop("tags_json"), [])
                return payload
            name_parts = [part for part in sender_name.split(" ") if part]
            first_name = name_parts[0] if name_parts else sender_email.split("@")[0]
            last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else ""
            contact_id = f"contact-{unique_suffix()}"
            payload = {
                "id": contact_id,
                "contact_id": f"CNT-{unique_suffix().upper()}",
                "organization_id": "org-1",
                "tenant_id": self._tenant_id(),
                "first_name": first_name,
                "last_name": last_name,
                "email": sender_email,
                "phone": None,
                "company": None,
                "company_id": None,
                "title": None,
                "department": None,
                "owner": "AIO Flow",
                "source": "Inbound Email",
                "status": "lead",
                "lead_score": 55,
                "quality": "warm",
                "engagement": "medium",
                "tags_json": json.dumps(["Email Lead"]),
                "last_contacted_at": utcnow(),
                "pipeline_stage": "New",
                "created_at": utcnow(),
                "updated_at": utcnow(),
                "deleted_at": None,
            }
            conn.execute(
                """
                INSERT INTO contacts (
                    id, contact_id, organization_id, tenant_id, first_name, last_name, email, phone, company, company_id,
                    title, department, owner, source, status, lead_score, quality, engagement, tags_json,
                    last_contacted_at, pipeline_stage, created_at, updated_at, deleted_at
                ) VALUES (
                    :id, :contact_id, :organization_id, :tenant_id, :first_name, :last_name, :email, :phone, :company, :company_id,
                    :title, :department, :owner, :source, :status, :lead_score, :quality, :engagement, :tags_json,
                    :last_contacted_at, :pipeline_stage, :created_at, :updated_at, :deleted_at
                )
                """,
                payload,
            )
            conn.commit()
        payload["tags"] = json_loads(payload.pop("tags_json"), [])
        return payload

    def _get_mailbox_row(self, mailbox_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM mailboxes WHERE id = ? AND tenant_id = ?", (mailbox_id, self._tenant_id())).fetchone()
        if not row:
            return None
        payload = dict(row)
        payload["config"] = json_loads(payload.pop("config_json"), {})
        payload["inbound_enabled"] = bool(payload.get("inbound_enabled", 1))
        payload["outbound_enabled"] = bool(payload.get("outbound_enabled", 1))
        return payload

    def sync_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        adapter = get_mail_adapter(mailbox.get("provider"))
        try:
            payload = adapter.build_sync_message(mailbox, self.list_contacts())
        except ValueError as error:
            self.update_mailbox(
                mailbox_id,
                {
                    "config": {**(mailbox.get("config") or {}), "last_error": str(error)},
                },
            )
            self._record_mail_event(mailbox_id, "mailbox.sync_failed", {"message": str(error)}, source_provider=adapter.provider_name)
            raise
        updated_at = utcnow()
        config_updates = (payload or {}).get("config_updates") or {}
        mailbox_updates: dict[str, Any] = {"last_synced_at": updated_at}
        mailbox_updates["config"] = {**(mailbox.get("config") or {}), **config_updates}
        mailbox_updates["config"].pop("last_error", None)
        mailbox = self.update_mailbox(mailbox_id, mailbox_updates)
        if not payload:
            event = self._record_mail_event(mailbox_id, "mailbox.synced", {"status": "noop", "message": "No new messages found."}, source_provider=adapter.provider_name)
            return {"mailbox": mailbox, "result": {"status": "noop", "message": "No new messages found."}, "event": event}
        thread = self.ingest_mail_message(
            mailbox_id=mailbox_id,
            subject=payload["subject"],
            body=payload["body"],
            sender_name=payload["sender_name"],
            sender_email=payload["sender_email"],
            recipients=payload.get("recipients"),
        )
        event = self._record_mail_event(mailbox_id, "mailbox.synced", payload, thread_id=thread["id"], message_id=thread["latestMessage"]["id"] if thread.get("latestMessage") else None, source_provider=adapter.provider_name)
        return {
            "mailbox": self._annotate_mailbox_status_canonical(adapter.describe_mailbox(mailbox)),
            "thread": thread,
            "event": event,
        }

    def test_mailbox_connection(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        adapter = get_mail_adapter(mailbox.get("provider"))
        result = adapter.test_connection(mailbox)
        status = "connected" if result["status"] == "ok" else "needs_config"
        next_config = {
            **(mailbox.get("config") or {}),
            "last_tested_at": utcnow(),
        }
        if result.get("connected_identity"):
            next_config["connected_identity"] = result["connected_identity"]
        if result["status"] == "ok":
            next_config.pop("last_error", None)
        else:
            next_config["last_error"] = result.get("message")
        mailbox = self.update_mailbox(mailbox_id, {"status": status, "config": next_config})
        event = self._record_mail_event(mailbox_id, "mailbox.tested", result, source_provider=adapter.provider_name)
        return {"mailbox": mailbox, "result": result, "event": event}

    def ingest_mail_message(
        self,
        mailbox_id: str,
        subject: str,
        body: str,
        sender_name: str,
        sender_email: str,
        recipients: list[str] | None = None,
    ) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        contact = self._ensure_contact_for_email(sender_name, sender_email)
        thread = self.open_thread_for_contact(
            contact_id=contact["id"],
            channel_type="email",
            subject=subject,
            force_new=False,
            mailbox_id=mailbox_id,
        )
        thread = self.send_thread_message(
            thread_id=thread["id"],
            body=body,
            channel_type="email",
            sender_name=sender_name,
            sender_email=sender_email,
            recipients=recipients or [mailbox["address"]],
            direction="inbound",
        )
        adapter = get_mail_adapter(mailbox.get("provider"))
        self._record_mail_event(mailbox_id, "mail.received", {"subject": subject, "sender_email": sender_email}, thread_id=thread["id"], message_id=thread["latestMessage"]["id"] if thread.get("latestMessage") else None, source_provider=adapter.provider_name)
        return thread

    def send_thread_via_mailbox(
        self,
        thread_id: str,
        body: str,
        mailbox_id: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str | None = None,
        recipients: list[str] | None = None,
    ) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        resolved_mailbox_id = mailbox_id or thread["mailbox_id"]
        mailbox = self._get_mailbox_row(resolved_mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        resolved_recipients = [recipient for recipient in (recipients or [thread.get("contact", {}).get("email")]) if recipient]
        adapter = get_mail_adapter(mailbox.get("provider"))
        try:
            delivery = adapter.deliver_outbound(
                mailbox,
                thread,
                body=body,
                sender_name=sender_name,
                sender_email=sender_email or mailbox.get("address") or "mission@aiocrm.local",
                recipients=resolved_recipients,
            )
        except ValueError as error:
            self.update_mailbox(
                resolved_mailbox_id,
                {
                    "config": {**(mailbox.get("config") or {}), "last_error": str(error)},
                },
            )
            self._record_mail_event(resolved_mailbox_id, "mail.failed", {"message": str(error), "thread_id": thread_id}, thread_id=thread_id, source_provider=adapter.provider_name)
            raise
        self.update_mailbox(
            resolved_mailbox_id,
            {
                "config": {**(mailbox.get("config") or {}), "last_error": None},
            },
        )
        updated = self.send_thread_message(
            thread_id=thread_id,
            body=body,
            channel_type="email",
            sender_name=delivery["sender_name"],
            sender_email=delivery["sender_email"],
            recipients=delivery["recipients"],
            direction="outbound",
        )
        self._record_mail_event(
            resolved_mailbox_id,
            "mail.sent",
            delivery["provider_payload"],
            thread_id=thread_id,
            message_id=updated["latestMessage"]["id"] if updated.get("latestMessage") else None,
            source_provider=adapter.provider_name,
        )
        internal_message_id = updated["latestMessage"]["id"] if updated.get("latestMessage") else None
        if adapter.provider_name == "local-stub":
            return {
                **updated,
                "deliveryStatus": "simulated",
                "deliveryMode": "local_stub",
                "providerMessageId": None,
                "internalMessageId": internal_message_id,
                "simulatedMessageId": delivery.get("provider_message_id"),
            }
        return {
            **updated,
            "deliveryStatus": delivery.get("delivery_status") or "sent",
            "deliveryMode": "provider",
            "providerMessageId": delivery.get("provider_message_id"),
            "internalMessageId": internal_message_id,
            "simulatedMessageId": None,
        }

    def get_comms_snapshot(self) -> dict[str, Any]:
        threads = self._get_thread_context()
        queues = [{**queue, "count": sum(1 for thread in threads if queue["id"] in thread["queueIds"])} for queue in default_queue_definitions()]
        return {
            "queues": queues,
            "threads": threads,
            "allThreads": threads,
            "mailboxes": self.list_mailboxes(),
            "calendarEvents": self.list_calendar_events(),
            "agents": [
                {"name": "ALPHA"},
                {"name": "BRAVO"},
                {"name": "CHARLIE"},
                {"name": "DELTA"},
                {"name": "ECHO"},
                {"name": "FORGE"},
                {"name": "GHOST"},
                {"name": "ARCHER"},
                {"name": "ATLAS"},
                {"name": "RANGER"},
                {"name": "SCOUT"},
                {"name": "STRIKER"},
                {"name": "VECTOR"},
            ],
        }

    def create_thread(
        self,
        subject: str,
        channel_type: str = "email",
        contact_id: str | None = None,
        company_id: str | None = None,
        body: str = "",
        status: str = "new",
        assignee: str = "ECHO",
        mailbox_id: str | None = None,
    ) -> dict[str, Any]:
        now = utcnow()
        thread_id = f"thread-{slugify(subject)}-{unique_suffix()}"
        resolved_company_id = company_id
        if contact_id and not resolved_company_id:
            with self._connect() as conn:
                row = conn.execute("SELECT company_id FROM contacts WHERE id = ? AND tenant_id = ?", (contact_id, self._tenant_id())).fetchone()
                resolved_company_id = row["company_id"] if row else None

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO threads (
                    id, tenant_id, mailbox_id, channel_type, subject, generated_title, status, ai_flags_json, ai_priority,
                    priority_score, owner, assignee, contact_id, company_id, automation_state, last_activity_at,
                    next_follow_up_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread_id, self._tenant_id(), mailbox_id or "mailbox-primary", channel_type, subject, subject, status, json.dumps({"needs_human": True}),
                    "medium", 70, assignee, assignee, contact_id, resolved_company_id, "manual", now, None, now, now,
                ),
            )
            conn.execute(
                """
                INSERT INTO thread_ai_briefs (
                    thread_id, tenant_id, summary, disposition, recommended_next_step, confidence,
                    unresolved_questions_json, crm_implications_json, reasoning_cues_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread_id, self._tenant_id(), "Fresh thread awaiting triage.", "New signal", "Review context and send a clear next step.",
                    0.64, json.dumps(["Confirm best next action"]), json.dumps([]), json.dumps(["Thread created manually"]), now,
                ),
            )
            conn.executemany(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (f"thread-action-{thread_id}-1", self._tenant_id(), thread_id, "Summarize", "summarize", "ai", "suggested", now, now),
                    (f"thread-action-{thread_id}-2", self._tenant_id(), thread_id, "Reply with AI", "reply-with-ai", "ai", "suggested", now, now),
                ],
            )
            if contact_id:
                conn.execute(
                    "INSERT INTO thread_links (id, tenant_id, thread_id, source_type, source_id, label) SELECT ?, ?, ?, 'contact', id, first_name || ' ' || last_name FROM contacts WHERE id = ? AND tenant_id = ?",
                    (f"thread-link-{thread_id}-contact", self._tenant_id(), thread_id, contact_id, self._tenant_id()),
                )
            if resolved_company_id:
                conn.execute(
                    "INSERT INTO thread_links (id, tenant_id, thread_id, source_type, source_id, label) SELECT ?, ?, ?, 'company', id, name FROM companies WHERE id = ? AND tenant_id = ?",
                    (f"thread-link-{thread_id}-company", self._tenant_id(), thread_id, resolved_company_id, self._tenant_id()),
                )
            conn.commit()
        if body:
            self.send_thread_message(thread_id, body, channel_type=channel_type)
        return next(thread for thread in self._get_thread_context() if thread["id"] == thread_id)

    def open_thread_for_contact(
        self,
        contact_id: str,
        channel_type: str = "email",
        subject: str | None = None,
        body: str = "",
        force_new: bool = False,
        mailbox_id: str | None = None,
    ) -> dict[str, Any]:
        if not force_new:
            for thread in self._get_thread_context():
                if thread["contact_id"] == contact_id and thread["channel_type"] == channel_type and thread["status"] != "closed":
                    return thread
        with self._connect() as conn:
            contact = conn.execute("SELECT first_name, last_name, company_id FROM contacts WHERE id = ? AND tenant_id = ?", (contact_id, self._tenant_id())).fetchone()
        if not contact:
            raise ValueError("Contact not found")
        resolved_subject = subject or f"{channel_type.upper()} follow-up for {contact['first_name']} {contact['last_name']}".strip()
        return self.create_thread(resolved_subject, channel_type=channel_type, contact_id=contact_id, company_id=contact["company_id"], body=body, assignee="STRIKER" if channel_type == "email" else "ECHO", mailbox_id=mailbox_id)

    def send_thread_message(
        self,
        thread_id: str,
        body: str,
        channel_type: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str = "mission@aiocrm.local",
        recipients: list[str] | None = None,
        direction: str = "outbound",
    ) -> dict[str, Any]:
        created_at = utcnow()
        message_id = f"msg-{thread_id}-{unique_suffix()}"
        with self._connect() as conn:
            thread_row = conn.execute("SELECT * FROM threads WHERE id = ? AND tenant_id = ?", (thread_id, self._tenant_id())).fetchone()
            if not thread_row:
                raise ValueError("Thread not found")
            thread = dict(thread_row)
            resolved_channel = channel_type or thread["channel_type"]
            resolved_recipients = recipients or []
            conn.execute(
                """
                INSERT INTO messages (
                    id, tenant_id, thread_id, channel_type, direction, sender_name, sender_email, recipients_json,
                    body, plain_text, quoted_history, delivery_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id, self._tenant_id(), thread_id, resolved_channel, direction, sender_name, sender_email, json.dumps(resolved_recipients),
                    body, body, "", "sent" if direction == "outbound" else "logged" if direction == "system" else "received", created_at, created_at,
                ),
            )
            ai_flags = json_loads(thread["ai_flags_json"], {})
            status = thread["status"]
            summary_text = "System note logged: " + body[:120]
            next_step = "Review the CRM/operator note and decide the next move."
            if direction == "outbound":
                ai_flags["follow_up_due"] = True
                status = "waiting_on_them"
                summary_text = f"Outbound {resolved_channel} sent: " + body[:120]
                next_step = "Monitor for response and prep the next touchpoint."
            elif direction == "inbound":
                ai_flags["needs_human"] = True
                status = "waiting_on_us"
                summary_text = f"Inbound {resolved_channel} received: " + body[:120]
                next_step = "Review the new signal and craft a precise reply."
            conn.execute(
                "UPDATE threads SET status = ?, ai_flags_json = ?, last_activity_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                (status, json.dumps(ai_flags), created_at, created_at, thread_id, self._tenant_id()),
            )
            conn.execute(
                "UPDATE thread_ai_briefs SET summary = ?, recommended_next_step = ?, updated_at = ? WHERE thread_id = ? AND tenant_id = ?",
                (
                    summary_text,
                    next_step,
                    created_at,
                    thread_id,
                    self._tenant_id(),
                ),
            )
            conn.commit()
        return next(thread for thread in self._get_thread_context() if thread["id"] == thread_id)

    def update_thread_status(self, thread_id: str, status: str) -> dict[str, Any]:
        now = utcnow()
        with self._connect() as conn:
            existing = conn.execute("SELECT status FROM threads WHERE id = ? AND tenant_id = ?", (thread_id, self._tenant_id())).fetchone()
            if not existing:
                raise ValueError("Thread not found")
            conn.execute("UPDATE threads SET status = ?, updated_at = ? WHERE id = ? AND tenant_id = ?", (status, now, thread_id, self._tenant_id()))
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"thread-action-{unique_suffix()}",
                    self._tenant_id(),
                    thread_id,
                    f"Status: {status.replace('_', ' ').title()}",
                    "status-update",
                    "system",
                    "completed",
                    now,
                    now,
                ),
            )
            conn.commit()
        return next(thread for thread in self._get_thread_context() if thread["id"] == thread_id)

    def create_thread_report(self, thread_id: str, kind: str = "operator") -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        now = utcnow()
        title = "Executive Thread Report" if kind == "executive" else "Operator Thread Report"
        artifact = {
            "id": f"thread-artifact-{unique_suffix()}",
            "tenant_id": self._tenant_id(),
            "thread_id": thread_id,
            "artifact_type": "report",
            "kind": kind,
            "title": title,
            "body": build_thread_report_text(thread, kind=kind),
            "created_by": thread.get("assignee") or "AIO Flow",
            "created_at": now,
            "updated_at": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO thread_artifacts (
                    id, tenant_id, thread_id, artifact_type, kind, title, body, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    artifact["id"],
                    artifact["tenant_id"],
                    artifact["thread_id"],
                    artifact["artifact_type"],
                    artifact["kind"],
                    artifact["title"],
                    artifact["body"],
                    artifact["created_by"],
                    artifact["created_at"],
                    artifact["updated_at"],
                ),
            )
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"thread-action-{unique_suffix()}",
                    self._tenant_id(),
                    thread_id,
                    title,
                    f"{kind}-report",
                    "system",
                    "completed",
                    now,
                    now,
                ),
            )
            conn.commit()
        return {"artifact": artifact, "thread": next(item for item in self._get_thread_context() if item["id"] == thread_id)}

    def delete_thread(self, thread_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT id FROM threads WHERE id = ? AND tenant_id = ?", (thread_id, self._tenant_id())).fetchone()
            if not existing:
                raise ValueError("Thread not found")
            conn.execute("UPDATE calendar_events SET thread_id = NULL, updated_at = ? WHERE thread_id = ? AND tenant_id = ?", (utcnow(), thread_id, self._tenant_id()))
            conn.execute("DELETE FROM messages WHERE thread_id = ? AND tenant_id = ?", (thread_id, self._tenant_id()))
            conn.execute("DELETE FROM thread_ai_briefs WHERE thread_id = ? AND tenant_id = ?", (thread_id, self._tenant_id()))
            conn.execute("DELETE FROM thread_actions WHERE thread_id = ? AND tenant_id = ?", (thread_id, self._tenant_id()))
            conn.execute("DELETE FROM thread_links WHERE thread_id = ? AND tenant_id = ?", (thread_id, self._tenant_id()))
            conn.execute("DELETE FROM thread_artifacts WHERE thread_id = ? AND tenant_id = ?", (thread_id, self._tenant_id()))
            conn.execute("DELETE FROM threads WHERE id = ? AND tenant_id = ?", (thread_id, self._tenant_id()))
            conn.commit()
        return {"deleted_thread_id": thread_id}

    def assign_thread(self, thread_id: str, assignee_name: str) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        previous_assignee = thread.get("assignee") or "Unassigned"
        now = utcnow()
        with self._connect() as conn:
            conn.execute("UPDATE threads SET assignee = ?, owner = ?, updated_at = ? WHERE id = ? AND tenant_id = ?", (assignee_name, assignee_name, now, thread_id, self._tenant_id()))
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{unique_suffix()}", self._tenant_id(), thread_id, f"Assigned to {assignee_name}", "assign-thread", "system", "completed", now, now),
            )
            conn.commit()
        self.send_thread_message(
            thread_id,
            f"Routing update: ownership moved from {previous_assignee} to {assignee_name}.",
            channel_type="internal",
            sender_name="ALPHA",
            sender_email="system@aiocrm.local",
            recipients=["Internal"],
            direction="system",
        )
        return next(thread for thread in self._get_thread_context() if thread["id"] == thread_id)

    def update_thread_mailbox(self, thread_id: str, mailbox_id: str) -> dict[str, Any]:
        mailbox = self._get_mailbox_row(mailbox_id)
        if not mailbox:
            raise ValueError("Mailbox not found")
        with self._connect() as conn:
            conn.execute("UPDATE threads SET mailbox_id = ?, updated_at = ? WHERE id = ? AND tenant_id = ?", (mailbox_id, utcnow(), thread_id, self._tenant_id()))
            conn.commit()
        self._record_mail_event(mailbox_id, "thread.mailbox_updated", {"thread_id": thread_id, "mailbox_name": mailbox["name"]}, thread_id=thread_id)
        return next(thread for thread in self._get_thread_context() if thread["id"] == thread_id)

    def summarize_thread(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        latest = thread["latestMessage"]
        summary = thread["brief"].get("summary", "No summary available.")
        if latest:
            summary = f"{latest['sender_name']} is focused on {latest['plain_text'].lower().rstrip('.')}."
        with self._connect() as conn:
            conn.execute("UPDATE thread_ai_briefs SET summary = ?, updated_at = ? WHERE thread_id = ? AND tenant_id = ?", (summary, utcnow(), thread_id, self._tenant_id()))
            conn.commit()
        return next(item for item in self._get_thread_context() if item["id"] == thread_id)

    def create_thread_draft(self, thread_id: str, mode: str = "reply") -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        first_name = (thread.get("contact") or {}).get("first_name") or "there"
        summary = thread["brief"].get("summary") or thread["preview"]
        if mode == "rewrite":
            draft = f"Refined version: {summary} Next move: {thread['brief'].get('recommended_next_step', 'reply with clarity and confidence.')}"
        elif mode == "extract":
            draft = "Task extract:\n- Confirm owner for " + thread["subject"]
        else:
            draft = f"Hi {first_name},\n\nI reviewed your message. {summary}\n\nNext step from our side: {thread['brief'].get('recommended_next_step', 'I will get this moving and send the next update shortly.')}\n\nBest,\n{thread.get('assignee') or 'ECHO'}"
        return {"draft": draft}

    def apply_thread_ai_result(
        self,
        thread_id: str,
        mode: str,
        suggestion: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        details = metadata or {}
        brief = thread.get("brief") or {}
        now = utcnow()
        action_labels = {
            "summary": "AI Brief Refreshed",
            "reply": "Reply Drafted",
            "rewrite": "Rewrite Drafted",
            "extract": "Tasks Extracted",
        }
        next_step = details.get("recommended_next_step") or brief.get("recommended_next_step") or "Review the active thread and send the clearest next move."
        disposition = details.get("disposition") or brief.get("disposition") or "Active relationship signal"
        confidence = details.get("confidence")
        if confidence is None:
            confidence = brief.get("confidence", 0.82)
        unresolved_questions = details.get("unresolved_questions") or brief.get("unresolved_questions") or []
        crm_implications = details.get("crm_implications") or brief.get("crm_implications") or []
        reasoning_cues = details.get("reasoning_cues") or brief.get("reasoning_cues") or ["AI assist applied to this thread."]
        summary = suggestion if mode == "summary" else (brief.get("summary") or thread.get("preview") or "AI summary is being refined from the active thread.")

        with self._connect() as conn:
            conn.execute(
                """
                UPDATE thread_ai_briefs
                SET summary = ?, disposition = ?, recommended_next_step = ?, confidence = ?,
                    unresolved_questions_json = ?, crm_implications_json = ?, reasoning_cues_json = ?, updated_at = ?
                WHERE thread_id = ? AND tenant_id = ?
                """,
                (
                    summary,
                    disposition,
                    next_step,
                    confidence,
                    json.dumps(unresolved_questions),
                    json.dumps(crm_implications),
                    json.dumps(reasoning_cues),
                    now,
                    thread_id,
                    self._tenant_id(),
                ),
            )
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"thread-action-{thread_id}-ai-{unique_suffix()}",
                    self._tenant_id(),
                    thread_id,
                    action_labels.get(mode, "AI Updated"),
                    f"ai-{mode}",
                    "ai",
                    "completed",
                    now,
                    now,
                ),
            )
            conn.commit()
        refreshed = next(item for item in self._get_thread_context() if item["id"] == thread_id)
        return {"thread": refreshed, "draft": suggestion}

    def create_deal_from_thread(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        if not thread.get("contact_id"):
            raise ValueError("Thread must be linked to a contact before creating a deal.")
        deal_label = f"{thread.get('company', {}).get('name') or thread.get('contact', {}).get('first_name') or 'Relationship'} Opportunity"
        now = utcnow()
        with self._connect() as conn:
            conn.execute(
                "UPDATE contacts SET pipeline_stage = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
                ("Qualified" if (thread.get("contact") or {}).get("pipeline_stage") == "New" else (thread.get("contact") or {}).get("pipeline_stage") or "Qualified", now, thread["contact_id"], self._tenant_id()),
            )
            exists = conn.execute("SELECT 1 FROM thread_links WHERE tenant_id = ? AND thread_id = ? AND source_type = 'deal' LIMIT 1", (self._tenant_id(), thread_id)).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO thread_links (id, tenant_id, thread_id, source_type, source_id, label) VALUES (?, ?, ?, 'deal', ?, ?)",
                    (f"thread-link-{thread_id}-deal", self._tenant_id(), thread_id, f"deal-{thread_id}", deal_label),
                )
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{thread_id}-deal-{unique_suffix()}", self._tenant_id(), thread_id, "Create Deal", "create-deal", "system", "completed", now, now),
            )
            conn.commit()
        self.send_thread_message(thread_id, "CRM action: created a deal shell from this conversation and qualified the linked contact.", channel_type="internal", sender_name="ALPHA", sender_email="system@aiocrm.local", recipients=["Internal"], direction="system")
        return next(item for item in self._get_thread_context() if item["id"] == thread_id)

    def advance_thread_stage(self, thread_id: str) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        if not thread.get("contact_id"):
            raise ValueError("Thread must be linked to a contact before advancing stage.")
        stage = next_pipeline_stage((thread.get("contact") or {}).get("pipeline_stage"))
        now = utcnow()
        with self._connect() as conn:
            conn.execute("UPDATE contacts SET pipeline_stage = ?, updated_at = ? WHERE id = ? AND tenant_id = ?", (stage, now, thread["contact_id"], self._tenant_id()))
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{thread_id}-stage-{unique_suffix()}", self._tenant_id(), thread_id, f"Advance Stage: {stage}", "advance-stage", "system", "completed", now, now),
            )
            conn.commit()
        self.send_thread_message(thread_id, f"CRM action: advanced the linked relationship to {stage}.", channel_type="internal", sender_name="STRIKER", sender_email="system@aiocrm.local", recipients=["Internal"], direction="system")
        return next(item for item in self._get_thread_context() if item["id"] == thread_id)

    def schedule_thread_meeting(self, thread_id: str, scheduled_at: str | None = None) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        follow_up_at = scheduled_at or next_meeting_slot()
        start_time = parse_utc(follow_up_at)
        if not start_time:
            raise ValueError("Invalid meeting time")
        now = utcnow()
        with self._connect() as conn:
            conn.execute("UPDATE threads SET status = ?, next_follow_up_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?", ("scheduled", follow_up_at, now, thread_id, self._tenant_id()))
            existing_event = conn.execute("SELECT id FROM calendar_events WHERE tenant_id = ? AND thread_id = ? LIMIT 1", (self._tenant_id(), thread_id)).fetchone()
            calendar_event_id = existing_event["id"] if existing_event else f"calendar-event-{thread_id}-{unique_suffix()}"
            if existing_event:
                conn.execute(
                    """
                    UPDATE calendar_events
                    SET title = ?, description = ?, start_time = ?, end_time = ?, status = ?, location_type = ?, location = ?, source_id = ?, sync_status = ?, external_event_ref = ?, last_synced_at = ?, authority_mode = ?, conflict_state = ?, sync_note = ?, imported_at = ?, source_payload_json = ?, updated_at = ?
                    WHERE id = ? AND tenant_id = ?
                    """,
                    (
                        f"{thread['subject']} meeting",
                        f"Scheduled from Comms for {thread['subject']}.",
                        follow_up_at,
                        (start_time + timedelta(minutes=30)).isoformat(),
                        "scheduled",
                        "other",
                        "Comms command room",
                        "calendar-source-local",
                        "local",
                        "",
                        now,
                        "local-first",
                        "clear",
                        "Scheduled locally from the Comms workspace.",
                        None,
                        json.dumps({}),
                        now,
                        calendar_event_id,
                        self._tenant_id(),
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO calendar_events (
                        id, tenant_id, calendar_id, thread_id, contact_id, company_id, title, description, start_time, end_time,
                        status, location_type, location, meeting_url, source_id, sync_status, external_event_ref, last_synced_at,
                        authority_mode, conflict_state, sync_note, imported_at, source_payload_json, source, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        calendar_event_id,
                        self._tenant_id(),
                        "calendar-comms",
                        thread_id,
                        thread.get("contact_id"),
                        thread.get("company_id"),
                        f"{thread['subject']} meeting",
                        f"Scheduled from Comms for {thread['subject']}.",
                        follow_up_at,
                        (start_time + timedelta(minutes=30)).isoformat(),
                        "scheduled",
                        "other",
                        "Comms command room",
                        "",
                        "calendar-source-local",
                        "local",
                        "",
                        now,
                        "local-first",
                        "clear",
                        "Scheduled locally from the Comms workspace.",
                        None,
                        json.dumps({}),
                        "comms",
                        now,
                        now,
                    ),
                )
            existing_link = conn.execute(
                "SELECT 1 FROM thread_links WHERE tenant_id = ? AND thread_id = ? AND source_type = 'calendar-event' AND source_id = ? LIMIT 1",
                (self._tenant_id(), thread_id, calendar_event_id),
            ).fetchone()
            if not existing_link:
                conn.execute(
                    "INSERT INTO thread_links (id, tenant_id, thread_id, source_type, source_id, label) VALUES (?, ?, ?, 'calendar-event', ?, ?)",
                    (f'thread-link-{thread_id}-calendar-{unique_suffix()}', self._tenant_id(), thread_id, calendar_event_id, "Scheduled meeting"),
                )
            conn.execute(
                "INSERT INTO thread_actions (id, tenant_id, thread_id, label, action_type, source, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{thread_id}-meeting-{unique_suffix()}", self._tenant_id(), thread_id, "Schedule Meeting", "schedule-meeting", "system", "completed", now, now),
            )
            conn.commit()
        self.send_thread_message(thread_id, f"CRM action: scheduled a meeting follow-up for {follow_up_at}.", channel_type="internal", sender_name="ALPHA", sender_email="system@aiocrm.local", recipients=["Internal"], direction="system")
        return next(item for item in self._get_thread_context() if item["id"] == thread_id)

    def save_ai_audit_log(self, payload: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ai_audit_logs (
                    id, tenant_id, run_id, step_id, agent, agent_id, action, result, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"audit-{unique_suffix()}",
                    self._tenant_id(),
                    payload.get("runId"),
                    payload.get("stepId"),
                    payload.get("agent"),
                    payload.get("agentId"),
                    payload.get("action"),
                    payload.get("result"),
                    payload.get("timestamp") or utcnow()
                )
            )
            conn.commit()

    def save_ai_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO ai_engine_runs (
                    id, tenant_id, command, mode, status, pause_reason, resume_at, next_node_id, current_node_id, locked_until, last_error, steps_json, 
                    artifacts_json, pending_approvals_json, routing_json, trace_json, 
                    actor_json, context_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    self._tenant_id(),
                    payload["command"],
                    payload["mode"],
                    payload["status"],
                    payload.get("pause_reason"),
                    payload.get("resume_at"),
                    payload.get("next_node_id"),
                    payload.get("current_node_id"),
                    payload.get("locked_until"),
                    payload.get("last_error"),
                    payload.get("steps_json", "[]"),
                    payload.get("artifacts_json", "[]"),
                    payload.get("pending_approvals_json", "[]"),
                    payload.get("routing_json", "{}"),
                    payload.get("trace_json", "[]"),
                    payload.get("actor_json", "{}"),
                    payload.get("context_json", "{}"),
                    now,
                    now,
                ),
            )
            conn.commit()
        res = self.get_ai_run(payload["id"])
        return res if res else payload

    def _deserialize_ai_engine_run_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if not row:
            return None
        parsed = dict(row)
        for key, default in [
            ("steps_json", []),
            ("artifacts_json", []),
            ("pending_approvals_json", []),
            ("routing_json", {}),
            ("trace_json", []),
            ("actor_json", {}),
            ("context_json", {}),
        ]:
            try:
                parsed[key[:-5] if key.endswith("_json") else key] = json.loads(parsed.get(key) or json.dumps(default))
            except json.JSONDecodeError:
                parsed[key[:-5] if key.endswith("_json") else key] = default
        return parsed

    def get_ai_run(self, run_id: str) -> dict[str, Any] | None:
        rows = self._tenant_rows("SELECT * FROM ai_engine_runs WHERE tenant_id = ? AND id = ?", (run_id,))
        return self._deserialize_ai_engine_run_row(rows[0] if rows else None)

    def update_ai_run(self, run_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            updates["updated_at"] = utcnow()
            set_clause = ", ".join(f"{k} = ?" for k in updates.keys() if k != "id" and k != "tenant_id")
            values = [v for k, v in updates.items() if k != "id" and k != "tenant_id"]
            if set_clause:
                conn.execute(f"UPDATE ai_engine_runs SET {set_clause} WHERE tenant_id = ? AND id = ?", (*values, self._tenant_id(), run_id))
                conn.commit()
        res = self.get_ai_run(run_id)
        return res if res else {}

    def list_ai_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self._tenant_rows(
            """
            SELECT *
            FROM ai_engine_runs
            WHERE tenant_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (max(1, min(limit, 200)),),
        )
        return [self._deserialize_ai_engine_run_row(row) for row in rows if row]

    def claim_due_ai_runs(self, pause_reason: str = "delay", limit: int = 10, lock_seconds: int = 60) -> list[dict[str, Any]]:
        now = utcnow()
        locked_until = (datetime.now(UTC) + timedelta(seconds=max(5, lock_seconds))).isoformat()
        claimed: list[dict[str, Any]] = []
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM ai_engine_runs
                WHERE status = 'paused'
                  AND pause_reason = ?
                  AND resume_at IS NOT NULL
                  AND resume_at <= ?
                  AND (locked_until IS NULL OR locked_until = '' OR locked_until <= ?)
                ORDER BY resume_at ASC
                LIMIT ?
                """,
                (pause_reason, now, now, max(1, min(limit, 200))),
            ).fetchall()
            for row in rows:
                updated = conn.execute(
                    """
                    UPDATE ai_engine_runs
                    SET locked_until = ?, updated_at = ?
                    WHERE id = ?
                      AND status = 'paused'
                      AND pause_reason = ?
                      AND (locked_until IS NULL OR locked_until = '' OR locked_until <= ?)
                    """,
                    (locked_until, now, row["id"], pause_reason, now),
                )
                if updated.rowcount:
                    refreshed = conn.execute("SELECT * FROM ai_engine_runs WHERE id = ?", (row["id"],)).fetchone()
                    parsed = self._deserialize_ai_engine_run_row(refreshed)
                    if parsed:
                        claimed.append(parsed)
            conn.commit()
        return claimed



def create_provider() -> BaseProvider:
    provider_name = os.getenv("DATA_PROVIDER", "sqlite").lower()
    if provider_name == "mock":
        return MockProvider()
    db_path = os.getenv("SQLITE_DB_PATH", str(Path(__file__).resolve().parent / "data" / "aio_crm.db"))
    return SQLiteProvider(db_path)
