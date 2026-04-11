import json
import os
import re
import sqlite3
from abc import ABC, abstractmethod
from contextvars import ContextVar, Token
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

from backend.calendar_adapters import get_calendar_adapter, get_calendar_provider_catalog
from backend.mail_adapters import get_mail_adapter, get_provider_catalog
try:
    from backend.agent_definitions import AGENT_DEFINITIONS
except ModuleNotFoundError:
    from agent_definitions import AGENT_DEFINITIONS

DEFAULT_TENANT_ID = "tenant-primary"
CURRENT_TENANT_ID: ContextVar[str | None] = ContextVar("current_tenantId", default=None)
MAIL_OAUTH_PROVIDERS = {"gmail-oauth", "microsoft365-oauth"}
CALENDAR_OAUTH_PROVIDERS = {"google-calendar-oauth", "google-meet-oauth", "microsoft365-calendar"}
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
KNOWN_AGENT_NAMES = set(AGENT_DEFINITIONS.keys())


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


def is_known_agent_name(value: str | None) -> bool:
    return str(value or "").strip().upper() in KNOWN_AGENT_NAMES


def resolve_thread_active_agent(
    messages: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    assignee: str | None,
) -> dict[str, str]:
    latest_candidate: dict[str, str] | None = None
    latest_stamp = -1.0

    for action in actions or []:
        agent_name = str(action.get("agentName") or action.get("agent") or "").strip().upper()
        if not is_known_agent_name(agent_name):
            continue
        stamp_source = action.get("updatedAt") or action.get("createdAt") or ""
        parsed_stamp = parse_utc(stamp_source)
        stamp = parsed_stamp.timestamp() if parsed_stamp else 0.0
        if stamp >= latest_stamp:
            latest_stamp = stamp
            latest_candidate = {"name": agent_name, "surface": "EXECUTION"}

    for message in messages or []:
        sender_name = str(message.get("senderName") or "").strip().upper()
        if not is_known_agent_name(sender_name):
            continue
        stamp_source = message.get("updatedAt") or message.get("createdAt") or ""
        parsed_stamp = parse_utc(stamp_source)
        stamp = parsed_stamp.timestamp() if parsed_stamp else 0.0
        if stamp >= latest_stamp:
            latest_stamp = stamp
            latest_candidate = {
                "name": sender_name,
                "surface": "COMMS" if str(message.get("direction") or "").lower() == "outbound" else "EXECUTION",
            }

    if latest_candidate:
        return latest_candidate

    fallback = str(assignee or "").strip().upper()
    if is_known_agent_name(fallback):
        return {"name": fallback, "surface": "COMMS"}
    return {"name": "", "surface": ""}


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
        normalized = "".join(char if char.isalnum() else " " for char in str(field["label"]).strip())
        parts = [part.lower() for part in normalized.split() if part]
        if parts:
            return parts[0] + "".join(part[:1].upper() + part[1:] for part in parts[1:])
    if field.get("id"):
        return str(field["id"])
    return f"field{unique_suffix().capitalize()}"


def unique_suffix() -> str:
    return uuid4().hex[:10]


