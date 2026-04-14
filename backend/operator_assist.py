from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

try:
    from backend.orchestration import match_flow_trigger_event
except ModuleNotFoundError:
    from orchestration import match_flow_trigger_event


logger = logging.getLogger(__name__)

INSUFFICIENT_DATA_MESSAGE = "I don't have enough data to confirm that."
INTENT_HOW_TO = "HOW_TO"
INTENT_WHY = "WHY_DIDNT_WORK"
INTENT_WHAT_IS = "WHAT_IS"
INTENT_CONFIG = "CONFIG_HELP"
INTENT_STATUS = "SYSTEM_STATUS"

KNOWN_EVENT_TYPES = {
    "booking_created": ["booking created", "new booking", "booking", "meeting created"],
    "booking_updated": ["booking updated", "booking changed", "rescheduled", "meeting updated"],
    "booking_cancelled": ["booking cancelled", "booking canceled", "meeting cancelled", "meeting canceled"],
}


def _normalize_text(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _sort_recent(records: list[dict[str, Any]], *keys: str) -> list[dict[str, Any]]:
    def sort_key(item: dict[str, Any]) -> tuple[datetime, str]:
        for key in keys:
            parsed = _parse_iso(item.get(key))
            if parsed:
                return (parsed, str(item.get("id") or ""))
        return (datetime.min.replace(tzinfo=UTC), str(item.get("id") or ""))

    return sorted(records, key=sort_key, reverse=True)


def classify_assist_intent(message: str, context: dict[str, Any] | None = None) -> str:
    haystack = " ".join(
        part
        for part in [
            _normalize_text(message),
            _normalize_text((context or {}).get("module")),
            _normalize_text((context or {}).get("surface")),
            _normalize_text((context or {}).get("topic")),
        ]
        if part
    )
    if any(term in haystack for term in ["why didn't", "why didnt", "not work", "didn't work", "didnt work", "failed", "failure", "error", "not running", "didn't run", "didnt run"]):
        return INTENT_WHY
    if any(term in haystack for term in ["status", "health", "active", "recent runs", "recent activity", "what's happening", "whats happening", "system status"]):
        return INTENT_STATUS
    if any(term in haystack for term in ["how do", "how can", "how to", "steps to"]):
        return INTENT_HOW_TO
    if any(term in haystack for term in ["setting", "config", "configure", "branding", "theme", "menu", "navigation", "variable", "template", "calendar default"]):
        return INTENT_CONFIG
    return INTENT_WHAT_IS


def detect_assist_domains(message: str, context: dict[str, Any] | None = None) -> set[str]:
    haystack = " ".join(
        part
        for part in [
            _normalize_text(message),
            _normalize_text((context or {}).get("module")),
            _normalize_text((context or {}).get("surface")),
            _normalize_text((context or {}).get("topic")),
        ]
        if part
    )
    domains: set[str] = set()
    if any(term in haystack for term in ["flow", "workflow", "automation", "trigger", "run", "agent"]):
        domains.add("automation")
    if any(term in haystack for term in ["setting", "config", "branding", "theme", "menu", "navigation", "variable", "template", "email default", "calendar default", "internal metadata"]):
        domains.add("settings")
    if any(term in haystack for term in ["variable", "placeholder", "merge field"]):
        domains.add("variables")
    if any(term in haystack for term in ["email", "message", "thread", "comms", "mailbox", "inbox"]):
        domains.add("comms")
    if any(term in haystack for term in ["calendar", "booking", "meeting", "event"]):
        domains.add("calendar")
    if any(term in haystack for term in ["status", "health", "recent", "overview"]):
        domains.add("status")
    return domains or {"general"}


def _extract_flow_triggers(flow: dict[str, Any]) -> list[str]:
    triggers: list[str] = []
    nodes = flow.get("nodes") if isinstance(flow.get("nodes"), list) else []
    for node in nodes:
        if str(node.get("type") or "").strip().lower() != "trigger":
            continue
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        config = data.get("config") if isinstance(data.get("config"), dict) else {}
        candidates = [
            config.get("event"),
            data.get("templateId"),
            data.get("id"),
            data.get("label"),
            node.get("id"),
        ]
        for candidate in candidates:
            normalized = str(candidate or "").strip().lower().replace("-", "_").replace(" ", "_")
            if normalized and normalized not in triggers:
                triggers.append(normalized)
    return triggers


def _extract_query_event_type(message: str, context: dict[str, Any] | None = None) -> str | None:
    explicit = str((context or {}).get("eventType") or (context or {}).get("event_type") or "").strip().lower()
    if explicit:
        return explicit.replace("-", "_").replace(" ", "_")
    haystack = _normalize_text(message)
    for event_type, variants in KNOWN_EVENT_TYPES.items():
        if any(variant in haystack for variant in variants):
            return event_type
    return None


def _find_matching_flow(query: str, flows: list[dict[str, Any]], context: dict[str, Any] | None = None) -> dict[str, Any] | None:
    explicit_id = str((context or {}).get("flowId") or (context or {}).get("flow_id") or "").strip().lower()
    if explicit_id:
        return next((flow for flow in flows if str(flow.get("id") or "").strip().lower() == explicit_id), None)

    haystack = _normalize_text(query)
    if not haystack:
        return None

    best_match: dict[str, Any] | None = None
    best_score = 0
    for flow in flows:
        flow_id = _normalize_text(flow.get("id"))
        flow_name = _normalize_text(flow.get("name"))
        score = 0
        if flow_id and flow_id in haystack:
            score += 3
        if flow_name and flow_name in haystack:
            score += 4
        if flow_name:
            flow_tokens = [token for token in re.split(r"[^a-z0-9]+", flow_name) if len(token) > 2]
            score += sum(1 for token in flow_tokens if token in haystack)
        if score > best_score:
            best_score = score
            best_match = flow
    return best_match if best_score > 0 else None


def _visible_variable_snapshot(variables: dict[str, Any]) -> list[dict[str, Any]]:
    visible: list[dict[str, Any]] = []
    for key, variable in variables.items():
        if not isinstance(variable, dict):
            continue
        visible.append(
            {
                "key": key,
                "label": variable.get("label") or key,
                "category": variable.get("category") or "general",
                "description": variable.get("description") or "",
                "editableByClient": bool(variable.get("editableByClient")),
                "isSecret": bool(variable.get("isSecret")),
                "value": "[secret hidden]" if bool(variable.get("isSecret")) else str(variable.get("value") or ""),
            }
        )
    return sorted(visible, key=lambda item: (str(item.get("category") or ""), str(item.get("key") or "")))


def _summarize_threads(snapshot: dict[str, Any], limit: int = 5) -> list[dict[str, Any]]:
    threads = snapshot.get("threads") if isinstance(snapshot.get("threads"), list) else []
    ordered = _sort_recent([thread for thread in threads if isinstance(thread, dict)], "last_activity_at", "lastActivityAt", "updated_at")
    summaries: list[dict[str, Any]] = []
    for thread in ordered[:limit]:
        latest = thread.get("latestMessage") if isinstance(thread.get("latestMessage"), dict) else {}
        summaries.append(
            {
                "id": thread.get("id"),
                "subject": thread.get("subject") or thread.get("generated_title") or "Untitled thread",
                "status": thread.get("status") or "unknown",
                "channelType": thread.get("channel_type") or thread.get("channelType") or "unknown",
                "lastActivityAt": thread.get("last_activity_at") or thread.get("lastActivityAt") or thread.get("updated_at"),
                "latestMessage": str(latest.get("body") or latest.get("plain_text") or thread.get("preview") or "").strip()[:180],
            }
        )
    return summaries


def _summarize_events(events: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    upcoming = []
    for event in events:
        if not isinstance(event, dict):
            continue
        start = _parse_iso(event.get("start_time") or event.get("startTime"))
        if start and start >= now:
            upcoming.append(event)
    ordered = sorted(upcoming, key=lambda item: _parse_iso(item.get("start_time") or item.get("startTime")) or datetime.max.replace(tzinfo=UTC))
    summaries: list[dict[str, Any]] = []
    for event in ordered[:limit]:
        summaries.append(
            {
                "id": event.get("id"),
                "title": event.get("title") or "Untitled event",
                "status": event.get("status") or "unknown",
                "startTime": event.get("start_time") or event.get("startTime"),
                "endTime": event.get("end_time") or event.get("endTime"),
                "locationType": event.get("location_type") or event.get("locationType") or "other",
                "location": event.get("location") or event.get("meeting_url") or "",
            }
        )
    return summaries


def _extract_run_error(run: dict[str, Any]) -> str:
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    for step in reversed(steps):
        if not isinstance(step, dict):
            continue
        if str(step.get("status") or "").strip().lower() == "error":
            error_text = str(step.get("error") or "").strip()
            if error_text:
                return error_text
            data = step.get("data") if isinstance(step.get("data"), dict) else {}
            nested = str(data.get("error") or data.get("message") or "").strip()
            if nested:
                return nested
    return ""


def _summarize_runs(runs: list[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
    ordered = _sort_recent([run for run in runs if isinstance(run, dict)], "updated_at", "created_at")
    summaries: list[dict[str, Any]] = []
    for run in ordered[:limit]:
        context = run.get("context") if isinstance(run.get("context"), dict) else {}
        flow = context.get("flow") if isinstance(context.get("flow"), dict) else {}
        trigger_event = context.get("trigger_event") if isinstance(context.get("trigger_event"), dict) else {}
        summaries.append(
            {
                "id": run.get("id"),
                "status": run.get("status") or "unknown",
                "mode": run.get("mode") or "unknown",
                "createdAt": run.get("created_at"),
                "updatedAt": run.get("updated_at"),
                "flowId": context.get("flow_id") or context.get("flowId") or flow.get("id"),
                "flowName": context.get("flow_name") or context.get("flowName") or flow.get("name"),
                "triggerEventType": trigger_event.get("type"),
                "command": str(run.get("command") or "").strip()[:180],
                "error": _extract_run_error(run),
            }
        )
    return summaries


def _summarize_recent_errors(runs: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    for run in _summarize_runs(runs, limit=20):
        status = str(run.get("status") or "").strip().lower()
        if status == "error" or run.get("error"):
            errors.append(
                {
                    "runId": run.get("id"),
                    "flowId": run.get("flowId"),
                    "flowName": run.get("flowName"),
                    "triggerEventType": run.get("triggerEventType"),
                    "error": run.get("error") or "Execution failed without a structured error message.",
                    "createdAt": run.get("createdAt"),
                }
            )
    return errors[:limit]


def _select_tenant_settings(tenant_settings: dict[str, Any], domains: set[str]) -> dict[str, Any]:
    selected: dict[str, Any] = {}
    if "settings" in domains or "general" in domains or "status" in domains:
        selected["branding"] = tenant_settings.get("branding") if isinstance(tenant_settings.get("branding"), dict) else {}
        selected["navigation"] = tenant_settings.get("navigation") if isinstance(tenant_settings.get("navigation"), dict) else {}
        selected["comms"] = tenant_settings.get("comms") if isinstance(tenant_settings.get("comms"), dict) else {}
        selected["calendar"] = tenant_settings.get("calendar") if isinstance(tenant_settings.get("calendar"), dict) else {}
        selected["internal"] = tenant_settings.get("internal") if isinstance(tenant_settings.get("internal"), dict) else {}
    if "variables" in domains:
        selected["globalVariables"] = tenant_settings.get("globalVariables") if isinstance(tenant_settings.get("globalVariables"), dict) else {}
    return selected


def build_assist_context(
    *,
    message: str,
    context: dict[str, Any] | None,
    token: str,
    session: dict[str, Any],
    auth_store: Any,
    provider: Any,
) -> tuple[dict[str, Any], list[str], str, set[str]]:
    intent = classify_assist_intent(message, context)
    domains = detect_assist_domains(message, context)
    user = session.get("user") if isinstance(session.get("user"), dict) else {}
    tenant = session.get("tenant") if isinstance(session.get("tenant"), dict) else {}
    role = "client" if str(user.get("role") or "").strip().lower() == "client" else "operator"
    tenant_id = str(tenant.get("id") or "").strip()
    if not tenant_id:
        raise ValueError("Active tenant context is required.")

    bundle = auth_store.get_canonical_settings_bundle(token, tenant_id, user_id=user.get("id"))
    tenant_settings = bundle.get("tenantSettings") if isinstance(bundle.get("tenantSettings"), dict) else {}
    assembled: dict[str, Any] = {
        "role": role,
        "intent": intent,
        "domains": sorted(domains),
        "tenantSettings": _select_tenant_settings(tenant_settings, domains),
    }
    used = ["tenantSettings"]

    if role == "operator" and ("automation" in domains or intent in {INTENT_WHY, INTENT_STATUS}):
        flows = provider.list_flows() if getattr(provider, "list_flows", None) else []
        assembled["flows"] = [
            {
                "id": flow.get("id"),
                "name": flow.get("name") or "Untitled Flow",
                "status": flow.get("status") or "Draft",
                "updatedAt": flow.get("updatedAt") or flow.get("updated_at"),
                "triggers": _extract_flow_triggers(flow),
                "nodeCount": len(flow.get("nodes") if isinstance(flow.get("nodes"), list) else []),
                "metadata": flow.get("metadata") if isinstance(flow.get("metadata"), dict) else {},
                "_raw": flow,
            }
            for flow in (flows or [])
            if isinstance(flow, dict)
        ][:12]
        used.append("flows")

        runs = provider.list_ai_runs(limit=20) if getattr(provider, "list_ai_runs", None) else []
        assembled["recentRuns"] = _summarize_runs(runs, limit=12)
        assembled["recentErrors"] = _summarize_recent_errors(runs, limit=5)
        used.extend(["recentRuns", "recentErrors"])

    if role == "operator" and ("variables" in domains or "settings" in domains or intent == INTENT_STATUS):
        variables = tenant_settings.get("globalVariables") if isinstance(tenant_settings.get("globalVariables"), dict) else {}
        assembled["globalVariables"] = _visible_variable_snapshot(variables)
        used.append("globalVariables")

    if "comms" in domains or intent == INTENT_STATUS:
        snapshot = provider.get_comms_snapshot() if getattr(provider, "get_comms_snapshot", None) else {}
        assembled["comms"] = {
            "threadCount": len(snapshot.get("threads") if isinstance(snapshot.get("threads"), list) else []),
            "recentThreads": _summarize_threads(snapshot, limit=5),
        }
        used.append("comms")

    if "calendar" in domains or intent == INTENT_STATUS:
        events = provider.list_calendar_events() if getattr(provider, "list_calendar_events", None) else []
        assembled["calendar"] = {
            "upcomingEvents": _summarize_events(events or [], limit=5),
            "eventCount": len(events or []),
        }
        used.append("calendar")

    return assembled, used, intent, domains


def _lookup_matching_variables(message: str, variables: list[dict[str, Any]], context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    explicit_key = str((context or {}).get("variableKey") or (context or {}).get("variable_key") or "").strip().lower()
    if explicit_key:
        return [item for item in variables if str(item.get("key") or "").strip().lower() == explicit_key]
    haystack = _normalize_text(message)
    matches = []
    for item in variables:
        key = _normalize_text(item.get("key"))
        label = _normalize_text(item.get("label"))
        if (key and key in haystack) or (label and label in haystack):
            matches.append(item)
    return matches


def _settings_config_response(message: str, assembled: dict[str, Any], context: dict[str, Any] | None) -> dict[str, Any]:
    tenant_settings = assembled.get("tenantSettings") if isinstance(assembled.get("tenantSettings"), dict) else {}
    branding = tenant_settings.get("branding") if isinstance(tenant_settings.get("branding"), dict) else {}
    navigation = tenant_settings.get("navigation") if isinstance(tenant_settings.get("navigation"), dict) else {}
    comms = tenant_settings.get("comms") if isinstance(tenant_settings.get("comms"), dict) else {}
    calendar = tenant_settings.get("calendar") if isinstance(tenant_settings.get("calendar"), dict) else {}
    internal = tenant_settings.get("internal") if isinstance(tenant_settings.get("internal"), dict) else {}
    variables = assembled.get("globalVariables") if isinstance(assembled.get("globalVariables"), list) else []
    haystack = _normalize_text(message)

    if any(term in haystack for term in ["brand", "theme", "color", "logo"]):
        answer = f"Branding is currently set to theme '{branding.get('theme') or 'auto'}'."
        brand_name = branding.get("companyName") or branding.get("name")
        if brand_name:
            answer = f"Branding is currently set to '{brand_name}' with theme '{branding.get('theme') or 'auto'}'."
        insights = []
        if branding.get("primaryColor"):
            insights.append(f"Primary color: {branding.get('primaryColor')}.")
        if branding.get("accentColor"):
            insights.append(f"Accent color: {branding.get('accentColor')}.")
        insights.append(f"Logo configured: {'yes' if bool(branding.get('logoUrl')) else 'no'}.")
        return {
            "answer": answer,
            "insights": insights,
            "suggestedActions": ["Use the Settings module to update branding and save changes through canonical tenant settings."],
        }

    if any(term in haystack for term in ["menu", "navigation", "sidebar"]):
        structure = navigation.get("menuStructure") if isinstance(navigation.get("menuStructure"), list) else []
        labels = [str(item.get("label") or item.get("title") or item.get("id") or "Untitled") for item in structure[:6] if isinstance(item, dict)]
        if not structure:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["Review the canonical navigation menu structure in Settings."]}
        return {
            "answer": f"The persisted navigation currently contains {len(structure)} top-level items.",
            "insights": [f"First items: {', '.join(labels)}." if labels else "Navigation is present but item labels were not available."],
            "suggestedActions": ["Use the Settings module to change menu structure. Unsaved draft menu changes do not drive the live shell."],
        }

    if any(term in haystack for term in ["variable", "placeholder", "merge field"]):
        matches = _lookup_matching_variables(message, variables, context)
        if matches:
            variable = matches[0]
            return {
                "answer": f"Variable '{variable.get('key')}' is available in category '{variable.get('category')}'.",
                "insights": [
                    f"Label: {variable.get('label')}.",
                    f"Value: {variable.get('value')}.",
                    f"Editable by client: {'yes' if variable.get('editableByClient') else 'no'}.",
                ],
                "suggestedActions": ["Update global variables through the existing variables surface or API if the value is incorrect."],
            }
        if not variables:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["No global variables were available in the canonical bundle."]}
        sample = ", ".join(item.get("key") or "" for item in variables[:5] if item.get("key"))
        return {
            "answer": f"There are {len(variables)} global variables projected into canonical tenant settings.",
            "insights": [f"Sample keys: {sample}." if sample else "Variable records exist but keys were not available."],
            "suggestedActions": ["Ask about a specific variable key if you need one value checked."],
        }

    if any(term in haystack for term in ["email template", "system email", "comms default", "send-to"]):
        templates = comms.get("systemEmailTemplates") if isinstance(comms.get("systemEmailTemplates"), dict) else {}
        enabled = [key for key, value in templates.items() if isinstance(value, dict) and bool(value.get("enabled", True))]
        if not templates:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["No projected system email templates were available in the canonical bundle."]}
        return {
            "answer": f"There are {len(templates)} projected system email templates in comms defaults.",
            "insights": [f"Enabled templates: {', '.join(enabled[:6])}." if enabled else "No enabled templates were found."],
            "suggestedActions": ["Use the system email settings surface to update template content or recipients."],
        }

    if any(term in haystack for term in ["calendar default", "default duration", "buffer", "meeting location"]):
        defaults = calendar.get("defaults") if isinstance(calendar.get("defaults"), dict) else {}
        if not defaults:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["Calendar defaults are not populated in canonical tenant settings."]}
        return {
            "answer": "Calendar defaults are active in canonical tenant settings and are applied when booking inputs omit those fields.",
            "insights": [
                f"defaultMeetingDuration: {defaults.get('defaultMeetingDuration')}.",
                f"bufferBeforeMinutes: {defaults.get('bufferBeforeMinutes')}.",
                f"bufferAfterMinutes: {defaults.get('bufferAfterMinutes')}.",
                f"defaultLocationType: {defaults.get('defaultLocationType')}.",
            ],
            "suggestedActions": ["Update canonical tenant settings if default duration, buffers, or location need to change."],
        }

    if any(term in haystack for term in ["internal", "onboarding", "fulfillment", "operator"]):
        if not internal:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["Operational metadata is not populated in tenantSettings.internal."]}
        insights = [f"{key}: {value}" for key, value in list(internal.items())[:6]]
        return {
            "answer": "Operational tenant metadata is stored in tenantSettings.internal.",
            "insights": insights,
            "suggestedActions": ["Keep route-critical identity fields on the tenant row and operational fields in tenantSettings.internal."],
        }

    return {
        "answer": "Canonical tenant settings are available for branding, navigation, projected variables, comms defaults, calendar defaults, and internal metadata.",
        "insights": [],
        "suggestedActions": ["Ask about a specific configuration area such as branding, menu structure, variables, comms defaults, or calendar defaults."],
    }


def _operator_status_response(assembled: dict[str, Any]) -> dict[str, Any]:
    flows = assembled.get("flows") if isinstance(assembled.get("flows"), list) else []
    runs = assembled.get("recentRuns") if isinstance(assembled.get("recentRuns"), list) else []
    errors = assembled.get("recentErrors") if isinstance(assembled.get("recentErrors"), list) else []
    comms = assembled.get("comms") if isinstance(assembled.get("comms"), dict) else {}
    calendar = assembled.get("calendar") if isinstance(assembled.get("calendar"), dict) else {}
    tenant_settings = assembled.get("tenantSettings") if isinstance(assembled.get("tenantSettings"), dict) else {}
    branding = tenant_settings.get("branding") if isinstance(tenant_settings.get("branding"), dict) else {}

    active_flows = [flow for flow in flows if str(flow.get("status") or "").strip().lower() == "active"]
    answer = (
        f"The workspace is live with {len(active_flows)} active flows, {len(runs)} recent execution runs, "
        f"{len(errors)} recent run errors, {int(comms.get('threadCount') or 0)} comms threads, and "
        f"{len(calendar.get('upcomingEvents') if isinstance(calendar.get('upcomingEvents'), list) else [])} upcoming events."
    )
    insights: list[str] = []
    if branding.get("theme"):
        insights.append(f"Current theme: {branding.get('theme')}.")
    if active_flows:
        insights.append(f"Active flows: {', '.join(str(flow.get('name') or flow.get('id')) for flow in active_flows[:5])}.")
    if errors:
        latest_error = errors[0]
        insights.append(f"Latest execution error: {latest_error.get('error')} (run {latest_error.get('runId')}).")
    elif runs:
        insights.append(f"Latest execution run status: {runs[0].get('status')} (run {runs[0].get('id')}).")
    upcoming = calendar.get("upcomingEvents") if isinstance(calendar.get("upcomingEvents"), list) else []
    if upcoming:
        insights.append(f"Next event: {upcoming[0].get('title')} at {upcoming[0].get('startTime')}.")
    return {
        "answer": answer,
        "insights": insights,
        "suggestedActions": ["Ask a narrower question if you need flow diagnostics, settings details, or booking/comms state."],
    }


def _client_status_response(assembled: dict[str, Any]) -> dict[str, Any]:
    comms = assembled.get("comms") if isinstance(assembled.get("comms"), dict) else {}
    calendar = assembled.get("calendar") if isinstance(assembled.get("calendar"), dict) else {}
    upcoming = calendar.get("upcomingEvents") if isinstance(calendar.get("upcomingEvents"), list) else []
    recent_threads = comms.get("recentThreads") if isinstance(comms.get("recentThreads"), list) else []
    return {
        "answer": (
            f"I can currently see {int(comms.get('threadCount') or 0)} conversation threads and {len(upcoming)} upcoming calendar events "
            "on your client-safe surface."
        ),
        "insights": [
            f"Next event: {upcoming[0].get('title')} at {upcoming[0].get('startTime')}." if upcoming else "No upcoming events were found.",
            f"Recent thread: {recent_threads[0].get('subject')}." if recent_threads else "No recent threads were found.",
        ],
        "suggestedActions": ["Use Comms for conversation follow-up and Calendar for booking changes.", "Ask an operator for internal automation or configuration details."],
    }


def _diagnostic_response(message: str, assembled: dict[str, Any], context: dict[str, Any] | None) -> dict[str, Any]:
    flows = assembled.get("flows") if isinstance(assembled.get("flows"), list) else []
    runs = assembled.get("recentRuns") if isinstance(assembled.get("recentRuns"), list) else []
    errors = assembled.get("recentErrors") if isinstance(assembled.get("recentErrors"), list) else []
    variables = assembled.get("globalVariables") if isinstance(assembled.get("globalVariables"), list) else []
    target_flow = _find_matching_flow(message, flows, context)
    target_event = _extract_query_event_type(message, context)
    matched_variables = _lookup_matching_variables(message, variables, context)
    relevant_runs = runs

    insights: list[str] = []
    suggested: list[str] = []

    if target_flow:
        relevant_runs = [
            run
            for run in runs
            if str(run.get("flowId") or "").strip() == str(target_flow.get("id") or "").strip()
            or _normalize_text(run.get("flowName")) == _normalize_text(target_flow.get("name"))
        ]
        insights.append(f"Flow '{target_flow.get('name')}' status: {target_flow.get('status')}.")
        if target_flow.get("triggers"):
            insights.append(f"Registered triggers: {', '.join(target_flow.get('triggers')[:5])}.")
        if str(target_flow.get("status") or "").strip().lower() != "active":
            return {
                "answer": f"Flow '{target_flow.get('name')}' is not active, so it will not execute.",
                "insights": insights,
                "suggestedActions": ["Activate the flow before testing it again."],
            }
        suggested.append("Confirm the triggering event is actually emitted in the current workspace.")

    if target_event:
        matching_flows = [flow for flow in flows if match_flow_trigger_event(flow.get("_raw") or {}, target_event)]
        relevant_runs = [
            run
            for run in relevant_runs
            if str(run.get("triggerEventType") or "").strip().lower().replace("-", "_") == target_event
        ]
        insights.append(f"Trigger event under review: {target_event}.")
        if not matching_flows:
            return {
                "answer": f"No active or draft flow in the current workspace matched trigger event '{target_event}'.",
                "insights": insights,
                "suggestedActions": ["Add or fix a trigger node for that event before retesting."],
            }
        active_matching = [flow for flow in matching_flows if str(flow.get("status") or "").strip().lower() == "active"]
        insights.append(f"Flows matching the trigger: {', '.join(str(flow.get('name') or flow.get('id')) for flow in matching_flows[:5])}.")
        if not active_matching:
            return {
                "answer": f"Flows exist for '{target_event}', but none of them are active.",
                "insights": insights,
                "suggestedActions": ["Activate one matching flow before retesting the trigger."],
            }
        suggested.append("Review the most recent matching run to confirm where execution stopped.")

    if matched_variables:
        insights.append(f"Referenced variables found: {', '.join(str(item.get('key')) for item in matched_variables[:5])}.")
    elif "variable" in detect_assist_domains(message, context):
        return {
            "answer": "The variable referenced in your question is not present in the canonical global variables projection.",
            "insights": [],
            "suggestedActions": ["Create or correct the missing variable in the variables store so canonical projection can expose it."],
        }

    if relevant_runs:
        latest = relevant_runs[0]
        insights.append(f"Latest relevant run: {latest.get('id')} with status {latest.get('status')}.")
        if latest.get("error"):
            return {
                "answer": f"The most recent relevant run failed: {latest.get('error')}",
                "insights": insights,
                "suggestedActions": suggested or ["Inspect the failing run steps in AI activity to locate the exact failing action."],
            }
        if str(latest.get("status") or "").strip().lower() in {"completed", "success"}:
            return {
                "answer": f"I found a recent successful run ({latest.get('id')}) for this path. The failure is not confirmed from run history.",
                "insights": insights,
                "suggestedActions": suggested or ["Check the downstream action outcome or the triggering record that should have changed."],
            }

    if errors:
        latest_error = errors[0]
        insights.append(f"Most recent workspace execution error: {latest_error.get('error')} (run {latest_error.get('runId')}).")
        return {
            "answer": f"The latest recorded execution error is: {latest_error.get('error')}",
            "insights": insights,
            "suggestedActions": suggested or ["Inspect the failing execution run and verify required variables and trigger data are present."],
        }

    return {
        "answer": f"{INSUFFICIENT_DATA_MESSAGE} I did not find a recent matching run or a definitive flow failure for this question.",
        "insights": insights,
        "suggestedActions": suggested or ["Narrow the question with a flow name, trigger event, or variable key for a more precise diagnosis."],
    }


def _help_assist_response(message: str, provider: Any, context: dict[str, Any] | None) -> dict[str, Any]:
    """Surfaces META:DOC:HELP articles and handles missing documentation registry."""
    all_items = provider.list_brain_items() if getattr(provider, "list_brain_items", None) else []
    help_articles = [item for item in all_items if "META:DOC:HELP" in (item.get("tags") or [])]
    
    haystack = _normalize_text(message)
    module = (context or {}).get("module", "").lower()
    
    # 1. Search existing help articles
    matches = []
    for article in help_articles:
        title = _normalize_text(article.get("title"))
        content = _normalize_text(article.get("content"))
        if (title and title in haystack) or (module and module in _normalize_text(article.get("category"))):
            matches.append(article)
            
    if matches:
        article = matches[0]
        return {
            "answer": f"I found a Knowledgebase article that might help: '{article.get('title')}'",
            "insights": [f"Category: {article.get('category', 'General')}.", "Grounding: Charlie Doc Layer."],
            "suggestedActions": [f"Open Help Module to read '{article.get('title')}'."],
        }
        
    # 2. If no match, trigger auto-generation (Documentation Registry)
    topic = module or "General System"
    registry_payload = {
        "title": f"Help Request: {topic}",
        "category": topic,
        "tags": ["META:DOC:HELP", "META:DOC:PENDING", f"TOPIC:{topic.upper()}"],
        "content": f"Documentation requested for topic: {message}. System context: {module}.",
        "metadata": {
            "requested_by": "Charlie",
            "source": "Crosshair",
            "query": message,
            "status": "pending_generation"
        }
    }
    
    try:
        new_item = provider.create_brain_item(registry_payload)
        logger.info("Auto-registered missing documentation for: %s (ID: %s)", topic, new_item.get("id"))
    except Exception as e:
        logger.error("Failed to register missing documentation: %s", str(e))
    
    return {
        "answer": f"I don't have a specific help guide for {topic} yet, but I've added it to my documentation queue and the system will generate it shortly.",
        "insights": [f"Topic '{topic}' registered in Documentation Registry.", "Status: GENERATION_QUEUED"],
        "suggestedActions": ["Consult an operator for immediate manual assistance."],
    }


def _how_to_response(message: str, assembled: dict[str, Any], role: str) -> dict[str, Any]:
    if role == "client":
        if "calendar" in detect_assist_domains(message):
            return {
                "answer": "Use the Calendar module to view or change bookings on your client-safe surface.",
                "insights": ["Client mode keeps booking changes on the live calendar path."],
                "suggestedActions": ["Open Calendar and update the event directly."],
            }
        if "comms" in detect_assist_domains(message):
            return {
                "answer": "Use the Comms module to open a thread or send a message.",
                "insights": ["Client mode exposes conversations without internal automation controls."],
                "suggestedActions": ["Open Comms and continue the relevant thread."],
            }
        return {
            "answer": "Client mode only exposes messages and bookings.",
            "insights": [],
            "suggestedActions": ["Ask an operator for system configuration or automation changes."],
        }

    return _settings_config_response(message, assembled, None)


def _what_is_response(message: str, assembled: dict[str, Any], role: str, context: dict[str, Any] | None) -> dict[str, Any]:
    domains = detect_assist_domains(message, context)
    if role == "client" and ("automation" in domains or "variables" in domains or "settings" in domains):
        return {
            "answer": "Client mode does not expose internal flow, variable, or tenant configuration details.",
            "insights": [],
            "suggestedActions": ["Ask an operator if you need an internal system explanation."],
        }
    if "settings" in domains or "variables" in domains:
        return _settings_config_response(message, assembled, context)
    if "calendar" in domains:
        calendar = assembled.get("calendar") if isinstance(assembled.get("calendar"), dict) else {}
        upcoming = calendar.get("upcomingEvents") if isinstance(calendar.get("upcomingEvents"), list) else []
        if not upcoming:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["No upcoming events were available to summarize."]}
        return {
            "answer": f"The next upcoming event is '{upcoming[0].get('title')}' at {upcoming[0].get('startTime')}.",
            "insights": [f"Status: {upcoming[0].get('status')}.", f"Location type: {upcoming[0].get('locationType')}."],
            "suggestedActions": [],
        }
    if "comms" in domains:
        comms = assembled.get("comms") if isinstance(assembled.get("comms"), dict) else {}
        threads = comms.get("recentThreads") if isinstance(comms.get("recentThreads"), list) else []
        if not threads:
            return {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": ["No recent conversation threads were available to summarize."]}
        return {
            "answer": f"The most recent conversation thread is '{threads[0].get('subject')}'.",
            "insights": [f"Status: {threads[0].get('status')}.", f"Channel: {threads[0].get('channelType')}."],
            "suggestedActions": [],
        }
    return _operator_status_response(assembled) if role == "operator" else _client_status_response(assembled)


def generate_assist_response(
    *,
    message: str,
    context: dict[str, Any] | None,
    token: str,
    session: dict[str, Any],
    auth_store: Any,
    provider: Any,
) -> dict[str, Any]:
    assembled, used, intent, domains = build_assist_context(
        message=message,
        context=context,
        token=token,
        session=session,
        auth_store=auth_store,
        provider=provider,
    )
    role = str(assembled.get("role") or "operator")
    restricted_client_topics = role == "client" and any(domain in domains for domain in {"automation", "variables", "settings"})
    if restricted_client_topics and not any(domain in domains for domain in {"calendar", "comms", "status"}):
        response = {
            "answer": "Client mode does not expose internal flow, variable, or tenant configuration details.",
            "insights": [],
            "suggestedActions": ["Ask an operator for internal system diagnostics or configuration changes."],
        }
    elif context.get("assistMode") == "help":
        response = _help_assist_response(message, provider, context)
    elif intent == INTENT_STATUS:
        response = _operator_status_response(assembled) if role == "operator" else _client_status_response(assembled)
    elif intent == INTENT_WHY:
        if role == "client":
            response = {
                "answer": "I can only diagnose messages and bookings in client mode. Internal automation details are hidden.",
                "insights": [],
                "suggestedActions": ["Ask an operator to inspect flow and run history if the issue is system-side."],
            }
        else:
            response = _diagnostic_response(message, assembled, context)
    elif intent == INTENT_HOW_TO:
        response = _how_to_response(message, assembled, role)
    elif intent in {INTENT_CONFIG, INTENT_WHAT_IS}:
        response = _what_is_response(message, assembled, role, context)
    else:
        response = {"answer": INSUFFICIENT_DATA_MESSAGE, "insights": [], "suggestedActions": []}

    answer = str(response.get("answer") or "").strip() or INSUFFICIENT_DATA_MESSAGE
    insights = response.get("insights") if isinstance(response.get("insights"), list) else []
    suggested_actions = response.get("suggestedActions") if isinstance(response.get("suggestedActions"), list) else []

    logger.info(
        "assist query tenant=%s user=%s role=%s intent=%s context=%s query=%r summary=%r",
        ((session.get("tenant") or {}).get("id") if isinstance(session.get("tenant"), dict) else None),
        ((session.get("user") or {}).get("id") if isinstance(session.get("user"), dict) else None),
        role,
        intent,
        ",".join(used),
        message[:400],
        answer[:240],
    )

    return {
        "answer": answer,
        "insights": [str(item) for item in insights if str(item or "").strip()],
        "suggestedActions": [str(item) for item in suggested_actions if str(item or "").strip()],
    }