def parse_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in re.split(r'[\n,]+', value) if item.strip()]
    return []


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
    cues = brief.get("reasoningCues") or []
    lines = [
        "Executive Thread Report" if kind == "executive" else "Operator Thread Report",
        f"Thread: {thread.get('subject') or thread.get('generatedTitle') or 'Untitled thread'}",
        f"Priority: {thread.get('aiPriority') or 'medium'}",
        f"Contact: {' '.join(part for part in [contact.get('firstName'), contact.get('lastName')] if part).strip() or 'No linked contact'}",
        f"Company: {company.get('name') or 'No linked company'}",
        f"Stage: {contact.get('pipelineStage') or 'Unlinked'}",
        f"Owner: {thread.get('owner') or 'Unassigned'}",
        f"Assignee: {thread.get('assignee') or 'Unassigned'}",
        "",
        "Executive Summary" if kind == "executive" else "Operating Summary",
        brief.get("summary") or thread.get("preview") or "No summary available.",
        "",
        "Recommended Next Step",
        brief.get("recommendedNextStep") or "Review the active thread and send the clearest next move.",
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
    selected_calendar_id = str(next_config.get("calendarId") or "").strip()
    if not selected_calendar_id:
        next_config.pop("connectedCalendar", None)
        return next_config
    available_calendars = next_config.get("availableCalendars")
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
            next_config["connectedCalendar"] = selected.get("label") or selected_calendar_id
        else:
            next_config.pop("connectedCalendar", None)
    return next_config


def disconnected_provider_config(provider: str | None, config: dict[str, Any] | None = None) -> dict[str, Any]:
    next_config = dict(config or {})
    for key in ["refreshToken", "accessToken", "lastError", "connectedIdentity", "connectedCalendar", "availableCalendars"]:
        next_config.pop(key, None)
    if provider in {"microsoft365-calendar", "google-calendar-oauth", "google-meet-oauth"}:
        next_config.pop("userId", None)
        next_config.pop("calendarId", None)
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
    def delete_contact(self, contact_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def bulk_delete_contacts(self, contact_ids: list[str]) -> dict[str, Any]:
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
    def bulk_delete_forms(self, form_ids: list[str]) -> dict[str, Any]:
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
    def delete_flow(self, flow_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def bulk_delete_flows(self, flow_ids: list[str]) -> dict[str, Any]:
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
        sender_email: str = "mail@aiocrm.org",
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
        latest_test = next((event for event in events if event["eventType"] == "mailbox.tested"), None)
        latest_failure = next((event for event in events if event["eventType"] == "mail.failed"), None)
        synced_at = parse_utc(mailbox.get("lastSyncedAt"))
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
        elif not mailbox.get("inboundEnabled") and not mailbox.get("outboundEnabled"):
            state = "limited"
            label = "Paused"
            detail = "Inbound and outbound are disabled."
        elif not mailbox.get("inboundEnabled") or not mailbox.get("outboundEnabled"):
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
            "lastEventAt": latest_event.get("createdAt") if latest_event else None,
            "lastTestedAt": latest_test.get("createdAt") if latest_test else None,
        }

    @staticmethod
    def _has_config_value(config: dict[str, Any] | None, key: str) -> bool:
        return bool(str((config or {}).get(key) or "").strip())

    @staticmethod
    def _last_error_text(record: dict[str, Any]) -> str:
        config = record.get("config") or {}
        return str(config.get("lastError") or record.get("lastError") or "").strip()

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
        if provider in MAIL_OAUTH_PROVIDERS and not self._has_config_value(config, "refreshToken"):
            return "reconnect_required"
        if self._is_auth_failure_error(self._last_error_text(mailbox)):
            return "unauthorized"

        validation = get_mail_adapter(provider).validate_mailbox(
            {
                "provider": provider,
                "config": config,
                "address": mailbox.get("address"),
                "inboundEnabled": mailbox.get("inboundEnabled", True),
                "outboundEnabled": mailbox.get("outboundEnabled", True),
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
        if provider in CALENDAR_OAUTH_PROVIDERS and not self._has_config_value(config, "refreshToken"):
            return "reconnect_required"
        if self._is_auth_failure_error(self._last_error_text(source)):
            return "unauthorized"

        validation = get_calendar_adapter(provider).validate_source(
            {
                "provider": provider,
                "config": config,
                "name": source.get("name"),
                "syncDirection": source.get("syncDirection"),
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
            threads_by_mailbox.setdefault(thread["mailboxId"], []).append(thread)
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
                "threadCount": len(mailbox_threads),
                "activeCount": sum(1 for thread in mailbox_threads if thread.get("status") != "closed"),
                "newCount": sum(1 for thread in mailbox_threads if thread.get("status") == "new"),
                "actionRequiredCount": queue_counts.get("now", 0),
                "needsReplyCount": queue_counts.get("needs-reply", 0),
                "waitingCount": queue_counts.get("waiting", 0),
                "hotLeadCount": queue_counts.get("hot-leads", 0),
                "atRiskCount": queue_counts.get("at-risk", 0),
                "scheduledCount": queue_counts.get("scheduled", 0),
                "automatedCount": queue_counts.get("automated", 0),
                "closedCount": queue_counts.get("closed", 0),
            }
            latest_thread = max(mailbox_threads, key=lambda item: item.get("lastActivityAt") or "", default=None)
            summaries.append(
                self._annotate_mailbox_status_canonical(
                    self.mail_adapter.describe_mailbox(
                        {
                            **effective_mailbox,
                            "stats": stats,
                            "queueCounts": queue_counts,
                            "health": self._mailbox_health_summary(effective_mailbox, events_by_mailbox.get(mailbox["id"], [])),
                            "latestThreadAt": latest_thread.get("lastActivityAt") if latest_thread else None,
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
            source_events = [event for event in events if (event.get("sourceId") or "calendar-source-local") == source["id"]]
            synced_count = sum(1 for event in source_events if event.get("syncStatus") in {"synced", "local"})
            imported_count = sum(1 for event in source_events if event.get("syncStatus") == "imported")
            conflict_count = sum(1 for event in source_events if event.get("conflictState") == "review")
            authority_mode = source_config_value(source, "authorityMode", "local-first")
            import_policy = source_config_value(source, "importPolicy", "review")
            summaries.append(
                self._annotate_calendar_source_status_canonical(
                    {
                        **get_calendar_adapter(source.get("provider")).describe_source(source),
                        **({"provider": "not-connected"} if source.get("provider") == "local-stub" else {}),
                        "authorityMode": authority_mode,
                        "importPolicy": import_policy,
                        "eventCounts": {
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
        authority_mode = source_config_value(source, "authorityMode", "local-first")
        import_policy = source_config_value(source, "importPolicy", "review")
        has_overlap = any(
            candidate.get("id") != event_id
            and candidate.get("status") not in {"cancelled", "completed"}
            and events_overlap(
                imported_event.get("startTime"),
                imported_event.get("endTime"),
                candidate.get("startTime"),
                candidate.get("endTime"),
            )
            for candidate in existing_events
        )
        if authority_mode == "mirror":
            return {
                "authorityMode": authority_mode,
                "conflictState": "mirrored",
                "syncStatus": "imported",
                "syncNote": "Imported as a mirrored external hold; local schedule stays authoritative.",
            }
        if has_overlap or import_policy == "review":
            return {
                "authorityMode": authority_mode,
                "conflictState": "review",
                "syncStatus": "conflict",
                "syncNote": "Imported event needs review before it can influence the local schedule.",
            }
        return {
            "authorityMode": authority_mode,
            "conflictState": "clear",
            "syncStatus": "imported",
            "syncNote": "Imported event is staged locally with no active conflicts.",
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
        self.tags = []
        self.companies = []
        self.contacts = []
        self.forms = [
            {
                "id": "form-contact",
                "name": "Contact Form",
                "folder_id": "form-folder-default",
                "slug": "contact-form",
                "description": "Get in touch with us for any questions or inquiries",
                "schema": [
                    {"id": "f1", "name": "fullName", "label": "Full Name", "type": "text", "required": True, "placeholder": "John Doe", "mapToContact": "firstName", "isIdentifier": False},
                    {"id": "f2", "name": "email", "label": "Email Address", "type": "email", "required": True, "placeholder": "john@example.com", "mapToContact": "email", "isIdentifier": True},
                    {"id": "f3", "name": "phone", "label": "Phone Number", "type": "tel", "required": False, "placeholder": "+1 (555) 000-0000", "mapToContact": "phone", "isIdentifier": False},
                    {"id": "f4", "name": "message", "label": "Message", "type": "textarea", "required": True, "placeholder": "How can we help you?", "mapToContact": None, "isIdentifier": False},
                ],
                "settings": {
                    "createContact": True,
                    "updateContact": True,
                    "webhookUrl": "",
                    "notificationEmail": "contact@aioagency.com",
                    "redirectUrl": "",
                    "thankYouMessage": "Thank you for contacting us! We'll get back to you within 24 hours.",
                },
                "is_active": True,
                "responses_count": 0,
                "last_response_at": None,
                "createdAt": now,
                "updatedAt": now,
            }
        ]
        self.brain_profile = {
            "id": "brain-profile-primary",
            "tenantId": DEFAULT_TENANT_ID,
            "company_name": "AIO CRM Workspace",
            "website": "https://aiocrm.local",
            "industry": "AI operations",
            "overview": "Central memory layer for company context, operating procedures, and AI-ready knowledge.",
            "mission": "Turn daily operations into a reusable intelligence system.",
            "brand_voice": "Direct, pragmatic, and operator-friendly.",
            "ideal_customer": "Owner-operators and lean teams using AI to run service businesses.",
            "createdAt": now,
            "updatedAt": now,
        }
        self.brain_sources = [
            {
                "id": "brain-source-profile",
                "tenantId": DEFAULT_TENANT_ID,
                "label": "Company Profile Intake",
                "source_type": "profile",
                "status": "ready",
                "location": "Internal workspace memory",
                "notes": "Core business identity and positioning.",
                "graph_x": 28.0,
                "graph_y": 24.0,
                "createdAt": now,
                "updatedAt": now,
            },
            {
                "id": "brain-source-ops",
                "tenantId": DEFAULT_TENANT_ID,
                "label": "Ops Playbook",
                "source_type": "document",
                "status": "draft",
                "location": "Upload or author internally",
                "notes": "Planned SOP source for agents and flows.",
                "graph_x": 24.0,
                "graph_y": 58.0,
                "createdAt": now,
                "updatedAt": now,
            },
        ]
        self.brain_items = [
            {
                "id": "brain-item-positioning",
                "tenantId": DEFAULT_TENANT_ID,
                "title": "Core positioning",
                "category": "strategy",
                "content": "AIO CRM is the local-first operator console where CRM, Comms, workflows, and AI agents share one memory layer.",
                "source_id": "brain-source-profile",
                "status": "active",
                "tags": ["positioning", "ai", "local-first"],
                "graph_x": 72.0,
                "graph_y": 26.0,
                "createdAt": now,
                "updatedAt": now,
            },
            {
                "id": "brain-item-agent-rule",
                "tenantId": DEFAULT_TENANT_ID,
                "title": "Agent guidance",
                "category": "operations",
                "content": "Named agents should pull from workspace memory before drafting, summarizing, or recommending next steps.",
                "source_id": "brain-source-ops",
                "status": "draft",
                "tags": ["agents", "memory", "rules"],
                "graph_x": 76.0,
                "graph_y": 58.0,
                "createdAt": now,
                "updatedAt": now,
            },
        ]
        self.brain_links = [
            {
                "id": "brain-link-positioning-agents",
                "tenantId": DEFAULT_TENANT_ID,
                "from_type": "item",
                "from_id": "brain-item-positioning",
                "to_type": "item",
                "to_id": "brain-item-agent-rule",
                "relationship_type": "supports",
                "createdAt": now,
                "updatedAt": now,
            },
        ]
        self.brain_ingests: list[dict[str, Any]] = []
        self.brain_chunks: list[dict[str, Any]] = []
        self.form_folders = [
            {"id": "form-folder-default", "name": "My Forms", "userId": "1", "createdAt": now, "expanded": True}
        ]
        self.form_submissions: list[dict[str, Any]] = []
        self.contact_activities: list[dict[str, Any]] = []
        self.flows: dict[str, dict[str, Any]] = {}
        self.flow_drafts: dict[str, dict[str, Any]] = {}
        self.mailboxes = [
            {
                "id": "mailbox-default-smtp",
                "name": "AIO CRM Mail",
                "address": "mail@aiocrm.org",
                "provider": "smtp-imap",
                "status": "ready",
                "inbound_enabled": True,
                "outbound_enabled": True,
                "last_synced_at": None,
                "config": {
                    "email": "mail@aiocrm.org",
                    "username": "mail@aiocrm.org",
                    "password": "#Test123!",
                    "incoming_host": "aiocrm.org",
                    "incoming_port": 993,
                    "outgoing_host": "aiocrm.org",
                    "outgoing_port": 465,
                },
            },
        ]
        self.mail_events: list[dict[str, Any]] = []
        self.calendar_sources = [
            {"id": "calendar-source-local", "name": "Local Command Calendar", "provider": "local-stub", "status": "connected", "sync_direction": "two-way", "config": {"adapter": "local-stub", "authority_mode": "local-first", "import_policy": "review"}, "last_synced_at": now},
            {"id": "calendar-source-google", "name": "Google Calendar", "provider": "google-calendar-oauth", "status": "needs_config", "sync_direction": "two-way", "config": {"authority_mode": "local-first", "import_policy": "review"}, "last_synced_at": None},
        ]
        self.calendars = [
            {"id": "calendar-primary", "userId": "1", "name": "AIO Calendar", "color": "#3b82f6", "is_default": True, "is_visible": True},
            {"id": "calendar-booking", "userId": "1", "name": "AIO Booking", "color": "#10b981", "is_default": False, "is_visible": True},
        ]
        self.booking_types = [
            {"id": "booking-type-demo", "userId": "1", "name": "Discovery Call", "slug": "discovery-call", "duration_minutes": 30, "location": "Google Meet", "description": "Introductory discovery meeting.", "color": "#10b981", "is_active": True},
        ]
        self.calendar_events = []
        self.threads = []
        self.messages = []
        self.thread_ai_briefs = {}
        self.thread_actions = {}
        self.thread_artifacts = {}
        self.thread_links = {}

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
    def delete_contact(self, contact_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def bulk_delete_contacts(self, contact_ids: list[str]) -> dict[str, Any]:
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
    def bulk_delete_forms(self, form_ids: list[str]) -> dict[str, Any]:
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
    def delete_flow(self, flow_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def bulk_delete_flows(self, flow_ids: list[str]) -> dict[str, Any]:
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
        sender_email: str = "mail@aiocrm.org",
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
        latest_test = next((event for event in events if event["eventType"] == "mailbox.tested"), None)
        latest_failure = next((event for event in events if event["eventType"] == "mail.failed"), None)
        synced_at = parse_utc(mailbox.get("lastSyncedAt"))
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
        elif not mailbox.get("inboundEnabled") and not mailbox.get("outboundEnabled"):
            state = "limited"
            label = "Paused"
            detail = "Inbound and outbound are disabled."
        elif not mailbox.get("inboundEnabled") or not mailbox.get("outboundEnabled"):
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
            "lastEventAt": latest_event.get("createdAt") if latest_event else None,
            "lastTestedAt": latest_test.get("createdAt") if latest_test else None,
        }

    @staticmethod
    def _has_config_value(config: dict[str, Any] | None, key: str) -> bool:
        return bool(str((config or {}).get(key) or "").strip())

    @staticmethod
    def _last_error_text(record: dict[str, Any]) -> str:
        config = record.get("config") or {}
        return str(config.get("lastError") or record.get("lastError") or "").strip()

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
        if provider in MAIL_OAUTH_PROVIDERS and not self._has_config_value(config, "refreshToken"):
            return "reconnect_required"
        if self._is_auth_failure_error(self._last_error_text(mailbox)):
            return "unauthorized"

        validation = get_mail_adapter(provider).validate_mailbox(
            {
                "provider": provider,
                "config": config,
                "address": mailbox.get("address"),
                "inboundEnabled": mailbox.get("inboundEnabled", True),
                "outboundEnabled": mailbox.get("outboundEnabled", True),
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
        if provider in CALENDAR_OAUTH_PROVIDERS and not self._has_config_value(config, "refreshToken"):
            return "reconnect_required"
        if self._is_auth_failure_error(self._last_error_text(source)):
            return "unauthorized"

        validation = get_calendar_adapter(provider).validate_source(
            {
                "provider": provider,
                "config": config,
                "name": source.get("name"),
                "syncDirection": source.get("syncDirection"),
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
            threads_by_mailbox.setdefault(thread["mailboxId"], []).append(thread)
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
                "threadCount": len(mailbox_threads),
                "activeCount": sum(1 for thread in mailbox_threads if thread.get("status") != "closed"),
                "newCount": sum(1 for thread in mailbox_threads if thread.get("status") == "new"),
                "actionRequiredCount": queue_counts.get("now", 0),
                "needsReplyCount": queue_counts.get("needs-reply", 0),
                "waitingCount": queue_counts.get("waiting", 0),
                "hotLeadCount": queue_counts.get("hot-leads", 0),
                "atRiskCount": queue_counts.get("at-risk", 0),
                "scheduledCount": queue_counts.get("scheduled", 0),
                "automatedCount": queue_counts.get("automated", 0),
                "closedCount": queue_counts.get("closed", 0),
            }
            latest_thread = max(mailbox_threads, key=lambda item: item.get("lastActivityAt") or "", default=None)
            summaries.append(
                self._annotate_mailbox_status_canonical(
                    self.mail_adapter.describe_mailbox(
                        {
                            **effective_mailbox,
                            "stats": stats,
                            "queueCounts": queue_counts,
                            "health": self._mailbox_health_summary(effective_mailbox, events_by_mailbox.get(mailbox["id"], [])),
                            "latestThreadAt": latest_thread.get("lastActivityAt") if latest_thread else None,
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
            source_events = [event for event in events if (event.get("sourceId") or "calendar-source-local") == source["id"]]
            synced_count = sum(1 for event in source_events if event.get("syncStatus") in {"synced", "local"})
            imported_count = sum(1 for event in source_events if event.get("syncStatus") == "imported")
            conflict_count = sum(1 for event in source_events if event.get("conflictState") == "review")
            authority_mode = source_config_value(source, "authorityMode", "local-first")
            import_policy = source_config_value(source, "importPolicy", "review")
            summaries.append(
                self._annotate_calendar_source_status_canonical(
                    {
                        **get_calendar_adapter(source.get("provider")).describe_source(source),
                        **({"provider": "not-connected"} if source.get("provider") == "local-stub" else {}),
                        "authorityMode": authority_mode,
                        "importPolicy": import_policy,
                        "eventCounts": {
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
        authority_mode = source_config_value(source, "authorityMode", "local-first")
        import_policy = source_config_value(source, "importPolicy", "review")
        has_overlap = any(
            candidate.get("id") != event_id
            and candidate.get("status") not in {"cancelled", "completed"}
            and events_overlap(
                imported_event.get("startTime"),
                imported_event.get("endTime"),
                candidate.get("startTime"),
                candidate.get("endTime"),
            )
            for candidate in existing_events
        )
        if authority_mode == "mirror":
            return {
                "authorityMode": authority_mode,
                "conflictState": "mirrored",
                "syncStatus": "imported",
                "syncNote": "Imported as a mirrored external hold; local schedule stays authoritative.",
            }
        if has_overlap or import_policy == "review":
            return {
                "authorityMode": authority_mode,
                "conflictState": "review",
                "syncStatus": "conflict",
                "syncNote": "Imported event needs review before it can influence the local schedule.",
            }
        return {
            "authorityMode": authority_mode,
            "conflictState": "clear",
            "syncStatus": "imported",
            "syncNote": "Imported event is staged locally with no active conflicts.",
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
        self.tags = []
        self.companies = []
        self.contacts = []
        self.forms = [
            {
                "id": "form-contact",
                "name": "Contact Form",
                "folder_id": "form-folder-default",
                "slug": "contact-form",
                "description": "Get in touch with us for any questions or inquiries",
                "schema": [
                    {"id": "f1", "name": "fullName", "label": "Full Name", "type": "text", "required": True, "placeholder": "John Doe", "mapToContact": "firstName", "isIdentifier": False},
                    {"id": "f2", "name": "email", "label": "Email Address", "type": "email", "required": True, "placeholder": "john@example.com", "mapToContact": "email", "isIdentifier": True},
                    {"id": "f3", "name": "phone", "label": "Phone Number", "type": "tel", "required": False, "placeholder": "+1 (555) 000-0000", "mapToContact": "phone", "isIdentifier": False},
                    {"id": "f4", "name": "message", "label": "Message", "type": "textarea", "required": True, "placeholder": "How can we help you?", "mapToContact": None, "isIdentifier": False},
                ],
                "settings": {
                    "createContact": True,
                    "updateContact": True,
                    "webhookUrl": "",
                    "notificationEmail": "contact@aioagency.com",
                    "redirectUrl": "",
                    "thankYouMessage": "Thank you for contacting us! We'll get back to you within 24 hours.",
                },
                "is_active": True,
                "responses_count": 0,
                "last_response_at": None,
                "createdAt": now,
                "updatedAt": now,
            }
        ]
        self.brain_profile = {
            "id": "brain-profile-primary",
            "tenantId": DEFAULT_TENANT_ID,
            "company_name": "AIO CRM Workspace",
            "website": "https://aiocrm.local",
            "industry": "AI operations",
            "overview": "Central memory layer for company context, operating procedures, and AI-ready knowledge.",
            "mission": "Turn daily operations into a reusable intelligence system.",
            "brand_voice": "Direct, pragmatic, and operator-friendly.",
            "ideal_customer": "Owner-operators and lean teams using AI to run service businesses.",
            "createdAt": now,
            "updatedAt": now,
        }
        self.brain_sources = [
            {
                "id": "brain-source-profile",
                "tenantId": DEFAULT_TENANT_ID,
                "label": "Company Profile Intake",
                "source_type": "profile",
                "status": "ready",
                "location": "Internal workspace memory",
                "notes": "Core business identity and positioning.",
                "graph_x": 28.0,
                "graph_y": 24.0,
                "createdAt": now,
                "updatedAt": now,
            },
            {
                "id": "brain-source-ops",
                "tenantId": DEFAULT_TENANT_ID,
                "label": "Ops Playbook",
                "source_type": "document",
                "status": "draft",
                "location": "Upload or author internally",
                "notes": "Planned SOP source for agents and flows.",
                "graph_x": 24.0,
                "graph_y": 58.0,
                "createdAt": now,
                "updatedAt": now,
            },
        ]
        self.brain_items = [
            {
                "id": "brain-item-positioning",
                "tenantId": DEFAULT_TENANT_ID,
                "title": "Core positioning",
                "category": "strategy",
                "content": "AIO CRM is the local-first operator console where CRM, Comms, workflows, and AI agents share one memory layer.",
                "source_id": "brain-source-profile",
                "status": "active",
                "tags": ["positioning", "ai", "local-first"],
                "graph_x": 72.0,
                "graph_y": 26.0,
                "createdAt": now,
                "updatedAt": now,
            },
            {
                "id": "brain-item-agent-rule",
                "tenantId": DEFAULT_TENANT_ID,
                "title": "Agent guidance",
                "category": "operations",
                "content": "Named agents should pull from workspace memory before drafting, summarizing, or recommending next steps.",
                "source_id": "brain-source-ops",
                "status": "draft",
                "tags": ["agents", "memory", "rules"],
                "graph_x": 76.0,
                "graph_y": 58.0,
                "createdAt": now,
                "updatedAt": now,
            },
        ]
        self.brain_links = [
            {
                "id": "brain-link-positioning-agents",
                "tenantId": DEFAULT_TENANT_ID,
                "from_type": "item",
                "from_id": "brain-item-positioning",
                "to_type": "item",
                "to_id": "brain-item-agent-rule",
                "relationship_type": "supports",
                "createdAt": now,
                "updatedAt": now,
            },
        ]
        self.brain_ingests: list[dict[str, Any]] = []
        self.brain_chunks: list[dict[str, Any]] = []
        self.form_folders = [
            {"id": "form-folder-default", "name": "My Forms", "userId": "1", "createdAt": now, "expanded": True}
        ]
        self.form_submissions: list[dict[str, Any]] = []
        self.contact_activities: list[dict[str, Any]] = []
        self.flows: dict[str, dict[str, Any]] = {}
        self.flow_drafts: dict[str, dict[str, Any]] = {}
        self.mailboxes = [
            {
                "id": "mailbox-default-smtp",
                "name": "AIO CRM Mail",
                "address": "mail@aiocrm.org",
                "provider": "smtp-imap",
                "status": "ready",
                "inbound_enabled": True,
                "outbound_enabled": True,
                "last_synced_at": None,
                "config": {
                    "email": "mail@aiocrm.org",
                    "username": "mail@aiocrm.org",
                    "password": "#Test123!",
                    "incoming_host": "aiocrm.org",
                    "incoming_port": 993,
                    "outgoing_host": "aiocrm.org",
                    "outgoing_port": 465,
                },
            },
        ]
        self.mail_events: list[dict[str, Any]] = []
        self.calendar_sources = [
            {"id": "calendar-source-local", "name": "Local Command Calendar", "provider": "local-stub", "status": "connected", "sync_direction": "two-way", "config": {"adapter": "local-stub", "authority_mode": "local-first", "import_policy": "review"}, "last_synced_at": now},
            {"id": "calendar-source-google", "name": "Google Calendar", "provider": "google-calendar-oauth", "status": "needs_config", "sync_direction": "two-way", "config": {"authority_mode": "local-first", "import_policy": "review"}, "last_synced_at": None},
        ]
        self.calendars = [
            {"id": "calendar-primary", "userId": "1", "name": "AIO Calendar", "color": "#3b82f6", "is_default": True, "is_visible": True},
            {"id": "calendar-booking", "userId": "1", "name": "AIO Booking", "color": "#10b981", "is_default": False, "is_visible": True},
        ]
        self.booking_types = [
            {"id": "booking-type-demo", "userId": "1", "name": "Discovery Call", "slug": "discovery-call", "duration_minutes": 30, "location": "Google Meet", "description": "Introductory discovery meeting.", "color": "#10b981", "is_active": True},
        ]
        self.calendar_events = []
        self.threads = []
        self.messages = []
        self.thread_ai_briefs = {}
        self.thread_actions = {}
        self.thread_artifacts = {}
        self.thread_links = {}

    def health(self) -> dict[str, Any]:
        return {"provider": self.provider_name, "status": "ready"}

    def list_contacts(self) -> list[dict[str, Any]]:
        return [contact for contact in self.contacts if not contact.get("deletedAt")]

    def create_contact(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        contact = {
            "id": payload.get("id") or f"contact-{unique_suffix()}",
            "contactId": payload.get("contactId") or f"CNT-{unique_suffix().upper()}",
            "organizationId": payload.get("organizationId") or "org-1",
            "firstName": payload.get("firstName"),
            "lastName": payload.get("lastName"),
            "email": payload.get("email"),
            "phone": payload.get("phone"),
            "company": payload.get("company"),
            "companyId": payload.get("companyId"),
            "title": payload.get("title"),
            "department": payload.get("department"),
            "owner": payload.get("owner") or "AIO Flow",
            "source": payload.get("source") or "Manual Entry",
            "status": payload.get("status") or "contact",
            "leadScore": payload.get("leadScore") or 50,
            "quality": payload.get("quality") or "warm",
            "engagement": payload.get("engagement") or "medium",
            "tags": payload.get("tags") or [],
            "lastContactedAt": payload.get("lastContactedAt"),
            "pipelineStage": payload.get("pipelineStage") or "New",
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
            "deletedAt": payload.get("deletedAt"),
            "website": payload.get("website"),
            "dob": payload.get("dob"),
            "ownerId": payload.get("ownerId"),
            "address": payload.get("address") or {},
            "customFields": payload.get("customFields") or {},
            "optInEmail": payload.get("optInEmail", True),
            "optInSms": payload.get("optInSms", True),
            "optInCalls": payload.get("optInCalls", True),
            "optInFlows": payload.get("optInFlows", True),
            "aiEmployee": payload.get("aiEmployee"),
        }
        self.contacts.append(contact)
        return contact

    def update_contact(self, contact_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        if not contact:
            raise ValueError("Contact not found")
        for key, value in updates.items():
            if key in {"id", "contactId"}:
                continue
            contact[key] = value
        contact["updatedAt"] = utcnow()
        return contact

    def delete_contact(self, contact_id: str) -> None:
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        if not contact:
            raise ValueError("Contact not found")
        contact["deletedAt"] = utcnow()

    def bulk_delete_contacts(self, contact_ids: list[str]) -> dict[str, Any]:
        deleted = 0
        for contact_id in contact_ids:
            contact = next((item for item in self.contacts if item["id"] == contact_id), None)
            if contact:
                contact["deletedAt"] = utcnow()
                deleted += 1
        return {"deleted": deleted, "requested": len(contact_ids)}

    def list_companies(self) -> list[dict[str, Any]]:
        return self.companies

    def list_tags(self) -> list[dict[str, Any]]:
        return self.tags

    def get_brain_profile(self) -> dict[str, Any]:
        return dict(self.brain_profile)

    def update_brain_profile(self, updates: dict[str, Any]) -> dict[str, Any]:
        for key in ["companyName", "website", "industry", "overview", "mission", "brandVoice", "idealCustomer"]:
            if key in updates and updates[key] is not None:
                self.brain_profile[key] = updates[key]
        self.brain_profile["updatedAt"] = utcnow()
        return dict(self.brain_profile)

    def list_brain_sources(self) -> list[dict[str, Any]]:
        return sorted((dict(item) for item in self.brain_sources), key=lambda item: (item.get("label") or "").lower())

    def create_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        source = {
            "id": payload.get("id") or f"brain-source-{unique_suffix()}",
            "tenantId": DEFAULT_TENANT_ID,
            "label": payload.get("label") or "New Source",
            "sourceType": payload.get("sourceType") or "document",
            "status": payload.get("status") or "draft",
            "location": payload.get("location") or "",
            "notes": payload.get("notes") or "",
            "metadata": clone_json(payload.get("metadata") or {}),
            "graphX": payload.get("graphX"),
            "graphY": payload.get("graphY"),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        self.brain_sources.append(source)
        return dict(source)

    def update_brain_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        source = next((item for item in self.brain_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Brain source not found")
        for key in ["label", "sourceType", "status", "location", "notes", "graphX", "graphY"]:
            if key in updates and updates[key] is not None:
                source[key] = updates[key]
        if "metadata" in updates and updates["metadata"] is not None:
            source["metadata"] = clone_json(updates.get("metadata") or {})
        source["updatedAt"] = utcnow()
        return dict(source)

    def delete_brain_source(self, source_id: str) -> None:
        self.brain_sources = [item for item in self.brain_sources if item["id"] != source_id]
        for item in self.brain_items:
            if item.get("sourceId") == source_id:
                item["sourceId"] = None
                item["updatedAt"] = utcnow()
        self.brain_links = [
            link
            for link in self.brain_links
            if not (
                (link["fromType"] == "source" and link["fromId"] == source_id)
                or (link["toType"] == "source" and link["toId"] == source_id)
            )
        ]
        self.brain_ingests = [ingest for ingest in self.brain_ingests if ingest.get("sourceId") != source_id]
        self.brain_chunks = [chunk for chunk in self.brain_chunks if chunk.get("sourceId") != source_id]

    def list_brain_items(self) -> list[dict[str, Any]]:
        return sorted((dict(item) for item in self.brain_items), key=lambda item: item.get("updatedAt") or "", reverse=True)

    def create_brain_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        item = {
            "id": payload.get("id") or f"brain-item-{unique_suffix()}",
            "tenantId": DEFAULT_TENANT_ID,
            "title": payload.get("title") or "New Knowledge Item",
            "category": payload.get("category") or "note",
            "content": payload.get("content") or "",
            "sourceId": payload.get("sourceId"),
            "status": payload.get("status") or "draft",
            "tags": payload.get("tags") or [],
            "metadata": clone_json(payload.get("metadata") or {}),
            "graphX": payload.get("graphX"),
            "graphY": payload.get("graphY"),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        self.brain_items.append(item)
        return dict(item)

    def update_brain_item(self, item_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        item = next((entry for entry in self.brain_items if entry["id"] == item_id), None)
        if not item:
            raise ValueError("Brain item not found")
        for key in ["title", "category", "content", "sourceId", "status", "tags", "graphX", "graphY"]:
            if key in updates and updates[key] is not None:
                item[key] = updates[key]
        if "metadata" in updates and updates["metadata"] is not None:
            item["metadata"] = clone_json(updates.get("metadata") or {})
        item["updatedAt"] = utcnow()
        return dict(item)

    def delete_brain_item(self, item_id: str) -> None:
        self.brain_items = [entry for entry in self.brain_items if entry["id"] != item_id]
        self.brain_links = [
            link
            for link in self.brain_links
            if not (
                (link["fromType"] == "item" and link["fromId"] == item_id)
                or (link["toType"] == "item" and link["toId"] == item_id)
            )
        ]

    def list_brain_links(self) -> list[dict[str, Any]]:
        return sorted((dict(link) for link in self.brain_links), key=lambda item: item.get("updatedAt") or "", reverse=True)

    def create_brain_link(self, payload: dict[str, Any]) -> dict[str, Any]:
        fromType = payload.get("fromType") or "item"
        toType = payload.get("toType") or "item"
        fromId = payload.get("fromId")
        toId = payload.get("toId")
        if not fromId or not toId:
            raise ValueError("Brain link endpoints are required")
        if fromType == toType and fromId == toId:
            raise ValueError("Brain links cannot point to the same node")
        existing = next(
            (
                link for link in self.brain_links
                if link["fromType"] == fromType
                and link["fromId"] == fromId
                and link["toType"] == toType
                and link["toId"] == toId
            ),
            None,
        )
        if existing:
            return dict(existing)
        now = utcnow()
        link = {
            "id": payload.get("id") or f"brain-link-{unique_suffix()}",
            "tenantId": DEFAULT_TENANT_ID,
            "fromType": fromType,
            "fromId": fromId,
            "toType": toType,
            "toId": toId,
            "relationshipType": payload.get("relationshipType") or "supports",
            "createdAt": now,
            "updatedAt": now,
        }
        self.brain_links.append(link)
        return dict(link)

    def delete_brain_link(self, link_id: str) -> None:
        self.brain_links = [link for link in self.brain_links if link["id"] != link_id]

    def list_brain_ingests(self, source_id: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        rows = [
            dict(ingest)
            for ingest in self.brain_ingests
            if not source_id or ingest.get("sourceId") == source_id
        ]
        rows.sort(key=lambda item: item.get("createdAt") or "", reverse=True)
        return rows[: max(1, limit)]

    def ingest_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        content = normalize_text_content(payload.get("content"))
        if not content:
            raise ValueError("No extracted text was available to ingest.")
        sourceId = payload.get("sourceId")
        now = utcnow()
        source = next((item for item in self.brain_sources if item["id"] == sourceId), None) if sourceId else None
        if source:
            for key in ["label", "sourceType", "location", "notes"]:
                if key in payload and payload.get(key) is not None:
                    source[key] = payload.get(key)
            if "metadata" in payload and payload.get("metadata") is not None:
                source["metadata"] = clone_json(payload.get("metadata") or {})
            source["status"] = payload.get("status") or "ready"
            source["updatedAt"] = now
        else:
            source = self.create_brain_source(
                {
                    "label": payload.get("label") or payload.get("title") or "Ingested Source",
                    "sourceType": payload.get("sourceType") or "document",
                    "status": payload.get("status") or "ready",
                    "location": payload.get("location") or "",
                    "notes": payload.get("notes") or "",
                    "metadata": payload.get("metadata") or {},
                }
            )
            sourceId = source["id"]
        chunks = chunk_text_content(content)
        if not chunks:
            raise ValueError("Unable to create Brain chunks from this ingest.")
        ingest = {
            "id": payload.get("id") or f"brain-ingest-{unique_suffix()}",
            "tenantId": DEFAULT_TENANT_ID,
            "sourceId": sourceId,
            "ingestType": payload.get("ingestType") or "text",
            "title": payload.get("title") or payload.get("label") or source.get("label") or "Brain ingest",
            "location": payload.get("location") or source.get("location") or "",
            "contentExcerpt": summarize_excerpt(content),
            "contentLength": len(content),
            "chunkCount": len(chunks),
            "status": "ready",
            "error": "",
            "createdAt": now,
            "updatedAt": now,
        }
        self.brain_ingests.append(ingest)
        self.brain_chunks = [chunk for chunk in self.brain_chunks if chunk.get("sourceId") != sourceId]
        self.brain_chunks.extend(
            [
                {
                    "id": f"brain-chunk-{unique_suffix()}",
                    "tenantId": DEFAULT_TENANT_ID,
                    "sourceId": sourceId,
                    "ingestId": ingest["id"],
                    "ordinal": index,
                    "title": ingest["title"],
                    "content": chunk,
                    "contentExcerpt": summarize_excerpt(chunk),
                    "createdAt": now,
                    "updatedAt": now,
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
                source = source_lookup.get(chunk.get("sourceId"))
                candidates.append(
                    {
                        "id": chunk["id"],
                        "kind": "chunk",
                        "title": chunk.get("title") or (source or {}).get("label") or "Brain source",
                        "excerpt": chunk.get("contentExcerpt") or summarize_excerpt(chunk.get("content")),
                        "sourceId": chunk.get("sourceId"),
                        "sourceLabel": (source or {}).get("label") or "",
                        "score": score + 2,
                        "matchedTerms": matched,
                    }
                )
        for item in self.brain_items:
            score, matched = score_text_match(resolved_query, [item.get("title"), item.get("content"), " ".join(item.get("tags") or [])])
            if score:
                source = source_lookup.get(item.get("sourceId"))
                candidates.append(
                    {
                        "id": item["id"],
                        "kind": "item",
                        "title": item.get("title") or "Knowledge item",
                        "excerpt": summarize_excerpt(item.get("content")),
                        "sourceId": item.get("sourceId"),
                        "sourceLabel": (source or {}).get("label") or "",
                        "score": score + 3,
                        "matchedTerms": matched,
                    }
                )
        profile = self.brain_profile
        profile_score, profile_terms = score_text_match(
            resolved_query,
            [
                profile.get("companyName"),
                profile.get("overview"),
                profile.get("mission"),
                profile.get("brandVoice"),
                profile.get("idealCustomer"),
            ],
        )
        if profile_score:
            candidates.append(
                {
                    "id": profile["id"],
                    "kind": "profile",
                    "title": profile.get("companyName") or "Workspace profile",
                    "excerpt": summarize_excerpt(profile.get("overview") or profile.get("mission")),
                    "sourceId": "profile",
                    "sourceLabel": "Workspace profile",
                    "score": profile_score + 1,
                    "matchedTerms": profile_terms,
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
            "userId": payload.get("userId") or "1",
            "createdAt": payload.get("createdAt") or utcnow(),
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
            "folderId": payload.get("folderId"),
            "slug": payload.get("slug") or f"form-{unique_suffix()}",
            "description": payload.get("description") or "",
            "schema": payload.get("schema") or [],
            "settings": payload.get("settings") or {"createContact": True, "updateContact": True, "webhookUrl": "", "notificationEmail": "", "redirectUrl": "", "thankYouMessage": "Thank you."},
            "status": payload.get("status") or "Draft",
            "isActive": bool(payload.get("isActive", False)),
            "responsesCount": payload.get("responsesCount", 0),
            "lastActive": payload.get("lastActive") or "Just now",
            "lastModifiedBy": payload.get("lastModifiedBy") or "AIO Flow",
            "lastModifiedAt": payload.get("lastModifiedAt") or now,
            "creator": payload.get("creator") or "AIO Flow",
            "triggers": payload.get("triggers"),
            "automation": payload.get("automation"),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
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
        form["updatedAt"] = utcnow()
        form["lastModifiedAt"] = form["updatedAt"]
        return form

    def delete_form(self, form_id: str) -> None:
        self.forms = [form for form in self.forms if form["id"] != form_id]

    def bulk_delete_forms(self, form_ids: list[str]) -> dict[str, Any]:
        deleted = 0
        for form_id in form_ids:
            before = len(self.forms)
            self.forms = [form for form in self.forms if form["id"] != form_id]
            deleted += before - len(self.forms)
        return {"deleted": deleted, "requested": len(form_ids)}

    def list_cms_tables(self) -> list[dict[str, Any]]:
        return [
            {
                "id": f"cms-{form['id']}",
                "name": form["name"],
                "slug": form["slug"],
                "description": form.get("description") or "",
                "recordCount": sum(1 for submission in self.form_submissions if submission.get("formId") == form["id"]),
            }
            for form in self.forms
        ]

    def list_cms_table_data(self, slug: str) -> list[dict[str, Any]]:
        form = self.get_form_by_slug(slug)
        if not form:
            return []
        rows = []
        for submission in self.form_submissions:
            if submission.get("formId") != form["id"]:
                continue
            row = {
                "submissionId": submission["id"],
                "contactId": submission.get("contactId"),
                "createdContact": submission.get("createdContact"),
                "submittedAt": submission.get("submittedAt"),
            }
            submissionData = submission.get("submissionData") or submission.get("submissionJson") or {}
            row.update(submissionData)
            rows.append(row)
        return sorted(rows, key=lambda row: row.get("submittedAt") or "", reverse=True)

    def list_orders(self) -> list[dict[str, Any]]:
        return []

    def submit_form(self, form_id: str, form_data: dict[str, Any]) -> dict[str, Any]:
        form = self.get_form_by_id(form_id)
        if not form:
            raise ValueError("Form not found")

        identifier_field = next((field for field in form["schema"] if field.get("isIdentifier")), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("mapToContact") == "email"), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("type") == "email"), None)

        identifier_key = (identifier_field or {}).get("mapToContact") or "email"
        identifier_value = form_data.get(field_key(identifier_field)) if identifier_field else None
        contact = next((item for item in self.contacts if item.get(identifier_key) == identifier_value), None)

        if contact is None and form["settings"].get("createContact"):
            contact = {
                "id": f"contact-{len(self.contacts) + 1}",
                "contactId": f"CNT-{len(self.contacts) + 1:03d}",
                "organizationId": "org-1",
                "source": f"Form: {form['name']}",
                "status": "lead",
                "leadScore": 50,
                "quality": "warm",
                "engagement": "medium",
                "tags": ["Form Submission"],
                "createdAt": utcnow(),
                "updatedAt": utcnow(),
                "deletedAt": None,
            }
            for field in form["schema"]:
                mapped = field.get("mapToContact")
                current_value = form_data.get(field_key(field))
                if mapped and current_value:
                    contact[mapped] = current_value
            self.contacts.append(contact)

        if contact and form["settings"].get("updateContact"):
            for field in form["schema"]:
                mapped = field.get("mapToContact")
                current_value = form_data.get(field_key(field))
                if mapped and current_value:
                    contact[mapped] = current_value
            contact["updatedAt"] = utcnow()

        submission = {
            "id": f"submission-{len(self.form_submissions) + 1}",
            "formId": form_id,
            "contactId": contact["id"] if contact else None,
            "submissionData": form_data,
            "createdContact": bool(contact),
            "submittedAt": utcnow(),
        }
        self.form_submissions.append(submission)
        form["responses_count"] += 1
        form["last_response_at"] = utcnow()
        if submission["contactId"]:
            self.open_thread_for_contact(
                submission["contactId"],
                channelType="email",
                subject=f"Form submission: {form['name']}",
                body=", ".join(f"{key}: {value}" for key, value in form_data.items()),
                forceNew=True,
            )
        return {"success": True, "contactId": submission["contactId"], "created": bool(contact), "submissionId": submission["id"]}

    def list_contact_activities(self, contact_id: str) -> list[dict[str, Any]]:
        activities: list[dict[str, Any]] = []
        activities.extend([dict(activity) for activity in self.contact_activities if activity.get("contactId") == contact_id])
        for thread in self._hydrate_threads():
            if thread["contactId"] != contact_id:
                continue
            for message in thread["messages"]:
                direction = message.get("direction")
                title = f"{thread['channelType'].upper()} {'received' if direction == 'inbound' else 'sent' if direction == 'outbound' else 'logged'}"
                activities.append(
                    {
                        "id": f"thread-activity-{message['id']}",
                        "contactId": contact_id,
                        "userId": "user-1",
                        "activityType": "email" if thread["channelType"] == "email" else "sms" if thread["channelType"] == "sms" else "note",
                        "title": title,
                        "description": message.get("plainText") or message.get("body") or "",
                        "metadata": {
                            "threadId": thread["id"],
                            "channelType": thread["channelType"],
                            "subject": thread["subject"],
                            "aiPriority": thread.get("aiPriority"),
                        },
                        "createdAt": message["createdAt"],
                    }
                )
            for action in thread.get("actions", []):
                if action.get("status") not in {None, "completed"}:
                    continue
                if action.get("actionType") not in {"create-deal", "advance-stage", "schedule-meeting", "calendar-event-updated"}:
                    continue
                activities.append(
                    {
                        "id": f"thread-action-{thread['id']}-{action.get('actionType') or slugify(action.get('label', 'action'))}",
                        "contactId": contact_id,
                        "userId": "user-1",
                        "activityType": "workflow",
                        "title": action.get("label") or "Workflow action",
                        "description": f"Comms workflow executed on thread {thread['subject']}.",
                        "metadata": {
                            "threadId": thread["id"],
                            "channelType": thread["channelType"],
                            "subject": thread["subject"],
                            "status": action.get("status"),
                        },
                        "createdAt": action.get("createdAt") or thread["updatedAt"],
                    }
                )
            for event in thread.get("calendarEvents", []):
                activities.append(
                    {
                        "id": f"calendar-activity-{event['id']}",
                        "contact_id": contact_id,
                        "userId": "user-1",
                        "activity_type": "meeting",
                        "title": event.get("title") or "Meeting scheduled",
                        "description": event.get("description") or f"Scheduled for {event.get('start_time')}.",
                        "metadata": {
                            "thread_id": thread["id"],
                            "meeting_url": event.get("meeting_url"),
                            "location": event.get("location"),
                            "status": event.get("status"),
                        },
                        "createdAt": event.get("start_time") or event.get("createdAt") or thread["updatedAt"],
                    }
                )
        return sorted(activities, key=lambda item: item["createdAt"], reverse=True)

    def create_contact_activity(self, contact_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        contact = next((item for item in self.contacts if item["id"] == contact_id), None)
        if not contact:
            raise ValueError("Contact not found.")
        now = utcnow()
        activity = {
            "id": payload.get("id") or f"contact-activity-{unique_suffix()}",
            "contactId": contact_id,
            "userId": str(payload.get("userId") or "user-1"),
            "activityType": str(payload.get("activityType") or "note"),
            "title": str(payload.get("title") or "Note"),
            "description": str(payload.get("description") or "").strip(),
            "metadata": payload.get("metadata") or {},
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        if not activity["description"]:
            raise ValueError("Activity description is required.")
        self.contact_activities.append(activity)
        contact["updatedAt"] = now
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

    def delete_flow(self, flow_id: str) -> None:
        self.flows = [f for f in self.flows if f.get("id") != flow_id]

    def bulk_delete_flows(self, flow_ids: list[str]) -> dict[str, Any]:
        deleted = 0
        for flow_id in flow_ids:
            before = len(self.flows)
            self.flows = [f for f in self.flows if f.get("id") != flow_id]
            deleted += before - len(self.flows)
        return {"deleted": deleted, "requested": len(flow_ids)}

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
            "tenantId": self._tenantId(),
            "name": name,
            "address": address,
            "provider": provider,
            "status": "connected" if provider == "local-stub" else "ready" if validation["ok"] else "needs_config",
            "inboundEnabled": inboundEnabled,
            "outboundEnabled": outboundEnabled,
            "lastSyncedAt": None,
            "config": resolved_config,
        }
        self.mailboxes.append(mailbox)
        return self._annotate_mailbox_status_canonical(self.mail_adapter.describe_mailbox(mailbox))

    def update_mailbox(self, mailbox_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        for key in ["name", "address", "provider", "status", "lastSyncedAt"]:
            if key in updates and updates[key] is not None:
                mailbox[key] = updates[key]
        for key in ["inboundEnabled", "outboundEnabled"]:
            if key in updates and updates[key] is not None:
                mailbox[key] = bool(updates[key])
        if "config" in updates and isinstance(updates["config"], dict):
            mailbox["config"] = updates["config"]
        if "status" not in updates:
            adapter = get_mail_adapter(mailbox.get("provider"))
            validation = adapter.validate_mailbox(mailbox)
            mailbox["status"] = "connected" if mailbox.get("provider") == "local-stub" else "ready" if validation["ok"] else "needs_config"
        return self._annotate_mailbox_status_canonical(get_mail_adapter(mailbox.get("provider")).describe_mailbox(mailbox))

    def delete_mailbox(self, mailbox_id: str, fallbackMailboxId: str | None = None) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        remaining_mailboxes = [item for item in self.mailboxes if item["id"] != mailbox_id]
        if not remaining_mailboxes:
            raise ValueError("Cannot delete the last mailbox")
        fallback = None
        if fallbackMailboxId:
            fallback = next((item for item in remaining_mailboxes if item["id"] == fallbackMailboxId), None)
            if not fallback:
                raise ValueError("Fallback mailbox not found")
        if not fallback:
            fallback = next((item for item in remaining_mailboxes if item.get("provider") != "local-stub"), None) or remaining_mailboxes[0]
        reassignedThreads = 0
        reassignedEvents = 0
        for thread in self.threads:
            if thread.get("mailboxId") == mailbox_id:
                thread["mailboxId"] = fallback["id"]
                thread["updatedAt"] = utcnow()
                reassignedThreads += 1
        for event in self.mail_events:
            if event.get("mailboxId") == mailbox_id:
                event["mailboxId"] = fallback["id"]
                reassignedEvents += 1
        self.mailboxes = remaining_mailboxes
        self._record_mail_event(
            fallback["id"],
            "mailbox.deleted",
            {
                "deletedMailboxId": mailbox_id,
                "deletedMailboxName": mailbox.get("name"),
                "fallbackMailboxId": fallback["id"],
                "fallbackMailboxName": fallback.get("name"),
                "reassignedThreads": reassignedThreads,
                "reassignedEvents": reassignedEvents,
            },
            source_provider=fallback.get("provider"),
        )
        return {
            "deletedMailboxId": mailbox_id,
            "deletedMailboxName": mailbox.get("name"),
            "fallbackMailboxId": fallback["id"],
            "fallbackMailboxName": fallback.get("name"),
            "reassignedThreads": reassignedThreads,
            "reassignedEvents": reassignedEvents,
        }

    def disconnect_mailbox(self, mailbox_id: str) -> dict[str, Any]:
        mailbox = next((item for item in self.mailboxes if item["id"] == mailbox_id), None)
        if not mailbox:
            raise ValueError("Mailbox not found")
        if mailbox.get("provider") == "local-stub":
            raise ValueError("Local stub mailboxes do not need disconnect.")
        mailbox["config"] = disconnected_provider_config(mailbox.get("provider"), mailbox.get("config"))
        mailbox["status"] = "needs_config"
        mailbox["lastSyncedAt"] = None
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
        return sorted(events, key=lambda item: item["createdAt"], reverse=True)

    def list_calendars(self) -> list[dict[str, Any]]:
        return self.calendars

    def list_calendar_events(self, thread_id: str | None = None) -> list[dict[str, Any]]:
        events = self.calendar_events
        if thread_id:
            events = [event for event in events if event.get("threadId") == thread_id]
        return sorted(events, key=lambda item: item.get("startTime") or item.get("createdAt") or "")

    def create_calendar_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        event = {
            "id": payload.get("id") or f"calendar-event-{unique_suffix()}",
            "calendarId": payload.get("calendarId") or self.calendars[0]["id"],
            "sourceId": payload.get("sourceId") or "calendar-source-local",
            "threadId": payload.get("threadId"),
            "contactId": payload.get("contactId"),
            "companyId": payload.get("companyId"),
            "title": payload.get("title") or "New Event",
            "description": payload.get("description") or "",
            "startTime": payload.get("startTime") or now,
            "endTime": payload.get("endTime") or now,
            "status": payload.get("status") or "scheduled",
            "locationType": payload.get("locationType") or "other",
            "location": payload.get("location") or "",
            "meetingUrl": payload.get("meetingUrl") or "",
            "syncStatus": payload.get("syncStatus") or "local",
            "externalEventRef": payload.get("externalEventRef") or "",
            "lastSyncedAt": payload.get("lastSyncedAt") or now,
            "authorityMode": payload.get("authorityMode") or "local-first",
            "conflictState": payload.get("conflictState") or "clear",
            "syncNote": payload.get("syncNote") or "Created locally.",
            "importedAt": payload.get("importedAt"),
            "sourcePayload": payload.get("sourcePayload") or {},
            "source": payload.get("source") or "calendar-local",
            "guestName": payload.get("guestName"),
            "guestEmail": payload.get("guestEmail"),
            "guestPhone": payload.get("guestPhone"),
            "bookingTypeId": payload.get("bookingTypeId"),
            "allDay": bool(payload.get("allDay", False)),
            "createdAt": now,
            "updatedAt": now,
        }
        self.calendar_events.append(event)
        return event

    def update_calendar_event(self, event_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        event = next((item for item in self.calendar_events if item["id"] == event_id), None)
        if not event:
            raise ValueError("Calendar event not found")
        for key in ["title", "description", "startTime", "endTime", "status", "locationType", "location", "meetingUrl", "sourceId", "syncStatus", "externalEventRef", "lastSyncedAt", "authorityMode", "conflictState", "syncNote", "importedAt", "sourcePayload"]:
            if key in updates and updates[key] is not None:
                event[key] = updates[key]
        event["updatedAt"] = utcnow()
        threadId = event.get("threadId")
        if threadId:
            thread = next((item for item in self.threads if item["id"] == threadId), None)
            if thread:
                if event.get("startTime"):
                    thread["nextFollowUpAt"] = event["startTime"]
                if event.get("status") in {"scheduled", "confirmed"}:
                    thread["status"] = "scheduled"
                elif event.get("status") in {"completed", "cancelled", "no_show"}:
                    thread["status"] = "waiting_on_us"
                thread["updatedAt"] = event["updatedAt"]
            label = f"Meeting {str(event.get('status') or 'updated').replace('_', ' ').title()}"
            self.thread_actions.setdefault(threadId, []).append(
                {
                    "id": f"thread-action-{threadId}-calendar-{unique_suffix()}",
                    "label": label,
                    "actionType": "calendar-event-updated",
                    "source": "system",
                    "status": "completed",
                    "createdAt": event["updatedAt"],
                    "updatedAt": event["updatedAt"],
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
            "userId": payload.get("userId") or "1",
            "name": payload.get("name") or "Meeting Type",
            "slug": payload.get("slug") or slugify(payload.get("name") or f"booking-{unique_suffix()}"),
            "durationMinutes": payload.get("durationMinutes") or 30,
            "location": payload.get("location") or "Google Meet",
            "description": payload.get("description") or "",
            "color": payload.get("color") or "#10b981",
            "isActive": bool(payload.get("isActive", True)),
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
            "tenantId": self._tenantId(),
            "name": name,
            "provider": provider,
            "status": "connected" if provider == "local-stub" else "ready" if validation["ok"] else "needs_config",
            "syncDirection": syncDirection,
            "config": resolved_config,
            "lastSyncedAt": None,
        }
        self.calendar_sources.append(source)
        return self._summarize_calendar_sources([source], self.calendar_events)[0]

    def update_calendar_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        for key in ["name", "provider", "status", "syncDirection", "lastSyncedAt"]:
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

    def delete_calendar_source(self, source_id: str, fallbackSourceId: str | None = None) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        remaining_sources = [item for item in self.calendar_sources if item["id"] != source_id]
        fallback = None
        if fallbackSourceId:
            fallback = next((item for item in remaining_sources if item["id"] == fallbackSourceId), None)
            if not fallback:
                raise ValueError("Fallback calendar source not found")
        reassignedEvents = 0
        clearedEvents = 0
        for event in self.calendar_events:
            if event.get("sourceId") == source_id:
                if fallback:
                    event["sourceId"] = fallback["id"]
                    reassignedEvents += 1
                else:
                    event["sourceId"] = None
                    clearedEvents += 1
                event["updatedAt"] = utcnow()
        self.calendar_sources = remaining_sources
        return {
            "deletedSourceId": source_id,
            "deletedSourceName": source.get("name"),
            "fallbackSourceId": fallback.get("id") if fallback else None,
            "fallbackSourceName": fallback.get("name") if fallback else None,
            "reassignedEvents": reassignedEvents,
            "clearedEvents": clearedEvents,
        }

    def disconnect_calendar_source(self, source_id: str) -> dict[str, Any]:
        source = next((item for item in self.calendar_sources if item["id"] == source_id), None)
        if not source:
            raise ValueError("Calendar source not found")
        if source.get("provider") == "local-stub":
            raise ValueError("Local stub calendar sources do not need disconnect.")
        source["config"] = disconnected_provider_config(source.get("provider"), source.get("config"))
        source["status"] = "needs_config"
        source["lastSyncedAt"] = None
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
        event["updatedAt"] = now
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
                "updatedAt": now,
            }
            if existing:
                existing.update(base_payload)
                imported.append(dict(existing))
            else:
                event = {
                    "id": f"calendar-event-import-{unique_suffix()}",
                    "createdAt": now,
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
            "createdAt": utcnow(),
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
            "createdAt": utcnow(),
            "updatedAt": utcnow(),
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
                sender_email=sender_email or mailbox.get("address") or "mail@aiocrm.org",
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
            messages = sorted([message for message in self.messages if message["thread_id"] == thread["id"]], key=lambda item: item["createdAt"])
            ai_flags = thread["ai_flags"]
            thread_actions = self.thread_actions.get(thread["id"], [])
            active_agent = resolve_thread_active_agent(messages, thread_actions, thread.get("assignee"))
            hydrated.append(
                {
                    **thread,
                    "aiFlags": ai_flags,
                    "brief": self.thread_ai_briefs.get(thread["id"], {}),
                    "actions": thread_actions,
                    "artifacts": self.thread_artifacts.get(thread["id"], []),
                    "links": self.thread_links.get(thread["id"], []),
                    "calendarEvents": [event for event in self.calendar_events if event.get("thread_id") == thread["id"]],
                    "mailbox": mailbox_map.get(thread["mailbox_id"]),
                    "contact": contact_map.get(thread["contact_id"]),
                    "company": company_map.get(thread["company_id"]),
                    "messages": messages,
                    "latestMessage": messages[-1] if messages else None,
                    "activeAgentName": active_agent["name"],
                    "activeAgentSurface": active_agent["surface"],
                    "activeAgentIdentity": f"{active_agent['name']} • {active_agent['surface']}" if active_agent["name"] else "",
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
                {"name": "HAMMER"},
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
            "mailbox_id": mailbox_id or "mailbox-default-smtp",
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
            "createdAt": now,
            "updatedAt": now,
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
        sender_email: str = "mail@aiocrm.org",
        recipients: list[str] | None = None,
        direction: str = "outbound",
    ) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        createdAt = utcnow()
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
            "createdAt": createdAt,
            "updatedAt": createdAt,
        }
        self.messages.append(message)
        thread["last_activity_at"] = createdAt
        thread["updatedAt"] = createdAt
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
        thread["updatedAt"] = utcnow()
        return next(item for item in self._hydrate_threads() if item["id"] == thread_id)

    def assign_thread(self, thread_id: str, assignee_name: str) -> dict[str, Any]:
        thread = next((item for item in self.threads if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        previous_assignee = thread.get("assignee") or "Unassigned"
        thread["assignee"] = assignee_name
        thread["owner"] = assignee_name
        thread["updatedAt"] = utcnow()
        self.thread_actions.setdefault(thread_id, []).append(
            {
                "label": f"Assigned to {assignee_name}",
                "action_type": "assign-thread",
                "source": "system",
                "status": "completed",
                "createdAt": thread["updatedAt"],
                "updatedAt": thread["updatedAt"],
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
        thread["updatedAt"] = utcnow()
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
            "agent_name": details.get("agent_name") or details.get("agent") or thread.get("assignee"),
            "status": "completed",
            "createdAt": utcnow(),
            "updatedAt": utcnow(),
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
        contact["updatedAt"] = utcnow()
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
        contact["updatedAt"] = utcnow()
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
        thread["updatedAt"] = now
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
                    "updatedAt": now,
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
                    "createdAt": now,
                    "updatedAt": now,
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
            "tenantId": DEFAULT_TENANT_ID,
            "artifact_type": "report",
            "kind": kind,
            "title": "Executive Thread Report" if kind == "executive" else "Operator Thread Report",
            "body": build_thread_report_text(thread, kind=kind),
            "created_by": thread.get("assignee") or "AIO Flow",
            "createdAt": now,
            "updatedAt": now,
        }
        self.thread_artifacts.setdefault(thread_id, []).insert(0, artifact)
        self.thread_actions.setdefault(thread_id, []).append({
            "label": artifact["title"],
            "action_type": f"{kind}-report",
            "source": "system",
            "status": "completed",
            "createdAt": now,
            "updatedAt": now,
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
    def _default_tenantId() -> str:
        return DEFAULT_TENANT_ID

    def _tenantId(self) -> str:
        return get_request_tenant_id()

    def _tenant_rows(self, query: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._connect() as conn:
            cursor = conn.execute(query, (*params, self._tenantId()))
            return [dict(row) for row in cursor.fetchall()]

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @staticmethod
    def _rename_column(conn: sqlite3.Connection, table: str, old_name: str, new_name: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if old_name in columns and new_name not in columns:
            conn.execute(f"ALTER TABLE {table} RENAME COLUMN {old_name} TO {new_name}")

    @classmethod
    def _migrate_ai_audit_logs_schema(cls, conn: sqlite3.Connection) -> None:
        cls._rename_column(conn, "ai_audit_logs", "tenantId", "tenant_id")
        cls._rename_column(conn, "ai_audit_logs", "runId", "run_id")
        cls._rename_column(conn, "ai_audit_logs", "stepId", "step_id")
        cls._rename_column(conn, "ai_audit_logs", "agentId", "agent_id")

    def _backfill_tenantIds(self, conn: sqlite3.Connection) -> None:
        tenantId = self._default_tenantId()
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
            "aiEngineRuns",
        ]:
            conn.execute(f"UPDATE {table} SET tenantId = COALESCE(tenantId, ?)", (tenantId,))

    def _purge_legacy_crm_seed_data(self, conn: sqlite3.Connection) -> None:
        tenant_id = self._default_tenantId()
        seed_contacts = ("contact-jenna", "contact-sarah", "contact-emily")
        seed_companies = ("company-techcorp", "company-finserve", "company-edulearn")
        seed_hit = conn.execute(
            """
            SELECT 1
            FROM contacts
            WHERE tenantId = ? AND id IN (?, ?, ?)
            UNION
            SELECT 1
            FROM companies
            WHERE tenantId = ? AND id IN (?, ?, ?)
            LIMIT 1
            """,
            (tenant_id, *seed_contacts, tenant_id, *seed_companies),
        ).fetchone()
        if not seed_hit:
            return

        conn.execute("DELETE FROM contact_activities WHERE tenantId = ?", (tenant_id,))
        conn.execute("DELETE FROM contacts WHERE tenantId = ?", (tenant_id,))
        conn.execute("DELETE FROM companies WHERE tenantId = ?", (tenant_id,))
        conn.execute("UPDATE threads SET contactId = NULL, companyId = NULL WHERE tenantId = ?", (tenant_id,))
        conn.execute("UPDATE calendar_events SET contactId = NULL, companyId = NULL WHERE tenantId = ?", (tenant_id,))

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS contacts (
                    id TEXT PRIMARY KEY,
                    contactId TEXT NOT NULL,
                    organizationId TEXT,
                    firstName TEXT,
                    lastName TEXT,
                    email TEXT UNIQUE,
                    phone TEXT,
                    company TEXT,
                    companyId TEXT,
                    title TEXT,
                    department TEXT,
                    owner TEXT,
                    source TEXT,
                    status TEXT,
                    leadScore INTEGER,
                    quality TEXT,
                    engagement TEXT,
                    tagsJson TEXT,
                    lastContactedAt TEXT,
                    pipelineStage TEXT,
                    emailVerified INTEGER,
                    emailVerifiedAt TEXT,
                    emailVerificationStatus TEXT,
                    emailVerificationScore REAL,
                    createdAt TEXT,
                    updatedAt TEXT,
                    deletedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS email_verifier_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL UNIQUE,
                    provider TEXT NOT NULL DEFAULT 'reoon',
                    apiKey TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    autoVerifyContacts INTEGER NOT NULL DEFAULT 1,
                    defaultMode TEXT NOT NULL DEFAULT 'quick',
                    lastTestedAt TEXT,
                    status TEXT,
                    lastError TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS email_verification_tasks (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    providerTaskId TEXT,
                    status TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    submittedCount INTEGER NOT NULL DEFAULT 0,
                    completedCount INTEGER NOT NULL DEFAULT 0,
                    validCount INTEGER NOT NULL DEFAULT 0,
                    riskyCount INTEGER NOT NULL DEFAULT 0,
                    invalidCount INTEGER NOT NULL DEFAULT 0,
                    unknownCount INTEGER NOT NULL DEFAULT 0,
                    targetsJson TEXT NOT NULL DEFAULT '[]',
                    createdAt TEXT,
                    updatedAt TEXT,
                    completedAt TEXT,
                    lastError TEXT
                );

                CREATE TABLE IF NOT EXISTS companies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    industry TEXT,
                    size TEXT,
                    website TEXT,
                    owner TEXT,
                    brandProfile TEXT,
                    tenantId TEXT
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    prefix TEXT,
                    label TEXT,
                    description TEXT,
                    type TEXT NOT NULL DEFAULT 'user',
                    isLocked INTEGER NOT NULL DEFAULT 0,
                    color TEXT,
                    usageCount INTEGER DEFAULT 0,
                    tenantId TEXT,
                    createdAt TEXT,
                    UNIQUE(name, tenantId)
                );

                CREATE TABLE IF NOT EXISTS brain_item_tags (
                    itemId TEXT NOT NULL,
                    tagId TEXT NOT NULL,
                    tenantId TEXT,
                    PRIMARY KEY(itemId, tagId, tenantId)
                );

                CREATE TABLE IF NOT EXISTS brain_profiles (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    companyName TEXT,
                    website TEXT,
                    industry TEXT,
                    overview TEXT,
                    mission TEXT,
                    brandVoice TEXT,
                    idealCustomer TEXT,
                    valueProp TEXT,
                    differentiation TEXT,
                    painPoints TEXT,
                    competitors TEXT,
                    marketingStrategy TEXT,
                    workflow TEXT,
                    legalEntity TEXT,
                    primaryBrand TEXT,
                    brandArchitecture TEXT,
                    legacyBrandNotes TEXT,
                    brandUsageRules TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_sources (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    label TEXT NOT NULL,
                    sourceType TEXT,
                    status TEXT,
                    location TEXT,
                    notes TEXT,
                    metadataJson TEXT NOT NULL DEFAULT '{}',
                    graphX REAL,
                    graphY REAL,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_items (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    title TEXT NOT NULL,
                    category TEXT,
                    content TEXT,
                    sourceId TEXT,
                    status TEXT,
                    tagsJson TEXT,
                    metadataJson TEXT NOT NULL DEFAULT '{}',
                    graphX REAL,
                    graphY REAL,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_links (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    fromType TEXT NOT NULL,
                    fromId TEXT NOT NULL,
                    toType TEXT NOT NULL,
                    toId TEXT NOT NULL,
                    relationshipType TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_ingests (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    sourceId TEXT NOT NULL,
                    ingestType TEXT,
                    status TEXT,
                    title TEXT,
                    location TEXT,
                    contentExcerpt TEXT,
                    contentLength INTEGER,
                    chunkCount INTEGER,
                    error TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );
                -- Phase 16: Learning & Outcome persistence
                CREATE TABLE IF NOT EXISTS ai_step_outcomes (
                    id TEXT PRIMARY KEY,
                    runId TEXT,
                    intent TEXT,
                    agentName TEXT,
                    agentId TEXT,
                    toolName TEXT,
                    status TEXT,
                    errorCategory TEXT,
                    recoveryAttempted INTEGER DEFAULT 0,
                    recoverySuccess INTEGER DEFAULT 0,
                    durationMs INTEGER,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS brain_chunks (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    sourceId TEXT NOT NULL,
                    ingestId TEXT NOT NULL,
                    ordinal INTEGER,
                    title TEXT,
                    content TEXT NOT NULL,
                    contentExcerpt TEXT,
                    tokens INTEGER,
                    vectorJson TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS brain_embeddings (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    chunkId TEXT NOT NULL,
                    vectorJson TEXT NOT NULL,
                    model TEXT,
                    createdAt TEXT
                );

                CREATE TABLE IF NOT EXISTS forms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    folderId TEXT,
                    slug TEXT UNIQUE NOT NULL,
                    description TEXT,
                    schemaJson TEXT NOT NULL,
                    settingsJson TEXT NOT NULL,
                    status TEXT,
                    isActive INTEGER NOT NULL DEFAULT 1,
                    responsesCount INTEGER NOT NULL DEFAULT 0,
                    lastActive TEXT,
                    lastModifiedBy TEXT,
                    creator TEXT,
                    triggersJson TEXT,
                    automationJson TEXT,
                    lastResponseAt TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS form_folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    userId TEXT,
                    createdAt TEXT,
                    expanded INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS form_submissions (
                    id TEXT PRIMARY KEY,
                    formId TEXT NOT NULL,
                    contactId TEXT,
                    submissionJson TEXT NOT NULL,
                    createdContact INTEGER NOT NULL DEFAULT 0,
                    submittedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS contact_activities (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    contactId TEXT NOT NULL,
                    userId TEXT,
                    activityType TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    metadataJson TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS brain_embeddings (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    chunk_id TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    model TEXT,
                    createdAt TEXT
                );

                CREATE TABLE IF NOT EXISTS forms (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    folderId TEXT,
                    slug TEXT UNIQUE NOT NULL,
                    description TEXT,
                    schemaJson TEXT NOT NULL,
                    settingsJson TEXT NOT NULL,
                    status TEXT,
                    isActive INTEGER NOT NULL DEFAULT 1,
                    responsesCount INTEGER NOT NULL DEFAULT 0,
                    lastActive TEXT,
                    lastModifiedBy TEXT,
                    creator TEXT,
                    triggersJson TEXT,
                    automationJson TEXT,
                    lastResponseAt TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS form_folders (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    userId TEXT,
                    createdAt TEXT,
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
                    tenantId TEXT NOT NULL,
                    contact_id TEXT NOT NULL,
                    userId TEXT,
                    activity_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    metadata_json TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS flows (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    nodesJson TEXT NOT NULL,
                    edgesJson TEXT NOT NULL,
                    specJson TEXT,
                    metadataJson TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    createdBy TEXT,
                    lastEditedBy TEXT
                );

                CREATE TABLE IF NOT EXISTS flow_folders (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    name TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS flow_drafts (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    draftJson TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    contactId TEXT,
                    formSubmissionId TEXT,
                    referenceCode TEXT,
                    status TEXT,
                    totalAmount REAL,
                    currency TEXT,
                    paymentStatus TEXT,
                    paymentProvider TEXT,
                    paymentId TEXT,
                    itemsJson TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS mailboxes (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    address TEXT,
                    provider TEXT,
                    status TEXT,
                    inboundEnabled INTEGER,
                    outboundEnabled INTEGER,
                    lastSyncedAt TEXT,
                    configJson TEXT
                );

                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    mailboxId TEXT NOT NULL,
                    channelType TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    generatedTitle TEXT,
                    status TEXT NOT NULL,
                    aiFlagsJson TEXT NOT NULL,
                    aiPriority TEXT,
                    priorityScore INTEGER,
                    owner TEXT,
                    assignee TEXT,
                    contactId TEXT,
                    companyId TEXT,
                    automationState TEXT,
                    lastActivityAt TEXT,
                    nextFollowUpAt TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    threadId TEXT NOT NULL,
                    channelType TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    senderName TEXT,
                    senderEmail TEXT,
                    recipientsJson TEXT NOT NULL,
                    body TEXT NOT NULL,
                    plainText TEXT NOT NULL,
                    quotedHistory TEXT,
                    deliveryStatus TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_ai_briefs (
                    threadId TEXT PRIMARY KEY,
                    summary TEXT,
                    disposition TEXT,
                    recommendedNextStep TEXT,
                    confidence REAL,
                    unresolvedQuestionsJson TEXT NOT NULL,
                    crmImplicationsJson TEXT NOT NULL,
                    reasoningCuesJson TEXT NOT NULL,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_actions (
                    id TEXT PRIMARY KEY,
                    threadId TEXT NOT NULL,
                    label TEXT NOT NULL,
                    actionType TEXT NOT NULL,
                    source TEXT,
                    status TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_links (
                    id TEXT PRIMARY KEY,
                    threadId TEXT NOT NULL,
                    sourceType TEXT NOT NULL,
                    sourceId TEXT NOT NULL,
                    label TEXT
                );

                CREATE TABLE IF NOT EXISTS thread_artifacts (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    threadId TEXT NOT NULL,
                    artifactType TEXT NOT NULL,
                    kind TEXT,
                    title TEXT NOT NULL,
                    body TEXT NOT NULL,
                    createdBy TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS calendar_events (
                    id TEXT PRIMARY KEY,
                    calendarId TEXT NOT NULL,
                    sourceId TEXT,
                    threadId TEXT,
                    contactId TEXT,
                    companyId TEXT,
                    title TEXT NOT NULL,
                    description TEXT,
                    startTime TEXT NOT NULL,
                    endTime TEXT NOT NULL,
                    status TEXT,
                    locationType TEXT,
                    location TEXT,
                    meetingUrl TEXT,
                    syncStatus TEXT,
                    externalEventRef TEXT,
                    lastSyncedAt TEXT,
                    authorityMode TEXT,
                    conflictState TEXT,
                    syncNote TEXT,
                    importedAt TEXT,
                    sourcePayloadJson TEXT,
                    guestName TEXT,
                    guestEmail TEXT,
                    guestPhone TEXT,
                    bookingTypeId TEXT,
                    allDay INTEGER,
                    source TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS calendars (
                    id TEXT PRIMARY KEY,
                    userId TEXT,
                    name TEXT NOT NULL,
                    color TEXT,
                    isDefault INTEGER NOT NULL DEFAULT 0,
                    isVisible INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS booking_types (
                    id TEXT PRIMARY KEY,
                    userId TEXT,
                    name TEXT NOT NULL,
                    slug TEXT,
                    durationMinutes INTEGER,
                    location TEXT,
                    locationType TEXT,
                    description TEXT,
                    color TEXT,
                    bufferBeforeMinutes INTEGER,
                    bufferAfterMinutes INTEGER,
                    isActive INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS calendar_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    status TEXT,
                    syncDirection TEXT,
                    configJson TEXT NOT NULL,
                    lastSyncedAt TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS mail_events (
                    id TEXT PRIMARY KEY,
                    mailboxId TEXT NOT NULL,
                    threadId TEXT,
                    messageId TEXT,
                    eventType TEXT NOT NULL,
                    sourceProvider TEXT,
                    payloadJson TEXT NOT NULL,
                    createdAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS help_tickets (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    userId TEXT,
                    subject TEXT NOT NULL,
                    content TEXT,
                    status TEXT NOT NULL DEFAULT 'open',
                    priority TEXT,
                    category TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS broadcast_messages (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    type TEXT NOT NULL DEFAULT 'info',
                    message TEXT NOT NULL,
                    isActive INTEGER NOT NULL DEFAULT 1,
                    createdAt TEXT,
                    expiresAt TEXT
                );

                CREATE TABLE IF NOT EXISTS aiEngineRuns (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    command TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    status TEXT NOT NULL,
                    pauseReason TEXT,
                    resumeAt TEXT,
                    nextNodeId TEXT,
                    currentNodeId TEXT,
                    lockedUntil TEXT,
                    lastError TEXT,
                    stepsJson TEXT NOT NULL,
                    artifactsJson TEXT NOT NULL,
                    pendingApprovalsJson TEXT NOT NULL,
                    routingJson TEXT NOT NULL,
                    traceJson TEXT NOT NULL DEFAULT '[]',
                    actorJson TEXT NOT NULL,
                    contextJson TEXT NOT NULL,
                    createdAt TEXT,
                    updatedAt TEXT
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

                CREATE TABLE IF NOT EXISTS comms_phone_numbers (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    number TEXT NOT NULL,
                    displayLabel TEXT,
                    owner TEXT,
                    workspace TEXT,
                    smsEnabled INTEGER DEFAULT 0,
                    callsEnabled INTEGER DEFAULT 0,
                    routeTarget TEXT,
                    tagsJson TEXT,
                    isActive INTEGER DEFAULT 1,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS sms_threads (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    contactId TEXT,
                    phoneNumberId TEXT,
                    direction TEXT NOT NULL,
                    status TEXT DEFAULT 'open',
                    subject TEXT,
                    lastMessageAt TEXT,
                    messageCount INTEGER DEFAULT 0,
                    tagsJson TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS sms_messages (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    threadId TEXT NOT NULL,
                    direction TEXT NOT NULL,
                    senderName TEXT,
                    senderNumber TEXT,
                    recipientNumber TEXT,
                    body TEXT NOT NULL,
                    deliveryStatus TEXT DEFAULT 'pending',
                    errorMessage TEXT,
                    createdAt TEXT
                );

                CREATE TABLE IF NOT EXISTS sms_plans (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    name TEXT NOT NULL,
                    brandName TEXT NOT NULL,
                    registrationStatus TEXT DEFAULT 'pending',
                    campaignType TEXT,
                    approvedNumbersJson TEXT,
                    dailyLimit INTEGER,
                    optOutKeywordsJson TEXT,
                    helpResponse TEXT,
                    complianceNotes TEXT,
                    isActive INTEGER DEFAULT 1,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS comms_extensions (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    extensionNumber TEXT NOT NULL,
                    displayName TEXT,
                    userId TEXT,
                    forwardTo TEXT,
                    ringTimeoutSeconds INTEGER DEFAULT 30,
                    isActive INTEGER DEFAULT 1,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS comms_ring_groups (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    name TEXT NOT NULL,
                    extensionsJson TEXT NOT NULL,
                    ringStrategy TEXT DEFAULT 'simultaneous',
                    ringTimeoutSeconds INTEGER DEFAULT 30,
                    isActive INTEGER DEFAULT 1,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS call_sessions (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    contactId TEXT,
                    phoneNumberId TEXT,
                    extensionId TEXT,
                    direction TEXT NOT NULL,
                    status TEXT DEFAULT 'initiated',
                    durationSeconds INTEGER,
                    startTime TEXT,
                    endTime TEXT,
                    recordingUrl TEXT,
                    transcriptUrl TEXT,
                    disposition TEXT,
                    notes TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS verified_caller_ids (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    phoneNumberId TEXT NOT NULL,
                    callerIdName TEXT,
                    verificationStatus TEXT DEFAULT 'pending',
                    verifiedAt TEXT,
                    createdAt TEXT,
                    updatedAt TEXT
                );

                CREATE TABLE IF NOT EXISTS comms_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    providerType TEXT NOT NULL,
                    providerName TEXT NOT NULL,
                    configJson TEXT,
                    status TEXT DEFAULT 'stub',
                    isActive INTEGER DEFAULT 0,
                    lastHealthCheck TEXT,
                    healthStatus TEXT DEFAULT 'unknown',
                    createdAt TEXT,
                    updatedAt TEXT
                );
                """
            )

            self._migrate_ai_audit_logs_schema(conn)

            self._ensure_column(conn, "mailboxes", "status", "TEXT")
            self._ensure_column(conn, "mailboxes", "inboundEnabled", "INTEGER")
            self._ensure_column(conn, "mailboxes", "outboundEnabled", "INTEGER")
            self._ensure_column(conn, "mailboxes", "lastSyncedAt", "TEXT")
            self._ensure_column(conn, "mailboxes", "configJson", "TEXT")
            self._ensure_column(conn, "contacts", "tenantId", "TEXT")
            self._ensure_column(conn, "companies", "tenantId", "TEXT")
            self._ensure_column(conn, "companies", "brandProfile", "TEXT")
            self._ensure_column(conn, "tags", "prefix", "TEXT")
            self._ensure_column(conn, "tags", "label", "TEXT")
            self._ensure_column(conn, "tags", "description", "TEXT")
            self._ensure_column(conn, "tags", "type", "TEXT DEFAULT 'user'")
            self._ensure_column(conn, "tags", "isLocked", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "tags", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_profiles", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_profiles", "valueProp", "TEXT")
            self._ensure_column(conn, "brain_profiles", "differentiation", "TEXT")
            self._ensure_column(conn, "brain_profiles", "painPoints", "TEXT")
            self._ensure_column(conn, "brain_profiles", "competitors", "TEXT")
            self._ensure_column(conn, "brain_profiles", "marketingStrategy", "TEXT")
            self._ensure_column(conn, "brain_profiles", "workflow", "TEXT")
            self._ensure_column(conn, "brain_profiles", "legalEntity", "TEXT")
            self._ensure_column(conn, "brain_profiles", "primaryBrand", "TEXT")
            self._ensure_column(conn, "brain_profiles", "brandArchitecture", "TEXT")
            self._ensure_column(conn, "brain_profiles", "legacyBrandNotes", "TEXT")
            self._ensure_column(conn, "brain_profiles", "brandUsageRules", "TEXT")
            self._ensure_column(conn, "brain_sources", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_items", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_links", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_ingests", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_chunks", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_embeddings", "tenantId", "TEXT")
            self._ensure_column(conn, "brain_sources", "metadataJson", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(conn, "brain_items", "metadataJson", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(conn, "brain_sources", "graphX", "REAL")
            self._ensure_column(conn, "brain_sources", "graphY", "REAL")
            self._ensure_column(conn, "brain_items", "graphX", "REAL")
            self._ensure_column(conn, "brain_items", "graphY", "REAL")
            self._ensure_column(conn, "contacts", "website", "TEXT")
            self._ensure_column(conn, "contacts", "dob", "TEXT")
            self._ensure_column(conn, "contacts", "ownerId", "TEXT")
            self._ensure_column(conn, "contacts", "addressJson", "TEXT")
            self._ensure_column(conn, "contacts", "customFieldsJson", "TEXT")
            self._ensure_column(conn, "contacts", "optInEmail", "INTEGER")
            self._ensure_column(conn, "contacts", "optInSms", "INTEGER")
            self._ensure_column(conn, "contacts", "optInCalls", "INTEGER")
            self._ensure_column(conn, "contacts", "optInFlows", "INTEGER")
            self._ensure_column(conn, "contacts", "aiEmployee", "TEXT")
            self._ensure_column(conn, "contacts", "emailVerified", "INTEGER")
            self._ensure_column(conn, "contacts", "emailVerifiedAt", "TEXT")
            self._ensure_column(conn, "contacts", "emailVerificationStatus", "TEXT")
            self._ensure_column(conn, "contacts", "emailVerificationScore", "REAL")
            self._ensure_column(conn, "email_verifier_configs", "tenantId", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "provider", "TEXT DEFAULT 'reoon'")
            self._ensure_column(conn, "email_verifier_configs", "apiKey", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "enabled", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verifier_configs", "autoVerifyContacts", "INTEGER DEFAULT 1")
            self._ensure_column(conn, "email_verifier_configs", "defaultMode", "TEXT DEFAULT 'quick'")
            self._ensure_column(conn, "email_verifier_configs", "lastTestedAt", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "status", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "lastError", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "createdAt", "TEXT")
            self._ensure_column(conn, "email_verifier_configs", "updatedAt", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "tenantId", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "providerTaskId", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "status", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "mode", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "submittedCount", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "completedCount", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "validCount", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "riskyCount", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "invalidCount", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "unknownCount", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "email_verification_tasks", "targetsJson", "TEXT DEFAULT '[]'")
            self._ensure_column(conn, "email_verification_tasks", "createdAt", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "updatedAt", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "completedAt", "TEXT")
            self._ensure_column(conn, "email_verification_tasks", "lastError", "TEXT")
            self._ensure_column(conn, "forms", "tenantId", "TEXT")
            self._ensure_column(conn, "form_folders", "tenantId", "TEXT")
            self._ensure_column(conn, "form_submissions", "tenantId", "TEXT")
            self._ensure_column(conn, "forms", "folderId", "TEXT")
            self._ensure_column(conn, "forms", "status", "TEXT")
            self._ensure_column(conn, "forms", "lastActive", "TEXT")
            self._ensure_column(conn, "forms", "lastModifiedBy", "TEXT")
            self._ensure_column(conn, "forms", "creator", "TEXT")
            self._ensure_column(conn, "forms", "triggersJson", "TEXT")
            self._ensure_column(conn, "forms", "automationJson", "TEXT")
            self._ensure_column(conn, "forms", "pagesJson", "TEXT")
            self._ensure_column(conn, "forms", "isActive", "INTEGER")
            self._ensure_column(conn, "forms", "responsesCount", "INTEGER")
            self._ensure_column(conn, "forms", "lastResponseAt", "TEXT")
            self._ensure_column(conn, "forms", "schemaJson", "TEXT")
            self._ensure_column(conn, "forms", "settingsJson", "TEXT")
            self._ensure_column(conn, "mailboxes", "tenantId", "TEXT")
            self._ensure_column(conn, "threads", "tenantId", "TEXT")
            self._ensure_column(conn, "messages", "tenantId", "TEXT")
            self._ensure_column(conn, "thread_ai_briefs", "tenantId", "TEXT")
            self._ensure_column(conn, "thread_actions", "tenantId", "TEXT")
            self._ensure_column(conn, "thread_actions", "agentName", "TEXT")
            self._ensure_column(conn, "thread_links", "tenantId", "TEXT")
            self._ensure_column(conn, "thread_artifacts", "tenantId", "TEXT")
            self._ensure_column(conn, "calendars", "tenantId", "TEXT")
            self._ensure_column(conn, "booking_types", "tenantId", "TEXT")
            self._ensure_column(conn, "calendar_sources", "tenantId", "TEXT")
            self._ensure_column(conn, "calendar_events", "tenantId", "TEXT")
            self._ensure_column(conn, "mail_events", "tenantId", "TEXT")
            self._ensure_column(conn, "calendar_events", "sourceId", "TEXT")
            self._ensure_column(conn, "calendar_events", "syncStatus", "TEXT")
            self._ensure_column(conn, "calendar_events", "externalEventRef", "TEXT")
            self._ensure_column(conn, "calendar_events", "lastSyncedAt", "TEXT")
            self._ensure_column(conn, "calendar_events", "authorityMode", "TEXT")
            self._ensure_column(conn, "calendar_events", "conflictState", "TEXT")
            self._ensure_column(conn, "calendar_events", "syncNote", "TEXT")
            self._ensure_column(conn, "calendar_events", "importedAt", "TEXT")
            self._ensure_column(conn, "calendar_events", "sourcePayloadJson", "TEXT")
            self._ensure_column(conn, "calendar_events", "guestName", "TEXT")
            self._ensure_column(conn, "calendar_events", "guestEmail", "TEXT")
            self._ensure_column(conn, "calendar_events", "guestPhone", "TEXT")
            self._ensure_column(conn, "calendar_events", "bookingTypeId", "TEXT")
            self._ensure_column(conn, "calendar_events", "allDay", "INTEGER")
            self._ensure_column(conn, "calendar_events", "updatedAt", "TEXT")
            self._ensure_column(conn, "booking_types", "locationType", "TEXT")
            self._ensure_column(conn, "booking_types", "bufferBeforeMinutes", "INTEGER")
            self._ensure_column(conn, "booking_types", "bufferAfterMinutes", "INTEGER")
            self._ensure_column(conn, "calendar_sources", "status", "TEXT")
            self._ensure_column(conn, "calendar_sources", "syncDirection", "TEXT")
            self._ensure_column(conn, "calendar_sources", "configJson", "TEXT")
            self._ensure_column(conn, "calendar_sources", "lastSyncedAt", "TEXT")
            self._ensure_column(conn, "calendar_sources", "createdAt", "TEXT")
            self._ensure_column(conn, "calendar_sources", "updatedAt", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "tenantId", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "pauseReason", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "resumeAt", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "nextNodeId", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "currentNodeId", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "lockedUntil", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "lastError", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "traceJson", "TEXT DEFAULT '[]'")
            self._ensure_column(conn, "ai_audit_logs", "tenant_id", "TEXT")
            self._ensure_column(conn, "orders", "tenantId", "TEXT")
            self._ensure_column(conn, "help_tickets", "tenantId", "TEXT")
            self._ensure_column(conn, "broadcast_messages", "tenantId", "TEXT")

            conn.execute(
                """
                UPDATE mailboxes
                SET
                    status = COALESCE(status, 'connected'),
                    inboundEnabled = COALESCE(inboundEnabled, 1),
                    outboundEnabled = COALESCE(outboundEnabled, 1),
                    provider = CASE WHEN provider IS NULL OR provider = 'sqlite' OR provider = 'mock-email' THEN 'local-stub' ELSE provider END,
                    configJson = COALESCE(configJson, '{}')
                """
            )
            conn.execute(
                """
                UPDATE contacts
                SET
                    addressJson = COALESCE(addressJson, '{}'),
                    customFieldsJson = COALESCE(customFieldsJson, '{}'),
                    optInEmail = COALESCE(optInEmail, 1),
                    optInSms = COALESCE(optInSms, 1),
                    optInCalls = COALESCE(optInCalls, 1),
                    optInFlows = COALESCE(optInFlows, 1)
                """
            )
            conn.execute(
                """
                UPDATE forms
                SET
                    status = COALESCE(status, CASE WHEN isActive = 1 THEN 'Active' ELSE 'Draft' END),
                    folderId = COALESCE(folderId, 'form-folder-default'),
                    lastActive = COALESCE(lastActive, lastResponseAt, 'Just now'),
                    lastModifiedBy = COALESCE(lastModifiedBy, 'AIO Flow'),
                    creator = COALESCE(creator, 'AIO Flow'),
                    triggersJson = COALESCE(triggersJson, 'null'),
                    automationJson = COALESCE(automationJson, 'null')
                """
            )
            conn.execute(
                """
                UPDATE calendar_events
                SET
                    sourceId = COALESCE(sourceId, 'calendar-source-local'),
                    syncStatus = COALESCE(syncStatus, 'local'),
                    externalEventRef = COALESCE(externalEventRef, ''),
                    lastSyncedAt = COALESCE(lastSyncedAt, updatedAt),
                    authorityMode = COALESCE(authorityMode, 'local-first'),
                    conflictState = COALESCE(conflictState, 'clear'),
                    syncNote = COALESCE(syncNote, 'Created locally.'),
                    sourcePayloadJson = COALESCE(sourcePayloadJson, '{}'),
                    allDay = COALESCE(allDay, 0)
                """
            )
            self._backfill_tenantIds(conn)
            existing_form_folders = conn.execute("SELECT COUNT(*) AS count FROM form_folders").fetchone()["count"]
            if not existing_form_folders:
                conn.execute(
                    "INSERT INTO form_folders (id, tenantId, name, userId, createdAt, expanded) VALUES (?, ?, ?, ?, ?, ?)",
                    ("form-folder-default", self._default_tenantId(), "My Forms", "1", utcnow(), 1),
                )
            existing_calendars = conn.execute("SELECT COUNT(*) AS count FROM calendars").fetchone()["count"]
            if not existing_calendars:
                conn.executemany(
                    "INSERT INTO calendars (id, tenantId, userId, name, color, isDefault, isVisible) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [
                        ("calendar-primary", self._default_tenantId(), "1", "AIO Calendar", "#3b82f6", 1, 1),
                        ("calendar-booking", self._default_tenantId(), "1", "AIO Booking", "#10b981", 0, 1),
                        ("calendar-comms", self._default_tenantId(), "system", "Comms", "#f59e0b", 0, 1),
                    ],
                )
            existing_booking_types = conn.execute("SELECT COUNT(*) AS count FROM booking_types").fetchone()["count"]
            if not existing_booking_types:
                conn.execute(
                    "INSERT INTO booking_types (id, tenantId, userId, name, slug, durationMinutes, location, description, color, isActive) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    ("booking-type-demo", self._default_tenantId(), "1", "Discovery Call", "discovery-call", 30, "Google Meet", "Introductory discovery meeting.", "#10b981", 1),
                )
            existing_sources = conn.execute("SELECT COUNT(*) AS count FROM calendar_sources").fetchone()["count"]
            if not existing_sources:
                seeded_now = utcnow()
                conn.executemany(
                    "INSERT INTO calendar_sources (id, tenantId, name, provider, status, syncDirection, configJson, lastSyncedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        ("calendar-source-local", self._default_tenantId(), "Local Command Calendar", "local-stub", "connected", "two-way", json.dumps({"adapter": "local-stub", "authorityMode": "local-first", "importPolicy": "review"}), seeded_now, seeded_now, seeded_now),
                    ],
                )
            existing_brain_profiles = conn.execute("SELECT COUNT(*) AS count FROM brain_profiles").fetchone()["count"]
            if not existing_brain_profiles:
                conn.execute(
                    """
                    INSERT INTO brain_profiles (
                        id, tenantId, companyName, website, industry, overview, mission, brandVoice, idealCustomer, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "brain-profile-primary",
                        self._default_tenantId(),
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
                        id, tenantId, label, sourceType, status, location, notes, metadataJson, graphX, graphY, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            "brain-source-profile",
                            self._default_tenantId(),
                            "Company Profile Intake",
                            "profile",
                            "ready",
                            "Internal workspace memory",
                            "Core business identity and positioning.",
                            json.dumps({}),
                            28.0,
                            24.0,
                            seeded_now,
                            seeded_now,
                        ),
                        (
                            "brain-source-ops",
                            self._default_tenantId(),
                            "Ops Playbook",
                            "document",
                            "draft",
                            "Upload or author internally",
                            "Planned SOP source for agents and flows.",
                            json.dumps({}),
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
                        id, tenantId, title, category, content, sourceId, status, tagsJson, metadataJson, graphX, graphY, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    [
                        (
                            "brain-item-positioning",
                            self._default_tenantId(),
                            "Core positioning",
                            "strategy",
                            "AIO CRM is the local-first operator console where CRM, Comms, workflows, and AI agents share one memory layer.",
                            "brain-source-profile",
                            "active",
                            json.dumps(["POSITIONING", "AI", "LOCAL-FIRST"]),
                            json.dumps({}),
                            72.0,
                            26.0,
                            seeded_now,
                            seeded_now,
                        ),
                        (
                            "brain-item-agent-rule",
                            self._default_tenantId(),
                            "Agent guidance",
                            "operations",
                            "Named agents should pull from workspace memory before drafting, summarizing, or recommending next steps.",
                            "brain-source-ops",
                            "draft",
                            json.dumps(["AGENTS", "MEMORY", "RULES"]),
                            json.dumps({}),
                            76.0,
                            58.0,
                            seeded_now,
                            seeded_now,
                        ),
                    ],
                )
            self.seed_canonical_tags(conn)
            self._purge_legacy_crm_seed_data(conn)

            existing = conn.execute("SELECT COUNT(*) AS count FROM forms").fetchone()["count"]
            if existing:
                self._backfill_tenantIds(conn)
                return

            now = utcnow()
            contacts = []
            companies = []
            tags = []
            forms = [
                (
                    "form-contact",
                    "Contact Form",
                    "contact-form",
                    "Get in touch with us for any questions or inquiries",
                    json.dumps([
                        {"id": "f1", "name": "fullName", "label": "Full Name", "type": "text", "required": True, "placeholder": "John Doe", "mapToContact": "firstName", "isIdentifier": False},
                        {"id": "f2", "name": "email", "label": "Email Address", "type": "email", "required": True, "placeholder": "john@example.com", "mapToContact": "email", "isIdentifier": True},
                        {"id": "f3", "name": "phone", "label": "Phone Number", "type": "tel", "required": False, "placeholder": "+1 (555) 000-0000", "mapToContact": "phone", "isIdentifier": False},
                        {"id": "f4", "name": "message", "label": "Message", "type": "textarea", "required": True, "placeholder": "How can we help you?", "mapToContact": None, "isIdentifier": False},
                    ]),
                    json.dumps({
                        "createContact": True,
                        "updateContact": True,
                        "webhookUrl": "",
                        "notificationEmail": "contact@aioagency.com",
                        "redirectUrl": "",
                        "thankYouMessage": "Thank you for contacting us! We'll get back to you within 24 hours.",
                    }),
                    1,
                    0,
                    None,
                    now,
                    now,
                )
            ]
            mailboxes = [
                (
                    "mailbox-default-smtp",
                    "AIO CRM Mail",
                    "mail@aiocrm.org",
                    "smtp-imap",
                    "ready",
                    1,
                    1,
                    None,
                    json.dumps(
                        {
                            "email": "mail@aiocrm.org",
                            "username": "mail@aiocrm.org",
                            "password": "#Test123!",
                            "incoming_host": "aiocrm.org",
                            "incoming_port": 993,
                            "outgoing_host": "aiocrm.org",
                            "outgoing_port": 465,
                        }
                    ),
                ),
            ]
            threads = []
            messages = []
            thread_briefs = []
            thread_actions = []
            thread_links = []
            calendar_events = []

            conn.executemany(
                """
                INSERT INTO contacts (
                    id, contactId, organizationId, tenantId, firstName, lastName, email, phone, company, companyId,
                    title, department, owner, source, status, leadScore, quality, engagement, tagsJson,
                    lastContactedAt, pipelineStage, createdAt, updatedAt, deletedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], row[1], row[2], self._default_tenantId(), *row[3:]) for row in contacts],
            )
            conn.executemany("INSERT INTO companies (id, name, industry, size, website, owner, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)", [(row[0], *row[1:], self._default_tenantId()) for row in companies])
            conn.executemany("INSERT INTO tags (id, name, color, type, usageCount, createdAt, tenantId) VALUES (?, ?, ?, ?, ?, ?, ?)", [(row[0], row[1], row[2], row[3], row[4], row[5], self._default_tenantId()) for row in tags])
            conn.executemany(
                """
                INSERT INTO forms (
                    id, name, slug, description, schemaJson, settingsJson, isActive,
                    responsesCount, lastResponseAt, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], row[9], row[10]) for row in forms],
            )
            conn.executemany(
                "INSERT INTO mailboxes (id, name, address, provider, status, inboundEnabled, outboundEnabled, lastSyncedAt, configJson) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [row for row in mailboxes],
            )
            conn.executemany(
                """
                INSERT INTO threads (
                    id, mailboxId, channelType, subject, generatedTitle, status, aiFlagsJson,
                    aiPriority, priorityScore, owner, assignee, contactId, companyId,
                    automationState, lastActivityAt, nextFollowUpAt, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [(row[0], *row[1:]) for row in threads],
            )
            conn.executemany(
                """
                INSERT INTO messages (
                    id, threadId, channelType, direction, senderName, senderEmail, recipientsJson,
                    body, plainText, quotedHistory, deliveryStatus, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [row for row in messages],
            )
            conn.executemany(
                """
                INSERT INTO thread_ai_briefs (
                    threadId, summary, disposition, recommendedNextStep, confidence,
                    unresolvedQuestionsJson, crmImplicationsJson, reasoningCuesJson, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [row for row in thread_briefs],
            )
            conn.executemany(
                "INSERT INTO thread_actions (id, threadId, label, actionType, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [row for row in thread_actions],
            )
            conn.executemany(
                "INSERT INTO thread_links (id, threadId, sourceType, sourceId, label) VALUES (?, ?, ?, ?, ?)",
                [row for row in thread_links],
            )
            conn.executemany(
                """
                INSERT INTO calendar_events (
                    id, calendarId, sourceId, threadId, contactId, companyId, title, description,
                    startTime, endTime, status, locationType, location, meetingUrl, syncStatus,
                    externalEventRef, lastSyncedAt, authorityMode, conflictState, syncNote, importedAt,
                    sourcePayloadJson, source, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [row for row in calendar_events],
            )
            self._backfill_tenantIds(conn)

    def _rows(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [dict(row) for row in rows]

    def _tenant_rows(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return self._rows(query, (self._tenantId(), *params))

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
        contact["tags"] = json_loads(contact.pop("tagsJson", None), [])
        contact["address"] = json_loads(contact.pop("addressJson", None), {})
        contact["customFields"] = json_loads(contact.pop("customFieldsJson", None), {})
        contact["optInEmail"] = bool(contact.get("optInEmail", 1))
        contact["optInSms"] = bool(contact.get("optInSms", 1))
        contact["optInCalls"] = bool(contact.get("optInCalls", 1))
        contact["optInFlows"] = bool(contact.get("optInFlows", 1))
        
        email_v = contact.get("emailVerified")
        contact["emailVerified"] = bool(email_v) if email_v is not None else None
        
        return contact

    def _email_verifier_config_from_row(self, row: dict[str, Any] | None, *, include_secret: bool = False) -> dict[str, Any]:
        if not row:
            return {
                "id": None,
                "tenantId": self._tenantId(),
                "provider": "reoon",
                "enabled": False,
                "autoVerifyContacts": True,
                "defaultMode": "quick",
                "lastTestedAt": None,
                "status": "unconfigured",
                "lastError": None,
                "hasApiKey": False,
                "apiKey": "" if include_secret else None,
                "createdAt": None,
                "updatedAt": None,
            }
        config = dict(row)
        api_key = str(config.get("apiKey") or "").strip()
        config["enabled"] = bool(config.get("enabled"))
        config["autoVerifyContacts"] = bool(config.get("autoVerifyContacts", 1))
        config["provider"] = config.get("provider") or "reoon"
        config["defaultMode"] = config.get("defaultMode") or "quick"
        config["status"] = config.get("status") or ("active" if api_key else "unconfigured")
        config["lastError"] = str(config.get("lastError") or "").strip() or None
        config["hasApiKey"] = bool(api_key)
        config["apiKey"] = api_key if include_secret else None
        return config

    def get_email_verifier_config(self, *, include_secret: bool = False) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM email_verifier_configs WHERE tenantId = ? LIMIT 1",
                (self._tenantId(),),
            ).fetchone()
        return self._email_verifier_config_from_row(dict(row) if row else None, include_secret=include_secret)

    def upsert_email_verifier_config(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        current = self.get_email_verifier_config(include_secret=True)
        api_key = str(payload.get("apiKey") if "apiKey" in payload else current.get("apiKey") or "").strip()
        enabled = bool(payload.get("enabled", current.get("enabled", False)) and api_key)
        auto_verify_contacts = bool(payload.get("autoVerifyContacts", current.get("autoVerifyContacts", True)))
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
            "tenantId": self._tenantId(),
            "provider": "reoon",
            "apiKey": api_key,
            "enabled": int(enabled),
            "autoVerifyContacts": int(auto_verify_contacts),
            "defaultMode": "power" if str(payload.get("defaultMode") or current.get("defaultMode") or "quick").strip().lower() == "power" else "quick",
            "lastTestedAt": payload.get("lastTestedAt") if "lastTestedAt" in payload else current.get("lastTestedAt"),
            "status": next_status,
            "lastError": str(payload.get("lastError") if "lastError" in payload else current.get("lastError") or "").strip() or None,
            "createdAt": current.get("createdAt") or now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO email_verifier_configs (
                    id, tenantId, provider, apiKey, enabled, autoVerifyContacts, defaultMode, lastTestedAt, status, lastError, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tenantId) DO UPDATE SET
                    provider = excluded.provider,
                    apiKey = excluded.apiKey,
                    enabled = excluded.enabled,
                    autoVerifyContacts = excluded.autoVerifyContacts,
                    defaultMode = excluded.defaultMode,
                    lastTestedAt = excluded.lastTestedAt,
                    status = excluded.status,
                    lastError = excluded.lastError,
                    updatedAt = excluded.updatedAt
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["provider"],
                    record["apiKey"],
                    record["enabled"],
                    record["autoVerifyContacts"],
                    record["defaultMode"],
                    record["lastTestedAt"],
                    record["status"],
                    record["lastError"],
                    record["createdAt"],
                    record["updatedAt"],
                ),
            )
            conn.commit()
        return self.get_email_verifier_config(include_secret=False)

    def mark_email_verifier_config_status(self, *, status: str, last_tested_at: str | None = None, last_error: str | None = None) -> dict[str, Any]:
        current = self.get_email_verifier_config(include_secret=True)
        updates: dict[str, Any] = {
            "status": status,
            "lastTestedAt": last_tested_at or utcnow(),
        }
        if last_error:
            updates["lastError"] = last_error
        elif status != "error":
            updates["lastError"] = None
        if last_error and "error" in status:
            updates["status"] = "error"
        return self.upsert_email_verifier_config({
            **updates,
            "apiKey": current.get("apiKey") or "",
            "enabled": current.get("enabled", False),
            "autoVerifyContacts": current.get("autoVerifyContacts", True),
            "defaultMode": current.get("defaultMode", "quick"),
        })

    def delete_email_verifier_config(self) -> dict[str, Any]:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM email_verifier_configs WHERE tenantId = ?",
                (self._tenantId(),),
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
                    f"SELECT * FROM contacts WHERE tenantId = ? AND id IN ({placeholders})",
                    (self._tenantId(), *chunk),
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
            "tenantId": self._tenantId(),
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
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
            "completed_at": payload.get("completed_at"),
            "last_error": payload.get("last_error"),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO email_verification_tasks (
                    id, tenantId, providerTaskId, status, mode, submittedCount, completedCount,
                    validCount, riskyCount, invalidCount, unknownCount, targetsJson,
                    createdAt, updatedAt, completedAt, lastError
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
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
                    record["createdAt"],
                    record["updatedAt"],
                    record["completed_at"],
                    record["last_error"],
                ),
            )
            conn.commit()
        return self.get_email_verification_task(record["id"])

    def get_email_verification_task(self, task_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM email_verification_tasks WHERE id = ? AND tenantId = ? LIMIT 1",
                (task_id, self._tenantId()),
            ).fetchone()
        return self._email_verification_task_from_row(dict(row) if row else None)

    def list_email_verification_tasks(self, limit: int = 50) -> list[dict[str, Any]]:
        resolved_limit = max(1, int(limit or 50))
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM email_verification_tasks
                WHERE tenantId = ?
                ORDER BY updatedAt DESC, createdAt DESC
                LIMIT ?
                """,
                (self._tenantId(), resolved_limit),
            ).fetchall()
        return [task for task in (self._email_verification_task_from_row(dict(row)) for row in rows) if task]

    def update_email_verification_task(self, task_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = dict(updates or {})
        if "targets" in payload:
            payload["targets_json"] = json.dumps(payload.pop("targets") or [])
        payload["updatedAt"] = utcnow()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT id FROM email_verification_tasks WHERE id = ? AND tenantId = ? LIMIT 1",
                (task_id, self._tenantId()),
            ).fetchone()
            if not existing:
                raise ValueError("Email verification task not found")
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(
                f"UPDATE email_verification_tasks SET {assignments} WHERE id = ? AND tenantId = ?",
                (*payload.values(), task_id, self._tenantId()),
            )
            conn.commit()
        return self.get_email_verification_task(task_id)

    def apply_email_verification_result(self, contact_id: str, result: dict[str, Any], *, expected_email: str | None = None) -> dict[str, Any]:
        normalized_status = str(result.get("status") or "unknown").strip().lower() or "unknown"
        verified_at = result.get("verifiedAt") or utcnow()
        with self._connect() as conn:
            existing = conn.execute(
                "SELECT * FROM contacts WHERE id = ? AND tenantId = ? LIMIT 1",
                (contact_id, self._tenantId()),
            ).fetchone()
            if not existing:
                raise ValueError("Contact not found")
            if expected_email and str(existing["email"] or "").strip().lower() != str(expected_email).strip().lower():
                return self._contact_from_row(dict(existing))
            conn.execute(
                """
                UPDATE contacts
                SET emailVerified = ?, emailVerifiedAt = ?, emailVerificationStatus = ?, emailVerificationScore = ?, updatedAt = ?
                WHERE id = ? AND tenantId = ?
                """,
                (
                    int(bool(result.get("is_safe_to_send"))),
                    verified_at,
                    normalized_status,
                    result.get("score"),
                    utcnow(),
                    contact_id,
                    self._tenantId(),
                ),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM contacts WHERE id = ? AND tenantId = ? LIMIT 1",
                (contact_id, self._tenantId()),
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
                        "SELECT id, email FROM contacts WHERE id = ? AND tenantId = ? LIMIT 1",
                        (target["contact_id"], self._tenantId()),
                    ).fetchone()
                    if contact_row and str(contact_row["email"] or "").strip().lower() != normalized_email:
                        continue
                if contact_row is None:
                    contact_row = conn.execute(
                        "SELECT id, email FROM contacts WHERE tenantId = ? AND LOWER(email) = LOWER(?) LIMIT 1",
                        (self._tenantId(), normalized_email),
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
                        self._tenantId(),
                    )
                )

            if updates:
                conn.executemany(
                    """
                    UPDATE contacts
                    SET emailVerified = ?, emailVerifiedAt = ?, emailVerificationStatus = ?, emailVerificationScore = ?, updatedAt = ?
                    WHERE id = ? AND tenantId = ?
                    """,
                    updates,
                )
                conn.commit()
        return self.update_email_verification_task(task_id, {"completed_at": now, "last_error": None})

    def _form_from_row(self, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        settings = self._normalize_form_settings(json_loads(row["settingsJson"], {}))
        schema = self._normalize_form_schema(json_loads(row["schemaJson"], []))
        return {
            "id": row["id"],
            "name": row["name"],
            "folderId": row.get("folderId"),
            "slug": row["slug"],
            "description": row["description"],
            "schema": schema,
            "settings": settings,
            "status": row.get("status") or ("Active" if row.get("isActive") else "Draft"),
            "isActive": bool(row["isActive"]),
            "responsesCount": row["responsesCount"],
            "lastActive": row.get("lastActive"),
            "lastModifiedBy": row.get("lastModifiedBy"),
            "creator": row.get("creator"),
            "triggers": json_loads(row.get("triggersJson"), None),
            "automation": json_loads(row.get("automationJson"), None),
            "lastResponseAt": row["lastResponseAt"],
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
            "lastModifiedAt": row["updatedAt"],
        }

    @staticmethod
    def _to_camel_case_key(key: str) -> str:
        normalized = (key or "").strip()
        if not normalized:
            return normalized
        if "_" in normalized or " " in normalized or "-" in normalized:
            parts = [part for part in re.split(r"[_\-\s]+", normalized) if part]
            if not parts:
                return normalized
            return parts[0][:1].lower() + parts[0][1:] + "".join(part[:1].upper() + part[1:] for part in parts[1:])
        return normalized[:1].lower() + normalized[1:]

    def _normalize_form_settings(self, settings: dict[str, Any] | None) -> dict[str, Any]:
        source = settings or {}
        normalized = {
            "createContact": bool(source.get("createContact", source.get("create_contact", True))),
            "updateContact": bool(source.get("updateContact", source.get("update_contact", True))),
            "webhookUrl": source.get("webhookUrl", source.get("webhook_url", "")) or "",
            "notificationEmail": source.get("notificationEmail", source.get("notification_email", "")) or "",
            "redirectUrl": source.get("redirectUrl", source.get("redirect_url", "")) or "",
            "thankYouMessage": source.get("thankYouMessage", source.get("thank_you_message", "Thank you.")) or "Thank you.",
            "headerImage": source.get("headerImage", source.get("header_image", "")) or "",
        }
        reserved = {
            "createContact", "create_contact",
            "updateContact", "update_contact",
            "webhookUrl", "webhook_url",
            "notificationEmail", "notification_email",
            "redirectUrl", "redirect_url",
            "thankYouMessage", "thank_you_message",
            "headerImage", "header_image",
        }
        for key, value in source.items():
            if key in reserved or value is None:
                continue
            normalized[self._to_camel_case_key(key)] = value
        return normalized

    def _normalize_form_field(self, field: dict[str, Any] | None, index: int = 0) -> dict[str, Any]:
        source = field or {}
        field_type = (source.get("type") or "text").strip()
        if field_type == "phone":
            field_type = "tel"
        label = source.get("label") or source.get("name") or f"Field {index + 1}"
        name = self._to_camel_case_key(source.get("name") or label or f"field{index + 1}") or f"field{index + 1}"
        map_to_contact = source.get("mapToContact", source.get("map_to_contact"))
        if map_to_contact:
            map_to_contact = self._to_camel_case_key(str(map_to_contact))
        is_content = source.get("isContent")
        if is_content is None:
            is_content = source.get("is_content")
        if is_content is None:
            is_content = field_type in {"textarea", "content", "html"}

        normalized = {
            "id": source.get("id") or f"field-{unique_suffix()}-{index}",
            "name": name,
            "label": label,
            "type": field_type,
            "required": bool(source.get("required")),
            "placeholder": source.get("placeholder") or "",
            "isContent": bool(is_content),
            "mapToContact": map_to_contact,
            "isIdentifier": bool(source.get("isIdentifier", source.get("is_identifier", False))),
        }

        passthrough_keys = (
            "options", "defaultValue", "prefix", "suffix", "mask", "customClass", "tabIndex",
            "labelPosition", "hidden", "hideLabel", "showWordCounter", "content", "minLength",
            "maxLength", "pattern", "customValidation", "errorMessage", "showTotalPrice",
            "showCouponCode", "showCreditCardInput", "collectCardHolderName", "showCvv",
            "collectEmail", "collectPhone", "collectBillingAddress", "addBillingConfirmation",
            "billingConfirmationText", "disableDefaultWelcomeEmail", "disableDefaultPaymentConfirmation",
        )
        for key in passthrough_keys:
            if key in source and source[key] is not None:
                normalized[key] = source[key]
        return normalized

    def _normalize_form_schema(self, schema: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        if not isinstance(schema, list):
            return []
        return [self._normalize_form_field(field, index) for index, field in enumerate(schema)]

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
        tenantId = self._tenantId()
        contacts = {contact["id"]: contact for contact in self.list_contacts()}
        companies = {company["id"]: company for company in self.list_companies()}
        with self._connect() as conn:
            mailboxes = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM mailboxes WHERE tenantId = ?", (tenantId,)).fetchall()}
            message_rows = [dict(row) for row in conn.execute("SELECT * FROM messages WHERE tenantId = ? ORDER BY createdAt ASC", (tenantId,)).fetchall()]
            brief_rows = {row["threadId"]: dict(row) for row in conn.execute("SELECT * FROM thread_ai_briefs WHERE tenantId = ?", (tenantId,)).fetchall()}
            action_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM thread_actions WHERE tenantId = ? ORDER BY createdAt ASC", (tenantId,)).fetchall():
                payload = dict(row)
                action_rows.setdefault(payload["threadId"], []).append(payload)
            link_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM thread_links WHERE tenantId = ?", (tenantId,)).fetchall():
                payload = dict(row)
                link_rows.setdefault(payload["threadId"], []).append(payload)
            artifact_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM thread_artifacts WHERE tenantId = ? ORDER BY createdAt DESC", (tenantId,)).fetchall():
                payload = dict(row)
                artifact_rows.setdefault(payload["threadId"], []).append(payload)
            calendar_event_rows: dict[str, list[dict[str, Any]]] = {}
            for row in conn.execute("SELECT * FROM calendar_events WHERE tenantId = ? ORDER BY startTime ASC", (tenantId,)).fetchall():
                payload = dict(row)
                calendar_event_rows.setdefault(payload["threadId"], []).append(payload)
            threads = [dict(row) for row in conn.execute("SELECT * FROM threads WHERE tenantId = ? ORDER BY lastActivityAt DESC", (tenantId,)).fetchall()]

        hydrated = []
        for thread in threads:
            thread_messages = []
            for message in message_rows:
                if message["threadId"] != thread["id"]:
                    continue
                thread_messages.append(
                    {
                        **message,
                        "recipients": json_loads(message.pop("recipientsJson"), []),
                    }
                )
            brief_row = brief_rows.get(thread["id"])
            brief = {
                "summary": brief_row["summary"],
                "disposition": brief_row["disposition"],
                "recommendedNextStep": brief_row["recommendedNextStep"],
                "confidence": brief_row["confidence"],
                "unresolvedQuestions": json_loads(brief_row["unresolvedQuestionsJson"], []),
                "crmImplications": json_loads(brief_row["crmImplicationsJson"], []),
                "reasoningCues": json_loads(brief_row["reasoningCuesJson"], []),
            } if brief_row else {}
            ai_flags = json_loads(thread.pop("aiFlagsJson"), {})
            latest_message = thread_messages[-1] if thread_messages else None
            thread_actions = action_rows.get(thread["id"], [])
            active_agent = resolve_thread_active_agent(thread_messages, thread_actions, thread.get("assignee"))
            hydrated.append(
                {
                    **thread,
                    "aiFlags": ai_flags,
                    "brief": brief,
                    "actions": thread_actions,
                    "artifacts": artifact_rows.get(thread["id"], []),
                    "links": link_rows.get(thread["id"], []),
                    "calendarEvents": calendar_event_rows.get(thread["id"], []),
                    "mailbox": mailboxes.get(thread["mailboxId"]),
                    "contact": contacts.get(thread["contactId"]),
                    "company": companies.get(thread["companyId"]),
                    "messages": thread_messages,
                    "latestMessage": latest_message,
                    "activeAgentName": active_agent["name"],
                    "activeAgentSurface": active_agent["surface"],
                    "activeAgentIdentity": f"{active_agent['name']} • {active_agent['surface']}" if active_agent["name"] else "",
                    "preview": (latest_message["plainText"] if latest_message else brief.get("summary")) or thread["generatedTitle"],
                    "queueIds": self._thread_queue_ids({**thread, "aiFlags": ai_flags}),
                }
            )
        return hydrated

    def health(self) -> dict[str, Any]:
        return {"provider": self.provider_name, "status": "ready", "db_path": str(self.db_path)}

    def list_contacts(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM contacts WHERE tenantId = ? AND deletedAt IS NULL ORDER BY updatedAt DESC")
        return [self._contact_from_row(row) for row in rows]

    def create_contact(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        first_name = str(payload.get("firstName") or "").strip()
        last_name = str(payload.get("lastName") or "").strip()
        email = str(payload.get("email") or "").strip().lower() or None
        phone = str(payload.get("phone") or "").strip() or None
        custom_fields = payload.get("customFields") or {}
        display_name = str(payload.get("displayName") or custom_fields.get("displayName") or "").strip()
        if not any([display_name, first_name, last_name, email, phone]):
            raise ValueError("A contact requires a name, email, or phone number.")
        record = {
            "id": payload.get("id") or f"contact-{unique_suffix()}",
            "contactId": payload.get("contactId") or f"CNT-{unique_suffix().upper()}",
            "organizationId": payload.get("organizationId") or "org-1",
            "tenantId": self._tenantId(),
            "firstName": first_name or None,
            "lastName": last_name or None,
            "email": email,
            "phone": phone,
            "company": payload.get("company"),
            "companyId": payload.get("companyId"),
            "title": payload.get("title"),
            "department": payload.get("department"),
            "owner": payload.get("owner") or "AIO Flow",
            "source": payload.get("source") or "Manual Entry",
            "status": payload.get("status") or "contact",
            "leadScore": payload.get("leadScore") or 50,
            "quality": payload.get("quality") or "warm",
            "engagement": payload.get("engagement") or "medium",
            "tagsJson": json.dumps([str(t).strip().upper() for t in (payload.get("tags") or [])]),
            "lastContactedAt": payload.get("lastContactedAt"),
            "pipelineStage": payload.get("pipelineStage") or "New",
            "emailVerified": None if "emailVerified" not in payload else (None if payload.get("emailVerified") is None else int(bool(payload.get("emailVerified")))),
            "emailVerifiedAt": payload.get("emailVerifiedAt"),
            "emailVerificationStatus": payload.get("emailVerificationStatus"),
            "emailVerificationScore": payload.get("emailVerificationScore"),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
            "deletedAt": payload.get("deletedAt"),
            "website": payload.get("website"),
            "dob": payload.get("dob"),
            "ownerId": payload.get("ownerId"),
            "addressJson": json.dumps(payload.get("address") or {}),
            "customFieldsJson": json.dumps(custom_fields),
            "optInEmail": int(payload.get("optInEmail", True)),
            "optInSms": int(payload.get("optInSms", True)),
            "optInCalls": int(payload.get("optInCalls", True)),
            "optInFlows": int(payload.get("optInFlows", True)),
            "aiEmployee": payload.get("aiEmployee"),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO contacts (
                    id, contactId, organizationId, tenantId, firstName, lastName, email, phone, company, companyId,
                    title, department, owner, source, status, leadScore, quality, engagement, tagsJson,
                    lastContactedAt, pipelineStage, emailVerified, emailVerifiedAt, emailVerificationStatus, emailVerificationScore,
                    createdAt, updatedAt, deletedAt, website, dob, ownerId,
                    addressJson, customFieldsJson, optInEmail, optInSms, optInCalls, optInFlows, aiEmployee
                ) VALUES (
                    :id, :contactId, :organizationId, :tenantId, :firstName, :lastName, :email, :phone, :company, :companyId,
                    :title, :department, :owner, :source, :status, :leadScore, :quality, :engagement, :tagsJson,
                    :lastContactedAt, :pipelineStage, :emailVerified, :emailVerifiedAt, :emailVerificationStatus, :emailVerificationScore,
                    :createdAt, :updatedAt, :deletedAt, :website, :dob, :ownerId,
                    :addressJson, :customFieldsJson, :optInEmail, :optInSms, :optInCalls, :optInFlows, :aiEmployee
                )
                """,
                record,
            )
            conn.commit()
        return self._contact_from_row(record)

    def update_contact(self, contact_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        allowed_scalar = {
            "firstName", "lastName", "email", "phone", "company", "companyId", "title", "department",
            "owner", "source", "status", "leadScore", "quality", "engagement", "lastContactedAt",
            "pipelineStage", "deletedAt", "website", "dob", "ownerId", "aiEmployee",
            "emailVerified", "emailVerifiedAt", "emailVerificationStatus", "emailVerificationScore"
        }
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM contacts WHERE id = ? AND tenantId = ?", (contact_id, self._tenantId())).fetchone()
            if not existing:
                raise ValueError("Contact not found")
            existing_contact = self._contact_from_row(dict(existing))
            payload = {}
            for key in allowed_scalar:
                if key in updates:
                    if key == "emailVerified":
                        payload[key] = None if updates[key] is None else int(bool(updates[key]))
                    else:
                        payload[key] = updates[key]
            if "email" in updates:
                next_email = str(updates.get("email") or "").strip().lower()
                current_email = str(existing["email"] or "").strip().lower()
                if next_email != current_email:
                    payload["emailVerified"] = None
                    payload["emailVerifiedAt"] = None
                    payload["emailVerificationStatus"] = None
                    payload["emailVerificationScore"] = None
            if "tags" in updates:
                payload["tagsJson"] = json.dumps([str(t).strip().upper() for t in (updates.get("tags") or [])])
            if "address" in updates:
                payload["addressJson"] = json.dumps(updates.get("address") or {})
            if "customFields" in updates:
                payload["customFieldsJson"] = json.dumps(updates.get("customFields") or {})
            for key in ["optInEmail", "optInSms", "optInCalls", "optInFlows"]:
                if key in updates:
                    payload[key] = int(bool(updates[key]))
            next_custom_fields = updates.get("customFields", existing_contact.get("customFields") or {})
            next_display_name = str(updates.get("displayName") or next_custom_fields.get("displayName") or "").strip()
            next_first_name = str(payload.get("firstName", existing_contact.get("firstName")) or "").strip()
            next_last_name = str(payload.get("lastName", existing_contact.get("lastName")) or "").strip()
            next_email = str(payload.get("email", existing_contact.get("email")) or "").strip().lower()
            next_phone = str(payload.get("phone", existing_contact.get("phone")) or "").strip()
            if not any([next_display_name, next_first_name, next_last_name, next_email, next_phone]):
                raise ValueError("A contact requires a name, email, or phone number.")
            if not payload:
                return self._contact_from_row(dict(existing))
            payload["updatedAt"] = utcnow()
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(f"UPDATE contacts SET {assignments} WHERE id = ? AND tenantId = ?", (*payload.values(), contact_id, self._tenantId()))
            conn.commit()
            refreshed = conn.execute("SELECT * FROM contacts WHERE id = ? AND tenantId = ?", (contact_id, self._tenantId())).fetchone()
        return self._contact_from_row(dict(refreshed))

    def delete_contact(self, contact_id: str) -> None:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM contacts WHERE id = ? AND tenantId = ?", (contact_id, self._tenantId())).fetchone()
            if not existing:
                raise ValueError("Contact not found")
            conn.execute("UPDATE contacts SET deletedAt = ? WHERE id = ? AND tenantId = ?", (utcnow(), contact_id, self._tenantId()))
            conn.commit()

    def bulk_delete_contacts(self, contact_ids: list[str]) -> dict[str, Any]:
        deleted = 0
        now = utcnow()
        with self._connect() as conn:
            for contact_id in contact_ids:
                result = conn.execute("UPDATE contacts SET deletedAt = ? WHERE id = ? AND tenantId = ?", (now, contact_id, self._tenantId()))
                deleted += result.rowcount
            conn.commit()
        return {"deleted": deleted, "requested": len(contact_ids)}

    def restore_contact(self, contact_id: str) -> None:
        with self._connect() as conn:
            result = conn.execute("UPDATE contacts SET deletedAt = NULL WHERE id = ? AND tenantId = ?", (contact_id, self._tenantId()))
            if result.rowcount == 0:
                raise ValueError("Contact not found")
            conn.commit()

    def list_deleted_contacts(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM contacts WHERE tenantId = ? AND deletedAt IS NOT NULL ORDER BY updatedAt DESC")
        return [self._contact_from_row(row) for row in rows]

    def list_companies(self) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM companies WHERE tenantId = ? ORDER BY name ASC")

    def get_company(self, company_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM companies WHERE id = ? AND tenantId = ?",
                (company_id, self._tenantId()),
            ).fetchone()
        if row:
            d = dict(row)
            bp = d.get("brandProfile") or d.get("brand_profile")
            if isinstance(bp, str) and bp.strip():
                try:
                    d["brandProfile"] = json.loads(bp)
                except Exception:
                    d["brandProfile"] = None
            return d
        return None

    def update_company(self, company_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = self.get_company(company_id)
        if not existing:
            raise ValueError(f"Company {company_id} not found.")
        bp = payload.get("brandProfile") or payload.get("brand_profile")
        if isinstance(bp, dict):
            bp = json.dumps(bp)
        fields = {}
        for key in ["name", "industry", "size", "website", "owner", "brandProfile"]:
            snake = key.replace("brandProfile", "brand_profile")
            if key in payload and payload[key] is not None:
                fields[key if key != "brandProfile" else "brand_profile"] = payload[key]
        if not fields:
            return existing
        fields["updatedAt"] = utcnow()
        assignments = ", ".join(f"{k} = ?" for k in fields.keys())
        with self._connect() as conn:
            conn.execute(
                f"UPDATE companies SET {assignments} WHERE id = ? AND tenantId = ?",
                (*fields.values(), company_id, self._tenantId()),
            )
            conn.commit()
        return self.get_company(company_id)

    def list_tags(self) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM tags WHERE tenantId = ? ORDER BY name ASC")

    def get_tag_by_name(self, name: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM tags WHERE UPPER(name) = UPPER(?) AND tenantId = ?",
                (name, self._tenantId()),
            ).fetchone()
        return dict(row) if row else None

    # DO NOT change tag casing rules locally. Tag casing contract is UPPERCASE system-wide.
    # Any new tag path must reuse this normalization or follow the UPPERCASE contract.
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
            "tenantId": self._tenantId(),
            "name": name,
            "prefix": prefix,
            "label": payload.get("label") or name.split(":", 1)[-1].title(),
            "description": payload.get("description") or "",
            "type": payload.get("type", "user"),
            "is_locked": 1 if payload.get("is_locked") else 0,
            "color": payload.get("color") or "#6b7280",
            "usage_count": 0,
            "createdAt": now,
        }

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO tags (id, tenantId, name, prefix, label, description, type, is_locked, color, usage_count, createdAt)
                VALUES (:id, :tenantId, :name, :prefix, :label, :description, :type, :is_locked, :color, :usage_count, :createdAt)
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
            conn.execute(f"UPDATE tags SET {set_clause} WHERE id = :id AND tenantId = :tenantId", {**payload, "id": tag_id, "tenantId": self._tenantId()})
        return self._get_tag(tag_id)

    def delete_tag(self, tag_id: str) -> None:
        tag = self._get_tag(tag_id)
        if not tag:
            return
        if tag.get("is_locked") or tag.get("type") == "system":
            raise ValueError("System tags cannot be deleted.")

        with self._connect() as conn:
            conn.execute("DELETE FROM tags WHERE id = ? AND tenantId = ?", (tag_id, self._tenantId()))
            conn.execute("DELETE FROM brain_item_tags WHERE tag_id = ? AND tenantId = ?", (tag_id, self._tenantId()))

    def _get_tag(self, tag_id: str) -> dict[str, Any] | None:
        # _tenant_rows appends tenantId as last param; include it explicitly here
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM tags WHERE id = ? AND tenantId = ?",
                (tag_id, self._tenantId()),
            ).fetchone()
        return dict(row) if row else None

    def get_tags_by_prefix(self, prefix: str) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM tags WHERE prefix = ? AND tenantId = ?", (prefix.upper(),))

    def seed_canonical_tags(self, conn: sqlite3.Connection = None) -> None:
        now = utcnow()
        tenantId = self._default_tenantId()
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
                existing = db_conn.execute("SELECT id FROM tags WHERE name = ? AND tenantId = ?", (name, tenantId)).fetchone()
                if not existing:
                    db_conn.execute(
                        """
                        INSERT INTO tags (id, tenantId, name, prefix, label, description, type, isLocked, color, usageCount, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (f"tag-{unique_suffix()}", tenantId, name, prefix, label, desc, ttype, locked, color, 0, now),
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
                    id, runId, intent, agentName, agentId, toolName, 
                    status, errorCategory, recoveryAttempted, recoverySuccess, durationMs
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
                SELECT agentName, status, recoverySuccess, durationMs
                FROM ai_step_outcomes
                WHERE intent = ?
                ORDER BY createdAt DESC
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

    @staticmethod
    def _brain_profile_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        return {
            "id": record.get("id"),
            "tenantId": record.get("tenantId"),
            "company_name": record.get("companyName"),
            "website": record.get("website"),
            "industry": record.get("industry"),
            "overview": record.get("overview"),
            "mission": record.get("mission"),
            "brand_voice": record.get("brandVoice"),
            "ideal_customer": record.get("idealCustomer"),
            "value_prop": record.get("valueProp"),
            "differentiation": record.get("differentiation"),
            "pain_points": record.get("painPoints"),
            "competitors": record.get("competitors"),
            "marketing_strategy": record.get("marketingStrategy"),
            "workflow": record.get("workflow"),
            "legal_entity": record.get("legalEntity"),
            "primary_brand": record.get("primaryBrand"),
            "brand_architecture": record.get("brandArchitecture"),
            "legacy_brand_notes": record.get("legacyBrandNotes"),
            "brand_usage_rules": record.get("brandUsageRules"),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    @staticmethod
    def _brain_source_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        return {
            "id": record.get("id"),
            "tenantId": record.get("tenantId"),
            "label": record.get("label"),
            "source_type": record.get("sourceType"),
            "status": record.get("status"),
            "location": record.get("location"),
            "notes": record.get("notes"),
            "metadata": json_loads(record.get("metadataJson"), {}),
            "graph_x": record.get("graphX"),
            "graph_y": record.get("graphY"),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    @staticmethod
    def _brain_item_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        return {
            "id": record.get("id"),
            "tenantId": record.get("tenantId"),
            "title": record.get("title"),
            "category": record.get("category"),
            "content": record.get("content"),
            "source_id": record.get("sourceId"),
            "status": record.get("status"),
            "tags": json_loads(record.get("tagsJson"), []),
            "metadata": json_loads(record.get("metadataJson"), {}),
            "graph_x": record.get("graphX"),
            "graph_y": record.get("graphY"),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    @staticmethod
    def _brain_link_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        return {
            "id": record.get("id"),
            "tenantId": record.get("tenantId"),
            "from_type": record.get("fromType"),
            "from_id": record.get("fromId"),
            "to_type": record.get("toType"),
            "to_id": record.get("toId"),
            "relationship_type": record.get("relationshipType"),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    @staticmethod
    def _brain_ingest_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        return {
            "id": record.get("id"),
            "tenantId": record.get("tenantId"),
            "source_id": record.get("sourceId"),
            "ingest_type": record.get("ingestType"),
            "status": record.get("status"),
            "title": record.get("title"),
            "location": record.get("location"),
            "content_excerpt": record.get("contentExcerpt"),
            "content_length": record.get("contentLength"),
            "chunk_count": record.get("chunkCount"),
            "error": record.get("error"),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    @staticmethod
    def _brain_chunk_record(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        record = dict(row)
        return {
            "id": record.get("id"),
            "tenantId": record.get("tenantId"),
            "source_id": record.get("sourceId"),
            "ingest_id": record.get("ingestId"),
            "ordinal": record.get("ordinal"),
            "title": record.get("title"),
            "content": record.get("content"),
            "content_excerpt": record.get("contentExcerpt"),
            "tokens": record.get("tokens"),
            "vector_json": record.get("vectorJson"),
            "createdAt": record.get("createdAt"),
            "updatedAt": record.get("updatedAt"),
        }

    def get_brain_profile(self) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM brain_profiles WHERE tenantId = ? ORDER BY updatedAt DESC LIMIT 1",
                (self._tenantId(),),
            ).fetchone()
        if row:
            return self._brain_profile_record(row)
        now = utcnow()
        profile = {
            "id": f"brain-profile-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "company_name": "",
            "website": "",
            "industry": "",
            "overview": "",
            "mission": "",
            "brand_voice": "",
            "ideal_customer": "",
            "value_prop": "",
            "differentiation": "",
            "pain_points": "",
            "competitors": "",
            "marketing_strategy": "",
            "workflow": "",
            "legal_entity": "",
            "primary_brand": "",
            "brand_architecture": "",
            "legacy_brand_notes": "",
            "brand_usage_rules": "",
            "createdAt": now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brain_profiles (
                    id, tenantId, companyName, website, industry, overview, mission, brandVoice, idealCustomer,
                    valueProp, differentiation, painPoints, competitors, marketingStrategy, workflow,
                    legalEntity, primaryBrand, brandArchitecture, legacyBrandNotes, brandUsageRules,
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    profile["id"],
                    profile["tenantId"],
                    profile["company_name"],
                    profile["website"],
                    profile["industry"],
                    profile["overview"],
                    profile["mission"],
                    profile["brand_voice"],
                    profile["ideal_customer"],
                    profile["value_prop"],
                    profile["differentiation"],
                    profile["pain_points"],
                    profile["competitors"],
                    profile["marketing_strategy"],
                    profile["workflow"],
                    profile["legal_entity"],
                    profile["primary_brand"],
                    profile["brand_architecture"],
                    profile["legacy_brand_notes"],
                    profile["brand_usage_rules"],
                    profile["createdAt"],
                    profile["updatedAt"],
                ),
            )
            conn.commit()
        return profile

    def update_brain_profile(self, updates: dict[str, Any]) -> dict[str, Any]:
        existing = self.get_brain_profile()
        payload = {}
        for key in ["company_name", "website", "industry", "overview", "mission", "brand_voice", "ideal_customer",
                     "value_prop", "differentiation", "pain_points", "competitors", "marketing_strategy", "workflow",
                     "legal_entity", "primary_brand", "brand_architecture", "legacy_brand_notes", "brand_usage_rules"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        if not payload:
            return existing
        assignments_map = {
            "company_name": "companyName",
            "website": "website",
            "industry": "industry",
            "overview": "overview",
            "mission": "mission",
            "brand_voice": "brandVoice",
            "ideal_customer": "idealCustomer",
            "value_prop": "valueProp",
            "differentiation": "differentiation",
            "pain_points": "painPoints",
            "competitors": "competitors",
            "marketing_strategy": "marketingStrategy",
            "workflow": "workflow",
            "legal_entity": "legalEntity",
            "primary_brand": "primaryBrand",
            "brand_architecture": "brandArchitecture",
            "legacy_brand_notes": "legacyBrandNotes",
            "brand_usage_rules": "brandUsageRules",
            "updatedAt": "updatedAt",
        }
        payload["updatedAt"] = utcnow()
        assignments = ", ".join(f"{assignments_map[key]} = ?" for key in payload.keys())
        with self._connect() as conn:
            conn.execute(
                f"UPDATE brain_profiles SET {assignments} WHERE id = ? AND tenantId = ?",
                (*payload.values(), existing["id"], self._tenantId()),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM brain_profiles WHERE id = ? AND tenantId = ?",
                (existing["id"], self._tenantId()),
            ).fetchone()
        return self._brain_profile_record(refreshed)

    def list_brain_sources(self) -> list[dict[str, Any]]:
        return [
            self._brain_source_record(row)
            for row in self._tenant_rows("SELECT * FROM brain_sources WHERE tenantId = ? ORDER BY updatedAt DESC")
        ]

    def create_brain_source(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"brain-source-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "label": payload.get("label") or "New Source",
            "source_type": payload.get("source_type") or "document",
            "status": payload.get("status") or "draft",
            "location": payload.get("location") or "",
            "notes": payload.get("notes") or "",
            "metadata_json": json.dumps(clone_json(payload.get("metadata") or {})),
            "graph_x": payload.get("graph_x"),
            "graph_y": payload.get("graph_y"),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brain_sources (
                    id, tenantId, label, sourceType, status, location, notes, metadataJson, graphX, graphY, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["label"],
                    record["source_type"],
                    record["status"],
                    record["location"],
                    record["notes"],
                    record["metadata_json"],
                    record["graph_x"],
                    record["graph_y"],
                    record["createdAt"],
                    record["updatedAt"],
                ),
            )
            conn.commit()
        return {
            **record,
            "metadata": json_loads(record["metadata_json"], {}),
        }

    def update_brain_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["label", "source_type", "status", "location", "notes", "graph_x", "graph_y"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        if "metadata" in updates and updates["metadata"] is not None:
            payload["metadata_json"] = json.dumps(clone_json(updates.get("metadata") or {}))
        if not payload:
            existing = next((item for item in self.list_brain_sources() if item["id"] == source_id), None)
            if not existing:
                raise ValueError("Brain source not found")
            return existing
        assignments_map = {
            "label": "label",
            "source_type": "sourceType",
            "status": "status",
            "location": "location",
            "notes": "notes",
            "metadata_json": "metadataJson",
            "graph_x": "graphX",
            "graph_y": "graphY",
            "updatedAt": "updatedAt",
        }
        payload["updatedAt"] = utcnow()
        assignments = ", ".join(f"{assignments_map[key]} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM brain_sources WHERE id = ? AND tenantId = ?",
                (source_id, self._tenantId()),
            ).fetchone()
            if not row:
                raise ValueError("Brain source not found")
            conn.execute(
                f"UPDATE brain_sources SET {assignments} WHERE id = ? AND tenantId = ?",
                (*payload.values(), source_id, self._tenantId()),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM brain_sources WHERE id = ? AND tenantId = ?",
                (source_id, self._tenantId()),
            ).fetchone()
        return self._brain_source_record(refreshed)

    def delete_brain_source(self, source_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE brain_items SET sourceId = NULL, updatedAt = ? WHERE tenantId = ? AND sourceId = ?",
                (utcnow(), self._tenantId(), source_id),
            )
            conn.execute(
                "DELETE FROM brain_chunks WHERE tenantId = ? AND sourceId = ?",
                (self._tenantId(), source_id),
            )
            conn.execute(
                "DELETE FROM brain_ingests WHERE tenantId = ? AND sourceId = ?",
                (self._tenantId(), source_id),
            )
            conn.execute(
                "DELETE FROM brain_links WHERE tenantId = ? AND ((fromType = 'source' AND fromId = ?) OR (toType = 'source' AND toId = ?))",
                (self._tenantId(), source_id, source_id),
            )
            conn.execute(
                "DELETE FROM brain_sources WHERE id = ? AND tenantId = ?",
                (source_id, self._tenantId()),
            )
            conn.commit()

    def list_brain_items(self, limit: int | None = None, tenantId: str | None = None) -> list[dict[str, Any]]:
        target_tenant = tenantId or self._tenantId()
        query = "SELECT * FROM brain_items WHERE tenantId = ? ORDER BY updatedAt DESC"
        if limit:
            query += f" LIMIT {limit}"
        rows = self._rows(query, (target_tenant,))
        return [self._brain_item_record(row) for row in rows]

    def create_brain_item(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": payload.get("id") or f"brain-item-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "title": payload.get("title") or "New Knowledge Item",
            "category": payload.get("category") or "note",
            "content": payload.get("content") or "",
            "source_id": payload.get("source_id"),
            "status": payload.get("status") or "draft",
            "tags_json": json.dumps([str(t).strip().upper() for t in (payload.get("tags") or [])]),
            "metadata_json": json.dumps(clone_json(payload.get("metadata") or {})),
            "graph_x": payload.get("graph_x"),
            "graph_y": payload.get("graph_y"),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO brain_items (
                    id, tenantId, title, category, content, sourceId, status, tagsJson, metadataJson, graphX, graphY, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["title"],
                    record["category"],
                    record["content"],
                    record["source_id"],
                    record["status"],
                    record["tags_json"],
                    record["metadata_json"],
                    record["graph_x"],
                    record["graph_y"],
                    record["createdAt"],
                    record["updatedAt"],
                ),
            )
            conn.commit()
        return {
            **record,
            "tags": json_loads(record["tags_json"], []),
            "metadata": json_loads(record["metadata_json"], {}),
        }

    def update_brain_item(self, item_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["title", "category", "content", "source_id", "status", "graph_x", "graph_y"]:
            if key in updates and updates[key] is not None:
                payload[key] = updates[key]
        if "tags" in updates:
            payload["tags_json"] = json.dumps(updates.get("tags") or [])
        if "metadata" in updates and updates["metadata"] is not None:
            payload["metadata_json"] = json.dumps(clone_json(updates.get("metadata") or {}))
        if not payload:
            existing = next((item for item in self.list_brain_items() if item["id"] == item_id), None)
            if not existing:
                raise ValueError("Brain item not found")
            return existing
        assignments_map = {
            "title": "title",
            "category": "category",
            "content": "content",
            "source_id": "sourceId",
            "status": "status",
            "graph_x": "graphX",
            "graph_y": "graphY",
            "tags_json": "tagsJson",
            "metadata_json": "metadataJson",
            "updatedAt": "updatedAt",
        }
        payload["updatedAt"] = utcnow()
        assignments = ", ".join(f"{assignments_map[key]} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM brain_items WHERE id = ? AND tenantId = ?",
                (item_id, self._tenantId()),
            ).fetchone()
            if not row:
                raise ValueError("Brain item not found")
            conn.execute(
                f"UPDATE brain_items SET {assignments} WHERE id = ? AND tenantId = ?",
                (*payload.values(), item_id, self._tenantId()),
            )
            conn.commit()
            refreshed = conn.execute(
                "SELECT * FROM brain_items WHERE id = ? AND tenantId = ?",
                (item_id, self._tenantId()),
            ).fetchone()
        return self._brain_item_record(refreshed)
    def delete_brain_item(self, item_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM brain_links WHERE tenantId = ? AND ((fromType = 'item' AND fromId = ?) OR (toType = 'item' AND toId = ?))",
                (self._tenantId(), item_id, item_id),
            )
            conn.execute(
                "DELETE FROM brain_items WHERE id = ? AND tenantId = ?",
                (item_id, self._tenantId()),
            )
            conn.commit()

    def save_brain_chunks(self, chunks: list[dict[str, Any]]) -> None:
        now = utcnow()
        with self._connect() as conn:
            for chunk in chunks:
                conn.execute(
                    """
                    INSERT INTO brain_chunks (
                        id, tenantId, sourceId, ingestId, ordinal, title, content, contentExcerpt, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk.get("id") or f"chunk-{unique_suffix()}",
                        self._tenantId(),
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
            rows = self._rows(
                "SELECT * FROM brain_chunks WHERE tenantId = ? AND ingestId = ?",
                (self._tenantId(), ingest_id),
            )
        else:
            rows = self._rows("SELECT * FROM brain_chunks WHERE tenantId = ?", (self._tenantId(),))
        return [self._brain_chunk_record(row) for row in rows]

    # --- Help Desk Methods ---

    def list_help_tickets(self, userId: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM help_tickets WHERE tenantId = ?"
        params = []
        if userId:
            query += " AND userId = ?"
            params.append(userId)
        query += " ORDER BY createdAt DESC"
        return self._tenant_rows(query, tuple(params))

    def create_help_ticket(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": f"ticket-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "userId": payload.get("userId"),
            "subject": payload.get("subject") or "No Subject",
            "content": payload.get("content") or "",
            "status": payload.get("status") or "open",
            "priority": payload.get("priority") or "normal",
            "category": payload.get("category") or "general",
            "createdAt": now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO help_tickets (
                    id, tenantId, userId, subject, content, status, priority, category, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["userId"],
                    record["subject"],
                    record["content"],
                    record["status"],
                    record["priority"],
                    record["category"],
                    record["createdAt"],
                    record["updatedAt"],
                ),
            )
            conn.commit()
        return record

    def update_help_ticket(self, ticket_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        updates["updatedAt"] = utcnow()
        keys = [k for k in updates.keys() if k in ["subject", "content", "status", "priority", "category", "updatedAt"]]
        if not keys:
            return next((t for t in self.list_help_tickets() if t["id"] == ticket_id), {})
        assignments = ", ".join(f"{k} = ?" for k in keys)
        with self._connect() as conn:
            conn.execute(
                f"UPDATE help_tickets SET {assignments} WHERE id = ? AND tenantId = ?",
                (*[updates[k] for k in keys], ticket_id, self._tenantId()),
            )
            conn.commit()
            row = conn.execute(
                "SELECT * FROM help_tickets WHERE id = ? AND tenantId = ?",
                (ticket_id, self._tenantId()),
            ).fetchone()
            return dict(row) if row else {}

    def list_broadcast_messages(self, active_only: bool = True) -> list[dict[str, Any]]:
        query = "SELECT * FROM broadcast_messages WHERE tenantId = ?"
        if active_only:
            query += " AND is_active = 1"
        query += " ORDER BY createdAt DESC"
        return self._tenant_rows(query)

    def create_broadcast_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        record = {
            "id": f"broadcast-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "type": payload.get("type") or "info",
            "message": payload.get("message") or "",
            "is_active": payload.get("is_active") if "is_active" in payload else 1,
            "createdAt": now,
            "expires_at": payload.get("expires_at"),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO broadcast_messages (
                    id, tenantId, type, message, is_active, createdAt, expires_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["type"],
                    record["message"],
                    record["is_active"],
                    record["createdAt"],
                    record["expires_at"],
                ),
            )
            conn.commit()
        return record

    # --- End Help Desk Methods ---

    def list_brain_links(self, limit: int | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM brain_links WHERE tenantId = ? ORDER BY updatedAt DESC"
        if limit:
            query += f" LIMIT {limit}"
        return [self._brain_link_record(row) for row in self._tenant_rows(query)]

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
                WHERE tenantId = ? AND fromType = ? AND fromId = ? AND toType = ? AND toId = ?
                LIMIT 1
                """,
                (self._tenantId(), from_type, from_id, to_type, to_id),
            ).fetchone()
            if existing:
                return self._brain_link_record(existing)
            now = utcnow()
            record = {
                "id": payload.get("id") or f"brain-link-{unique_suffix()}",
                "tenantId": self._tenantId(),
                "from_type": from_type,
                "from_id": from_id,
                "to_type": to_type,
                "to_id": to_id,
                "relationship_type": relationship_type,
                "createdAt": now,
                "updatedAt": now,
            }
            conn.execute(
                """
                INSERT INTO brain_links (
                    id, tenantId, fromType, fromId, toType, toId, relationshipType, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["from_type"],
                    record["from_id"],
                    record["to_type"],
                    record["to_id"],
                    record["relationship_type"],
                    record["createdAt"],
                    record["updatedAt"],
                ),
            )
            conn.commit()
        return record

    def delete_brain_link(self, link_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM brain_links WHERE id = ? AND tenantId = ?",
                (link_id, self._tenantId()),
            )
            conn.commit()

    def list_brain_ingests(self, source_id: str | None = None, limit: int = 25) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if source_id:
                rows = conn.execute(
                    "SELECT * FROM brain_ingests WHERE tenantId = ? AND sourceId = ? ORDER BY createdAt DESC LIMIT ?",
                    (self._tenantId(), source_id, max(1, limit)),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM brain_ingests WHERE tenantId = ? ORDER BY createdAt DESC LIMIT ?",
                    (self._tenantId(), max(1, limit)),
                ).fetchall()
        return [self._brain_ingest_record(row) for row in rows]

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
                    "SELECT * FROM brain_sources WHERE id = ? AND tenantId = ?",
                    (source_id, self._tenantId()),
                ).fetchone()
                if not source_row:
                    raise ValueError("Brain source not found")
                updates = {}
                for key in ["label", "source_type", "location", "notes"]:
                    if key in payload and payload.get(key) is not None:
                        updates[key] = payload.get(key)
                if "metadata" in payload and payload.get("metadata") is not None:
                    updates["metadata_json"] = json.dumps(clone_json(payload.get("metadata") or {}))
                updates["status"] = payload.get("status") or "ready"
                updates["updatedAt"] = now
                assignments_map = {
                    "label": "label",
                    "source_type": "sourceType",
                    "location": "location",
                    "notes": "notes",
                    "metadata_json": "metadataJson",
                    "status": "status",
                    "updatedAt": "updatedAt",
                }
                assignments = ", ".join(f"{assignments_map[key]} = ?" for key in updates.keys())
                conn.execute(
                    f"UPDATE brain_sources SET {assignments} WHERE id = ? AND tenantId = ?",
                    (*updates.values(), source_id, self._tenantId()),
                )
            else:
                source_id = payload.get("id") or f"brain-source-{unique_suffix()}"
                source_record = {
                    "id": source_id,
                    "tenantId": self._tenantId(),
                    "label": payload.get("label") or payload.get("title") or "Ingested Source",
                    "source_type": payload.get("source_type") or "document",
                    "status": payload.get("status") or "ready",
                    "location": payload.get("location") or "",
                    "notes": payload.get("notes") or "",
                    "metadata_json": json.dumps(clone_json(payload.get("metadata") or {})),
                    "graph_x": payload.get("graph_x"),
                    "graph_y": payload.get("graph_y"),
                    "createdAt": now,
                    "updatedAt": now,
                }
                conn.execute(
                    """
                    INSERT INTO brain_sources (
                        id, tenantId, label, sourceType, status, location, notes, metadataJson, graphX, graphY, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        source_record["id"],
                        source_record["tenantId"],
                        source_record["label"],
                        source_record["source_type"],
                        source_record["status"],
                        source_record["location"],
                        source_record["notes"],
                        source_record["metadata_json"],
                        source_record["graph_x"],
                        source_record["graph_y"],
                        source_record["createdAt"],
                        source_record["updatedAt"],
                    ),
                )
            source = dict(
                conn.execute(
                    "SELECT * FROM brain_sources WHERE id = ? AND tenantId = ?",
                    (source_id, self._tenantId()),
                ).fetchone()
            )
            
            # --- Auto-Item Creation ---
            if payload.get("create_item"):
                item_id = f"brain-item-{unique_suffix()}"
                item_record = {
                    "id": item_id,
                    "tenantId": self._tenantId(),
                    "title": f"Summary: {source['label']}",
                    "category": payload.get("category") or ("brand" if source["sourceType"] == "profile" else "note"),
                    "content": payload.get("item_content") or summarize_excerpt(content, limit=500),
                    "source_id": source_id,
                    "status": "ready",
                    "tags_json": json.dumps(payload.get("tags") or ["auto-ingest"]),
                    "metadata_json": json.dumps(clone_json(payload.get("metadata") or {})),
                    "graph_x": payload.get("graph_x") + 100 if payload.get("graph_x") else None,
                    "graph_y": payload.get("graph_y") + 100 if payload.get("graph_y") else None,
                    "createdAt": now,
                    "updatedAt": now,
                }
                conn.execute(
                    """
                    INSERT INTO brain_items (
                        id, tenantId, title, category, content, sourceId, status, tagsJson, metadataJson, graphX, graphY, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item_record["id"],
                        item_record["tenantId"],
                        item_record["title"],
                        item_record["category"],
                        item_record["content"],
                        item_record["source_id"],
                        item_record["status"],
                        item_record["tags_json"],
                        item_record["metadata_json"],
                        item_record["graph_x"],
                        item_record["graph_y"],
                        item_record["createdAt"],
                        item_record["updatedAt"],
                    ),
                )

            chunks = chunk_text_content(content)
            if not chunks:
                raise ValueError("Unable to create Brain chunks from this ingest.")
            ingest = {
                "id": payload.get("ingest_id") or f"brain-ingest-{unique_suffix()}",
                "tenantId": self._tenantId(),
                "source_id": source_id,
                "ingest_type": payload.get("ingest_type") or "text",
                "status": "ready",
                "title": payload.get("title") or payload.get("label") or source.get("label") or "Brain ingest",
                "location": payload.get("location") or source.get("location") or "",
                "content_excerpt": summarize_excerpt(content),
                "content_length": len(content),
                "chunk_count": len(chunks),
                "error": "",
                "createdAt": now,
                "updatedAt": now,
            }
            conn.execute(
                """
                INSERT INTO brain_ingests (
                    id, tenantId, sourceId, ingestType, status, title, location, contentExcerpt, contentLength, chunkCount, error, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ingest["id"],
                    ingest["tenantId"],
                    ingest["source_id"],
                    ingest["ingest_type"],
                    ingest["status"],
                    ingest["title"],
                    ingest["location"],
                    ingest["content_excerpt"],
                    ingest["content_length"],
                    ingest["chunk_count"],
                    ingest["error"],
                    ingest["createdAt"],
                    ingest["updatedAt"],
                ),
            )
            conn.execute(
                "DELETE FROM brain_chunks WHERE tenantId = ? AND sourceId = ?",
                (self._tenantId(), source_id),
            )
            conn.executemany(
                """
                INSERT INTO brain_chunks (
                    id, tenantId, sourceId, ingestId, ordinal, title, content, contentExcerpt, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        f"chunk-{unique_suffix()}",
                        self._tenantId(),
                        source_id,
                        ingest["id"],
                        idx + 1,
                        ingest["title"],
                        chunk,
                        summarize_excerpt(chunk),
                        now,
                        now,
                    )
                    for idx, chunk in enumerate(chunks)
                ],
            )
            conn.commit()
        return {"source": self._brain_source_record(source), "ingest": ingest}

    def search_brain_memory(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        resolved_query = normalize_text_content(query)
        if not resolved_query:
            return []
        profile = self.get_brain_profile()
        sources = {source["id"]: source for source in self.list_brain_sources()}
        candidates: list[dict[str, Any]] = []
        with self._connect() as conn:
            chunk_rows = [
                self._brain_chunk_record(row)
                for row in conn.execute(
                    "SELECT * FROM brain_chunks WHERE tenantId = ? ORDER BY updatedAt DESC",
                    (self._tenantId(),),
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
            row = conn.execute("SELECT * FROM forms WHERE tenantId = ? AND (slug = ? OR id = ?)", (self._tenantId(), slug, slug)).fetchone()
        return self._form_from_row(dict(row) if row else None)

    def get_form_by_id(self, form_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM forms WHERE tenantId = ? AND id = ?", (self._tenantId(), form_id)).fetchone()
        return self._form_from_row(dict(row) if row else None)

    def list_form_folders(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM form_folders WHERE tenantId = ? ORDER BY name ASC")
        return [{**row, "expanded": bool(row.get("expanded", 1))} for row in rows]

    def create_form_folder(self, payload: dict[str, Any]) -> dict[str, Any]:
        folder = {
            "id": payload.get("id") or f"form-folder-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "name": payload.get("name") or "New Folder",
            "userId": payload.get("userId") or "1",
            "createdAt": payload.get("createdAt") or utcnow(),
            "expanded": int(bool(payload.get("expanded", True))),
        }
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO form_folders (id, tenantId, name, userId, createdAt, expanded) VALUES (?, ?, ?, ?, ?, ?)",
                (folder["id"], folder["tenantId"], folder["name"], folder["userId"], folder["createdAt"], folder["expanded"]),
            )
            conn.commit()
        return {**folder, "expanded": bool(folder["expanded"])}

    def update_form_folder(self, folder_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["name", "userId"]:
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
            row = conn.execute("SELECT id FROM form_folders WHERE id = ? AND tenantId = ?", (folder_id, self._tenantId())).fetchone()
            if not row:
                raise ValueError("Form folder not found")
            conn.execute(f"UPDATE form_folders SET {assignments} WHERE id = ? AND tenantId = ?", (*payload.values(), folder_id, self._tenantId()))
            conn.commit()
        return next(folder for folder in self.list_form_folders() if folder["id"] == folder_id)

    def list_forms(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM forms WHERE tenantId = ? ORDER BY updatedAt DESC")
        return [self._form_from_row(row) for row in rows]

    def list_forms_summary(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT id, name, folderId, slug, status, isActive, responsesCount, lastActive, lastModifiedBy, creator, createdAt, updatedAt, schemaJson, pagesJson FROM forms WHERE tenantId = ? ORDER BY updatedAt DESC")
        return [self._form_summary_from_row(row) for row in rows]

    def _form_summary_from_row(self, row: dict[str, Any] | None) -> dict[str, Any] | None:
        if row is None:
            return None
        schema = self._normalize_form_schema(json_loads(row.get("schemaJson"), []))
        pages = json_loads(row.get("pagesJson"), [])
        field_count = len(schema) + sum(len(p.get("fields", [])) for p in pages)
        return {
            "id": row["id"],
            "name": row["name"],
            "folderId": row.get("folderId"),
            "slug": row["slug"],
            "status": row.get("status") or ("Active" if row.get("isActive") else "Draft"),
            "isActive": bool(row["isActive"]),
            "responsesCount": row["responsesCount"],
            "lastActive": row.get("lastActive"),
            "lastModifiedBy": row.get("lastModifiedBy"),
            "creator": row.get("creator"),
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
            "lastModifiedAt": row["updatedAt"],
            "fieldCount": field_count,
        }

    def create_form(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        settings = self._normalize_form_settings(payload.get("settings") or {})
        schema = self._normalize_form_schema(payload.get("schema") or [])
        record = {
            "id": payload.get("id") or f"form-{unique_suffix()}",
            "tenantId": self._tenantId(),
            "name": payload.get("name") or "New Untitled Form",
            "folderId": payload.get("folderId") or payload.get("folder_id") or "form-folder-default",
            "slug": payload.get("slug") or f"form-{unique_suffix()}",
            "description": payload.get("description") or "",
            "schemaJson": json.dumps(schema),
            "pagesJson": json.dumps(payload.get("pages") or [{"id": "page_1", "label": "Page 1", "fields": []}]),
            "settingsJson": json.dumps(settings),
            "status": payload.get("status") or "Draft",
            "isActive": int(bool(payload.get("isActive", payload.get("is_active", False)))),
            "responsesCount": payload.get("responsesCount", payload.get("responses_count", 0)),
            "lastActive": payload.get("lastActive", payload.get("last_active")) or "Just now",
            "lastModifiedBy": payload.get("lastModifiedBy", payload.get("last_modified_by")) or "AIO Flow",
            "creator": payload.get("creator") or "AIO Flow",
            "triggersJson": json.dumps(payload.get("triggers")),
            "automationJson": json.dumps(payload.get("automation")),
            "lastResponseAt": payload.get("lastResponseAt", payload.get("last_response_at")),
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO forms (
                    id, tenantId, name, folderId, slug, description, schemaJson, pagesJson, settingsJson, status, isActive,
                    responsesCount, lastActive, lastModifiedBy, creator, triggersJson, automationJson,
                    lastResponseAt, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"], record["tenantId"], record["name"], record["folderId"], record["slug"], record["description"],
                    record["schemaJson"], record["pagesJson"], record["settingsJson"], record["status"], record["isActive"],
                    record["responsesCount"], record["lastActive"], record["lastModifiedBy"], record["creator"],
                    record["triggersJson"], record["automationJson"], record["lastResponseAt"],
                    record["createdAt"], record["updatedAt"],
                ),
            )
            conn.commit()
        return self._form_from_row(record)

    def update_form(self, form_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        direct_keys = {
            "name": "name",
            "folderId": "folderId",
            "folder_id": "folderId",
            "slug": "slug",
            "description": "description",
            "status": "status",
            "lastActive": "lastActive",
            "last_active": "lastActive",
            "lastModifiedBy": "lastModifiedBy",
            "last_modified_by": "lastModifiedBy",
            "creator": "creator",
            "lastResponseAt": "lastResponseAt",
            "last_response_at": "lastResponseAt",
        }
        for source_key, target_key in direct_keys.items():
            if source_key in updates and updates[source_key] is not None:
                payload[target_key] = updates[source_key]
        if "schema" in updates:
            payload["schemaJson"] = json.dumps(self._normalize_form_schema(updates["schema"] or []))
        if "pages" in updates:
            payload["pagesJson"] = json.dumps(updates["pages"] or [])
        if "settings" in updates:
            payload["settingsJson"] = json.dumps(self._normalize_form_settings(updates["settings"] or {}))
        if "isActive" in updates:
            payload["isActive"] = int(bool(updates["isActive"]))
        elif "is_active" in updates:
            payload["isActive"] = int(bool(updates["is_active"]))
        if "responsesCount" in updates and updates["responsesCount"] is not None:
            payload["responsesCount"] = updates["responsesCount"]
        elif "responses_count" in updates and updates["responses_count"] is not None:
            payload["responsesCount"] = updates["responses_count"]
        if "triggers" in updates:
            payload["triggersJson"] = json.dumps(updates["triggers"])
        if "automation" in updates:
            payload["automationJson"] = json.dumps(updates["automation"])
        if not payload:
            form = self.get_form_by_id(form_id)
            if not form:
                raise ValueError("Form not found")
            return form
        payload["updatedAt"] = utcnow()
        assignments = ", ".join(f"{key} = ?" for key in payload.keys())
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM forms WHERE id = ? AND tenantId = ?", (form_id, self._tenantId())).fetchone()
            if not row:
                raise ValueError("Form not found")
            conn.execute(f"UPDATE forms SET {assignments} WHERE id = ? AND tenantId = ?", (*payload.values(), form_id, self._tenantId()))
            conn.commit()
        return self.get_form_by_id(form_id)

    def delete_form(self, form_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM forms WHERE id = ? AND tenantId = ?", (form_id, self._tenantId()))
            conn.commit()

    def bulk_delete_forms(self, form_ids: list[str]) -> dict[str, Any]:
        deleted = 0
        with self._connect() as conn:
            for form_id in form_ids:
                result = conn.execute("DELETE FROM forms WHERE id = ? AND tenantId = ?", (form_id, self._tenantId()))
                deleted += result.rowcount
            conn.commit()
        return {"deleted": deleted, "requested": len(form_ids)}

    def list_cms_tables(self) -> list[dict[str, Any]]:
        forms = self.list_forms()
        submission_counts: dict[str, int] = {}
        for row in self._tenant_rows("SELECT formId, COUNT(*) AS total FROM form_submissions WHERE tenantId = ? GROUP BY formId"):
            submission_counts[row["formId"]] = row["total"]
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
        rows = self._tenant_rows("SELECT * FROM form_submissions WHERE tenantId = ? AND formId = ? ORDER BY submittedAt DESC", (form["id"],))
        data = []
        for row in rows:
            entry = {
                "submission_id": row["id"],
                "contact_id": row.get("contact_id"),
                "created_contact": bool(row.get("created_contact")),
                "submitted_at": row.get("submitted_at"),
            }
            entry.update(json_loads(row.get("submissionJson"), {}))
            data.append(entry)
    
    def create_order(self, order_data: dict[str, Any]) -> dict[str, Any]:
        order_id = order_data.get("id") or f"order-{unique_suffix()}"
        contact_id = order_data.get("contactId")
        form_submission_id = order_data.get("formSubmissionId")
        reference_code = order_data.get("referenceCode") or f"ORD-{unique_suffix().upper()}"
        status = order_data.get("status", "active")
        total_amount = float(order_data.get("totalAmount", 0.0))
        currency = order_data.get("currency", "USD")
        payment_status = order_data.get("paymentStatus", "pending")
        payment_provider = order_data.get("paymentProvider", "unknown")
        payment_id = order_data.get("paymentId")
        items = order_data.get("items", [])
        
        conn = self._conn()
        conn.execute(
            """
            INSERT INTO orders (
                id, tenantId, contactId, formSubmissionId, referenceCode,
                status, totalAmount, currency, paymentStatus, paymentProvider,
                paymentId, itemsJson, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id, self._tenantId(), contact_id, form_submission_id, reference_code,
                status, total_amount, currency, payment_status, payment_provider,
                payment_id, json_dumps(items), utcnow(), utcnow()
            )
        )
        conn.commit()
        return self.get_order_by_id(order_id)
    
    def get_order_by_id(self, order_id: str) -> dict[str, Any] | None:
        rows = self._tenant_rows("SELECT * FROM orders WHERE id = ? AND tenantId = ?", (order_id, self._tenantId()))
        if not rows:
            return None
        entry = dict(rows[0])
        entry["items"] = json_loads(rows[0].get("itemsJson"), [])
        return entry
    
    def update_order(self, order_id: str, order_data: dict[str, Any]) -> dict[str, Any]:
        conn = self._conn()
        updates = []
        params = []
        for field in ["status", "totalAmount", "currency", "paymentStatus", "paymentProvider", "paymentId"]:
            if field in order_data:
                updates.append(f"{field} = ?")
                params.append(order_data[field])
        if "items" in order_data:
            updates.append("itemsJson = ?")
            params.append(json_dumps(order_data["items"]))
        if not updates:
            return self.get_order_by_id(order_id)
        updates.append("updatedAt = ?")
        params.append(utcnow())
        params.append(order_id)
        params.append(self._tenantId())
        conn.execute(f"UPDATE orders SET {', '.join(updates)} WHERE id = ? AND tenantId = ?", params)
        conn.commit()
        return self.get_order_by_id(order_id)
    
    def delete_order(self, order_id: str) -> bool:
        conn = self._conn()
        conn.execute("DELETE FROM orders WHERE id = ? AND tenantId = ?", (order_id, self._tenantId()))
        conn.commit()
        return True
    
    def list_orders(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM orders WHERE tenantId = ? ORDER BY createdAt DESC")
        data = []
        for row in rows:
            entry = dict(row)
            entry["items"] = json_loads(row.get("itemsJson"), [])
            data.append(entry)
        return data

    def submit_form(self, form_id: str, form_data: dict[str, Any]) -> dict[str, Any]:
        form = self.get_form_by_id(form_id)
        if not form:
            raise ValueError("Form not found")

        identifier_field = next((field for field in form["schema"] if field.get("isIdentifier")), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("mapToContact") == "email"), None)
        if not identifier_field:
            identifier_field = next((field for field in form["schema"] if field.get("type") == "email"), None)

        identifier_key = (identifier_field or {}).get("mapToContact") or "email"
        identifier_value = form_data.get(field_key(identifier_field)) if identifier_field else None
        created_contact = False

        with self._connect() as conn:
            row = conn.execute(f"SELECT * FROM contacts WHERE tenantId = ? AND {identifier_key} = ?", (self._tenantId(), identifier_value)).fetchone()
            contact_id = None

            if row:
                contact_id = row["id"]
                if form["settings"].get("updateContact"):
                    updates = {}
                    for field in form["schema"]:
                        mapped = field.get("mapToContact")
                        current_value = form_data.get(field_key(field))
                        if mapped and current_value:
                            updates[mapped] = current_value
                    if updates:
                        assignments = ", ".join(f"{key} = ?" for key in updates.keys())
                        params = tuple(updates.values()) + (utcnow(), contact_id, self._tenantId())
                        conn.execute(f"UPDATE contacts SET {assignments}, updatedAt = ? WHERE id = ? AND tenantId = ?", params)
            elif form["settings"].get("createContact"):
                contact_id = f"contact-{unique_suffix()}"
                payload = {
                    "id": contact_id,
                    "contact_id": f"CNT-{unique_suffix().upper()}",
                    "organization_id": "org-1",
                    "tenantId": self._tenantId(),
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
                    "createdAt": utcnow(),
                    "updatedAt": utcnow(),
                    "deleted_at": None,
                }
                for field in form["schema"]:
                    mapped = field.get("mapToContact")
                    current_value = form_data.get(field_key(field))
                    if mapped and current_value:
                        payload[mapped] = current_value
                conn.execute(
                    """
                    INSERT INTO contacts (
                        id, contactId, organizationId, tenantId, firstName, lastName, email, phone, company, companyId,
                        title, department, owner, source, status, leadScore, quality, engagement, tagsJson,
                        lastContactedAt, pipelineStage, createdAt, updatedAt, deletedAt
                    ) VALUES (
                        :id, :contact_id, :organization_id, :tenantId, :first_name, :last_name, :email, :phone, :company, :company_id,
                        :title, :department, :owner, :source, :status, :lead_score, :quality, :engagement, :tags_json,
                        :last_contacted_at, :pipeline_stage, :createdAt, :updatedAt, :deleted_at
                    )
                    """,
                    payload,
                )
                created_contact = True

            submission_id = f"submission-{unique_suffix()}"
            conn.execute(
                "INSERT INTO form_submissions (id, tenantId, formId, contactId, submissionJson, createdContact, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (submission_id, self._tenantId(), form_id, contact_id, json_dumps(form_data), int(created_contact), utcnow()),
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
                        id, tenantId, contactId, formSubmissionId, referenceCode,
                        status, totalAmount, currency, paymentStatus, paymentProvider,
                        paymentId, itemsJson, createdAt, updatedAt
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                    )
                    """,
                    (
                        order_id, self._tenantId(), contact_id, submission_id, f"ORD-{unique_suffix().upper()}",
                        "active", total_amount, "USD", payment_status, payment_provider,
                        payment_id, json_dumps(items), utcnow(), utcnow()
                    )
                )

            conn.execute(
                "UPDATE forms SET responsesCount = responsesCount + 1, lastResponseAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                (utcnow(), utcnow(), form_id, self._tenantId()),
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

        try:
            from orchestration import emit_system_event
            emit_system_event(
                self,
                {
                    "type": "form_submitted",
                    "payload": {
                        "form_id": form_id,
                        "form_name": form.get("name"),
                        "submission_id": submission_id,
                        "contact_id": contact_id,
                        "form_data": form_data,
                    },
                    "meta": {"depth": 0},
                },
                actor={},
                tenant={"id": self._tenantId()},
                provider_config=None,
            )
        except Exception:
            pass

        return {"success": True, "contactId": contact_id, "created": created_contact, "submissionId": submission_id}

    def list_contact_activities(self, contactId: str) -> list[dict[str, Any]]:
        activities: list[dict[str, Any]] = []
        rows = self._rows(
            """
            SELECT * FROM contact_activities
            WHERE tenantId = ? AND contactId = ?
            ORDER BY createdAt DESC
            """,
            (self._tenantId(), contactId),
        )
        for row in rows:
            activities.append(
                {
                    **row,
                    "metadata": json_loads(row.pop("metadataJson"), {}),
                }
            )
        for thread in self._get_thread_context():
            if thread["contactId"] != contactId:
                continue
            for message in thread["messages"]:
                direction = message.get("direction")
                title = f"{thread['channelType'].upper()} {'received' if direction == 'inbound' else 'sent' if direction == 'outbound' else 'logged'}"
                activities.append(
                    {
                        "id": f"thread-activity-{message['id']}",
                        "contactId": contactId,
                        "userId": "user-1",
                        "activityType": "email" if thread["channelType"] == "email" else "sms" if thread["channelType"] == "sms" else "note",
                        "title": title,
                        "description": message.get("plainText") or message.get("body") or "",
                        "metadata": {
                            "threadId": thread["id"],
                            "channelType": thread["channelType"],
                            "subject": thread["subject"],
                            "aiPriority": thread.get("aiPriority"),
                        },
                        "createdAt": message["createdAt"],
                    }
                )
            for action in thread.get("actions", []):
                if action.get("status") != "completed":
                    continue
                if action.get("actionType") not in {"create-deal", "advance-stage", "schedule-meeting", "calendar-event-updated"}:
                    continue
                activities.append(
                    {
                        "id": action["id"],
                        "contactId": contactId,
                        "userId": "user-1",
                        "activityType": "workflow",
                        "title": action.get("label") or "Workflow action",
                        "description": f"Comms workflow executed on thread {thread['subject']}.",
                        "metadata": {
                            "threadId": thread["id"],
                            "channelType": thread["channelType"],
                            "subject": thread["subject"],
                            "status": action.get("status"),
                        },
                        "createdAt": action.get("createdAt") or thread["updatedAt"],
                    }
                )
            for event in thread.get("calendarEvents", []):
                activities.append(
                    {
                        "id": f"calendar-activity-{event['id']}",
                        "contact_id": contact_id,
                        "userId": "user-1",
                        "activity_type": "meeting",
                        "title": event.get("title") or "Meeting scheduled",
                        "description": event.get("description") or f"Scheduled for {event.get('start_time')}.",
                        "metadata": {
                            "thread_id": thread["id"],
                            "meeting_url": event.get("meeting_url"),
                            "location": event.get("location"),
                            "status": event.get("status"),
                        },
                        "createdAt": event.get("start_time") or event.get("createdAt") or thread["updatedAt"],
                    }
                )
        return sorted(activities, key=lambda item: item["createdAt"], reverse=True)

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
            "tenantId": self._tenantId(),
            "contact_id": contact_id,
            "userId": str(payload.get("userId") or "user-1"),
            "activity_type": str(payload.get("activity_type") or "note"),
            "title": str(payload.get("title") or "Note"),
            "description": description,
            "metadata": payload.get("metadata") or {},
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO contact_activities (
                    id, tenantId, contact_id, userId, activity_type, title, description, metadata_json, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    activity["id"],
                    activity["tenantId"],
                    activity["contact_id"],
                    activity["userId"],
                    activity["activity_type"],
                    activity["title"],
                    activity["description"],
                    json.dumps(activity["metadata"]),
                    activity["createdAt"],
                    activity["updatedAt"],
                ),
            )
            conn.execute(
                "UPDATE contacts SET updatedAt = ? WHERE id = ? AND tenantId = ?",
                (now, contact_id, self._tenantId()),
            )
            conn.commit()
        return activity

    def list_flows(self) -> list[dict[str, Any]]:
        rows = self._rows(
            """
            SELECT * FROM flows
            WHERE tenantId = ?
            ORDER BY updatedAt DESC, createdAt DESC
            """,
            (self._tenantId(),),
        )
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "status": row["status"],
                "nodes": json_loads(row["nodesJson"], []),
                "edges": json_loads(row["edgesJson"], []),
                "spec": json_loads(row["specJson"], None),
                "metadata": json_loads(row["metadataJson"], {}),
                "createdAt": row["createdAt"],
                "updatedAt": row["updatedAt"],
                "createdBy": row.get("created_by"),
                "lastEditedBy": row.get("last_edited_by"),
            }
            for row in rows
        ]

    def get_flow(self, flow_id: str) -> dict[str, Any] | None:
        row = next((item for item in self._rows("SELECT * FROM flows WHERE id = ? AND tenantId = ? LIMIT 1", (flow_id, self._tenantId(),))), None)
        if not row:
            return None
        edges = json_loads(row["edgesJson"], [])
        # Normalize: strip animation from edges (only execution should animate)
        for e in edges:
            if isinstance(e, dict):
                e["animated"] = False
        return {
            "id": row["id"],
            "name": row["name"],
            "status": row["status"],
            "nodes": json_loads(row["nodesJson"], []),
            "edges": edges,
            "spec": json_loads(row["specJson"], None),
            "metadata": json_loads(row["metadataJson"], {}),
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
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
                    id, tenantId, name, status, nodesJson, edgesJson, specJson, metadataJson,
                    createdAt, updatedAt, createdBy, lastEditedBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    status = excluded.status,
                    nodesJson = excluded.nodesJson,
                    edgesJson = excluded.edgesJson,
                    specJson = excluded.specJson,
                    metadataJson = excluded.metadataJson,
                    updatedAt = excluded.updatedAt,
                    lastEditedBy = excluded.lastEditedBy
                """,
                (
                    record["id"],
                    self._tenantId(),
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
                INSERT INTO flow_drafts (id, tenantId, draftJson, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    draftJson = excluded.draftJson,
                    updatedAt = excluded.updatedAt
                """,
                (draft_id, self._tenantId(), json.dumps(draft), draft["createdAt"], draft["updatedAt"]),
            )
            conn.commit()
        return draft

    def get_flow_draft(self, draft_id: str) -> dict[str, Any] | None:
        rows = self._rows("SELECT draftJson FROM flow_drafts WHERE id = ? AND tenantId = ? LIMIT 1", (draft_id, self._tenantId()))
        if not rows:
            return None
        return json_loads(rows[0]["draftJson"], None)

    def delete_flow_draft(self, draft_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM flow_drafts WHERE id = ? AND tenantId = ?", (draft_id, self._tenantId()))
            conn.commit()

    def delete_flow(self, flow_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM flows WHERE id = ? AND tenantId = ?", (flow_id, self._tenantId()))
            conn.commit()

    def bulk_delete_flows(self, flow_ids: list[str]) -> dict[str, Any]:
        deleted = 0
        with self._connect() as conn:
            for flow_id in flow_ids:
                result = conn.execute("DELETE FROM flows WHERE id = ? AND tenantId = ?", (flow_id, self._tenantId()))
                deleted += result.rowcount
            conn.commit()
        return {"deleted": deleted, "requested": len(flow_ids)}
    
    def create_flow_folder(self, name: str) -> dict[str, Any]:
        folder_id = f"folder-{unique_suffix()}"
        now = utcnow()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO flow_folders (id, tenantId, name, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
                (folder_id, self._tenantId(), name, now, now)
            )
            conn.commit()
        return {"id": folder_id, "name": name, "createdAt": now, "updatedAt": now}
    
    def list_flow_folders(self) -> list[dict[str, Any]]:
        return self._tenant_rows("SELECT * FROM flow_folders ORDER BY name ASC")
    
    def rename_flow_folder(self, folder_id: str, new_name: str) -> dict[str, Any] | None:
        now = utcnow()
        with self._connect() as conn:
            conn.execute(
                "UPDATE flow_folders SET name = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                (new_name, now, folder_id, self._tenantId())
            )
            conn.commit()
        rows = self._tenant_rows("SELECT * FROM flow_folders WHERE id = ?", (folder_id,))
        return dict(rows[0]) if rows else None
    
    def delete_flow_folder(self, folder_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM flow_folders WHERE id = ? AND tenantId = ?", (folder_id, self._tenantId()))
            conn.commit()
        return True

    def list_form_submissions(self, contact_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM form_submissions WHERE tenantId = ?"
        params: tuple[Any, ...] = (self._tenantId(),)
        if contact_id:
            query += " AND contactId = ?"
            params = (self._tenantId(), contact_id)
        query += " ORDER BY submittedAt DESC"
        rows = self._rows(query, params)
        for row in rows:
            row["submissionData"] = json_loads(row.pop("submissionJson"), {})
            row["createdContact"] = bool(row["createdContact"])
        return rows

    def list_mailboxes(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM mailboxes WHERE tenantId = ? ORDER BY name ASC")
        mailboxes = [
            {
                **row,
                "inbound_enabled": bool(row.get("inbound_enabled", 1)),
                "outbound_enabled": bool(row.get("outbound_enabled", 1)),
                "config": json_loads(row.pop("configJson"), {}),
            }
            for row in rows
        ]
        return self._summarize_mailboxes(mailboxes, self._get_thread_context(), self.list_mail_events())

    def list_calendars(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM calendars WHERE tenantId = ? ORDER BY isDefault DESC, name ASC")
        return [
            {
                **row,
                "is_default": bool(row.get("isDefault", 0)),
                "is_visible": bool(row.get("isVisible", 1)),
            }
            for row in rows
        ]

    def list_calendar_events(self, thread_id: str | None = None) -> list[dict[str, Any]]:
        query = "SELECT * FROM calendar_events WHERE tenantId = ?"
        params: tuple[Any, ...] = (self._tenantId(),)
        if thread_id:
            query += " AND threadId = ?"
            params = (self._tenantId(), thread_id)
        query += " ORDER BY startTime ASC"
        return [self._calendar_event_from_row(row) for row in self._rows(query, params)]

    def create_calendar_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = utcnow()
        calendars = self.list_calendars()
        default_calendar_id = next((calendar["id"] for calendar in calendars if calendar.get("is_default")), None) or (calendars[0]["id"] if calendars else "calendar-primary")
        record = {
            "id": payload.get("id") or f"calendar-event-{unique_suffix()}",
            "tenantId": self._tenantId(),
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
            "createdAt": now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO calendar_events (
                    id, tenantId, calendarId, sourceId, threadId, contactId, companyId, title, description,
                    startTime, endTime, status, locationType, location, meetingUrl, syncStatus,
                    externalEventRef, lastSyncedAt, authorityMode, conflictState, syncNote, importedAt,
                    sourcePayloadJson, guestName, guestEmail, guestPhone, bookingTypeId, allDay, source,
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"], record["tenantId"], record["calendarId"], record["sourceId"], record["threadId"], record["contactId"],
                    record["companyId"], record["title"], record["description"], record["startTime"], record["endTime"],
                    record["status"], record["locationType"], record["location"], record["meetingUrl"], record["syncStatus"],
                    record["externalEventRef"], record["lastSyncedAt"], record["authorityMode"], record["conflictState"],
                    record["syncNote"], record["importedAt"], record["sourcePayloadJson"], record["guestName"],
                    record["guestEmail"], record["guestPhone"], record["bookingTypeId"], record["allDay"], record["source"],
                    record["createdAt"], record["updatedAt"],
                ),
            )
            conn.commit()
        return next((item for item in self.list_calendar_events() if item["id"] == record["id"]), self._calendar_event_from_row(record))

    def update_calendar_event(self, event_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM calendar_events WHERE id = ? AND tenantId = ?", (event_id, self._tenantId())).fetchone()
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
            payload["updatedAt"] = utcnow()
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(
                f"UPDATE calendar_events SET {assignments} WHERE id = ? AND tenantId = ?",
                (*payload.values(), event_id, self._tenantId()),
            )
            refreshed = {**event, **payload}
            if refreshed.get("thread_id"):
                next_follow_up_at = refreshed.get("start_time")
                status = refreshed.get("status")
                thread_status = "scheduled" if status in {"scheduled", "confirmed"} else "waiting_on_us"
                conn.execute(
                    "UPDATE threads SET status = ?, next_follow_up_at = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                    (thread_status, next_follow_up_at, payload["updatedAt"], refreshed["thread_id"], self._tenantId()),
                )
                conn.execute(
                    "INSERT INTO thread_actions (id, tenantId, thread_id, label, action_type, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        f"thread-action-{refreshed['thread_id']}-calendar-{unique_suffix()}",
                        self._tenantId(),
                        refreshed["thread_id"],
                        f"Meeting {str(status or 'updated').replace('_', ' ').title()}",
                        "calendar-event-updated",
                        "system",
                        "completed",
                        payload["updatedAt"],
                        payload["updatedAt"],
                    ),
                )
            conn.commit()
        return next((item for item in self.list_calendar_events() if item["id"] == event_id), refreshed)

    def delete_calendar_event(self, event_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM calendar_events WHERE id = ? AND tenantId = ?", (event_id, self._tenantId()))
            conn.commit()

    def list_booking_types(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM booking_types WHERE tenantId = ? ORDER BY name ASC")
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
            "tenantId": self._tenantId(),
            "userId": payload.get("userId") or "1",
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
                    id, tenantId, userId, name, slug, duration_minutes, location, location_type, description, color,
                    buffer_before_minutes, buffer_after_minutes, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"], record["tenantId"], record["userId"], record["name"], record["slug"], record["durationMinutes"],
                    record["location"], record["locationType"], record["description"], record["color"],
                    record["bufferBeforeMinutes"], record["bufferAfterMinutes"], record["isActive"],
                ),
            )
            conn.commit()
        return next((item for item in self.list_booking_types() if item["id"] == record["id"]), {**record, "is_active": bool(record["is_active"])})

    def update_booking_type(self, booking_type_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        payload = {}
        for key in ["name", "slug", "location", "location_type", "description", "color", "userId"]:
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
            row = conn.execute("SELECT id FROM booking_types WHERE id = ? AND tenantId = ?", (booking_type_id, self._tenantId())).fetchone()
            if not row:
                raise ValueError("Booking type not found")
            conn.execute(f"UPDATE booking_types SET {assignments} WHERE id = ? AND tenantId = ?", (*payload.values(), booking_type_id, self._tenantId()))
            conn.commit()
        return next(item for item in self.list_booking_types() if item["id"] == booking_type_id)

    def delete_booking_type(self, booking_type_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM booking_types WHERE id = ? AND tenantId = ?", (booking_type_id, self._tenantId()))
            conn.commit()

    def list_calendar_sources(self) -> list[dict[str, Any]]:
        rows = self._tenant_rows("SELECT * FROM calendar_sources WHERE tenantId = ? ORDER BY name ASC")
        sources = [
            {
                **row,
                "config": json_loads(row.pop("configJson"), {}),
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
            "createdAt": utcnow(),
            "updatedAt": utcnow(),
        }
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO calendar_sources (id, tenantId, name, provider, status, syncDirection, configJson, lastSyncedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    source["id"],
                    source["tenantId"],
                    source["name"],
                    source["provider"],
                    source["status"],
                    source["sync_direction"],
                    json.dumps(source["config"]),
                    source["last_synced_at"],
                    source["createdAt"],
                    source["updatedAt"],
                ),
            )
            conn.commit()
        return self._summarize_calendar_sources([source], self.list_calendar_events())[0]

    def update_calendar_source(self, source_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM calendar_sources WHERE id = ? AND tenantId = ?", (source_id, self._tenantId())).fetchone()
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
            payload["updatedAt"] = utcnow()
            assignments = ", ".join(f"{key} = ?" for key in payload.keys())
            conn.execute(f"UPDATE calendar_sources SET {assignments} WHERE id = ? AND tenantId = ?", (*payload.values(), source_id, self._tenantId()))
            conn.commit()
        return next((item for item in self.list_calendar_sources() if item["id"] == source_id), None)

    def delete_calendar_source(self, source_id: str, fallback_source_id: str | None = None) -> dict[str, Any]:
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM calendar_sources WHERE id = ? AND tenantId = ?", (source_id, self._tenantId())).fetchone()
            if not existing:
                raise ValueError("Calendar source not found")
            fallback_row = None
            if fallback_source_id:
                fallback_row = conn.execute("SELECT * FROM calendar_sources WHERE id = ? AND tenantId = ?", (fallback_source_id, self._tenantId())).fetchone()
                if not fallback_row:
                    raise ValueError("Fallback calendar source not found")
            reassigned_events = conn.execute(
                "SELECT COUNT(*) FROM calendar_events WHERE tenantId = ? AND sourceId = ?",
                (self._tenantId(), source_id),
            ).fetchone()[0]
            now = utcnow()
            if fallback_row:
                conn.execute(
                    "UPDATE calendar_events SET sourceId = ?, updatedAt = ? WHERE tenantId = ? AND sourceId = ?",
                    (fallback_row["id"], now, self._tenantId(), source_id),
                )
                cleared_events = 0
            else:
                conn.execute(
                    "UPDATE calendar_events SET sourceId = NULL, updatedAt = ? WHERE tenantId = ? AND sourceId = ?",
                    (now, self._tenantId(), source_id),
                )
                cleared_events = reassigned_events
                reassigned_events = 0
            conn.execute("DELETE FROM calendar_sources WHERE id = ? AND tenantId = ?", (source_id, self._tenantId()))
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
                SET status = ?, lastSyncedAt = ?, configJson = ?, updatedAt = ?
                WHERE id = ? AND tenantId = ?
                """,
                ("needs_config", None, json.dumps(next_config), utcnow(), source_id, self._tenantId()),
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
                    "SELECT * FROM calendar_events WHERE tenantId = ? AND sourceId = ? AND external_event_ref = ?",
                    (self._tenantId(), source_id, payload.get("external_event_ref")),
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
                    "updatedAt": now,
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
                    createdAt = now
                    conn.execute(
                        """
                        INSERT INTO calendar_events (
                            id, tenantId, calendarId, sourceId, threadId, contactId, companyId, title, description,
                            startTime, endTime, status, locationType, location, meetingUrl, syncStatus,
                            externalEventRef, lastSyncedAt, authorityMode, conflictState, syncNote, importedAt,
                            sourcePayloadJson, source, createdAt, updatedAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            event_id,
                            self._tenantId(),
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
                            createdAt,
                            normalized["updatedAt"],
                        ),
                    )
                    imported.append(
                        self._calendar_event_from_row(
                            {
                                "id": event_id,
                                "createdAt": createdAt,
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
                    id, tenantId, name, address, provider, status, inboundEnabled, outboundEnabled, lastSyncedAt, configJson
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mailbox["id"],
                    mailbox["tenantId"],
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
                SET name = ?, address = ?, provider = ?, status = ?, inboundEnabled = ?, outboundEnabled = ?, lastSyncedAt = ?, configJson = ?
                WHERE id = ? AND tenantId = ?
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
                    self._tenantId(),
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
                "SELECT * FROM mailboxes WHERE tenantId = ? AND id != ? ORDER BY CASE WHEN provider = 'local-stub' THEN 1 ELSE 0 END, name ASC",
                (self._tenantId(), mailbox_id),
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
                "SELECT COUNT(*) FROM threads WHERE tenantId = ? AND mailboxId = ?",
                (self._tenantId(), mailbox_id),
            ).fetchone()[0]
            reassigned_events = conn.execute(
                "SELECT COUNT(*) FROM mail_events WHERE tenantId = ? AND mailboxId = ?",
                (self._tenantId(), mailbox_id),
            ).fetchone()[0]
            now = utcnow()
            conn.execute("UPDATE threads SET mailboxId = ?, updatedAt = ? WHERE tenantId = ? AND mailboxId = ?", (fallback_row["id"], now, self._tenantId(), mailbox_id))
            conn.execute("UPDATE mail_events SET mailboxId = ? WHERE tenantId = ? AND mailboxId = ?", (fallback_row["id"], self._tenantId(), mailbox_id))
            conn.execute("DELETE FROM mailboxes WHERE id = ? AND tenantId = ?", (mailbox_id, self._tenantId()))
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
        params: list[str] = [self._tenantId()]
        clauses: list[str] = ["tenantId = ?"]
        if mailbox_id:
            clauses.append("mailboxId = ?")
            params.append(mailbox_id)
        if thread_id:
            clauses.append("threadId = ?")
            params.append(thread_id)
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY createdAt DESC"
        rows = self._rows(query, tuple(params))
        for row in rows:
            row["payload"] = json_loads(row.pop("payloadJson"), {})
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
            "tenantId": self._tenantId(),
            "mailbox_id": mailbox_id,
            "thread_id": thread_id,
            "message_id": message_id,
            "event_type": event_type,
            "source_provider": source_provider or self.mail_adapter.provider_name,
            "payload": payload,
            "createdAt": utcnow(),
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO mail_events (
                    id, tenantId, mailboxId, threadId, messageId, eventType, sourceProvider, payloadJson, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event["id"],
                    event["tenantId"],
                    event["mailbox_id"],
                    event["thread_id"],
                    event["message_id"],
                    event["event_type"],
                    event["source_provider"],
                    json.dumps(event["payload"]),
                    event["createdAt"],
                ),
            )
            conn.commit()
        return event

    def _ensure_contact_for_email(self, sender_name: str, sender_email: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM contacts WHERE tenantId = ? AND LOWER(email) = LOWER(?)", (self._tenantId(), sender_email)).fetchone()
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
                "tenantId": self._tenantId(),
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
                "createdAt": utcnow(),
                "updatedAt": utcnow(),
                "deleted_at": None,
            }
            conn.execute(
                """
                INSERT INTO contacts (
                    id, contactId, organizationId, tenantId, firstName, lastName, email, phone, company, companyId,
                    title, department, owner, source, status, leadScore, quality, engagement, tagsJson,
                    lastContactedAt, pipelineStage, createdAt, updatedAt, deletedAt
                ) VALUES (
                    :id, :contact_id, :organization_id, :tenantId, :first_name, :last_name, :email, :phone, :company, :company_id,
                    :title, :department, :owner, :source, :status, :lead_score, :quality, :engagement, :tags_json,
                    :last_contacted_at, :pipeline_stage, :createdAt, :updatedAt, :deleted_at
                )
                """,
                payload,
            )
            conn.commit()
        payload["tags"] = json_loads(payload.pop("tags_json"), [])
        return payload

    def _get_mailbox_row(self, mailbox_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM mailboxes WHERE id = ? AND tenantId = ?", (mailbox_id, self._tenantId())).fetchone()
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
        updatedAt = utcnow()
        config_updates = (payload or {}).get("config_updates") or {}
        mailbox_updates: dict[str, Any] = {"last_synced_at": updatedAt}
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
                sender_email=sender_email or mailbox.get("address") or "mail@aiocrm.org",
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
                {"name": definition.name, "agent_id": definition.agent_id}
                for definition in AGENT_DEFINITIONS.values()
                if definition.visibility != "hidden"
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
                row = conn.execute("SELECT companyId FROM contacts WHERE id = ? AND tenantId = ?", (contact_id, self._tenantId())).fetchone()
                resolved_company_id = row["companyId"] if row else None

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO threads (
                    id, tenantId, mailboxId, channelType, subject, generatedTitle, status, aiFlagsJson, aiPriority,
                    priorityScore, owner, assignee, contactId, companyId, automationState, lastActivityAt,
                    nextFollowUpAt, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread_id, self._tenantId(), mailbox_id or "mailbox-default-smtp", channel_type, subject, subject, status, json.dumps({"needs_human": True}),
                    "medium", 70, assignee, assignee, contact_id, resolved_company_id, "manual", now, None, now, now,
                ),
            )
            conn.execute(
                """
                INSERT INTO thread_ai_briefs (
                    threadId, tenantId, summary, disposition, recommendedNextStep, confidence,
                    unresolvedQuestionsJson, crmImplicationsJson, reasoningCuesJson, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    thread_id, self._tenantId(), "Fresh thread awaiting triage.", "New signal", "Review context and send a clear next step.",
                    0.64, json.dumps(["Confirm best next action"]), json.dumps([]), json.dumps(["Thread created manually"]), now,
                ),
            )
            conn.executemany(
                "INSERT INTO thread_actions (id, tenantId, threadId, label, actionType, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (f"thread-action-{thread_id}-1", self._tenantId(), thread_id, "Summarize", "summarize", "ai", "suggested", now, now),
                    (f"thread-action-{thread_id}-2", self._tenantId(), thread_id, "Reply with AI", "reply-with-ai", "ai", "suggested", now, now),
                ],
            )
            if contact_id:
                conn.execute(
                    "INSERT INTO thread_links (id, tenantId, threadId, sourceType, sourceId, label) SELECT ?, ?, ?, 'contact', id, firstName || ' ' || lastName FROM contacts WHERE id = ? AND tenantId = ?",
                    (f"thread-link-{thread_id}-contact", self._tenantId(), thread_id, contact_id, self._tenantId()),
                )
            if resolved_company_id:
                conn.execute(
                    "INSERT INTO thread_links (id, tenantId, threadId, sourceType, sourceId, label) SELECT ?, ?, ?, 'company', id, name FROM companies WHERE id = ? AND tenantId = ?",
                    (f"thread-link-{thread_id}-company", self._tenantId(), thread_id, resolved_company_id, self._tenantId()),
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
            contact = conn.execute("SELECT firstName, lastName, companyId FROM contacts WHERE id = ? AND tenantId = ?", (contact_id, self._tenantId())).fetchone()
        if not contact:
            raise ValueError("Contact not found")
        resolved_subject = subject or f"{channel_type.upper()} follow-up for {contact['firstName']} {contact['lastName']}".strip()
        return self.create_thread(resolved_subject, channel_type=channel_type, contact_id=contact_id, company_id=contact["companyId"], body=body, assignee="STRIKER" if channel_type == "email" else "ECHO", mailbox_id=mailbox_id)

    def send_thread_message(
        self,
        thread_id: str,
        body: str,
        channel_type: str | None = None,
        sender_name: str = "AIO Flow",
        sender_email: str = "mail@aiocrm.org",
        recipients: list[str] | None = None,
        direction: str = "outbound",
    ) -> dict[str, Any]:
        createdAt = utcnow()
        message_id = f"msg-{thread_id}-{unique_suffix()}"
        with self._connect() as conn:
            thread_row = conn.execute("SELECT * FROM threads WHERE id = ? AND tenantId = ?", (thread_id, self._tenantId())).fetchone()
            if not thread_row:
                raise ValueError("Thread not found")
            thread = dict(thread_row)
            resolved_channel = channel_type or thread["channelType"]
            resolved_recipients = recipients or []
            conn.execute(
                """
                INSERT INTO messages (
                    id, tenantId, threadId, channelType, direction, senderName, senderEmail, recipientsJson,
                    body, plainText, quotedHistory, deliveryStatus, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message_id, self._tenantId(), thread_id, resolved_channel, direction, sender_name, sender_email, json.dumps(resolved_recipients),
                    body, body, "", "sent" if direction == "outbound" else "logged" if direction == "system" else "received", createdAt, createdAt,
                ),
            )
            ai_flags = json_loads(thread["aiFlagsJson"], {})
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
                "UPDATE threads SET status = ?, aiFlagsJson = ?, lastActivityAt = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                (status, json.dumps(ai_flags), createdAt, createdAt, thread_id, self._tenantId()),
            )
            conn.execute(
                "UPDATE thread_ai_briefs SET summary = ?, recommendedNextStep = ?, updatedAt = ? WHERE threadId = ? AND tenantId = ?",
                (
                    summary_text,
                    next_step,
                    createdAt,
                    thread_id,
                    self._tenantId(),
                ),
            )
            conn.commit()
        return next(thread for thread in self._get_thread_context() if thread["id"] == thread_id)

    def update_thread_status(self, thread_id: str, status: str) -> dict[str, Any]:
        now = utcnow()
        with self._connect() as conn:
            existing = conn.execute("SELECT status FROM threads WHERE id = ? AND tenantId = ?", (thread_id, self._tenantId())).fetchone()
            if not existing:
                raise ValueError("Thread not found")
            conn.execute("UPDATE threads SET status = ?, updatedAt = ? WHERE id = ? AND tenantId = ?", (status, now, thread_id, self._tenantId()))
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, threadId, label, actionType, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"thread-action-{unique_suffix()}",
                    self._tenantId(),
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
            "tenantId": self._tenantId(),
            "thread_id": thread_id,
            "artifact_type": "report",
            "kind": kind,
            "title": title,
            "body": build_thread_report_text(thread, kind=kind),
            "created_by": thread.get("assignee") or "AIO Flow",
            "createdAt": now,
            "updatedAt": now,
        }
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO thread_artifacts (
                    id, tenantId, threadId, artifactType, kind, title, body, createdBy, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    artifact["id"],
                    artifact["tenantId"],
                    artifact["thread_id"],
                    artifact["artifact_type"],
                    artifact["kind"],
                    artifact["title"],
                    artifact["body"],
                    artifact["created_by"],
                    artifact["createdAt"],
                    artifact["updatedAt"],
                ),
            )
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, thread_id, label, action_type, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"thread-action-{unique_suffix()}",
                    self._tenantId(),
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
            existing = conn.execute("SELECT id FROM threads WHERE id = ? AND tenantId = ?", (thread_id, self._tenantId())).fetchone()
            if not existing:
                raise ValueError("Thread not found")
            conn.execute("UPDATE calendar_events SET thread_id = NULL, updatedAt = ? WHERE threadId = ? AND tenantId = ?", (utcnow(), thread_id, self._tenantId()))
            conn.execute("DELETE FROM messages WHERE threadId = ? AND tenantId = ?", (thread_id, self._tenantId()))
            conn.execute("DELETE FROM thread_ai_briefs WHERE threadId = ? AND tenantId = ?", (thread_id, self._tenantId()))
            conn.execute("DELETE FROM thread_actions WHERE threadId = ? AND tenantId = ?", (thread_id, self._tenantId()))
            conn.execute("DELETE FROM thread_links WHERE threadId = ? AND tenantId = ?", (thread_id, self._tenantId()))
            conn.execute("DELETE FROM thread_artifacts WHERE threadId = ? AND tenantId = ?", (thread_id, self._tenantId()))
            conn.execute("DELETE FROM threads WHERE id = ? AND tenantId = ?", (thread_id, self._tenantId()))
            conn.commit()
        return {"deleted_thread_id": thread_id}

    def assign_thread(self, thread_id: str, assignee_name: str) -> dict[str, Any]:
        thread = next((item for item in self._get_thread_context() if item["id"] == thread_id), None)
        if not thread:
            raise ValueError("Thread not found")
        previous_assignee = thread.get("assignee") or "Unassigned"
        now = utcnow()
        with self._connect() as conn:
            conn.execute("UPDATE threads SET assignee = ?, owner = ?, updatedAt = ? WHERE id = ? AND tenantId = ?", (assignee_name, assignee_name, now, thread_id, self._tenantId()))
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, thread_id, label, action_type, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{unique_suffix()}", self._tenantId(), thread_id, f"Assigned to {assignee_name}", "assign-thread", "system", "completed", now, now),
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
            conn.execute("UPDATE threads SET mailboxId = ?, updatedAt = ? WHERE id = ? AND tenantId = ?", (mailbox_id, utcnow(), thread_id, self._tenantId()))
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
            conn.execute("UPDATE thread_ai_briefs SET summary = ?, updatedAt = ? WHERE threadId = ? AND tenantId = ?", (summary, utcnow(), thread_id, self._tenantId()))
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
                SET summary = ?, disposition = ?, recommendedNextStep = ?, confidence = ?,
                    unresolvedQuestionsJson = ?, crmImplicationsJson = ?, reasoningCuesJson = ?, updatedAt = ?
                WHERE threadId = ? AND tenantId = ?
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
                    self._tenantId(),
                ),
            )
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, threadId, label, actionType, source, agentName, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    f"thread-action-{thread_id}-ai-{unique_suffix()}",
                    self._tenantId(),
                    thread_id,
                    action_labels.get(mode, "AI Updated"),
                    f"ai-{mode}",
                    "ai",
                    details.get("agent_name") or details.get("agent") or thread.get("assignee"),
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
                "UPDATE contacts SET pipeline_stage = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                ("Qualified" if (thread.get("contact") or {}).get("pipeline_stage") == "New" else (thread.get("contact") or {}).get("pipeline_stage") or "Qualified", now, thread["contact_id"], self._tenantId()),
            )
            exists = conn.execute("SELECT 1 FROM thread_links WHERE tenantId = ? AND threadId = ? AND source_type = 'deal' LIMIT 1", (self._tenantId(), thread_id)).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO thread_links (id, tenantId, thread_id, source_type, source_id, label) VALUES (?, ?, ?, 'deal', ?, ?)",
                    (f"thread-link-{thread_id}-deal", self._tenantId(), thread_id, f"deal-{thread_id}", deal_label),
                )
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, thread_id, label, action_type, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{thread_id}-deal-{unique_suffix()}", self._tenantId(), thread_id, "Create Deal", "create-deal", "system", "completed", now, now),
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
            conn.execute("UPDATE contacts SET pipeline_stage = ?, updatedAt = ? WHERE id = ? AND tenantId = ?", (stage, now, thread["contact_id"], self._tenantId()))
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, thread_id, label, action_type, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{thread_id}-stage-{unique_suffix()}", self._tenantId(), thread_id, f"Advance Stage: {stage}", "advance-stage", "system", "completed", now, now),
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
            conn.execute("UPDATE threads SET status = ?, next_follow_up_at = ?, updatedAt = ? WHERE id = ? AND tenantId = ?", ("scheduled", follow_up_at, now, thread_id, self._tenantId()))
            existing_event = conn.execute("SELECT id FROM calendar_events WHERE tenantId = ? AND threadId = ? LIMIT 1", (self._tenantId(), thread_id)).fetchone()
            calendar_event_id = existing_event["id"] if existing_event else f"calendar-event-{thread_id}-{unique_suffix()}"
            if existing_event:
                conn.execute(
                    """
                    UPDATE calendar_events
                    SET title = ?, description = ?, startTime = ?, endTime = ?, status = ?, locationType = ?, location = ?, sourceId = ?, syncStatus = ?, externalEventRef = ?, lastSyncedAt = ?, authorityMode = ?, conflictState = ?, syncNote = ?, importedAt = ?, sourcePayloadJson = ?, updatedAt = ?
                    WHERE id = ? AND tenantId = ?
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
                        self._tenantId(),
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO calendar_events (
                        id, tenantId, calendarId, threadId, contactId, companyId, title, description, startTime, endTime,
                        status, locationType, location, meetingUrl, sourceId, syncStatus, externalEventRef, lastSyncedAt,
                        authorityMode, conflictState, syncNote, importedAt, sourcePayloadJson, source, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        calendar_event_id,
                        self._tenantId(),
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
                "SELECT 1 FROM thread_links WHERE tenantId = ? AND threadId = ? AND source_type = 'calendar-event' AND sourceId = ? LIMIT 1",
                (self._tenantId(), thread_id, calendar_event_id),
            ).fetchone()
            if not existing_link:
                conn.execute(
                    "INSERT INTO thread_links (id, tenantId, thread_id, source_type, source_id, label) VALUES (?, ?, ?, 'calendar-event', ?, ?)",
                    (f'thread-link-{thread_id}-calendar-{unique_suffix()}', self._tenantId(), thread_id, calendar_event_id, "Scheduled meeting"),
                )
            conn.execute(
                "INSERT INTO thread_actions (id, tenantId, thread_id, label, action_type, source, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (f"thread-action-{thread_id}-meeting-{unique_suffix()}", self._tenantId(), thread_id, "Schedule Meeting", "schedule-meeting", "system", "completed", now, now),
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
                    self._tenantId(),
                    payload.get("run_id"),
                    payload.get("step_id"),
                    payload.get("agent"),
                    payload.get("agent_id"),
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
                INSERT INTO aiEngineRuns (
                    id, tenantId, command, mode, status, pauseReason, resumeAt, nextNodeId, currentNodeId, lockedUntil, lastError, stepsJson, 
                    artifactsJson, pendingApprovalsJson, routingJson, traceJson, 
                    actorJson, contextJson, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    self._tenantId(),
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
            ("stepsJson", []),
            ("artifactsJson", []),
            ("pendingApprovalsJson", []),
            ("routingJson", {}),
            ("traceJson", []),
            ("actorJson", {}),
            ("contextJson", {}),
        ]:
            try:
                parsed[key[:-4] if key.endswith("Json") else key] = json.loads(parsed.get(key) or json.dumps(default))
            except json.JSONDecodeError:
                parsed[key[:-4] if key.endswith("Json") else key] = default
        return parsed

    def get_ai_run(self, run_id: str) -> dict[str, Any] | None:
        rows = self._tenant_rows("SELECT * FROM aiEngineRuns WHERE tenantId = ? AND id = ?", (run_id,))
        return self._deserialize_ai_engine_run_row(rows[0] if rows else None)

    def update_ai_run(self, run_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            updates["updatedAt"] = utcnow()
            set_clause = ", ".join(f"{k} = ?" for k in updates.keys() if k != "id" and k != "tenantId")
            values = [v for k, v in updates.items() if k != "id" and k != "tenantId"]
            if set_clause:
                conn.execute(f"UPDATE aiEngineRuns SET {set_clause} WHERE tenantId = ? AND id = ?", (*values, self._tenantId(), run_id))
                conn.commit()
        res = self.get_ai_run(run_id)
        return res if res else {}

    def list_ai_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        rows = self._tenant_rows(
            """
            SELECT *
            FROM aiEngineRuns
            WHERE tenantId = ?
            ORDER BY createdAt DESC
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
                FROM aiEngineRuns
                WHERE status = 'paused'
                  AND pauseReason = ?
                  AND resumeAt IS NOT NULL
                  AND resumeAt <= ?
                  AND (lockedUntil IS NULL OR lockedUntil = '' OR lockedUntil <= ?)
                ORDER BY resumeAt ASC
                LIMIT ?
                """,
                (pause_reason, now, now, max(1, min(limit, 200))),
            ).fetchall()
            for row in rows:
                updated = conn.execute(
                    """
                    UPDATE aiEngineRuns
                    SET lockedUntil = ?, updatedAt = ?
                    WHERE id = ?
                      AND status = 'paused'
                      AND pauseReason = ?
                      AND (lockedUntil IS NULL OR lockedUntil = '' OR lockedUntil <= ?)
                    """,
                    (locked_until, now, row["id"], pause_reason, now),
                )
                if updated.rowcount:
                    refreshed = conn.execute("SELECT * FROM aiEngineRuns WHERE id = ?", (row["id"],)).fetchone()
                    parsed = self._deserialize_ai_engine_run_row(refreshed)
                    if parsed:
                        claimed.append(parsed)
            conn.commit()
        return claimed

    # === Comms Phone Numbers ===
    def list_comms_phone_numbers(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM comms_phone_numbers WHERE tenantId = ? AND isActive = 1 ORDER BY createdAt DESC",
                (self._tenantId(),)
            ).fetchall()
            return [dict(row) for row in rows]

    def create_comms_phone_number(self, number: str, display_label: str | None = None, owner: str | None = None) -> dict[str, Any]:
        now = utcnow()
        id = f"phone-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO comms_phone_numbers 
                   (id, tenantId, number, displayLabel, owner, smsEnabled, callsEnabled, isActive, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?, ?)""",
                (id, self._tenantId(), number, display_label, owner, now, now)
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM comms_phone_numbers WHERE id = ?", (id,)).fetchone())

    def update_comms_phone_number(self, id: str, **kwargs) -> dict[str, Any]:
        now = utcnow()
        fields = []
        values = []
        for k, v in kwargs.items():
            fields.append(k.replace("_", ""))
            values.append(v)
        fields.append("updatedAt")
        values.append(now)
        with self._connect() as conn:
            conn.execute(f"UPDATE comms_phone_numbers SET {', '.join(fields)} = ? WHERE id = ? AND tenantId = ?", values + [id, self._tenantId()])
            conn.commit()
        return dict(conn.execute("SELECT * FROM comms_phone_numbers WHERE id = ?", (id,)).fetchone())

    def delete_comms_phone_number(self, id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE comms_phone_numbers SET isActive = 0 WHERE id = ? AND tenantId = ?", (id, self._tenantId()))
            conn.commit()

    # === SMS Threads ===
    def list_sms_threads(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sms_threads WHERE tenantId = ? ORDER BY lastMessageAt DESC LIMIT ?",
                (self._tenantId(), limit)
            ).fetchall()
            return [dict(row) for row in rows]

    def create_sms_thread(self, contact_id: str | None = None, phone_number_id: str | None = None, subject: str | None = None) -> dict[str, Any]:
        now = utcnow()
        id = f"sms-thread-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO sms_threads 
                   (id, tenantId, contactId, phoneNumberId, direction, status, subject, messageCount, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, 'inbound', 'open', ?, 0, ?, ?)""",
                (id, self._tenantId(), contact_id, phone_number_id, subject or "New SMS Thread", now, now)
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM sms_threads WHERE id = ?", (id,)).fetchone())

    # === SMS Messages ===
    def add_sms_message(self, thread_id: str, body: str, direction: str, sender_number: str | None = None, recipient_number: str | None = None) -> dict[str, Any]:
        now = utcnow()
        id = f"sms-msg-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO sms_messages 
                   (id, tenantId, threadId, direction, senderNumber, recipientNumber, body, deliveryStatus, createdAt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)""",
                (id, self._tenantId(), thread_id, direction, sender_number, recipient_number, body, now)
            )
            conn.execute("UPDATE sms_threads SET messageCount = messageCount + 1, lastMessageAt = ?, updatedAt = ? WHERE id = ?",
                         (now, now, thread_id))
            conn.commit()
        return dict(conn.execute("SELECT * FROM sms_messages WHERE id = ?", (id,)).fetchone())

    def update_sms_message_status(self, message_id: str, status: str) -> dict[str, Any]:
        now = utcnow()
        with self._connect() as conn:
            conn.execute(
                "UPDATE sms_messages SET deliveryStatus = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                (status, now, message_id, self._tenantId())
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM sms_messages WHERE id = ?", (message_id,)).fetchone())

    # === SMS Plans ===
    def list_sms_plans(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sms_plans WHERE tenantId = ? AND isActive = 1 ORDER BY createdAt DESC",
                (self._tenantId(),)
            ).fetchall()
            return [dict(row) for row in rows]

    def create_sms_plan(self, name: str, brand_name: str, campaign_type: str | None = None) -> dict[str, Any]:
        now = utcnow()
        id = f"sms-plan-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO sms_plans 
                   (id, tenantId, name, brandName, campaignType, registrationStatus, isActive, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, 'pending', 1, ?, ?)""",
                (id, self._tenantId(), name, brand_name, campaign_type, now, now)
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM sms_plans WHERE id = ?", (id,)).fetchone())

    def update_sms_plan(self, id: str, **kwargs) -> dict[str, Any]:
        now = utcnow()
        fields = []
        values = []
        for k, v in kwargs.items():
            fields.append(k.replace("_", ""))
            values.append(v)
        fields.append("updatedAt")
        values.append(now)
        with self._connect() as conn:
            conn.execute(f"UPDATE sms_plans SET {', '.join(fields)} = ? WHERE id = ? AND tenantId = ?", values + [id, self._tenantId()])
            conn.commit()
        return dict(conn.execute("SELECT * FROM sms_plans WHERE id = ?", (id,)).fetchone())

    # === Extensions ===
    def list_comms_extensions(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM comms_extensions WHERE tenantId = ? AND isActive = 1 ORDER BY extensionNumber",
                (self._tenantId(),)
            ).fetchall()
            return [dict(row) for row in rows]

    def create_comms_extension(self, extension_number: str, display_name: str | None = None, user_id: str | None = None) -> dict[str, Any]:
        now = utcnow()
        id = f"ext-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO comms_extensions 
                   (id, tenantId, extensionNumber, displayName, userId, isActive, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
                (id, self._tenantId(), extension_number, display_name, user_id, now, now)
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM comms_extensions WHERE id = ?", (id,)).fetchone())

    # === Ring Groups ===
    def list_comms_ring_groups(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM comms_ring_groups WHERE tenantId = ? AND isActive = 1 ORDER BY name",
                (self._tenantId(),)
            ).fetchall()
            return [dict(row) for row in rows]

    def create_comms_ring_group(self, name: str, extensions: list[str], ring_strategy: str = "simultaneous") -> dict[str, Any]:
        now = utcnow()
        id = f"rg-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO comms_ring_groups 
                   (id, tenantId, name, extensionsJson, ringStrategy, isActive, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, 1, ?, ?)""",
                (id, self._tenantId(), name, json.dumps(extensions), ring_strategy, now, now)
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM comms_ring_groups WHERE id = ?", (id,)).fetchone())

    # === Call Sessions ===
    def list_call_sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM call_sessions WHERE tenantId = ? ORDER BY startTime DESC LIMIT ?",
                (self._tenantId(), limit)
            ).fetchall()
            return [dict(row) for row in rows]

    def create_call_session(self, direction: str, contact_id: str | None = None, phone_number_id: str | None = None) -> dict[str, Any]:
        now = utcnow()
        id = f"call-{unique_suffix()}"
        with self._connect() as conn:
            conn.execute(
                """INSERT INTO call_sessions 
                   (id, tenantId, contactId, phoneNumberId, direction, status, startTime, createdAt, updatedAt)
                   VALUES (?, ?, ?, ?, ?, 'initiated', ?, ?, ?)""",
                (id, self._tenantId(), contact_id, phone_number_id, direction, now, now, now)
            )
            conn.commit()
        return dict(conn.execute("SELECT * FROM call_sessions WHERE id = ?", (id,)).fetchone())

    def update_call_session(self, id: str, **kwargs) -> dict[str, Any]:
        now = utcnow()
        fields = []
        values = []
        for k, v in kwargs.items():
            fields.append(k.replace("_", ""))
            values.append(v)
        fields.append("updatedAt")
        values.append(now)
        with self._connect() as conn:
            conn.execute(f"UPDATE call_sessions SET {', '.join(fields)} = ? WHERE id = ? AND tenantId = ?", values + [id, self._tenantId()])
            conn.commit()
        return dict(conn.execute("SELECT * FROM call_sessions WHERE id = ?", (id,)).fetchone())

    # === Comms Overview ===
    def get_comms_overview(self) -> dict[str, Any]:
        tenant = self._tenantId()
        with self._connect() as conn:
            active_numbers = conn.execute(
                "SELECT COUNT(*) as cnt FROM comms_phone_numbers WHERE tenantId = ? AND isActive = 1", (tenant,)
            ).fetchone()["cnt"]
            sms_enabled = conn.execute(
                "SELECT COUNT(*) as cnt FROM comms_phone_numbers WHERE tenantId = ? AND smsEnabled = 1", (tenant,)
            ).fetchone()["cnt"]
            calls_enabled = conn.execute(
                "SELECT COUNT(*) as cnt FROM comms_phone_numbers WHERE tenantId = ? AND callsEnabled = 1", (tenant,)
            ).fetchone()["cnt"]
            active_extensions = conn.execute(
                "SELECT COUNT(*) as cnt FROM comms_extensions WHERE tenantId = ? AND isActive = 1", (tenant,)
            ).fetchone()["cnt"]
            active_ring_groups = conn.execute(
                "SELECT COUNT(*) as cnt FROM comms_ring_groups WHERE tenantId = ? AND isActive = 1", (tenant,)
            ).fetchone()["cnt"]
            active_plans = conn.execute(
                "SELECT COUNT(*) as cnt FROM sms_plans WHERE tenantId = ? AND isActive = 1", (tenant,)
            ).fetchone()["cnt"]
            recent_threads = conn.execute(
                "SELECT COUNT(*) as cnt FROM sms_threads WHERE tenantId = ? AND lastMessageAt >= datetime('now', '-7 days')", (tenant,)
            ).fetchone()["cnt"]
            recent_calls = conn.execute(
                "SELECT COUNT(*) as cnt FROM call_sessions WHERE tenantId = ? AND startTime >= datetime('now', '-7 days')", (tenant,)
            ).fetchone()["cnt"]
            provider_config = conn.execute(
                "SELECT healthStatus FROM comms_provider_configs WHERE tenantId = ? AND isActive = 1 LIMIT 1", (tenant,)
            ).fetchone()
            provider_status = provider_config["healthStatus"] if provider_config else "stub"
        return {
            "active_numbers": active_numbers,
            "sms_enabled_count": sms_enabled,
            "calls_enabled_count": calls_enabled,
            "active_extensions": active_extensions,
            "active_ring_groups": active_ring_groups,
            "active_plans": active_plans,
            "provider_status": provider_status,
            "recent_threads_count": recent_threads,
            "recent_calls_count": recent_calls
        }


def create_provider() -> BaseProvider:
    provider_name = os.getenv("DATA_PROVIDER", "sqlite").lower()
    if provider_name == "mock":
        return MockProvider()
    db_path = os.getenv("SQLITE_DB_PATH", str(Path(__file__).resolve().parent / "data" / "aio_crm.db"))
    return SQLiteProvider(db_path)
