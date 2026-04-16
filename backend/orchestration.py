import json
import logging
import time
import re
import copy
import asyncio
from datetime import datetime, UTC, timedelta
from typing import Any
from urllib.parse import urlparse
from urllib import error as urlerror
from urllib import request as urlrequest
from uuid import uuid4
try:
    from backend.agent_definitions import AGENT_DEFINITIONS
    from backend.agent_runtime import AgentRegistry
    from backend.canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
    from backend.data_provider import reset_request_tenant, set_request_tenant_id
    from backend.email_verifier_service import (
        create_bulk_task as create_email_verifier_bulk_task,
        get_bulk_results as get_email_verifier_bulk_results,
        verify_single_email as verify_single_email_address,
    )
    from backend.media_engine import (
        get_media_engine,
        get_transcription_provider_lock,
        resolve_transcription_provider_id_from_lock,
    )
except ModuleNotFoundError:
    from agent_definitions import AGENT_DEFINITIONS
    from agent_runtime import AgentRegistry
    from canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
    from data_provider import reset_request_tenant, set_request_tenant_id
    from email_verifier_service import (
        create_bulk_task as create_email_verifier_bulk_task,
        get_bulk_results as get_email_verifier_bulk_results,
        verify_single_email as verify_single_email_address,
    )
    from media_engine import (
        get_media_engine,
        get_transcription_provider_lock,
        resolve_transcription_provider_id_from_lock,
    )
    from backend.auth_store import get_auth_store
except ModuleNotFoundError:
    from media_engine import (
        get_media_engine,
        get_transcription_provider_lock,
        resolve_transcription_provider_id_from_lock,
    )
    from auth_store import get_auth_store

logger = logging.getLogger(__name__)


def canonical_agent_id_for(agent_name: Any) -> str:
    normalized = str(agent_name or "").strip().upper()
    definition = AGENT_DEFINITIONS.get(normalized) or AGENT_DEFINITIONS["ALPHA"]
    return definition.agent_id

DIRECT_EXECUTION_INTENTS = {
    "query_vault",
    "schedule_calendar",
    "create_booking",
    "update_booking",
    "cancel_booking",
    "get_booking",
    "set_variable",
    "send_email",
    "send_sms",
    "store_data",
    "http_request",
    "if_then",
    "filter",
    "switch",
    "time_delay",
    "verify_email",
    "verify_email_bulk",
    "wait_for_verification",
    "verification_branch",
    "generate_script",
    "generate_run_of_show",
    "generate_transcript_intelligence",
    "generate_voice",
    "text_to_speech",
    "generate_thumbnail",
    "generate_video",
    "generate_podcast_script",
    "generate_postbot_content",
    "transcribe_media",
    "transcribe-media",
    "ingest_meeting_artifacts",
    "publish_asset",
    "rss_ingest",
    "generate_image",
    "INPUT_REQUIRED",
}

BOOKING_WRITE_INTENTS = {"schedule_calendar", "create_booking", "update_booking", "cancel_booking"}
BOOKING_INTENTS = BOOKING_WRITE_INTENTS | {"get_booking"}

def datetime_now() -> str:
    return datetime.now(UTC).isoformat()

def unique_suffix() -> str:
    return uuid4().hex[:10]


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def normalize_token(value: Any) -> str:
    return re.sub(r"[^a-z0-9_]+", "_", clean_text(value).lower()).strip("_")


def parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = clean_text(value).lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    return default


def parse_string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [clean_text(item) for item in value if clean_text(item)]
    if isinstance(value, str):
        return [clean_text(item) for item in re.split(r"[\n,]+", value) if clean_text(item)]
    return []


TRANSCRIPT_ACTION_VERBS = {
    "assign",
    "compile",
    "confirm",
    "create",
    "deliver",
    "draft",
    "finalize",
    "follow",
    "prepare",
    "publish",
    "review",
    "schedule",
    "send",
    "share",
    "update",
}

TRANSCRIPT_STOPWORDS = {
    "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "been", "but", "by",
    "can", "could", "did", "do", "does", "done", "each", "for", "from", "get", "got", "had", "has", "have",
    "if", "in", "into", "is", "it", "its", "just", "like", "meeting", "more", "most", "need", "needed", "needs",
    "not", "now", "of", "on", "one", "only", "or", "other", "our", "over", "should", "speaker", "than", "that",
    "the", "their", "them", "then", "there", "these", "they", "this", "those", "to", "too", "transcript", "very",
    "was", "we", "were", "what", "when", "where", "which", "who", "why", "will", "with", "would", "you", "your",
}


TEMPLATE_TOKEN_RE = re.compile(r"{{\s*([^{}]+?)\s*}}")
TOKEN_PATH_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+)*$")


def json_value(value: Any, default: Any = None) -> Any:
    if isinstance(value, (dict, list)):
        return json.loads(json.dumps(value))
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return default
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return default if default is not None else value
    return default if default is not None else value


def deep_merge_dict(target: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(target or {})
    for key, value in (updates or {}).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge_dict(merged[key], value)
        else:
            merged[key] = value
    return merged


def dotted_get(source: Any, path: str) -> Any:
    current = source
    for segment in [part for part in str(path or "").split(".") if part]:
        if isinstance(current, dict):
            current = current.get(segment)
            continue
        if isinstance(current, list) and segment.isdigit():
            index = int(segment)
            current = current[index] if 0 <= index < len(current) else None
            continue
        return None
    return current


def dotted_set(target: dict[str, Any], path: str, value: Any) -> None:
    segments = [part for part in str(path or "").split(".") if part]
    if not segments:
        return
    current = target
    for segment in segments[:-1]:
        next_value = current.get(segment)
        if not isinstance(next_value, dict):
            next_value = {}
            current[segment] = next_value
        current = next_value
    current[segments[-1]] = value


def safe_clone(value: Any) -> Any:
    return copy.deepcopy(value)


def is_numeric_segment(value: str) -> bool:
    return str(value or "").isdigit()


ALLOWED_HTTP_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}
SAFE_RETRY_HTTP_METHODS = {"GET", "HEAD"}


def safe_assign_path(target: dict[str, Any], path: str, value: Any) -> tuple[bool, str | None]:
    segments = [part for part in str(path or "").split(".") if part]
    if not segments:
        return False, "Variable path is required."
    current: Any = target
    for index, segment in enumerate(segments[:-1]):
        next_segment = segments[index + 1]
        if isinstance(current, dict):
            existing = current.get(segment)
            if existing is None:
                if is_numeric_segment(next_segment):
                    return False, f"Cannot create array path implicitly at '{'.'.join(segments[: index + 1])}'."
                current[segment] = {}
                existing = current[segment]
            elif not isinstance(existing, (dict, list)):
                return False, f"Path collision at '{'.'.join(segments[: index + 1])}': scalar cannot become nested."
            elif isinstance(existing, list) and not is_numeric_segment(next_segment):
                return False, f"Array path '{'.'.join(segments[: index + 1])}' requires numeric index access."
            elif isinstance(existing, dict) and is_numeric_segment(next_segment):
                return False, f"Cannot index object path '{'.'.join(segments[: index + 1])}' as an array."
            current = existing
            continue
        if isinstance(current, list):
            if not is_numeric_segment(segment):
                return False, f"Array path '{'.'.join(segments[:index])}' requires numeric index access."
            list_index = int(segment)
            if list_index < 0 or list_index >= len(current):
                return False, f"Array index out of range at '{'.'.join(segments[: index + 1])}'."
            existing = current[list_index]
            if existing is None:
                if is_numeric_segment(next_segment):
                    return False, f"Cannot create nested array path implicitly at '{'.'.join(segments[: index + 1])}'."
                current[list_index] = {}
                existing = current[list_index]
            elif not isinstance(existing, (dict, list)):
                return False, f"Path collision at '{'.'.join(segments[: index + 1])}': scalar cannot become nested."
            elif isinstance(existing, list) and not is_numeric_segment(next_segment):
                return False, f"Array path '{'.'.join(segments[: index + 1])}' requires numeric index access."
            elif isinstance(existing, dict) and is_numeric_segment(next_segment):
                return False, f"Cannot index object path '{'.'.join(segments[: index + 1])}' as an array."
            current = existing
            continue
        return False, f"Unsupported path traversal at '{'.'.join(segments[: index + 1])}'."

    leaf = segments[-1]
    cloned_value = safe_clone(value)
    if isinstance(current, dict):
        existing = current.get(leaf)
        if existing is not None:
            if isinstance(existing, (dict, list)) != isinstance(cloned_value, (dict, list)):
                return False, f"Path collision at '{path}': cannot replace scalar with object or object with scalar."
        current[leaf] = cloned_value
        return True, None
    if isinstance(current, list):
        if not is_numeric_segment(leaf):
            return False, f"Array path '{'.'.join(segments[:-1])}' requires numeric index access."
        list_index = int(leaf)
        if list_index < 0 or list_index >= len(current):
            return False, f"Array index out of range at '{path}'."
        existing = current[list_index]
        if existing is not None:
            if isinstance(existing, (dict, list)) != isinstance(cloned_value, (dict, list)):
                return False, f"Path collision at '{path}': cannot replace scalar with object or object with scalar."
        current[list_index] = cloned_value
        return True, None
    return False, f"Unsupported leaf write at '{path}'."


def runtime_tenant_settings(context: dict[str, Any]) -> dict[str, Any]:
    tenant = context.get("tenant") if isinstance(context.get("tenant"), dict) else {}
    candidate = tenant.get("tenant_settings") if isinstance(tenant.get("tenant_settings"), dict) else tenant.get("settings") or {}
    return normalize_tenant_settings_payload({"tenantSettings": candidate}, include_defaults=True)


def coerce_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    raw = str(value).strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def match_flow_trigger_event(flow: dict[str, Any], event_type: str) -> bool:
    nodes = flow.get("nodes") if isinstance(flow.get("nodes"), list) else []
    for node in nodes:
        if str(node.get("type") or "").lower() != "trigger":
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
            if not normalized:
                continue
            if normalized == event_type:
                return True
            if normalized.endswith("_trigger") and normalized[:-8] == event_type:
                return True
    return False


def emit_system_event(
    provider: Any,
    event: dict[str, Any],
    *,
    actor: dict[str, Any] | None = None,
    tenant: dict[str, Any] | None = None,
    provider_config: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    event_type = str(event.get("type") or "").strip()
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    if not event_type:
        return []

    meta = event.get("meta") if isinstance(event.get("meta"), dict) else {}
    depth = safe_int(meta.get("depth"), 0)
    if depth >= 1:
        logger.warning("Skipping nested system event %s at depth %s", event_type, depth)
        return []

    try:
        import server
    except Exception as exc:
        logger.error("Unable to import server for system event dispatch: %s", exc)
        return []

    dispatched_runs: list[dict[str, Any]] = []
    flows = []
    try:
        flows = provider.list_flows() if getattr(provider, "list_flows", None) else []
    except Exception as exc:
        logger.error("Unable to list flows for system event dispatch: %s", exc)
        return []

    tenant_payload = tenant or {"id": getattr(provider, "_tenant_id", lambda: None)()}
    for flow in flows or []:
        flow_status = str(flow.get("status") or "").strip().lower()
        if flow_status != "active":
            continue
        trigger_targets = server.resolve_flow_trigger_targets(flow, event_type)
        if not trigger_targets:
            continue
        raw_steps, flow_agent_chain = server.build_flow_execution_steps(
            flow,
            f"System event {event_type}",
            "DELTA",
            runtime_context={
                "system_event": event,
                "trigger_event": event,
                "booking_event": payload,
            },
            start_node_ids=trigger_targets,
        )
        if not raw_steps:
            continue
        flow_context = {
            "module": "flows",
            "surface": "system-event",
            "field": "event",
            "intent": "flow_trigger",
            "system_event": event,
            "trigger_event": event,
            "booking_event": payload,
            "flow_id": flow.get("id"),
            "flow_name": flow.get("name") or "Untitled Flow",
            "flow": {"id": flow.get("id"), "name": flow.get("name") or "Untitled Flow"},
            "step_count": len(raw_steps),
            "agent_chain": flow_agent_chain,
            "_provider_config": provider_config,
            "_requested_agent_locked": True,
            "_system_event_depth": depth + 1,
            "_system_event_type": event_type,
            "_system_event_actor": actor or {},
            "_system_event_tenant": tenant_payload,
            **payload,
        }
        try:
            engine = ExecutionEngine(provider)
            result = engine.run(
                raw_steps=raw_steps,
                mode="execute",
                command=f"System event {event_type}",
                context=flow_context,
                actor=actor or {},
                tenant=tenant_payload,
            )
            dispatched_runs.append(
                {
                    "flow_id": flow.get("id"),
                    "flow_name": flow.get("name") or "Untitled Flow",
                    "run_id": result.get("runId"),
                    "status": result.get("status"),
                }
            )
        except Exception as exc:
            logger.error("System event dispatch failed for flow %s: %s", flow.get("id"), exc)
    return dispatched_runs

def normalize_parsed_steps(raw_steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    if not isinstance(raw_steps, list):
        return []
    
    for i, raw in enumerate(raw_steps):
        intent = str(raw.get("action") or raw.get("intent") or "unknown")
        parameters = raw.get("parameters") or raw.get("payload") or {}
        
        step_id = raw.get("id") or f"step-{unique_suffix()}"
        # Phase 12 Declarative Step
        is_write = intent in ("draft_email", "schedule_calendar", "add_contact", "add_crm_note", "create_booking", "update_booking", "cancel_booking")
        mutation_type = "create" if intent in ("draft_email", "schedule_calendar", "add_contact", "add_crm_note", "create_booking") else "update" if intent == "update_booking" else "delete" if intent == "cancel_booking" else "none"
        target_type = intent.split("_")[-1] if "_" in intent else "unknown"
        is_external = intent in ("draft_email", "schedule_calendar")
        
        assigned_agent = str(raw.get("assignedAgent") or "ALPHA").strip().upper() or "ALPHA"
        if assigned_agent not in AGENT_DEFINITIONS:
            assigned_agent = "ALPHA"
        normalized.append({
            "id": step_id,
            "intent": intent,
            "parameters": parameters if isinstance(parameters, dict) else {},
            "status": "pending",
            "dependsOn": raw.get("depends_on") or ([normalized[i-1]["id"]] if i > 0 else []),
            
            "isWrite": is_write,
            "mutationType": mutation_type,
            "targetType": target_type,
            "isExternal": is_external,
            "sideEffect": is_write,
            "requiresApproval": False,
            
            "artifactTypes": [],
            "error": None,
            "data": None,
            
            "assignedAgent": assigned_agent,
            "agentId": canonical_agent_id_for(assigned_agent),
        })
    return normalized

def check_step_gate(step: dict[str, Any], actor: dict[str, Any], tenant: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    import server
    intent = step.get("intent", "")
    parameters = step.get("parameters", {})
    command_text = f"{intent} " + " ".join(str(v) for v in parameters.values())
    
    tier = server.resolve_permission_tier(command_text, intent=intent)

    if intent in BOOKING_INTENTS:
        return {
            "allowed": True,
            "requiresApproval": False,
            "reason": None,
            "permissionTier": tier,
            "riskLevel": "low" if intent == "get_booking" else "medium",
        }
    if intent in {"verify_email", "verify_email_bulk", "wait_for_verification", "verification_branch", "filter", "switch"}:
        return {
            "allowed": True,
            "requiresApproval": False,
            "reason": None,
            "permissionTier": tier,
            "riskLevel": "medium" if intent in {"verify_email", "verify_email_bulk"} else "low",
        }
    if intent == "schedule_calendar":
        return {
            "allowed": True,
            "requiresApproval": False,
            "reason": None,
            "permissionTier": tier,
            "riskLevel": "medium",
        }
    
    # Phase 12: Declarative gating
    is_write = step.get("isWrite", False)
    is_external = step.get("isExternal", False)
    mutation_type = step.get("mutationType", "none")
    
    requires_approval = False
    risk_level = "low"
    
    if tier in ("guarded", "dangerous"):
        requires_approval = True
        risk_level = "high"
    elif mutation_type == "delete":
        requires_approval = True
        risk_level = "high"
    elif is_write and is_external:
        requires_approval = True
        risk_level = "high"  # Per Phase 12 specs
    elif is_write and not is_external:
        requires_approval = True
        risk_level = "medium"
        
    return {
        "allowed": True,
        "requiresApproval": requires_approval,
        "reason": f"Action involves writes or sensitive mutations." if requires_approval else None,
        "permissionTier": tier,
        "riskLevel": risk_level
    }

def normalize_execution_artifacts(step: dict[str, Any], raw_result: Any) -> list[dict[str, Any]]:
    '''
    Artifact Adapter (Step 3) - Map results to real CRM objects without bloating server.py
    '''
    artifacts = []
    intent = step.get("intent")
    step_id = step.get("id")
    
    if intent == "draft_email":
        body = step.get("parameters", {}).get("body", "AI Draft")
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "email_draft",
            "title": "Email Draft Generated",
            "summary": "AI drafted an email for approval.",
            "data": {"body": body, "raw_result": raw_result},
            "uiBinding": {"module": "comms", "recordId": step_id, "view": "draft"},
            "createdAt": "now" # In real app, proper timestamp
        })
    elif intent == "schedule_calendar":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "calendar_event",
            "title": "Calendar Event Scheduled",
            "summary": "A meeting was added to the calendar.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "calendar", "recordId": step_id, "view": "event"},
            "createdAt": "now"
        })
    elif intent in {"create_booking", "update_booking", "cancel_booking", "get_booking"}:
        title_by_intent = {
            "create_booking": "Booking Created",
            "update_booking": "Booking Updated",
            "cancel_booking": "Booking Cancelled",
            "get_booking": "Booking Retrieved",
        }
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "calendar_event",
            "title": title_by_intent[intent],
            "summary": title_by_intent[intent],
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "calendar", "recordId": step_id, "view": "event"},
            "createdAt": "now"
        })
    elif intent == "add_contact":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "contact",
            "title": "Contact Created",
            "summary": "A new contact was added to the CRM.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "contacts", "recordId": step_id, "view": "detail"},
            "createdAt": "now"
        })
    elif intent == "add_crm_note":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "crm_note",
            "title": "CRM Note Added",
            "summary": "A contextual note was appended to the thread.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "crm", "recordId": step_id, "view": "timeline"},
            "createdAt": "now"
        })
    elif intent == "verify_email":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "email_verification",
            "title": "Email Verified",
            "summary": "Email verification completed for a single record.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "crm", "recordId": step_id, "view": "detail"},
            "createdAt": "now"
        })
    elif intent in {"verify_email_bulk", "wait_for_verification"}:
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "email_verification_task",
            "title": "Email Verification Task",
            "summary": "Bulk email verification task state updated.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "crm", "recordId": step_id, "view": "list"},
            "createdAt": "now"
        })
    elif intent == "generate_video":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "media_render",
            "title": "Media Render Job",
            "summary": "A media render job was queued or completed.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "generate_script":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "script_generation",
            "title": "Script Job",
            "summary": "A script job was completed through the media layer.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "generate_run_of_show":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "run_of_show_generation",
            "title": "Run of Show Job",
            "summary": "A structured run of show was generated.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "generate_transcript_intelligence":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "transcript_intelligence",
            "title": "Transcript Intelligence",
            "summary": "Structured intelligence was generated from transcript output.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "generate_voice":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "audio_render",
            "title": "Audio Render Job",
            "summary": "A voice render job was queued or completed.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "text_to_speech":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "audio_render",
            "title": "Text to Speech Job",
            "summary": "A text-to-speech render job was queued or completed.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "generate_thumbnail":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "image_generation",
            "title": "Thumbnail Job",
            "summary": "A thumbnail render was queued or completed.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "publish_asset":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "media_publication",
            "title": "Publish Asset",
            "summary": "A media publication record was created.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "transcribe_media":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "media_transcript",
            "title": "Transcript Job",
            "summary": "Media transcription state updated.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    elif intent == "ingest_meeting_artifacts":
        artifacts.append({
            "id": f"art-{unique_suffix()}",
            "type": "meeting_ingest",
            "title": "Meeting Ingestion",
            "summary": "Meeting artifacts were normalized and attached.",
            "data": {"raw_result": raw_result},
            "uiBinding": {"module": "flows", "recordId": step_id, "view": "run"},
            "createdAt": "now"
        })
    return artifacts


def resolve_brand_profile(provider: Any, company_id: str | None = None, tenant_id: str | None = None) -> dict[str, Any]:
    """
    Resolve brand profile with deterministic fallback chain:
    1. Client-level brand profile (company.brandProfile JSON, if enabled)
    2. Global Brain/Cortex DNA (brain_profiles table)
    3. Empty defaults

    Returns camelCase dict suitable for prompt injection.
    """
    # Priority 1: Client-level brand profile
    if company_id and provider:
        try:
            company = provider.get_company(company_id)
            if company:
                bp_raw = company.get("brandProfile") or company.get("brand_profile")
                if isinstance(bp_raw, str):
                    bp_raw = json.loads(bp_raw) if bp_raw.strip() else None
                if isinstance(bp_raw, dict) and bp_raw.get("enabled"):
                    return {
                        "brandName": clean_text(bp_raw.get("brandName") or bp_raw.get("brand_name") or company.get("name")),
                        "brandVoice": clean_text(bp_raw.get("brandVoice") or bp_raw.get("brand_voice")),
                        "valueProp": clean_text(bp_raw.get("valueProp") or bp_raw.get("value_prop")),
                        "differentiation": clean_text(bp_raw.get("differentiation")),
                        "idealCustomer": clean_text(bp_raw.get("idealCustomer") or bp_raw.get("ideal_customer")),
                        "painPoints": clean_text(bp_raw.get("painPoints") or bp_raw.get("pain_points")),
                        "marketingStrategy": clean_text(bp_raw.get("marketingStrategy") or bp_raw.get("marketing_strategy")),
                        "toneDirectives": clean_text(bp_raw.get("toneDirectives") or bp_raw.get("tone_directives")),
                        "notes": clean_text(bp_raw.get("notes")),
                    }
        except Exception:
            pass

    # Priority 2: Global Brain/Cortex DNA
    if provider:
        try:
            profile = provider.get_brain_profile()
            if profile:
                return {
                    "brandName": clean_text(profile.get("companyName") or profile.get("company_name") or profile.get("primaryBrand") or profile.get("primary_brand")),
                    "brandVoice": clean_text(profile.get("brandVoice") or profile.get("brand_voice")),
                    "valueProp": clean_text(profile.get("valueProp") or profile.get("value_prop")),
                    "differentiation": clean_text(profile.get("differentiation")),
                    "idealCustomer": clean_text(profile.get("idealCustomer") or profile.get("ideal_customer")),
                    "painPoints": clean_text(profile.get("painPoints") or profile.get("pain_points")),
                    "marketingStrategy": clean_text(profile.get("marketingStrategy") or profile.get("marketing_strategy")),
                    "toneDirectives": "",
                    "notes": "",
                }
        except Exception:
            pass

    # Priority 3: Empty defaults
    return {
        "brandName": "",
        "brandVoice": "",
        "valueProp": "",
        "differentiation": "",
        "idealCustomer": "",
        "painPoints": "",
        "marketingStrategy": "",
        "toneDirectives": "",
        "notes": "",
    }


def normalize_postbot_input(raw: dict[str, Any], trigger_type: str = "manual") -> dict[str, Any]:
    """
    Normalize any trigger source into the canonical PostBot input contract.
    All trigger paths (manual, form, feed) must pass through this function
    before reaching the PostBot engine.
    """
    # Shape B — Form submission payload: flatten formData.fields.* into root
    form_data = raw.get("formData")
    if isinstance(form_data, dict):
        form_fields = form_data.get("fields") or form_data.get("data") or form_data.get("submission") or {}
        if isinstance(form_fields, dict):
            raw = {**form_fields, **raw}
        if isinstance(form_data.get("formId"), str):
            raw.setdefault("formId", form_data["formId"])
        if isinstance(form_data.get("id"), str):
            raw.setdefault("formId", form_data["id"])

    if isinstance(raw.get("targetPlatforms"), str):
        platforms = [p.strip().lower() for p in raw["targetPlatforms"].split(",") if p.strip()]
    elif isinstance(raw.get("targetPlatforms"), list):
        platforms = [str(p).strip().lower() for p in raw["targetPlatforms"] if str(p).strip()]
    else:
        raw_platforms = raw.get("platforms") or raw.get("platform") or ""
        if isinstance(raw_platforms, list):
            platforms = [str(p).strip().lower() for p in raw_platforms if str(p).strip()]
        elif isinstance(raw_platforms, str):
            platforms = [p.strip().lower() for p in raw_platforms.split(",") if p.strip()]
        else:
            platforms = []

    return {
        "articleUrl": clean_text(raw.get("articleUrl") or raw.get("article_url") or raw.get("sourceUrl") or raw.get("source_url") or raw.get("url")),
        "articleTitle": clean_text(raw.get("articleTitle") or raw.get("article_title") or raw.get("title")),
        "articleSummary": clean_text(raw.get("articleSummary") or raw.get("article_summary") or raw.get("summary") or raw.get("content") or raw.get("sourceContent") or raw.get("source_content")),
        "sourceContent": clean_text(raw.get("sourceContent") or raw.get("source_content") or raw.get("fullContent") or raw.get("full_content")),
        "targetPlatforms": platforms,
        "imageStyle": clean_text(raw.get("imageStyle") or raw.get("image_style") or "Artstyle Pop Art"),
        "customInstructions": clean_text(raw.get("customInstructions") or raw.get("custom_instructions")),
        "outputNotes": clean_text(raw.get("outputNotes") or raw.get("output_notes")),
        "generateAudio": clean_text(raw.get("generateAudio") or raw.get("generate_audio") or "No").lower() == "yes",
        "generateShorts": clean_text(raw.get("generateShorts") or raw.get("generate_shorts") or "No").lower() == "yes",
        "publishToYouTube": clean_text(raw.get("publishToYouTube") or raw.get("publish_to_youtube") or "No").lower() == "yes",
        "sourceType": clean_text(raw.get("sourceType") or raw.get("source_type") or trigger_type),
        "sourceFormId": clean_text(raw.get("sourceFormId") or raw.get("source_form_id") or raw.get("formId") or raw.get("form_id")),
        "sourceFeedId": clean_text(raw.get("sourceFeedId") or raw.get("source_feed_id") or raw.get("feedId") or raw.get("feed_id")),
        "triggerType": clean_text(trigger_type),
    }


class StepExecutor:
    def __init__(self, provider: Any) -> None:
        self.provider = provider
        self.service_registry = {
            "set_variable": {"service": "variableService", "handlerType": "direct", "executionType": "deterministic"},
            "send_email": {"service": "messagingService", "handlerType": "direct", "executionType": "deterministic"},
            "send_sms": {"service": "messagingService", "handlerType": "direct", "executionType": "deterministic"},
            "store_data": {"service": "storageService", "handlerType": "direct", "executionType": "deterministic"},
            "http_request": {"service": "httpService", "handlerType": "adapter", "executionType": "bridge"},
            "if_then": {"service": "logicService", "handlerType": "direct", "executionType": "deterministic"},
            "filter": {"service": "logicService", "handlerType": "direct", "executionType": "deterministic"},
            "switch": {"service": "logicService", "handlerType": "direct", "executionType": "deterministic"},
            "time_delay": {"service": "logicService", "handlerType": "direct", "executionType": "deterministic"},
            "create_booking": {"service": "bookingService", "handlerType": "direct", "executionType": "deterministic"},
            "update_booking": {"service": "bookingService", "handlerType": "direct", "executionType": "deterministic"},
            "cancel_booking": {"service": "bookingService", "handlerType": "direct", "executionType": "deterministic"},
            "get_booking": {"service": "bookingService", "handlerType": "direct", "executionType": "deterministic"},
            "verify_email": {"service": "verificationService", "handlerType": "direct", "executionType": "deterministic"},
            "verify_email_bulk": {"service": "verificationService", "handlerType": "direct", "executionType": "deterministic"},
            "wait_for_verification": {"service": "logicService", "handlerType": "direct", "executionType": "deterministic"},
            "verification_branch": {"service": "logicService", "handlerType": "direct", "executionType": "deterministic"},
            "generate_script": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "generate_run_of_show": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "generate_transcript_intelligence": {"service": "mediaService", "handlerType": "direct", "executionType": "deterministic"},
            "generate_voice": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "text_to_speech": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "generate_thumbnail": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "generate_video": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "transcribe_media": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "transcribe-media": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "ingest_meeting_artifacts": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
            "publish_asset": {"service": "mediaService", "handlerType": "adapter", "executionType": "bridge"},
        }
        self.executors = {
            "draft_email": self._draft_email,
            "schedule_calendar": self._schedule_calendar,
            "create_booking": self._create_booking,
            "update_booking": self._update_booking,
            "cancel_booking": self._cancel_booking,
            "get_booking": self._get_booking,
            "set_variable": self._set_variable,
            "send_email": self._send_email,
            "send_sms": self._send_sms,
            "store_data": self._store_data,
            "http_request": self._http_request,
            "if_then": self._if_then,
            "filter": self._filter,
            "switch": self._switch,
            "time_delay": self._time_delay,
            "add_contact": self._add_contact,
            "add_crm_note": self._add_crm_note,
            "query_vault": self._query_vault,
            "verify_email": self._verify_email,
            "verify_email_bulk": self._verify_email_bulk,
            "wait_for_verification": self._wait_for_verification,
            "verification_branch": self._verification_branch,
            "generate_script": self._generate_script,
            "generate_run_of_show": self._generate_run_of_show,
            "generate_transcript_intelligence": self._generate_transcript_intelligence,
            "generate_voice": self._generate_voice,
            "text_to_speech": self._generate_voice,
            "generate_thumbnail": self._generate_thumbnail,
            "generate_video": self._generate_video,
            "generate_podcast_script": self._generate_podcast_script,
            "generate_postbot_content": self._generate_postbot_content,
            "transcribe_media": self._transcribe_media,
            "transcribe-media": self._transcribe_media,
            "ingest_meeting_artifacts": self._ingest_meeting_artifacts,
            "publish_asset": self._publish_asset,
            "rss_ingest": self._rss_ingest,
            "generate_image": self._generate_image,
            "INPUT_REQUIRED": self._input_required,
            "INPUT_REQUIRED",
        }

    def _merged_step_config(self, step: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_config = json_object(params.get("node_config"))
        config = json_object(params.get("configuration"))
        return {**node_config, **config}

    def _normalized_service_config(self, step: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_config = json_object(params.get("node_config"))
        configuration = json_value(node_config.get("configuration"), {})
        if not isinstance(configuration, dict):
            configuration = {}
        merged = {**configuration, **node_config}
        intent = clean_text(step.get("intent"))
        execution_defaults = self.service_registry.get(intent, {})
        inputs = json_value(merged.get("inputs"), {})
        outputs = json_value(merged.get("outputs"), {})
        execution = json_value(merged.get("execution"), {})
        error_handling = json_value(merged.get("errorHandling") or merged.get("error_handling"), {})
        variable_io = json_value(merged.get("variableIO") or merged.get("variable_io"), {})
        if not isinstance(inputs, dict):
            inputs = {}
        if not isinstance(outputs, dict):
            outputs = {}
        if not isinstance(execution, dict):
            execution = {}
        if not isinstance(error_handling, dict):
            error_handling = {}
        if not isinstance(variable_io, dict):
            variable_io = {}
        execution = {
            "executionType": execution_defaults.get("executionType") or execution.get("executionType") or "agent_resolved",
            "serviceName": execution_defaults.get("service") or execution.get("serviceName") or "",
            "handlerType": execution_defaults.get("handlerType") or execution.get("handlerType") or "",
            "timeout": execution.get("timeout") or merged.get("timeout"),
            "retryPolicy": execution.get("retryPolicy") or {
                "count": safe_int(merged.get("retryCount") or merged.get("retry_count"), 0),
            },
            **execution,
        }
        return {
            **merged,
            "inputs": inputs,
            "outputs": outputs,
            "execution": execution,
            "errorHandling": {
                "onError": error_handling.get("onError") or merged.get("onError") or "fail_step",
                **error_handling,
            },
            "variableIO": variable_io,
        }

    def _runtime_store(self, runtime: dict[str, Any]) -> dict[str, Any]:
        return {
            "nodes": runtime.setdefault("node_results", {}),
            "previous": runtime.get("previous"),
            "run_vars": runtime.setdefault("run_vars", {}),
        }

    def _trigger_payload(self, context: dict[str, Any]) -> dict[str, Any]:
        trigger = context.get("trigger_event") if isinstance(context.get("trigger_event"), dict) else {}
        payload = trigger.get("payload") if isinstance(trigger.get("payload"), dict) else {}
        return payload

    def _global_variables(self, context: dict[str, Any]) -> dict[str, Any]:
        settings = runtime_tenant_settings(context)
        variables = settings.get("tenant", {}).get("globalVariables") if isinstance(settings.get("tenant"), dict) else {}
        return variables if isinstance(variables, dict) else {}

    def _media_attachments(self, context: dict[str, Any], runtime: dict[str, Any], merged: dict[str, Any]) -> list[dict[str, Any]]:
        trigger_payload = self._trigger_payload(context)
        return [
            item
            for item in [
                {
                    "kind": "flow_run",
                    "id": runtime.get("runId"),
                    "label": clean_text((context.get("flow") or {}).get("name") if isinstance(context.get("flow"), dict) else context.get("flow_name")),
                },
                {
                    "kind": "comms_thread",
                    "id": merged.get("thread_id") or context.get("thread_id") or trigger_payload.get("thread_id"),
                    "label": clean_text(context.get("subject") or trigger_payload.get("subject")),
                },
                {
                    "kind": "crm_contact",
                    "id": merged.get("contact_id") or context.get("contact_id") or trigger_payload.get("contact_id"),
                    "label": clean_text(context.get("contact", {}).get("email") if isinstance(context.get("contact"), dict) else trigger_payload.get("email")),
                },
                {
                    "kind": "attachment_target",
                    "id": merged.get("attachTarget") or merged.get("attach_target") or merged.get("outputTarget") or merged.get("output_target"),
                    "label": clean_text(merged.get("attachTarget") or merged.get("attach_target") or merged.get("outputTarget") or merged.get("output_target")),
                },
            ]
            if clean_text(item.get("id"))
        ]

    def _resolve_reference(self, reference: str, context: dict[str, Any], runtime: dict[str, Any]) -> tuple[Any, bool]:
        token = clean_text(reference)
        store = self._runtime_store(runtime)
        sources = [
            ("nodes", store["nodes"]),
            ("previous", store["previous"] if isinstance(store["previous"], dict) else {}),
            ("run.vars", store["run_vars"]),
            ("form", context.get("form") if isinstance(context.get("form"), dict) else self._trigger_payload(context)),
            ("trigger", context.get("trigger_event") if isinstance(context.get("trigger_event"), dict) else {}),
            ("globals", self._global_variables(context)),
            ("contact", context.get("contact") if isinstance(context.get("contact"), dict) else {}),
            ("booking", context.get("booking_event") if isinstance(context.get("booking_event"), dict) else {}),
        ]
        for prefix, source in sources:
            if token == prefix:
                return source, True
            if token.startswith(f"{prefix}."):
                value = dotted_get(source, token[len(prefix) + 1:])
                if value is not None:
                    return value, True
        for prefix, source in sources:
            value = dotted_get(source, token)
            if value is not None:
                return value, True
        return None, False

    def _token_syntax_errors(self, value: Any, field_name: str) -> list[str]:
        if not isinstance(value, str):
            return []
        raw = value
        if "{{" not in raw and "}}" not in raw:
            return []
        errors: list[str] = []
        if raw.count("{{") != raw.count("}}"):
            errors.append(f"Malformed token syntax in {field_name}.")
            return errors
        stripped = TEMPLATE_TOKEN_RE.sub("", raw)
        if "{{" in stripped or "}}" in stripped:
            errors.append(f"Malformed token syntax in {field_name}.")
        for match in TEMPLATE_TOKEN_RE.finditer(raw):
            token = clean_text(match.group(1))
            if not token or not TOKEN_PATH_RE.match(token):
                errors.append(f"Malformed token '{token or match.group(1)}' in {field_name}.")
        return list(dict.fromkeys(errors))

    def _nested_token_syntax_errors(self, value: Any, field_name: str) -> list[str]:
        if isinstance(value, dict):
            errors: list[str] = []
            for key, child in value.items():
                child_field = f"{field_name}.{key}"
                errors.extend(self._nested_token_syntax_errors(child, child_field))
            return list(dict.fromkeys(errors))
        if isinstance(value, list):
            errors: list[str] = []
            for index, child in enumerate(value):
                child_field = f"{field_name}[{index}]"
                errors.extend(self._nested_token_syntax_errors(child, child_field))
            return list(dict.fromkeys(errors))
        return self._token_syntax_errors(value, field_name)

    def _safe_write_targets(self, write_targets: dict[str, Any], envelope: dict[str, Any], runtime: dict[str, Any]) -> str | None:
        store = self._runtime_store(runtime)
        next_run_vars = safe_clone(store["run_vars"])
        for target_path, source_path in write_targets.items():
            normalized_target = clean_text(target_path)
            if normalized_target.startswith("run.vars."):
                normalized_target = normalized_target[len("run.vars."):]
            value = envelope["data"] if source_path in {None, "", "data", "$"} else dotted_get(envelope, str(source_path))
            if not normalized_target:
                continue
            success, error = safe_assign_path(next_run_vars, normalized_target, safe_clone(value))
            if not success:
                return error or f"Unable to write target '{normalized_target}'."
        runtime["run_vars"] = next_run_vars
        return None

    def _resolve_value(self, value: Any, context: dict[str, Any], runtime: dict[str, Any]) -> tuple[Any, list[str]]:
        if isinstance(value, dict):
            resolved: dict[str, Any] = {}
            missing: list[str] = []
            for key, child in value.items():
                child_value, child_missing = self._resolve_value(child, context, runtime)
                resolved[key] = child_value
                missing.extend(child_missing)
            return resolved, missing
        if isinstance(value, list):
            resolved_list: list[Any] = []
            missing: list[str] = []
            for child in value:
                child_value, child_missing = self._resolve_value(child, context, runtime)
                resolved_list.append(child_value)
                missing.extend(child_missing)
            return resolved_list, missing
        if not isinstance(value, str):
            return value, []
        matches = list(TEMPLATE_TOKEN_RE.finditer(value))
        if not matches:
            return value, []
        if len(matches) == 1 and matches[0].span() == (0, len(value)):
            token = matches[0].group(1)
            resolved, found = self._resolve_reference(token, context, runtime)
            if found:
                resolved = safe_clone(resolved)
            return resolved, ([] if found else [clean_text(token)])
        missing: list[str] = []
        rendered = value
        for match in matches:
            token = match.group(1)
            resolved, found = self._resolve_reference(token, context, runtime)
            if not found:
                missing.append(clean_text(token))
                replacement = ""
            else:
                replacement = "" if resolved is None else str(resolved)
            rendered = rendered.replace(match.group(0), replacement)
        return rendered, missing

    def _resolve_required_inputs(
        self,
        mapping: dict[str, Any],
        context: dict[str, Any],
        runtime: dict[str, Any],
        *,
        required: set[str] | None = None,
    ) -> tuple[dict[str, Any], list[str]]:
        resolved: dict[str, Any] = {}
        missing: list[str] = []
        for key, value in mapping.items():
            resolved_value, unresolved = self._resolve_value(value, context, runtime)
            resolved[key] = resolved_value
            if unresolved and (required is None or key in required):
                missing.extend(unresolved)
            if required and key in required and (resolved_value is None or resolved_value == "" or resolved_value == []):
                missing.append(key)
        return resolved, list(dict.fromkeys(item for item in missing if item))

    def _write_runtime_result(self, step: dict[str, Any], result: dict[str, Any], runtime: dict[str, Any]) -> None:
        store = self._runtime_store(runtime)
        node_id = clean_text((step.get("parameters") or {}).get("node_id") or step.get("id"))
        envelope = {
            "status": result.get("status"),
            "data": safe_clone(result.get("data")),
            "error": result.get("error"),
            "metadata": safe_clone(result.get("metadata")),
            "intent": step.get("intent"),
        }
        if not isinstance(envelope["metadata"], dict):
            envelope["metadata"] = {}
        if node_id:
            store["nodes"][node_id] = safe_clone(envelope)
        runtime["previous"] = safe_clone(result.get("data")) if isinstance(result.get("data"), dict) else {"value": safe_clone(result.get("data"))}
        config = self._normalized_service_config(step)
        variable_io = config.get("variableIO") if isinstance(config.get("variableIO"), dict) else {}
        outputs = config.get("outputs") if isinstance(config.get("outputs"), dict) else {}
        write_targets = variable_io.get("writeTo") or outputs.get("writeTo")
        if isinstance(write_targets, dict):
            write_error = self._safe_write_targets(write_targets, envelope, runtime)
            if write_error:
                envelope["metadata"]["writeTargetError"] = write_error
                if envelope["status"] == "success":
                    envelope["status"] = "partial"
                if node_id:
                    store["nodes"][node_id] = safe_clone(envelope)

    def _service_error(self, step: dict[str, Any], message: str, *, data: dict[str, Any] | None = None) -> dict[str, Any]:
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "error",
            "error": message,
            "data": safe_clone(data) if isinstance(data, dict) else {},
            "metadata": {"service": self.service_registry.get(clean_text(step.get("intent")), {})},
        }

    def _select_mailbox(self, mailbox_id: str | None = None) -> dict[str, Any]:
        mailboxes = self.provider.list_mailboxes() if getattr(self.provider, "list_mailboxes", None) else []
        if mailbox_id:
            mailbox = next((item for item in mailboxes if item.get("id") == mailbox_id), None)
            if not mailbox:
                raise ValueError("Mailbox not found")
            return mailbox
        preferred = next(
            (
                item for item in mailboxes
                if item.get("outbound_enabled")
                and item.get("provider") == "local-stub"
            ),
            None,
        )
        if preferred:
            return preferred
        preferred = next((item for item in mailboxes if item.get("outbound_enabled") and item.get("status") == "connected"), None)
        if preferred:
            return preferred
        if mailboxes:
            return mailboxes[0]
        raise ValueError("No mailbox is configured for outbound email.")

    def _previous_step_result(self, runtime: dict[str, Any], *, intents: set[str] | None = None) -> dict[str, Any] | None:
        steps = runtime.get("steps") if isinstance(runtime.get("steps"), list) else []
        for item in reversed(steps):
            if not isinstance(item, dict):
                continue
            if item.get("status") != "success":
                continue
            if intents and item.get("intent") not in intents:
                continue
            data = item.get("data")
            if isinstance(data, dict):
                return data
        return None

    def _lookup_contact(self, contact_id: str | None) -> dict[str, Any] | None:
        normalized_contact_id = clean_text(contact_id)
        if not normalized_contact_id:
            return None
        contacts = self.provider.list_contacts() if getattr(self.provider, "list_contacts", None) else []
        return next((item for item in contacts if item.get("id") == normalized_contact_id), None)

    def _email_verifier_config(self) -> dict[str, Any]:
        getter = getattr(self.provider, "get_email_verifier_config", None)
        return getter(include_secret=True) if getter else {}

    def _resolve_single_verification_target(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> tuple[str, str | None]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        config = self._merged_step_config(step)
        trigger_payload = (context.get("trigger_event") or {}).get("payload") if isinstance(context.get("trigger_event"), dict) else {}
        previous_result = self._previous_step_result(runtime, intents={"verify_email"})
        contact_id = clean_text(
            config.get("contactId")
            or config.get("contact_id")
            or params.get("contact_id")
            or context.get("contact_id")
            or trigger_payload.get("contact_id")
        ) or None
        email = clean_text(
            config.get("email")
            or params.get("email")
            or context.get("email")
            or context.get("guest_email")
            or trigger_payload.get("email")
            or (previous_result or {}).get("email")
        ).lower()
        if contact_id and not email:
            resolver = getattr(self.provider, "resolve_email_verification_targets", None)
            targets = resolver(contact_ids=[contact_id]) if resolver else []
            if targets:
                email = clean_text(targets[0].get("email")).lower()
        return email, contact_id

    def _extract_if_then_condition(self, step: dict[str, Any]) -> dict[str, Any]:
        merged = self._merged_step_config(step)
        condition = merged.get("condition")
        parsed_condition = json_object(condition) if isinstance(condition, str) else (dict(condition) if isinstance(condition, dict) else {})
        return {
            "operator": clean_text(
                merged.get("operator")
                or merged.get("comparison")
                or merged.get("comparator")
                or parsed_condition.get("operator")
                or parsed_condition.get("comparison")
                or parsed_condition.get("comparator")
            ).lower(),
            "left": (
                merged.get("left")
                if "left" in merged
                else merged.get("leftOperand")
                if "leftOperand" in merged
                else merged.get("left_operand")
                if "left_operand" in merged
                else parsed_condition.get("left")
                if "left" in parsed_condition
                else parsed_condition.get("leftOperand")
                if "leftOperand" in parsed_condition
                else parsed_condition.get("left_operand")
            ),
            "right": (
                merged.get("right")
                if "right" in merged
                else merged.get("rightOperand")
                if "rightOperand" in merged
                else merged.get("right_operand")
                if "right_operand" in merged
                else parsed_condition.get("right")
                if "right" in parsed_condition
                else parsed_condition.get("rightOperand")
                if "rightOperand" in parsed_condition
                else parsed_condition.get("right_operand")
            ),
        }

    def _extract_switch_definition(self, step: dict[str, Any]) -> dict[str, Any]:
        merged = self._merged_step_config(step)
        condition = merged.get("condition")
        parsed_condition = json_object(condition) if isinstance(condition, str) else (dict(condition) if isinstance(condition, dict) else {})
        return {
            "source": (
                merged.get("source")
                if "source" in merged
                else merged.get("value")
                if "value" in merged
                else merged.get("switchValue")
                if "switchValue" in merged
                else merged.get("switch_value")
                if "switch_value" in merged
                else parsed_condition.get("source")
                if "source" in parsed_condition
                else parsed_condition.get("value")
                if "value" in parsed_condition
                else parsed_condition.get("switchValue")
                if "switchValue" in parsed_condition
                else parsed_condition.get("switch_value")
            ),
        }

    def _is_empty_logic_value(self, value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, str):
            return clean_text(value) == ""
        if isinstance(value, (list, tuple, set, dict)):
            return len(value) == 0
        return False

    def _coerce_numeric_logic_value(self, value: Any) -> tuple[float | None, bool]:
        if isinstance(value, bool) or value is None:
            return None, False
        if isinstance(value, (int, float)):
            return float(value), True
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return None, False
            try:
                return float(raw), True
            except ValueError:
                return None, False
        return None, False

    def _evaluate_if_then_condition(self, operator: str, left: Any, right: Any) -> tuple[bool | None, str | None]:
        if operator == "equals":
            return left == right, None
        if operator == "not_equals":
            return left != right, None
        if operator in {"greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal"}:
            left_number, left_ok = self._coerce_numeric_logic_value(left)
            right_number, right_ok = self._coerce_numeric_logic_value(right)
            if not left_ok or not right_ok:
                return None, "Numeric comparison requires both operands to be numbers."
            if operator == "greater_than":
                return left_number > right_number, None
            if operator == "greater_than_or_equal":
                return left_number >= right_number, None
            if operator == "less_than":
                return left_number < right_number, None
            return left_number <= right_number, None
        if operator in {"contains", "not_contains"}:
            if isinstance(left, str):
                contains = str(right) in left
            elif isinstance(left, (list, tuple, set)):
                contains = right in left
            else:
                return None, "Contains operators require a string or list-like left operand."
            return (contains, None) if operator == "contains" else (not contains, None)
        if operator == "is_empty":
            return self._is_empty_logic_value(left), None
        if operator == "is_not_empty":
            return not self._is_empty_logic_value(left), None
        return None, f"Unsupported if-then operator '{operator}'."

    def _resolve_delay_config(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
        config = self._normalized_service_config(step)
        syntax_errors: list[str] = []
        for field_name in ["duration", "unit"]:
            syntax_errors.extend(self._token_syntax_errors(config.get(field_name), f"time-delay {field_name}"))
        if syntax_errors:
            return {}, syntax_errors[0]
        resolved, missing = self._resolve_required_inputs(
            {
                "duration": config.get("duration"),
                "unit": config.get("unit"),
            },
            context,
            runtime,
            required={"duration", "unit"},
        )
        if missing:
            return {}, f"Time-delay is missing required inputs: {', '.join(missing)}."
        try:
            duration = int(resolved.get("duration"))
        except (TypeError, ValueError):
            return {}, "Time-delay duration must be a positive integer."
        if duration <= 0:
            return {}, "Time-delay duration must be a positive integer."
        unit = clean_text(resolved.get("unit")).lower()
        if unit not in {"minutes", "hours", "days"}:
            return {}, "Time-delay unit must be one of: minutes, hours, days."
        return {"duration": duration, "unit": unit}, None

    def _resolve_single_downstream_target(self, step: dict[str, Any]) -> tuple[str | None, str | None]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
        targets = []
        for edge in outgoing_edges:
            target = clean_text(edge.get("target"))
            if target and target not in targets:
                targets.append(target)
        if not targets:
            return None, "Time-delay requires exactly one downstream node."
        if len(targets) != 1:
            return None, "Time-delay routing is ambiguous. Use exactly one downstream edge."
        return targets[0], None

    def _apply_branch_selection(
        self,
        *,
        runtime: dict[str, Any],
        node_id: str,
        outgoing_edges: list[dict[str, Any]],
        selected_targets: list[str],
        branch_status: str,
    ) -> None:
        selected_descendants = self._graph_descendants(runtime, selected_targets)
        alternate_targets = [
            clean_text(edge.get("target"))
            for edge in outgoing_edges
            if clean_text(edge.get("target")) and clean_text(edge.get("target")) not in selected_targets
        ]
        suppressed_nodes = self._graph_descendants(runtime, alternate_targets) - selected_descendants
        runtime.setdefault("suppressed_nodes", set()).update(suppressed_nodes)
        runtime.setdefault("branch_decisions", {})[node_id] = {
            "status": branch_status,
            "selected_targets": selected_targets,
        }

    def _resolve_switch_targets(self, outgoing_edges: list[dict[str, Any]], switch_value: Any) -> tuple[list[str], str | None, str | None]:
        normalized_value = normalize_token(switch_value)
        if not normalized_value:
            return [], None, "Switch source value is empty and cannot be routed."
        matched_targets: list[str] = []
        default_targets: list[str] = []
        unlabeled_targets: list[str] = []
        for edge in outgoing_edges:
            target = clean_text(edge.get("target"))
            if not target:
                continue
            raw_filter = clean_text(edge.get("filters") or ((edge.get("data") or {}) if isinstance(edge.get("data"), dict) else {}).get("filters"))
            raw_handle = clean_text(edge.get("sourceHandle"))
            raw_label = clean_text(edge.get("label"))
            candidate_text = " ".join(filter(None, [raw_filter, raw_handle, raw_label])).lower()
            if not candidate_text:
                unlabeled_targets.append(target)
                continue
            tokens = {normalize_token(item) for item in re.split(r"[^a-z0-9_]+", candidate_text) if normalize_token(item)}
            if "default" in tokens:
                default_targets.append(target)
            if normalized_value in tokens or candidate_text == normalized_value:
                matched_targets.append(target)
        if unlabeled_targets:
            return [], normalized_value, "Switch routing requires labeled outgoing edges or explicit edge filters."
        if len(matched_targets) > 1:
            return [], normalized_value, f"Switch routing is ambiguous for case '{normalized_value}'."
        if matched_targets:
            return matched_targets, normalized_value, None
        if len(default_targets) > 1:
            return [], normalized_value, "Switch routing defines multiple default branches."
        if default_targets:
            return default_targets, normalized_value, None
        return [], normalized_value, f"Switch did not find a matching branch for '{normalized_value}'."

    def _branch_edge_targets(self, outgoing_edges: list[dict[str, Any]], branch_status: str) -> tuple[list[str], list[str]]:
        normalized_status = normalize_token(branch_status) or "unknown"
        matched_targets: list[str] = []
        default_targets: list[str] = []
        for edge in outgoing_edges:
            target = clean_text(edge.get("target"))
            if not target:
                continue
            raw_filter = clean_text(edge.get("filters") or ((edge.get("data") or {}) if isinstance(edge.get("data"), dict) else {}).get("filters"))
            raw_handle = clean_text(edge.get("sourceHandle"))
            raw_label = clean_text(edge.get("label"))
            candidate_text = " ".join(filter(None, [raw_filter, raw_handle, raw_label])).lower()
            if not candidate_text:
                default_targets.append(target)
                continue
            tokens = {normalize_token(item) for item in re.split(r"[^a-z0-9_]+", candidate_text) if normalize_token(item)}
            if normalized_status in tokens:
                matched_targets.append(target)
        return matched_targets, default_targets

    def _graph_descendants(self, runtime: dict[str, Any], starting_nodes: list[str]) -> set[str]:
        adjacency = runtime.get("graph_adjacency") if isinstance(runtime.get("graph_adjacency"), dict) else {}
        visited: set[str] = set()
        stack = [clean_text(node_id) for node_id in starting_nodes if clean_text(node_id)]
        while stack:
            node_id = stack.pop()
            if node_id in visited:
                continue
            visited.add(node_id)
            for target in adjacency.get(node_id, []):
                normalized_target = clean_text(target)
                if normalized_target and normalized_target not in visited:
                    stack.append(normalized_target)
        return visited

    def _sync_email_verification_task(self, task_id: str, api_key: str) -> dict[str, Any]:
        task = self.provider.get_email_verification_task(task_id) if getattr(self.provider, "get_email_verification_task", None) else None
        if not task:
            return {
                "taskId": task_id,
                "status": "failed",
                "submittedCount": 0,
                "completedCount": 0,
                "valid": 0,
                "risky": 0,
                "invalid": 0,
                "unknown": 0,
                "error": "Email verification task not found.",
            }
        remote = get_email_verifier_bulk_results(api_key, clean_text(task.get("provider_task_id")))
        updates = {
            "status": remote["status"],
            "submitted_count": remote["submittedCount"] or task.get("submitted_count") or 0,
            "completed_count": remote["completedCount"],
            "valid_count": remote["validCount"],
            "risky_count": remote["riskyCount"],
            "invalid_count": remote["invalidCount"],
            "unknown_count": remote["unknownCount"],
            "last_error": None,
        }
        if remote["status"] == "completed":
            updates["completed_at"] = datetime_now()
            if getattr(self.provider, "apply_email_verification_task_results", None):
                self.provider.apply_email_verification_task_results(task_id, remote["results"])
        updated_task = self.provider.update_email_verification_task(task_id, updates) if getattr(self.provider, "update_email_verification_task", None) else task
        return {
            "taskId": updated_task.get("id") or task_id,
            "providerTaskId": updated_task.get("provider_task_id") or remote.get("providerTaskId"),
            "status": clean_text(updated_task.get("status") or remote.get("status")) or "failed",
            "submittedCount": safe_int(updated_task.get("submitted_count"), remote.get("submittedCount") or 0),
            "completedCount": safe_int(updated_task.get("completed_count"), remote.get("completedCount") or 0),
            "valid": safe_int(updated_task.get("valid_count"), remote.get("validCount") or 0),
            "risky": safe_int(updated_task.get("risky_count"), remote.get("riskyCount") or 0),
            "invalid": safe_int(updated_task.get("invalid_count"), remote.get("invalidCount") or 0),
            "unknown": safe_int(updated_task.get("unknown_count"), remote.get("unknownCount") or 0),
            "lastError": updated_task.get("last_error"),
        }

    def _query_vault(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        from backend.tools import AIOToolRegistry
        tool = AIOToolRegistry.get("query_vault")
        if not tool:
            raise ValueError("QueryVaultTool not registered in AIOToolRegistry.")
        
        params = step.get("parameters", {})
        res = tool.run(params, context)
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}

    def _set_variable(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._normalized_service_config(step)
        assignments = config.get("values")
        if not isinstance(assignments, dict):
            assignments = json_value(config.get("configuration"), {})
        if not isinstance(assignments, dict) or not assignments:
            return self._service_error(step, "Set Variable requires a JSON object of assignments.", data={"written": False, "keys": []})
        resolved_assignments, missing = self._resolve_required_inputs(assignments, context, runtime, required=set(assignments.keys()))
        if missing:
            return self._service_error(step, f"Missing required variable inputs: {', '.join(missing)}", data={"written": False, "keys": []})
        store = self._runtime_store(runtime)
        next_run_vars = safe_clone(store["run_vars"])
        written_keys: list[str] = []
        for key, value in resolved_assignments.items():
            normalized_key = clean_text(key)
            if not normalized_key:
                continue
            if normalized_key.startswith("run.vars."):
                normalized_key = normalized_key[len("run.vars."):]
            success, error = safe_assign_path(next_run_vars, normalized_key, value)
            if not success:
                return self._service_error(step, error or f"Unable to write variable path '{normalized_key}'.", data={"written": False, "keys": [], "runVars": safe_clone(store["run_vars"])})
            written_keys.append(normalized_key)
        runtime["run_vars"] = next_run_vars
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {
                "written": True,
                "keys": written_keys,
                "runVars": safe_clone(next_run_vars),
            },
            "metadata": {"service": "variableService", "executionType": "deterministic"},
        }


    def _input_required(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {})
        form_id = params.get("form_id") or params.get("formId")
        
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "paused",
            "data": {
                "pauseReason": "input_required",
                "formId": form_id,
                "message": params.get("message") or "Waiting for form submission."
            },
            "metadata": {"service": "logicService", "executionType": "bridge"}
        }

    def _send_email(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._normalized_service_config(step)
        raw_inputs = {
            "to": config.get("to") or config.get("recipient") or config.get("recipients"),
            "subject": config.get("subject"),
            "body": config.get("body"),
            "mailboxId": config.get("mailboxId") or config.get("mailbox_id"),
            "threadId": config.get("threadId") or config.get("thread_id") or context.get("thread_id"),
            "senderName": config.get("senderName") or config.get("sender_name") or "AIO Flow",
            "senderEmail": config.get("senderEmail") or config.get("sender_email"),
            "contactId": config.get("contactId") or config.get("contact_id") or context.get("contact_id"),
            "companyId": config.get("companyId") or config.get("company_id") or context.get("company_id"),
        }
        syntax_errors: list[str] = []
        for field_name in ["to", "subject", "body", "mailboxId", "senderName", "senderEmail"]:
            syntax_errors.extend(self._token_syntax_errors(raw_inputs.get(field_name), field_name))
        if syntax_errors:
            return self._service_error(
                step,
                "; ".join(syntax_errors),
                data={
                    "deliveryStatus": "error",
                    "deliveryMode": "validation_failed",
                    "providerMessageId": None,
                    "internalMessageId": None,
                    "recipients": [],
                },
            )
        inputs = {
            **raw_inputs,
        }
        resolved, missing = self._resolve_required_inputs(inputs, context, runtime, required={"to", "subject", "body"})
        if missing:
            return self._service_error(
                step,
                f"Missing required email inputs: {', '.join(missing)}",
                data={
                    "deliveryStatus": "error",
                    "deliveryMode": "validation_failed",
                    "providerMessageId": None,
                    "internalMessageId": None,
                    "recipients": [],
                },
            )
        recipients = parse_string_list(resolved.get("to"))
        if not recipients:
            value = resolved.get("to")
            if isinstance(value, str) and clean_text(value):
                recipients = [clean_text(value)]
        if not recipients:
            return self._service_error(
                step,
                "Missing required email inputs: to",
                data={
                    "deliveryStatus": "error",
                    "deliveryMode": "validation_failed",
                    "providerMessageId": None,
                    "internalMessageId": None,
                    "recipients": [],
                },
            )
        subject = resolved.get("subject")
        body = resolved.get("body")
        if isinstance(subject, (dict, list)) or not clean_text(subject):
            return self._service_error(
                step,
                "Missing required email inputs: subject",
                data={
                    "deliveryStatus": "error",
                    "deliveryMode": "validation_failed",
                    "providerMessageId": None,
                    "internalMessageId": None,
                    "recipients": recipients,
                },
            )
        if isinstance(body, (dict, list)) or not clean_text(body):
            return self._service_error(
                step,
                "Missing required email inputs: body",
                data={
                    "deliveryStatus": "error",
                    "deliveryMode": "validation_failed",
                    "providerMessageId": None,
                    "internalMessageId": None,
                    "recipients": recipients,
                },
            )
        # 3. MAILBOX RESOLUTION & EXECUTION
        from comms_service import send_email_message
        
        mailbox = self._select_mailbox(clean_text(resolved.get("mailboxId")) or None)
        mailbox_id = mailbox.get("id")
        
        result = send_email_message(
            thread_id=clean_text(resolved.get("threadId")) or None,
            recipients=recipients,
            subject=clean_text(subject) or "Flow Email",
            body=clean_text(body),
            mailbox_id=mailbox_id,
            sender_name=clean_text(resolved.get("senderName")) or "AIO Flow",
            sender_email=clean_text(resolved.get("senderEmail")) or mailbox.get("address"),
            contact_id=clean_text(resolved.get("contactId")) or None,
            company_id=clean_text(resolved.get("companyId")) or None,
            execution_context=True
        )
        
        if not result.get("success"):
            return self._service_error(
                step,
                result.get("error", "Email send failed"),
                data={
                    "deliveryStatus": "error",
                    "deliveryMode": "provider_error",
                    "mailboxId": mailbox_id,
                    "recipients": recipients,
                },
            )

        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {
                "deliveryStatus": "sent",
                "deliveryMode": "provider",
                "providerMessageId": result.get("providerMessageId"),
                "internalMessageId": result.get("message_id"),
                "threadId": result.get("thread_id"),
                "mailboxId": result.get("mailbox_id"),
                "recipients": recipients,
            },
            "metadata": {"service": "messagingService", "executionType": "deterministic"},
        }

    def _is_valid_sms_recipient(self, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        normalized = clean_text(value)
        if not normalized:
            return False
        digits = re.sub(r"\D+", "", normalized)
        if len(digits) < 7:
            return False
        return bool(re.fullmatch(r"[0-9+\-().\s]+", normalized))

    def _resolve_sms_provider(self, config: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
        provider = normalize_token(
            config.get("provider")
            or config.get("providerKey")
            or config.get("provider_key")
            or config.get("smsProvider")
            or config.get("sms_provider")
        ) or None
        provider_metadata = {
            "provider": provider,
            "senderId": clean_text(
                config.get("senderId")
                or config.get("sender_id")
                or config.get("from")
                or config.get("fromNumber")
                or config.get("from_number")
            ) or None,
        }
        return provider, provider_metadata

    def _send_sms_failure(
        self,
        step: dict[str, Any],
        *,
        machine_status: str,
        message: str,
        recipients: list[str] | None = None,
        provider: str | None = None,
        sender_id: str | None = None,
    ) -> dict[str, Any]:
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "failed",
            "error": message,
            "data": {
                "status": machine_status,
                "deliveryStatus": "failed",
                "provider": provider,
                "senderId": sender_id,
                "providerMessageId": None,
                "recipients": recipients or [],
                "error": message,
            },
            "metadata": {"service": "messagingService", "executionType": "deterministic"},
        }

    def _send_sms(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._normalized_service_config(step)
        contact = self._lookup_contact(config.get("contactId") or config.get("contact_id") or context.get("contact_id"))
        raw_inputs = {
            "to": config.get("to") or config.get("recipient") or config.get("recipients") or (contact or {}).get("phone"),
            "message": config.get("message") or config.get("body") or config.get("content"),
            "provider": config.get("provider") or config.get("providerKey") or config.get("provider_key") or config.get("smsProvider") or config.get("sms_provider"),
            "senderId": config.get("senderId") or config.get("sender_id") or config.get("from") or config.get("fromNumber") or config.get("from_number"),
            "contactId": config.get("contactId") or config.get("contact_id") or context.get("contact_id"),
        }
        syntax_errors: list[str] = []
        for field_name in ["to", "message", "provider", "senderId"]:
            syntax_errors.extend(self._token_syntax_errors(raw_inputs.get(field_name), field_name))
        if syntax_errors:
            return self._send_sms_failure(
                step,
                machine_status="validation_error",
                message="; ".join(syntax_errors),
            )
        resolved, missing = self._resolve_required_inputs(raw_inputs, context, runtime, required={"to", "message"})
        if missing:
            return self._send_sms_failure(
                step,
                machine_status="invalid_input",
                message=f"Missing required SMS inputs: {', '.join(missing)}",
            )
        recipients = parse_string_list(resolved.get("to"))
        if not recipients:
            value = resolved.get("to")
            if isinstance(value, str) and clean_text(value):
                recipients = [clean_text(value)]
        if not recipients:
            return self._send_sms_failure(
                step,
                machine_status="invalid_input",
                message="Missing required SMS inputs: to",
            )
        invalid_recipients = [recipient for recipient in recipients if not self._is_valid_sms_recipient(recipient)]
        if invalid_recipients:
            return self._send_sms_failure(
                step,
                machine_status="invalid_input",
                message=f"Invalid SMS recipient: {invalid_recipients[0]}",
                recipients=recipients,
            )
        message_body = resolved.get("message")
        if isinstance(message_body, (dict, list)) or not clean_text(message_body):
            return self._send_sms_failure(
                step,
                machine_status="invalid_input",
                message="Missing required SMS inputs: message",
                recipients=recipients,
            )
        provider, provider_metadata = self._resolve_sms_provider(resolved)
        if not provider:
            return self._send_sms_failure(
                step,
                machine_status="not_configured",
                message="SMS provider is not configured.",
                recipients=recipients,
                sender_id=provider_metadata.get("senderId"),
            )
        
        try:
            from comms_service import send_sms_message as _comms_send_sms
            contact_id = resolved.get("contactId")
            from_number = resolved.get("senderId")
            to_number = recipients[0] if len(recipients) == 1 else None
            thread_id = context.get("threadId") or context.get("thread_id")
            
            if to_number:
                result = _comms_send_sms(
                    thread_id=thread_id,
                    phone_number=to_number,
                    body=message_body,
                    from_number=from_number,
                    contact_id=contact_id,
                    execution_context=True,
                )
            else:
                results = []
                for recipient in recipients:
                    result = _comms_send_sms(
                        thread_id=thread_id,
                        phone_number=recipient,
                        body=message_body,
                        from_number=from_number,
                        contact_id=contact_id,
                        execution_context=True,
                    )
                    results.append(result)
                result = results[-1] if results else {"success": False, "error": "No recipients"}
            
            if result.get("success"):
                return {
                    "stepId": step.get("id"),
                    "intent": step.get("intent"),
                    "status": "success",
                    "data": {
                        "status": "sent",
                        "deliveryStatus": "delivered",
                        "provider": provider,
                        "senderId": from_number,
                        "providerMessageId": result.get("message_id"),
                        "recipients": recipients,
                        "threadId": result.get("thread_id"),
                    },
                    "metadata": {"service": "messagingService", "executionType": "deterministic"},
                }
            else:
                return self._send_sms_failure(
                    step,
                    machine_status="provider_error",
                    message=result.get("error", "SMS send failed"),
                    recipients=recipients,
                    provider=provider,
                    sender_id=from_number,
                )
        except Exception as exc:
            return self._send_sms_failure(
                step,
                machine_status="execution_error",
                message=str(exc),
                recipients=recipients,
                provider=provider,
                sender_id=resolved.get("senderId"),
            )

    def _store_data_failure(
        self,
        step: dict[str, Any],
        *,
        machine_status: str,
        message: str,
        target: str | None = None,
        operation: str | None = None,
        stored_data: Any = None,
    ) -> dict[str, Any]:
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "failed",
            "error": message,
            "data": {
                "status": machine_status,
                "target": target,
                "operation": operation,
                "recordId": None,
                "storedData": safe_clone(stored_data),
                "error": message,
            },
            "metadata": {"service": "storageService", "executionType": "deterministic"},
        }

    def _store_data(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._normalized_service_config(step)
        raw_target = (
            config.get("target")
            or config.get("targetTable")
            or config.get("target_table")
            or config.get("table")
            or config.get("entity")
        )
        raw_operation = config.get("operation") or config.get("writeBehavior") or config.get("write_behavior")
        raw_payload = (
            config.get("payload")
            if "payload" in config
            else config.get("data")
            if "data" in config
            else config.get("fields")
            if "fields" in config
            else config.get("record")
        )
        raw_contact_id = config.get("contactId") or config.get("contact_id") or context.get("contact_id")

        syntax_errors: list[str] = []
        syntax_errors.extend(self._token_syntax_errors(raw_target, "target"))
        syntax_errors.extend(self._token_syntax_errors(raw_operation, "operation"))
        syntax_errors.extend(self._token_syntax_errors(raw_contact_id, "contactId"))
        syntax_errors.extend(self._nested_token_syntax_errors(raw_payload, "payload"))
        if syntax_errors:
            return self._store_data_failure(
                step,
                machine_status="validation_error",
                message="; ".join(syntax_errors),
            )

        resolved, missing = self._resolve_required_inputs(
            {
                "target": raw_target,
                "operation": raw_operation,
                "payload": raw_payload,
                "contactId": raw_contact_id,
            },
            context,
            runtime,
            required={"target", "operation", "payload"},
        )
        if missing:
            return self._store_data_failure(
                step,
                machine_status="invalid_input",
                message=f"Missing required store-data inputs: {', '.join(missing)}",
            )

        target = normalize_token(resolved.get("target"))
        operation = normalize_token(resolved.get("operation"))
        payload = resolved.get("payload")
        contact_id = clean_text(resolved.get("contactId")) or None

        if not target:
            return self._store_data_failure(step, machine_status="invalid_target", message="Store Data target is required.")
        if not operation:
            return self._store_data_failure(step, machine_status="invalid_operation", message="Store Data operation is required.", target=target)
        if payload is None or (isinstance(payload, dict) and not payload) or (isinstance(payload, list) and not payload):
            return self._store_data_failure(
                step,
                machine_status="invalid_input",
                message="Store Data payload is required.",
                target=target,
                operation=operation,
            )
        if not isinstance(payload, dict):
            return self._store_data_failure(
                step,
                machine_status="invalid_input",
                message="Store Data payload must resolve to an object.",
                target=target,
                operation=operation,
            )

        if target == "brain_item":
            if operation != "create":
                return self._store_data_failure(
                    step,
                    machine_status="invalid_operation",
                    message="brain_item only supports the create operation.",
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
            try:
                stored = self.provider.create_brain_item(payload)
            except Exception as exc:
                return self._store_data_failure(
                    step,
                    machine_status="persistence_failed",
                    message=str(exc),
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
        elif target == "contact_activity":
            if operation != "create":
                return self._store_data_failure(
                    step,
                    machine_status="invalid_operation",
                    message="contact_activity only supports the create operation.",
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
            if not contact_id:
                return self._store_data_failure(
                    step,
                    machine_status="invalid_input",
                    message="contact_activity requires contactId.",
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
            try:
                stored = self.provider.create_contact_activity(contact_id, payload)
            except Exception as exc:
                return self._store_data_failure(
                    step,
                    machine_status="persistence_failed",
                    message=str(exc),
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
        elif target == "flow_draft":
            if operation not in {"create", "upsert"}:
                return self._store_data_failure(
                    step,
                    machine_status="invalid_operation",
                    message="flow_draft only supports create or upsert.",
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
            try:
                stored = self.provider.save_flow_draft(payload)
            except Exception as exc:
                return self._store_data_failure(
                    step,
                    machine_status="persistence_failed",
                    message=str(exc),
                    target=target,
                    operation=operation,
                    stored_data=payload,
                )
        else:
            return self._store_data_failure(
                step,
                machine_status="unsupported_target",
                message=f"Unsupported store-data target '{target}'.",
                target=target,
                operation=operation,
                stored_data=payload,
            )

        record_id = clean_text((stored or {}).get("id")) if isinstance(stored, dict) else ""
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {
                "status": "stored",
                "target": target,
                "operation": operation,
                "recordId": record_id or None,
                "storedData": safe_clone(stored),
                "error": None,
            },
            "metadata": {"service": "storageService", "executionType": "deterministic"},
        }

    def _validate_http_url(self, value: Any) -> str | None:
        if not isinstance(value, str):
            return "HTTP URL must be a string."
        normalized = clean_text(value)
        if not normalized:
            return "Missing required HTTP inputs: url"
        parsed = urlparse(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return "Invalid HTTP URL."
        return None

    def _http_request(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._normalized_service_config(step)
        syntax_errors: list[str] = []
        for field_name in ["url", "headers", "body"]:
            syntax_errors.extend(self._token_syntax_errors(config.get(field_name), field_name))
        if syntax_errors:
            return {
                "stepId": step.get("id"),
                "intent": step.get("intent"),
                "status": "error",
                "error": "; ".join(syntax_errors),
                "data": {"statusCode": None, "responseBody": None},
                "metadata": {
                    "service": self.service_registry.get("http_request"),
                    "attempts": 0,
                    "finalAttempt": 0,
                    "retried": False,
                    "failureReason": "validation_error",
                },
            }
        retry_policy = config.get("execution", {}).get("retryPolicy") if isinstance(config.get("execution"), dict) else {}
        if not isinstance(retry_policy, dict):
            retry_policy = {}
        required_inputs = {
            "method": config.get("method") or "GET",
            "url": config.get("url"),
            "headers": json_value(config.get("headers"), {}) if not isinstance(config.get("headers"), dict) else config.get("headers"),
            "body": json_value(config.get("body"), None) if not isinstance(config.get("body"), (dict, list)) else config.get("body"),
        }
        resolved, missing = self._resolve_required_inputs(required_inputs, context, runtime, required={"method", "url"})
        if missing:
            return {
                "stepId": step.get("id"),
                "intent": step.get("intent"),
                "status": "error",
                "error": f"Missing required HTTP inputs: {', '.join(missing)}",
                "data": {"statusCode": None, "responseBody": None},
                "metadata": {
                    "service": self.service_registry.get("http_request"),
                    "attempts": 0,
                    "finalAttempt": 0,
                    "retried": False,
                    "failureReason": "validation_error",
                },
            }
        method = clean_text(resolved.get("method")).upper() or "GET"
        url = clean_text(resolved.get("url"))
        if method not in ALLOWED_HTTP_METHODS:
            return {
                "stepId": step.get("id"),
                "intent": step.get("intent"),
                "status": "error",
                "error": f"Invalid HTTP method: {method}",
                "data": {"statusCode": None, "responseBody": None},
                "metadata": {
                    "service": self.service_registry.get("http_request"),
                    "attempts": 0,
                    "finalAttempt": 0,
                    "retried": False,
                    "failureReason": "validation_error",
                },
            }
        url_error = self._validate_http_url(url)
        if url_error:
            return {
                "stepId": step.get("id"),
                "intent": step.get("intent"),
                "status": "error",
                "error": url_error,
                "data": {"statusCode": None, "responseBody": None},
                "metadata": {
                    "service": self.service_registry.get("http_request"),
                    "attempts": 0,
                    "finalAttempt": 0,
                    "retried": False,
                    "failureReason": "validation_error",
                },
            }
        headers = resolved.get("headers") if isinstance(resolved.get("headers"), dict) else {}
        body = resolved.get("body")
        timeout_ms = safe_int((config.get("execution") or {}).get("timeout"), config.get("timeout") or 30000)
        timeout_seconds = max(1, timeout_ms / 1000)
        retry_override = parse_bool(retry_policy.get("allowUnsafeRetry"), False)
        requested_retry_count = max(0, safe_int(retry_policy.get("count"), safe_int(config.get("retryCount") or config.get("retry_count"), 0)))
        retry_count = requested_retry_count if method in SAFE_RETRY_HTTP_METHODS or retry_override else 0
        payload: bytes | None = None
        if body is not None and method not in {"GET", "HEAD"}:
            if isinstance(body, (dict, list)):
                payload = json.dumps(body).encode("utf-8")
                headers = {"Content-Type": "application/json", **headers}
            else:
                payload = str(body).encode("utf-8")
        last_error: str | None = None
        last_status_code: int | None = None
        last_response_body: Any = None
        failure_reason = "request_error"
        for attempt in range(retry_count + 1):
            request = urlrequest.Request(url, data=payload, method=method, headers=headers)
            try:
                with urlrequest.urlopen(request, timeout=timeout_seconds) as response:
                    charset = response.headers.get_content_charset() or "utf-8"
                    raw_body = response.read().decode(charset, errors="replace")
                    content_type = response.headers.get("Content-Type", "")
                    response_body: Any = raw_body
                    if "json" in content_type.lower():
                        try:
                            response_body = json.loads(raw_body) if raw_body else {}
                        except json.JSONDecodeError:
                            response_body = raw_body
                    return {
                        "stepId": step.get("id"),
                        "intent": step.get("intent"),
                        "status": "success",
                        "data": {
                            "statusCode": getattr(response, "status", 200),
                            "responseBody": response_body,
                        },
                        "metadata": {
                            "service": "httpService",
                            "executionType": "bridge",
                            "attempts": attempt + 1,
                            "finalAttempt": attempt + 1,
                            "retried": attempt > 0,
                            "failureReason": None,
                        },
                    }
            except urlerror.HTTPError as exc:
                charset = exc.headers.get_content_charset() if exc.headers else None
                raw_error = exc.read().decode(charset or "utf-8", errors="replace") if hasattr(exc, "read") else str(exc)
                content_type = exc.headers.get("Content-Type", "") if exc.headers else ""
                response_body: Any = raw_error
                if "json" in content_type.lower():
                    try:
                        response_body = json.loads(raw_error) if raw_error else {}
                    except json.JSONDecodeError:
                        response_body = raw_error
                last_status_code = exc.code
                last_response_body = response_body
                last_error = f"HTTP {exc.code}: {raw_error}"
                failure_reason = "http_error"
            except (urlerror.URLError, TimeoutError, OSError) as exc:
                last_error = str(exc)
                failure_reason = "timeout" if "timed out" in str(exc).lower() else "transport_error"
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "error",
            "error": last_error or "HTTP request failed.",
            "data": {
                "statusCode": last_status_code,
                "responseBody": last_response_body,
            },
            "metadata": {
                "service": self.service_registry.get("http_request"),
                "attempts": retry_count + 1,
                "finalAttempt": retry_count + 1,
                "retried": retry_count > 0,
                "failureReason": failure_reason,
            },
        }

    def execute(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        intent = step.get("intent")
        handler = self.executors.get(intent)

        def finalize(result: dict[str, Any]) -> dict[str, Any]:
            self._write_runtime_result(step, result, runtime)
            return result

        if intent in DIRECT_EXECUTION_INTENTS and handler:
            try:
                if intent in {"verify_email", "verify_email_bulk", "wait_for_verification", "verification_branch", "if_then", "filter", "switch", "time_delay", "set_variable", "send_email", "send_sms", "store_data", "http_request", "generate_script", "generate_run_of_show", "generate_transcript_intelligence", "generate_voice", "text_to_speech", "generate_thumbnail", "generate_video", "transcribe_media", "transcribe-media", "ingest_meeting_artifacts", "publish_asset"}:
                    return finalize(handler(step, context, runtime))
                return finalize(handler(step, context))
            except Exception as exc:
                logger.error("Step execution failed: %s", exc)
                return finalize({
                    "stepId": step.get("id"),
                    "intent": intent,
                    "status": "error",
                    "error": str(exc),
                    "data": {}
                })
        
        # Step 1: Agent Runtime Execution
        assigned_agent = step.get("assignedAgent") or "ALPHA"
        agent = AgentRegistry.get(assigned_agent)
        
        if agent:
            try:
                # Phase 12 Agent Execution
                return finalize(agent.execute(step, context, runtime))
            except NotImplementedError:
                # Agent exists but hasn't natively implemented the specific capability yet, safe fallback.
                pass
            except Exception as exc:
                logger.error("Agent %s failed: %s", assigned_agent, exc)
                return finalize({
                    "stepId": step.get("id"),
                    "intent": intent,
                    "status": "error",
                    "error": str(exc),
                    "data": {}
                })
        
        # Fallback to StepExecutor local method
        if not handler:
            return finalize({
                "stepId": step.get("id"),
                "intent": intent,
                "status": "error",
                "error": f"Unsupported or unknown intent: {intent}",
                "data": {}
            })
        try:
            return finalize(handler(step, context))
        except Exception as exc:
            logger.error("Step execution failed: %s", exc)
            return finalize({
                "stepId": step.get("id"),
                "intent": intent,
                "status": "error",
                "error": str(exc),
                "data": {}
            })

    def _draft_email(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {})
        thread_id = params.get("thread_id") or context.get("thread_id")
        body = params.get("body") or "Auto-generated draft."
        if not thread_id:
            raise ValueError("Missing thread_id context for draft_email.")
        res = getattr(self.provider, "apply_thread_ai_result")(thread_id, mode="draft", suggestion=body)
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}
        
    def _schedule_calendar(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {})
        thread_id = params.get("thread_id") or context.get("thread_id")
        scheduled_at = params.get("scheduled_at") or params.get("time") or context.get("scheduled_at") or context.get("start_time")
        if thread_id:
            existing_events = self.provider.list_calendar_events(thread_id=thread_id) if getattr(self.provider, "list_calendar_events", None) else []
            res = getattr(self.provider, "schedule_thread_meeting")(thread_id, scheduled_at=scheduled_at)
            linked_events = self.provider.list_calendar_events(thread_id=thread_id) if getattr(self.provider, "list_calendar_events", None) else []
            event = linked_events[0] if linked_events else None
            if event:
                emit_system_event(
                    self.provider,
                    {
                        "type": "booking_created" if not existing_events else "booking_updated",
                        "payload": {
                            "event_id": event.get("id"),
                            "calendar_id": event.get("calendar_id"),
                            "contact_id": event.get("contact_id"),
                            "thread_id": event.get("thread_id"),
                            "start_time": event.get("start_time"),
                            "end_time": event.get("end_time"),
                            "booking_type_id": event.get("booking_type_id"),
                            "status": event.get("status"),
                        },
                        "meta": {"depth": safe_int(context.get("_system_event_depth"), 0)},
                    },
                    actor=context.get("_system_event_actor") or {},
                    tenant=context.get("_system_event_tenant") or context.get("tenant") or {},
                    provider_config=context.get("_provider_config"),
                )
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}
        created = self.provider.create_calendar_event(self._coerce_booking_payload(step, context, mode="create"))
        emit_system_event(
            self.provider,
            {
                "type": "booking_created",
                "payload": self._booking_event_payload(created),
                "meta": {"depth": safe_int(context.get("_system_event_depth"), 0)},
            },
            actor=context.get("_system_event_actor") or {},
            tenant=context.get("_system_event_tenant") or context.get("tenant") or {},
            provider_config=context.get("_provider_config"),
        )
        res = created
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}

    def _booking_event_payload(self, event: dict[str, Any]) -> dict[str, Any]:
        return {
            "event_id": event.get("id"),
            "calendar_id": event.get("calendar_id"),
            "contact_id": event.get("contact_id"),
            "thread_id": event.get("thread_id"),
            "start_time": event.get("start_time"),
            "end_time": event.get("end_time"),
            "booking_type_id": event.get("booking_type_id"),
            "status": event.get("status"),
        }

    def _resolve_booking_event(self, params: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        event_id = (
            params.get("event_id")
            or params.get("id")
            or context.get("event_id")
            or (context.get("booking_event") or {}).get("event_id")
            or (context.get("trigger_event") or {}).get("payload", {}).get("event_id")
        )
        events = self.provider.list_calendar_events() if getattr(self.provider, "list_calendar_events", None) else []
        if event_id:
            event = next((item for item in events if item.get("id") == event_id), None)
            if event:
                return event
        thread_id = (
            params.get("thread_id")
            or context.get("thread_id")
            or (context.get("booking_event") or {}).get("thread_id")
            or (context.get("trigger_event") or {}).get("payload", {}).get("thread_id")
        )
        if thread_id:
            thread_events = [item for item in events if item.get("thread_id") == thread_id]
            if thread_events:
                return sorted(thread_events, key=lambda item: str(item.get("start_time") or ""))[0]
        contact_id = (
            params.get("contact_id")
            or context.get("contact_id")
            or (context.get("booking_event") or {}).get("contact_id")
            or (context.get("trigger_event") or {}).get("payload", {}).get("contact_id")
        )
        if contact_id:
            contact_events = [item for item in events if item.get("contact_id") == contact_id]
            if contact_events:
                return sorted(contact_events, key=lambda item: str(item.get("start_time") or ""))[0]
        raise ValueError("Booking event not found")

    def _coerce_booking_payload(self, step: dict[str, Any], context: dict[str, Any], *, mode: str) -> dict[str, Any]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        config = json_object(params.get("node_config")) | json_object(params.get("configuration"))
        trigger_payload = (context.get("trigger_event") or {}).get("payload") if isinstance(context.get("trigger_event"), dict) else {}
        booking_event = context.get("booking_event") if isinstance(context.get("booking_event"), dict) else {}
        start_time = (
            params.get("start_time")
            or params.get("scheduled_at")
            or config.get("start_time")
            or context.get("start_time")
            or booking_event.get("start_time")
            or trigger_payload.get("start_time")
        )
        end_time = (
            params.get("end_time")
            or config.get("end_time")
            or context.get("end_time")
            or booking_event.get("end_time")
            or trigger_payload.get("end_time")
        )
        base = {
            "calendar_id": params.get("calendar_id") or config.get("calendar_id") or context.get("calendar_id") or booking_event.get("calendar_id") or trigger_payload.get("calendar_id"),
            "thread_id": params.get("thread_id") or config.get("thread_id") or context.get("thread_id") or booking_event.get("thread_id") or trigger_payload.get("thread_id"),
            "contact_id": params.get("contact_id") or config.get("contact_id") or context.get("contact_id") or booking_event.get("contact_id") or trigger_payload.get("contact_id"),
            "company_id": params.get("company_id") or config.get("company_id") or context.get("company_id"),
            "booking_type_id": params.get("booking_type_id") or config.get("booking_type_id") or context.get("booking_type_id") or booking_event.get("booking_type_id") or trigger_payload.get("booking_type_id"),
            "title": params.get("title") or config.get("title") or context.get("title") or booking_event.get("title") or trigger_payload.get("title") or "Scheduled Meeting",
            "description": params.get("description") or config.get("description") or context.get("description") or booking_event.get("description") or trigger_payload.get("description") or "",
            "location_type": params.get("location_type") or config.get("location_type") or context.get("location_type") or booking_event.get("location_type") or trigger_payload.get("location_type"),
            "location": params.get("location") or config.get("location") or context.get("location") or booking_event.get("location") or trigger_payload.get("location") or "",
            "meeting_url": params.get("meeting_url") or config.get("meeting_url") or context.get("meeting_url") or booking_event.get("meeting_url") or trigger_payload.get("meeting_url") or "",
            "status": params.get("status") or config.get("status") or context.get("status") or booking_event.get("status") or trigger_payload.get("status") or ("cancelled" if mode == "cancel" else "scheduled"),
            "guest_name": params.get("guest_name") or config.get("guest_name") or context.get("guest_name") or booking_event.get("guest_name"),
            "guest_email": params.get("guest_email") or config.get("guest_email") or context.get("guest_email") or booking_event.get("guest_email"),
            "guest_phone": params.get("guest_phone") or config.get("guest_phone") or context.get("guest_phone") or booking_event.get("guest_phone"),
            "source": params.get("source") or config.get("source") or context.get("source") or booking_event.get("source") or "flow",
            "start_time": start_time,
            "end_time": end_time,
        }
        if mode != "create":
            base["event_id"] = params.get("event_id") or config.get("event_id") or context.get("event_id") or booking_event.get("event_id") or trigger_payload.get("event_id")
        duration_override = params.get("duration_minutes") or config.get("duration_minutes")
        if duration_override is not None:
            start_dt = coerce_datetime(base.get("start_time")) or datetime.now(UTC)
            if not base.get("end_time"):
                base["end_time"] = (start_dt + timedelta(minutes=safe_int(duration_override, 30))).isoformat()
        resolved = apply_calendar_event_defaults(base, runtime_tenant_settings(context))
        return {key: value for key, value in resolved.items() if value is not None}

    def _create_booking(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        created = self.provider.create_calendar_event(self._coerce_booking_payload(step, context, mode="create"))
        emit_system_event(
            self.provider,
            {
                "type": "booking_created",
                "payload": self._booking_event_payload(created),
                "meta": {"depth": safe_int(context.get("_system_event_depth"), 0)},
            },
            actor=context.get("_system_event_actor") or {},
            tenant=context.get("_system_event_tenant") or context.get("tenant") or {},
            provider_config=context.get("_provider_config"),
        )
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": created}

    def _update_booking(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        params = self._coerce_booking_payload(step, context, mode="update")
        event = self._resolve_booking_event(params, context)
        updated = self.provider.update_calendar_event(
            event["id"],
            {key: value for key, value in params.items() if key not in {"event_id"}},
        )
        event_type = "booking_cancelled" if str(updated.get("status") or "").strip().lower() == "cancelled" else "booking_updated"
        emit_system_event(
            self.provider,
            {
                "type": event_type,
                "payload": self._booking_event_payload(updated),
                "meta": {"depth": safe_int(context.get("_system_event_depth"), 0)},
            },
            actor=context.get("_system_event_actor") or {},
            tenant=context.get("_system_event_tenant") or context.get("tenant") or {},
            provider_config=context.get("_provider_config"),
        )
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": updated}

    def _cancel_booking(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        event = self._resolve_booking_event(step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}, context)
        cancelled = self.provider.update_calendar_event(
            event["id"],
            {"status": "cancelled", "sync_note": "Cancelled via execution layer."},
        )
        emit_system_event(
            self.provider,
            {
                "type": "booking_cancelled",
                "payload": self._booking_event_payload(cancelled),
                "meta": {"depth": safe_int(context.get("_system_event_depth"), 0)},
            },
            actor=context.get("_system_event_actor") or {},
            tenant=context.get("_system_event_tenant") or context.get("tenant") or {},
            provider_config=context.get("_provider_config"),
        )
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": cancelled}

    def _get_booking(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        events = self.provider.list_calendar_events() if getattr(self.provider, "list_calendar_events", None) else []
        event_id = params.get("event_id") or context.get("event_id") or (context.get("booking_event") or {}).get("event_id")
        if event_id:
            event = next((item for item in events if item.get("id") == event_id), None)
            if not event:
                raise ValueError("Booking event not found")
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": {"event": event, "count": 1}}
        thread_id = params.get("thread_id") or context.get("thread_id") or (context.get("booking_event") or {}).get("thread_id")
        if thread_id:
            events = [item for item in events if item.get("thread_id") == thread_id]
        contact_id = params.get("contact_id") or context.get("contact_id") or (context.get("booking_event") or {}).get("contact_id")
        if contact_id:
            events = [item for item in events if item.get("contact_id") == contact_id]
        status_filter = params.get("status") or context.get("status")
        if status_filter:
            events = [item for item in events if str(item.get("status") or "").strip().lower() == str(status_filter).strip().lower()]
        events = sorted(events, key=lambda item: str(item.get("start_time") or ""))
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {"events": events[:25], "count": len(events), "event": events[0] if events else None},
        }

    def _add_contact(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {})
        if not params.get("email") and not params.get("first_name"):
            raise ValueError("add_contact requires email or first_name in parameters.")
        res = getattr(self.provider, "create_contact")(params)
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}

    def _add_crm_note(self, step: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {})
        thread_id = params.get("thread_id") or context.get("thread_id")
        if not thread_id:
            raise ValueError("Missing thread_id context for add_crm_note.")
        res = getattr(self.provider, "apply_thread_ai_result")(thread_id, mode="note", suggestion=params.get("note") or params.get("content", ""))
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}

    def _verification_runtime_status(self, data_status: Any, error: Any = None) -> str:
        normalized = normalize_token(data_status) or ""
        if error:
            return "failed"
        if normalized in {"failed", "error", "timeout", "not_configured", "invalid_input"}:
            return "failed"
        return "success"

    def _verify_email(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._email_verifier_config()
        email, contact_id = self._resolve_single_verification_target(step, context, runtime)
        if not email:
            data = {
                "email": "",
                "status": "invalid_input",
                "score": None,
                "isSafe": False,
                "contactId": contact_id,
                "error": "No email was available for verification.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        if not config.get("enabled") or not config.get("api_key"):
            data = {
                "email": email,
                "status": "not_configured",
                "score": None,
                "isSafe": False,
                "contactId": contact_id,
                "error": "Email verification is not configured for this tenant.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        writeback = parse_bool(self._merged_step_config(step).get("writeback"), True)
        try:
            result = verify_single_email_address(config["api_key"], email, "quick")
            updated_contact = None
            if writeback and contact_id and getattr(self.provider, "apply_email_verification_result", None):
                updated_contact = self.provider.apply_email_verification_result(contact_id, result, expected_email=email)
            data = {
                "email": result.get("email") or email,
                "status": result.get("status") or "unknown",
                "score": result.get("score"),
                "isSafe": bool(result.get("is_safe_to_send")),
                "contactId": contact_id,
                "contact": updated_contact,
                "raw": result.get("raw"),
            }
            step_status = self._verification_runtime_status(data.get("status"), data.get("error"))
        except Exception as exc:
            data = {
                "email": email,
                "status": "unknown",
                "score": None,
                "isSafe": False,
                "contactId": contact_id,
                "error": str(exc),
            }
            step_status = "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": step_status, "data": data, "error": data.get("error")}

    def _verify_email_bulk(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._email_verifier_config()
        merged = self._merged_step_config(step)
        trigger_payload = (context.get("trigger_event") or {}).get("payload") if isinstance(context.get("trigger_event"), dict) else {}
        contact_ids = parse_string_list(merged.get("contactIds") or merged.get("contact_ids") or context.get("contact_ids") or trigger_payload.get("contact_ids"))
        emails = parse_string_list(merged.get("emails") or context.get("emails") or trigger_payload.get("emails"))
        if not contact_ids and clean_text(context.get("contact_id")):
            contact_ids = [clean_text(context.get("contact_id"))]
        if not emails and clean_text(context.get("email")):
            emails = [clean_text(context.get("email"))]
        resolver = getattr(self.provider, "resolve_email_verification_targets", None)
        targets = resolver(contact_ids=contact_ids or None, emails=emails or None) if resolver else []
        if not targets:
            data = {
                "taskId": None,
                "submittedCount": 0,
                "status": "invalid_input",
                "error": "No verifiable emails were available for bulk verification.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        if not config.get("enabled") or not config.get("api_key"):
            data = {
                "taskId": None,
                "submittedCount": 0,
                "status": "not_configured",
                "error": "Email verification is not configured for this tenant.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        unique_emails = sorted({clean_text(item.get("email")).lower() for item in targets if clean_text(item.get("email"))})
        try:
            remote_task = create_email_verifier_bulk_task(config["api_key"], unique_emails, "power", task_name=f"flow-{clean_text(context.get('flow_id')) or 'runtime'}")
            task = self.provider.create_email_verification_task({
                "provider_task_id": remote_task["providerTaskId"],
                "status": "queued",
                "mode": remote_task["mode"],
                "submitted_count": remote_task["submittedCount"],
                "completed_count": 0,
                "targets": targets,
            }) if getattr(self.provider, "create_email_verification_task", None) else {}
            data = {
                "taskId": task.get("id"),
                "providerTaskId": remote_task["providerTaskId"],
                "submittedCount": remote_task["submittedCount"],
                "status": clean_text(task.get("status")) or "queued",
            }
            step_status = self._verification_runtime_status(data.get("status"), data.get("error"))
        except Exception as exc:
            data = {
                "taskId": None,
                "submittedCount": 0,
                "status": "failed",
                "error": str(exc),
            }
            step_status = "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": step_status, "data": data, "error": data.get("error")}

    def _wait_for_verification(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._email_verifier_config()
        merged = self._merged_step_config(step)
        previous_bulk = self._previous_step_result(runtime, intents={"verify_email_bulk", "wait_for_verification"})
        task_id = clean_text(
            merged.get("taskId")
            or merged.get("task_id")
            or context.get("task_id")
            or (previous_bulk or {}).get("taskId")
        )
        timeout_seconds = min(max(safe_int(merged.get("timeoutSeconds") or merged.get("timeout_seconds"), 60), 5), 600)
        poll_interval = min(max(safe_int(merged.get("pollInterval") or merged.get("poll_interval"), 5), 1), 30)
        if not task_id:
            data = {
                "taskId": None,
                "status": "invalid_input",
                "valid": 0,
                "risky": 0,
                "invalid": 0,
                "unknown": 0,
                "error": "No email verification task id was available.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        if not config.get("enabled") or not config.get("api_key"):
            data = {
                "taskId": task_id,
                "status": "not_configured",
                "valid": 0,
                "risky": 0,
                "invalid": 0,
                "unknown": 0,
                "error": "Email verification is not configured for this tenant.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        deadline = time.time() + timeout_seconds
        last_result = {
            "taskId": task_id,
            "status": "timeout",
            "submittedCount": 0,
            "completedCount": 0,
            "valid": 0,
            "risky": 0,
            "invalid": 0,
            "unknown": 0,
        }
        while time.time() < deadline:
            try:
                last_result = self._sync_email_verification_task(task_id, config["api_key"])
            except Exception as exc:
                last_result = {
                    "taskId": task_id,
                    "status": "failed",
                    "submittedCount": 0,
                    "completedCount": 0,
                    "valid": 0,
                    "risky": 0,
                    "invalid": 0,
                    "unknown": 0,
                    "error": str(exc),
                }
                break
            if last_result.get("status") in {"completed", "failed"}:
                break
            time.sleep(poll_interval)
        if last_result.get("status") not in {"completed", "failed"}:
            last_result["status"] = "timeout"
        data = {
            "taskId": task_id,
            "status": last_result.get("status") or "timeout",
            "submittedCount": safe_int(last_result.get("submittedCount")),
            "completedCount": safe_int(last_result.get("completedCount")),
            "valid": safe_int(last_result.get("valid")),
            "risky": safe_int(last_result.get("risky")),
            "invalid": safe_int(last_result.get("invalid")),
            "unknown": safe_int(last_result.get("unknown")),
            "error": last_result.get("error") or last_result.get("lastError"),
        }
        step_status = self._verification_runtime_status(data.get("status"), data.get("error"))
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": step_status, "data": data, "error": data.get("error")}

    def _resolved_media_payload(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        config = self._normalized_service_config(step)
        raw_inputs = config.get("inputs") if isinstance(config.get("inputs"), dict) else {}
        trigger_payload = self._trigger_payload(context)
        missing: list[str] = []

        def resolve_media_value(value: Any, field_name: str) -> Any:
            if value is None:
                missing.append(field_name)
                return None
            syntax_errors = self._token_syntax_errors(value, field_name)
            if syntax_errors:
                missing.extend(syntax_errors)
                return None
            resolved, unresolved = self._resolve_value(value, context, runtime)
            if unresolved:
                missing.append(f"{field_name}: {', '.join(unresolved)}")
            return resolved

        source_type = clean_text(config.get("sourceType") or config.get("source_type")).lower()
        source_ref = config.get("sourceRef") if "sourceRef" in config else config.get("source_ref")
        meeting_provider = clean_text(config.get("meetingProvider") or config.get("meeting_provider") or config.get("provider"))
        meeting_ref = config.get("meetingRef") if "meetingRef" in config else config.get("meeting_ref")
        resolved_source_ref = resolve_media_value(source_ref, "sourceRef") if source_ref is not None else None
        resolved_meeting_ref = resolve_media_value(meeting_ref, "meetingRef") if meeting_ref is not None else None
        topic = config.get("topic") if "topic" in config else raw_inputs.get("topic")
        tone_value = config.get("tone") if "tone" in config else raw_inputs.get("tone")
        duration = config.get("duration") if "duration" in config else config.get("length")
        if duration is None:
            duration = raw_inputs.get("duration") if "duration" in raw_inputs else raw_inputs.get("length")
        context_value = config.get("context") if "context" in config else raw_inputs.get("context")
        text_value = config.get("text") if "text" in config else config.get("scriptText")
        if text_value is None:
            text_value = raw_inputs.get("text") if "text" in raw_inputs else raw_inputs.get("scriptText")
        source_url_value = config.get("sourceUrl") if "sourceUrl" in config else config.get("source_url")
        if source_url_value is None:
            source_url_value = raw_inputs.get("sourceUrl") if "sourceUrl" in raw_inputs else raw_inputs.get("source_url")
        transcript_text_value = config.get("transcriptText") if "transcriptText" in config else config.get("transcript_text")
        if transcript_text_value is None:
            transcript_text_value = raw_inputs.get("transcriptText") if "transcriptText" in raw_inputs else raw_inputs.get("transcript_text")
        speaker_segments_value = config.get("speakerSegments") if "speakerSegments" in config else config.get("speaker_segments")
        if speaker_segments_value is None:
            speaker_segments_value = raw_inputs.get("speakerSegments") if "speakerSegments" in raw_inputs else raw_inputs.get("speaker_segments")
        title_value = config.get("title") if "title" in config else raw_inputs.get("title")
        subtitle_value = config.get("subtitle") if "subtitle" in config else raw_inputs.get("subtitle")
        prompt_value = config.get("prompt") if "prompt" in config else raw_inputs.get("prompt")
        voice_value = config.get("voice") if "voice" in config else raw_inputs.get("voice")
        style_value = config.get("style") if "style" in config else raw_inputs.get("style")
        image_value = config.get("image") if "image" in config else raw_inputs.get("image")
        metadata_value = config.get("metadata") if "metadata" in config else raw_inputs.get("metadata")
        if isinstance(metadata_value, str) and "{{" not in metadata_value and "}}" not in metadata_value:
            metadata_value = json_value(metadata_value, metadata_value)
        asset_ref_value = config.get("assetRef") if "assetRef" in config else config.get("asset_ref")
        asset_id_value = config.get("assetId") if "assetId" in config else config.get("asset_id")
        artifact_ref_value = config.get("artifactRef") if "artifactRef" in config else config.get("artifact_ref")
        publish_target_value = config.get("publishTarget") if "publishTarget" in config else config.get("publish_target")
        resolved_topic = resolve_media_value(topic, "topic") if topic is not None else None
        resolved_tone_value = resolve_media_value(tone_value, "tone") if tone_value is not None else None
        resolved_duration = resolve_media_value(duration, "duration") if duration is not None else None
        resolved_context_value = resolve_media_value(context_value, "context") if context_value is not None else None
        resolved_text_value = resolve_media_value(text_value, "text") if text_value is not None else None
        resolved_source_url_value = resolve_media_value(source_url_value, "sourceUrl") if source_url_value is not None else None
        resolved_transcript_text_value = resolve_media_value(transcript_text_value, "transcriptText") if transcript_text_value is not None else None
        resolved_speaker_segments_value = resolve_media_value(speaker_segments_value, "speakerSegments") if speaker_segments_value is not None else None
        resolved_title_value = resolve_media_value(title_value, "title") if title_value is not None else None
        resolved_subtitle_value = resolve_media_value(subtitle_value, "subtitle") if subtitle_value is not None else None
        resolved_prompt_value = resolve_media_value(prompt_value, "prompt") if prompt_value is not None else None
        resolved_voice_value = resolve_media_value(voice_value, "voice") if voice_value is not None else None
        resolved_style_value = resolve_media_value(style_value, "style") if style_value is not None else None
        resolved_image_value = resolve_media_value(image_value, "image") if image_value is not None else None
        resolved_metadata_value = resolve_media_value(metadata_value, "metadata") if metadata_value is not None else None
        resolved_asset_ref_value = resolve_media_value(asset_ref_value, "assetRef") if asset_ref_value is not None else None
        resolved_asset_id_value = resolve_media_value(asset_id_value, "assetId") if asset_id_value is not None else None
        resolved_artifact_ref_value = resolve_media_value(artifact_ref_value, "artifactRef") if artifact_ref_value is not None else None
        resolved_publish_target_value = resolve_media_value(publish_target_value, "publishTarget") if publish_target_value is not None else None

        payload = {
            "provider": config.get("provider") or config.get("mediaProvider") or config.get("transcriptionProvider"),
            "title": resolved_title_value if resolved_title_value is not None else config.get("title") or context.get("flow_name") or "Media Job",
            "templateId": config.get("templateId") or config.get("template_id"),
            "outputTarget": config.get("outputTarget") or config.get("output_target"),
            "source_url": resolved_source_url_value if resolved_source_url_value is not None else config.get("source_url") or config.get("sourceUrl") or trigger_payload.get("source_url") or trigger_payload.get("recording_url"),
            "transcript_text": resolved_transcript_text_value if resolved_transcript_text_value is not None else config.get("transcript_text") or config.get("transcriptText") or trigger_payload.get("transcript_text"),
            "speaker_segments": resolved_speaker_segments_value if resolved_speaker_segments_value is not None else config.get("speaker_segments") or config.get("speakerSegments") or trigger_payload.get("speaker_segments"),
            "recording_files": config.get("recording_files") or config.get("recordingFiles") or trigger_payload.get("recording_files"),
            "drive_files": config.get("drive_files") or config.get("driveFiles") or trigger_payload.get("drive_files"),
            "meeting_id": config.get("meeting_id") or config.get("meetingId") or trigger_payload.get("meeting_id"),
            "meeting_title": config.get("meeting_title") or config.get("meetingTitle") or trigger_payload.get("meeting_title"),
            "media_type": config.get("media_type") or config.get("mediaType") or "video",
            "script": config.get("script") or resolved_prompt_value or config.get("prompt"),
            "text": resolved_text_value if resolved_text_value is not None else text_value,
            "topic": resolved_topic if resolved_topic is not None else topic,
            "tone": resolved_tone_value if resolved_tone_value is not None else config.get("tone") or raw_inputs.get("tone"),
            "duration": resolved_duration if resolved_duration is not None else duration,
            "context": resolved_context_value if resolved_context_value is not None else context_value,
            "subtitle": resolved_subtitle_value if resolved_subtitle_value is not None else subtitle_value,
            "prompt": resolved_prompt_value if resolved_prompt_value is not None else prompt_value,
            "voice": resolved_voice_value if resolved_voice_value is not None else voice_value,
            "style": resolved_style_value if resolved_style_value is not None else style_value,
            "image": resolved_image_value if resolved_image_value is not None else image_value,
            "assetRef": resolved_asset_ref_value if resolved_asset_ref_value is not None else asset_ref_value,
            "asset_id": resolved_asset_id_value if resolved_asset_id_value is not None else asset_id_value,
            "artifactRef": resolved_artifact_ref_value if resolved_artifact_ref_value is not None else artifact_ref_value,
            "publishTarget": resolved_publish_target_value if resolved_publish_target_value is not None else publish_target_value,
            "attachTarget": config.get("attachTarget") or config.get("attach_target"),
            "metadata": resolved_metadata_value if isinstance(resolved_metadata_value, dict) else (config.get("metadata") if isinstance(config.get("metadata"), dict) else {}),
            "attachments": self._media_attachments(context, runtime, config),
            "auto_transcribe": parse_bool(config.get("auto_transcribe"), True),
            "api_key": config.get("api_key"),
            "access_key_id": config.get("access_key_id"),
            "secret_access_key": config.get("secret_access_key"),
        }
        if source_type in {"source_url", "url"}:
            payload["source_url"] = clean_text(resolved_source_ref) or payload.get("source_url")
        elif source_type in {"asset", "asset_id"}:
            payload["asset_id"] = clean_text(resolved_source_ref) or clean_text(payload.get("asset_id")) or None
        elif source_type in {"transcript_text", "inline_transcript"}:
            payload["transcript_text"] = clean_text(resolved_source_ref) or payload.get("transcript_text")
        elif source_type == "speaker_segments":
            payload["speaker_segments"] = resolved_source_ref if isinstance(resolved_source_ref, list) else payload.get("speaker_segments")

        if meeting_provider:
            payload["provider"] = meeting_provider
        if resolved_meeting_ref is not None:
            payload["meeting_id"] = clean_text(resolved_meeting_ref) or payload.get("meeting_id")
        if clean_text(config.get("meetingTitle") or config.get("meeting_title")):
            payload["meeting_title"] = clean_text(config.get("meetingTitle") or config.get("meeting_title"))
        if config.get("recordingFiles") is not None or config.get("recording_files") is not None:
            payload["recording_files"] = config.get("recordingFiles") if config.get("recordingFiles") is not None else config.get("recording_files")
        if config.get("driveFiles") is not None or config.get("drive_files") is not None:
            payload["drive_files"] = config.get("driveFiles") if config.get("driveFiles") is not None else config.get("drive_files")
        if config.get("transcriptText") is not None or config.get("transcript_text") is not None:
            payload["transcript_text"] = resolved_transcript_text_value if resolved_transcript_text_value is not None else (config.get("transcriptText") if config.get("transcriptText") is not None else config.get("transcript_text"))

        return payload, missing

    def _generate_script(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "artifact": None})
        if not clean_text(payload.get("topic")):
            return self._service_error(step, "Generate Script requires a topic.", data={"job": None, "artifact": None})
        result = get_media_engine().generate_script(
            {
                **payload,
                "provider": clean_text(payload.get("provider")) or "stub-script",
                "title": clean_text(payload.get("title")) or f"{clean_text(payload.get('topic'))} Script",
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": status, "data": result, "error": job.get("last_error")}

    def _generate_run_of_show(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "artifact": None})
        if not clean_text(payload.get("topic")):
            return self._service_error(step, "Generate Run of Show requires a topic.", data={"job": None, "artifact": None})
        if not clean_text(payload.get("duration")):
            return self._service_error(step, "Generate Run of Show requires a duration.", data={"job": None, "artifact": None})
        result = get_media_engine().generate_run_of_show(
            {
                **payload,
                "provider": clean_text(payload.get("provider")) or "stub-run-of-show",
                "title": clean_text(payload.get("title")) or clean_text(payload.get("topic")) or "Run of Show",
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": status, "data": result, "error": job.get("last_error")}

    def _generate_podcast_script(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        """Generate a broadcast-ready podcast script with YouTube metadata and encoder handoff scaffold."""
        node_config = step.get("config") or {}
        brand_key = clean_text(node_config.get("brandKey") or node_config.get("brand_key") or "unknown")
        episode_title = clean_text(node_config.get("episodeTitle") or node_config.get("episode_title") or node_config.get("topic"))
        episode_topic = clean_text(node_config.get("episodeTopic") or node_config.get("episode_topic") or node_config.get("topic"))
        episode_summary = clean_text(node_config.get("episodeSummary") or node_config.get("episode_summary"))
        target_audience = clean_text(node_config.get("targetAudience") or node_config.get("target_audience"))
        episode_goal = clean_text(node_config.get("episodeGoal") or node_config.get("episode_goal"))
        source_transcript = clean_text(node_config.get("sourceTranscript") or node_config.get("source_transcript"))
        source_notes = clean_text(node_config.get("sourceNotes") or node_config.get("source_notes"))
        source_links = clean_text(node_config.get("sourceLinks") or node_config.get("source_links"))
        key_points = clean_text(node_config.get("keyPoints") or node_config.get("key_points"))
        guest_name = clean_text(node_config.get("guestName") or node_config.get("guest_name"))
        guest_title = clean_text(node_config.get("guestTitle") or node_config.get("guest_title"))
        guest_bio = clean_text(node_config.get("guestBio") or node_config.get("guest_bio"))
        tone_direction = clean_text(node_config.get("toneDirection") or node_config.get("tone_direction"))
        segment_structure = clean_text(node_config.get("segmentStructure") or node_config.get("segment_structure"))
        call_to_action = clean_text(node_config.get("callToAction") or node_config.get("call_to_action"))
        desired_length = clean_text(node_config.get("desiredLength") or node_config.get("desired_length") or "20-30 min")
        include_intro = clean_text(node_config.get("includeIntro") or node_config.get("include_intro") or "Yes").lower() == "yes"
        include_sponsor = clean_text(node_config.get("includeSponsorBreak") or node_config.get("include_sponsor_break") or "No").lower() == "yes"
        include_outro = clean_text(node_config.get("includeOutro") or node_config.get("include_outro") or "Yes").lower() == "yes"
        brand_voice = clean_text(node_config.get("brandVoice") or node_config.get("brand_voice"))
        mission = clean_text(node_config.get("mission"))
        value_prop = clean_text(node_config.get("valueProp") or node_config.get("value_prop"))
        differentiation = clean_text(node_config.get("differentiation"))
        ideal_customer = clean_text(node_config.get("idealCustomer") or node_config.get("ideal_customer"))
        pain_points = clean_text(node_config.get("painPoints") or node_config.get("pain_points"))

        # Resolve brand profile: client-level → global Cortex → defaults
        company_id = clean_text(node_config.get("companyId") or node_config.get("company_id"))
        tenant_id = clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None
        brand = resolve_brand_profile(self.provider, company_id, tenant_id)

        # Override with explicitly passed values (node config takes priority over resolved profile)
        brand_voice = brand_voice or brand.get("brandVoice") or ""
        mission = mission or brand.get("brandName") or ""
        value_prop = value_prop or brand.get("valueProp") or ""
        differentiation = differentiation or brand.get("differentiation") or ""
        ideal_customer = ideal_customer or brand.get("idealCustomer") or ""
        pain_points = pain_points or brand.get("painPoints") or ""

        if not episode_title and not episode_topic:
            return self._service_error(step, "Podcast script generation requires an episode title or topic.", data={"artifact": None})

        ai_trends = clean_text(node_config.get("aiTrends") or node_config.get("ai_trends"))
        easy_site_updates = clean_text(node_config.get("easySiteUpdates") or node_config.get("easy_site_updates"))
        new_oaks_updates = clean_text(node_config.get("newOaksUpdates") or node_config.get("new_oaks_updates"))

        system_prompt = (
            f"You are a podcast scriptwriter for {brand_key}. "
        )
        if brand_key == "aioBestAiPodcast":
            system_prompt += (
                f"Brand voice: {brand_voice or 'Commanding, intelligent, direct, high-trust, execution-driven.'} "
                f"Mission: {mission or 'Build AI-native systems that eliminate software sprawl.'} "
                f"Value proposition: {value_prop or 'An AI-first execution platform.'} "
                f"Differentiation: {differentiation or 'System-native architecture.'} "
                f"Target audience: {ideal_customer or 'Founder-operators and lean teams.'} "
                f"Pain points: {pain_points or 'Tool sprawl and fragmented workflows.'} "
                "Never sound hypey, corporate-generic, or overly cheerful. "
                "Prefer strong positioning, plain language, sharp contrast, and execution authority."
            )
        elif brand_key == "newOaksPodcast":
            system_prompt += (
                "Professional, informative, and authoritative. "
                "Structure content clearly with section headers. "
                "Use markdown formatting (H1, H2, H3, lists, bold)."
            )

        user_prompt_parts = []
        if include_intro:
            user_prompt_parts.append("## INTRO\nGenerate a compelling intro hook for this episode.")
        if ai_trends or source_notes:
            user_prompt_parts.append(f"## AI TREND SPOTLIGHT\nSource material: {ai_trends or source_notes}")
        if easy_site_updates:
            user_prompt_parts.append(f"## FEATURE UPDATES\nSource material: {easy_site_updates}")
        if new_oaks_updates:
            user_prompt_parts.append(f"## PLATFORM UPDATES\nSource material: {new_oaks_updates}")
        if key_points:
            user_prompt_parts.append(f"## KEY POINTS\n{key_points}")
        if guest_name:
            user_prompt_parts.append(f"## GUEST\nName: {guest_name}, Title: {guest_title or 'N/A'}, Bio: {guest_bio or 'N/A'}")
        if include_sponsor:
            user_prompt_parts.append("## SPONSOR BREAK\nInclude a natural sponsor read transition.")
        if include_outro:
            user_prompt_parts.append(f"## OUTRO\nWrap up the episode. Call to action: {call_to_action or 'Subscribe and follow.'}")

        user_prompt = "\n\n".join(user_prompt_parts)

        result = get_media_engine().generate_script(
            {
                "title": episode_title or episode_topic,
                "topic": episode_topic or episode_title,
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "episode_summary": episode_summary,
                "target_audience": target_audience,
                "episode_goal": episode_goal,
                "source_transcript": source_transcript,
                "source_links": source_links,
                "tone_direction": tone_direction,
                "segment_structure": segment_structure,
                "desired_length": desired_length,
                "brand_key": brand_key,
                "provider": clean_text(node_config.get("provider")) or "stub-script",
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        script_text = job.get("result") or job.get("script") or ""
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"

        # Parse scriptText into structured segments
        parsed_script = self._parse_script_segments(script_text)

        youtube_title = f"{brand_key} Podcast – {episode_title or episode_topic}"
        youtube_desc = f"Episode: {episode_title or episode_topic}\n\nTopic: {episode_topic or episode_title}\n\n"
        if episode_summary:
            youtube_desc += f"{episode_summary}\n\n"
        if key_points:
            youtube_desc += f"Key Points:\n{key_points}\n\n"
        youtube_desc += f"#{brand_key.replace(' ', '')} #AI #Podcast"

        form_submission_id = clean_text(runtime.get("formData", {}).get("id") or runtime.get("form_submission_id"))
        artifact = {
            "brandKey": brand_key,
            "episode": {
                "title": episode_title or episode_topic,
                "topic": episode_topic or episode_title,
                "summary": episode_summary,
                "targetAudience": target_audience,
                "goal": episode_goal,
            },
            "script": parsed_script,
            "youtube": {
                "videoTitle": youtube_title,
                "description": youtube_desc,
                "tags": [brand_key.replace(" ", ""), "AI", "Podcast", episode_topic.replace(" ", "-")][:10],
                "category": "Science & Technology",
                "visibility": "private",
                "scheduledStartTime": "",
                "thumbnailRef": "",
            },
            "broadcast": {
                "title": youtube_title,
                "description": episode_summary or episode_topic,
                "privacyStatus": "private",
                "scheduledStartTime": "",
                "streamConfig": {
                    "encoder": "vmix",
                    "resolution": "1920x1080",
                    "frameRate": 30,
                    "bitrate": "6000",
                },
                "rtmp": {
                    "ingestServer": "",
                    "streamKey": "",
                },
                "status": "draft",
            },
            "artifacts": {
                "scriptText": script_text,
                "youtubeDescription": youtube_desc,
            },
            "generationMeta": {
                "brandSource": brand_key,
                "formSubmissionId": form_submission_id,
                "timestamp": datetime_now(),
            },
        }
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": status,
            "data": {"job": job, "artifact": artifact},
            "error": job.get("last_error"),
        }

    @staticmethod
    def _parse_script_segments(script_text: str) -> dict[str, Any]:
        """Parse raw script text into structured intro/segments/outro."""
        if not script_text or not script_text.strip():
            return {"intro": "", "segments": [], "outro": "", "callToAction": ""}

        # Split on markdown headers (## or #)
        header_pattern = re.compile(r'^#{1,3}\s+(.+)$', re.MULTILINE)
        sections = header_pattern.split(script_text.strip())

        if len(sections) >= 4:
            # Has headers: sections[0] = pre-header text, sections[1] = header1 title, sections[2] = header1 content, etc.
            parsed_sections = []
            i = 0
            if sections[0].strip():
                parsed_sections.append({"title": "Opening", "content": sections[0].strip()})
            i = 1
            while i < len(sections) - 1:
                title = sections[i].strip()
                content = sections[i + 1].strip() if i + 1 < len(sections) else ""
                if title or content:
                    parsed_sections.append({"title": title, "content": content})
                i += 2

            if len(parsed_sections) == 1:
                return {"intro": parsed_sections[0]["content"], "segments": [], "outro": "", "callToAction": ""}

            intro = parsed_sections[0]["content"]
            outro = parsed_sections[-1]["content"]
            middle = parsed_sections[1:-1]
            segments = [{"title": s["title"], "content": s["content"]} for s in middle if s["content"].strip()]

            return {"intro": intro, "segments": segments, "outro": outro, "callToAction": ""}

        # No headers: split by percentage
        lines = script_text.strip().split("\n\n")
        total = len(lines)
        if total <= 2:
            return {"intro": script_text.strip(), "segments": [], "outro": "", "callToAction": ""}

        intro_size = max(1, total // 5)
        outro_size = max(1, total // 5)
        intro = "\n\n".join(lines[:intro_size]).strip()
        outro = "\n\n".join(lines[-outro_size:]).strip()
        middle_lines = lines[intro_size:total - outro_size]

        # Split middle into 2-4 segments
        seg_count = min(4, max(2, len(middle_lines)))
        seg_size = max(1, len(middle_lines) // seg_count)
        segments = []
        for idx in range(seg_count):
            start = idx * seg_size
            end = start + seg_size if idx < seg_count - 1 else len(middle_lines)
            seg_content = "\n\n".join(middle_lines[start:end]).strip()
            if seg_content:
                segments.append({"title": f"Segment {idx + 1}", "content": seg_content})

        return {"intro": intro, "segments": segments, "outro": outro, "callToAction": ""}

    def _check_provider_connected(self, tenant_id: str | None, provider_key: str) -> dict[str, Any] | None:
        """
        Returns None if provider is connected.
        Returns a blocked response dict if not connected.
        """
        if not tenant_id or not provider_key:
            return {
                "status": "blocked",
                "reason": "provider_not_configured",
                "providerKey": provider_key,
                "providerStatus": "notConnected",
                "message": f"Provider '{provider_key}' is not configured.",
            }
        try:
            auth_store = get_auth_store()
            config = auth_store.get_social_provider_config(tenant_id, provider_key)
        except Exception:
            return {
                "status": "blocked",
                "reason": "provider_config_error",
                "providerKey": provider_key,
                "providerStatus": "unknown",
                "message": f"Could not retrieve config for '{provider_key}'.",
            }
        if not config:
            return {
                "status": "blocked",
                "reason": "provider_not_found",
                "providerKey": provider_key,
                "providerStatus": "notConnected",
                "message": f"Provider '{provider_key}' is not connected.",
            }
        canonical_status = (config.get("status") or "").strip().lower()
        if canonical_status == "connected":
            return None
        reason_map = {
            "configured": "provider_configured_not_connected",
            "needsconfig": "provider_needs_config",
            "notconnected": "provider_not_connected",
            "reconnectrequired": "provider_reconnect_required",
            "disconnected": "provider_not_connected",
        }
        return {
            "status": "blocked",
            "reason": reason_map.get(canonical_status, "provider_not_connected"),
            "providerKey": provider_key,
            "providerStatus": canonical_status or "unknown",
            "message": f"Provider '{provider_key}' is {canonical_status or 'unknown'} (not connected).",
        }

    def _generate_postbot_content(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        """
        Generate platform-optimized social content from canonical PostBot input.
        Engine accepts ONLY canonical input — all trigger normalization happens upstream.
        """
        node_config = step.get("config") or {}
        trigger_type = clean_text(node_config.get("triggerType") or node_config.get("trigger_type") or runtime.get("triggerType") or "manual")

        # Normalize raw config into canonical contract
        canonical = normalize_postbot_input(node_config, trigger_type)

        article_url = canonical["articleUrl"]
        article_summary = canonical["articleSummary"]
        target_platforms = canonical["targetPlatforms"]
        image_style = canonical["imageStyle"]
        custom_instructions = canonical["customInstructions"]
        generate_audio = canonical["generateAudio"]
        generate_shorts = canonical["generateShorts"]
        publish_to_youtube = canonical["publishToYouTube"]

        if not article_summary and not article_url:
            return self._service_error(step, "PostBot requires an article URL or summary.", data={"artifact": None})

        if not target_platforms:
            return self._service_error(step, "PostBot requires at least one target platform.", data={"artifact": None})

        # Resolve brand profile: explicit config → client brand → global Cortex → defaults
        company_id = clean_text(node_config.get("companyId") or node_config.get("company_id") or canonical.get("sourceFormId"))
        tenant_id = clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None
        brand = resolve_brand_profile(self.provider, company_id, tenant_id)

        # Explicit node config overrides resolved profile
        brand_voice = clean_text(node_config.get("brandVoice") or node_config.get("brand_voice") or brand.get("brandVoice"))
        value_prop = clean_text(node_config.get("valueProp") or node_config.get("value_prop") or brand.get("valueProp"))
        differentiation = clean_text(node_config.get("differentiation") or brand.get("differentiation"))
        ideal_customer = clean_text(node_config.get("idealCustomer") or node_config.get("ideal_customer") or brand.get("idealCustomer"))
        pain_points = clean_text(node_config.get("painPoints") or node_config.get("pain_points") or brand.get("painPoints"))
        marketing_strategy = clean_text(node_config.get("marketingStrategy") or node_config.get("marketing_strategy") or brand.get("marketingStrategy"))
        tone_directives = clean_text(node_config.get("toneDirectives") or node_config.get("tone_directives") or brand.get("toneDirectives"))

        platform_outputs = {}
        for plat in target_platforms:
            plat = plat.lower()
            block = self._check_provider_connected(tenant_id, plat)
            if block:
                platform_outputs[plat] = {**block, "content": None, "imagePrompt": None}
                continue
            system_prompt = "You are an expert social media copywriter specializing in SEO and platform-native content."
            user_prompt = ""

            if plat == "facebook":
                system_prompt = "You are an expert in social media management specializing in SEO and Facebook content strategy."
                user_prompt = (
                    f"Generate a Facebook post about this article summary: {article_summary}\n\n"
                    f"The post should engage the audience with a compelling introductory hook, "
                    f"provide essential details, and encourage interaction through likes, comments, and shares. "
                    f"End with a clear call to action to follow @BestAITV on YouTube. "
                    f"Use the hashtags #BLTV #BestAiTV #BestAiPodcast and include any other relevant hashtags.\n"
                    f"Add a link to the original article: {article_url}"
                )
            elif plat == "instagram":
                system_prompt = "You are a digital marketing specialist with expertise in Instagram and SEO."
                user_prompt = (
                    f"Create a viral Instagram post about this article summary: {article_summary}\n\n"
                    f"Ensure the content is visually appealing and includes an inspirational message. "
                    f"Use emojis to enhance engagement.\n"
                    f"Limit post to a maximum of 2000 characters. Include a link to https://bestai.tv\n"
                    f"Use the hashtags #BLTV #BestAiTV #BestAiPodcast. Include other relevant hashtags as necessary."
                )
            elif plat == "x":
                system_prompt = "You are a social media marketing manager with expert SEO skills."
                user_prompt = (
                    f"Write a Twitter/X post about this article summary: {article_summary}\n\n"
                    f"The post should be concise, impactful, and highlight an important aspect or benefit. "
                    f"Include an element of curiosity. Post limit: 240 characters. "
                    f"Add a call-to-action link at the end using either https://aiochatbots.com or https://bestai.tv.\n"
                    f"Use the hashtags #BLTV #BestAiTV #BestAiPodcast #AIOChatbots"
                )
            elif plat == "linkedin":
                system_prompt = "You are an AI industry expert and automations specialist."
                user_prompt = (
                    f"Produce a LinkedIn post discussing the key points from this article summary: {article_summary}\n\n"
                    f"The post should provide insightful analysis, connect with current industry trends, "
                    f"and encourage professional engagement or discussions. "
                    f"Highlight any notable implications for the industry. "
                    f"Ensure it is informative and structured. "
                    f"Include a link to the original article: {article_url}\n"
                    f"Add a call-to-action link using either https://aiochatbots.com or https://bestai.tv (use only one). "
                    f"Use the hashtags #BLTV #BestAiTV #BestAiPodcast and other relevant hashtags and emojis.\n\n"
                    f"Do not give any type of content or image suggestions in the result. Only the post."
                )
            elif plat == "youtube":
                system_prompt = "You are an expert YouTube video producer with a knack for SEO."
                user_prompt = (
                    f"Generate a compelling YouTube video title and a 3-minute video script for this article summary: {article_summary}\n\n"
                    f"The script should engage the audience with a compelling introductory hook, "
                    f"provide essential details, cover industry impacts, include rhetorical questions, "
                    f"and end with a clear call to action encouraging interaction through likes, comments, and shares. "
                    f"The information should be easily readable by an AI voice synthesizer.\n\n"
                    f"Negative Prompt: No emojis or side notes, suggestions, etc. in the result. The podcast content only."
                )

            if custom_instructions:
                user_prompt += f"\n\nAdditional instructions: {custom_instructions}"

            # Inject brand context when available (non-empty values only)
            brand_context_parts = []
            if brand_voice:
                brand_context_parts.append(f"Brand voice: {brand_voice}")
            if value_prop:
                brand_context_parts.append(f"Value proposition: {value_prop}")
            if differentiation:
                brand_context_parts.append(f"What makes this brand different: {differentiation}")
            if ideal_customer:
                brand_context_parts.append(f"Target audience: {ideal_customer}")
            if pain_points:
                brand_context_parts.append(f"Audience pain points: {pain_points}")
            if marketing_strategy:
                brand_context_parts.append(f"Marketing approach: {marketing_strategy}")
            if tone_directives:
                brand_context_parts.append(f"Tone guidance: {tone_directives}")

            if brand_context_parts:
                user_prompt += f"\n\nBrand context: {'; '.join(brand_context_parts)}"

            result = get_media_engine().generate_script(
                {
                    "title": f"PostBot: {plat}",
                    "topic": article_summary[:200] if article_summary else "Social Content",
                    "system_prompt": system_prompt,
                    "user_prompt": user_prompt,
                    "image_style": image_style if plat in ("facebook", "instagram", "linkedin") else None,
                    "platform": plat,
                    "article_url": article_url,
                    "provider": clean_text(node_config.get("provider")) or "stub-script",
                },
                tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
                context={
                    "run_id": runtime.get("runId"),
                    "flow_name": context.get("flow_name"),
                    "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                    "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
                },
            )
            job = result.get("job") or {}
            plat_status = "success" if clean_text(job.get("status")) == "complete" else "failed"
            platform_outputs[plat] = {
                "content": job.get("result") or job.get("script") or "",
                "status": plat_status,
                "imagePrompt": self._postbot_image_prompt(plat, article_summary, image_style) if plat in ("facebook", "instagram", "linkedin") else None,
            }

        # --- Media Lanes: Narration, Shorts, YouTube Handoff ---
        narration_asset_id = None
        narration_status = None
        shorts_assets = []
        shorts_status = None
        youtube_payload = {}
        youtube_status = None

        youtube_content = platform_outputs.get("youtube", {}).get("content") or ""
        youtube_title = ""
        if youtube_content:
            # Extract title from first line if it looks like a title
            first_line = youtube_content.split("\n")[0].strip()
            if first_line and len(first_line) < 200 and not first_line.startswith("#"):
                youtube_title = first_line
            else:
                youtube_title = f"PostBot: {article_url or article_summary[:80]}"

        # Lane 1: ElevenLabs Narration
        if generate_audio and youtube_content:
            try:
                tts_result = get_media_engine().render_audio(
                    {
                        "text": youtube_content,
                        "provider": "elevenlabs",
                        "voice_id": clean_text(node_config.get("narrationVoiceId") or node_config.get("narration_voice_id")),
                        "model_id": clean_text(node_config.get("narrationModelId") or node_config.get("narration_model_id") or "eleven_turbo_v2"),
                        "voice_settings": {
                            "stability": float(node_config.get("narrationStability") or node_config.get("narration_stability") or 0.5),
                            "similarity_boost": float(node_config.get("narrationSimilarity") or node_config.get("narration_similarity") or 0.75),
                        },
                    },
                    tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
                )
                tts_job = tts_result.get("job") or {}
                if clean_text(tts_job.get("status")) == "complete":
                    narration_asset_id = tts_job.get("id") or tts_job.get("asset_id")
                    narration_status = "success"
                else:
                    narration_status = "failed"
            except Exception:
                narration_status = "failed"
        elif generate_audio:
            narration_status = "skipped"

        # Lane 2: Shorts Generation (structured output only)
        if generate_shorts:
            source_text = youtube_content or article_summary
            if source_text:
                # Split into hook-driven short-form blocks
                paragraphs = [p.strip() for p in source_text.split("\n\n") if p.strip()]
                if not paragraphs:
                    paragraphs = [source_text]

                for idx, para in enumerate(paragraphs[:4]):
                    hook = para[:100] + "..." if len(para) > 100 else para
                    shorts_assets.append({
                        "title": f"Short {idx + 1}: {hook[:50]}",
                        "script": para,
                        "durationEstimate": f"{max(15, min(60, len(para.split()) * 0.5)):.0f}s",
                    })
                shorts_status = "success" if shorts_assets else "empty"
            else:
                shorts_status = "skipped"

        # Lane 3: YouTube Handoff Payload
        if publish_to_youtube:
            youtube_payload = {
                "title": youtube_title,
                "description": f"Generated by AIO PostBot™\n\n{article_summary[:500] if article_summary else ''}\n\nSource: {article_url}",
                "tags": ["AIO", "PostBot", "AI", "Tech"] + [p.replace(" ", "") for p in target_platforms[:3]],
                "script": youtube_content,
                "audioAssetId": narration_asset_id,
                "privacy": "private",
            }
            youtube_status = "ready"

        artifact = {
            "contentPack": {
                "platforms": platform_outputs,
                "articleUrl": article_url,
                "articleSummary": article_summary,
                "imageStyle": image_style,
            },
            "narration": {
                "enabled": generate_audio,
                "assetId": narration_asset_id,
                "status": narration_status,
            },
            "shorts": {
                "enabled": generate_shorts,
                "assets": shorts_assets,
                "status": shorts_status,
            },
            "youtubeHandoff": {
                "enabled": publish_to_youtube,
                "status": youtube_status,
                "payload": youtube_payload,
            },
            "generationMeta": {
                "platforms": target_platforms,
                "timestamp": datetime_now(),
                "formSubmissionId": canonical["sourceFormId"],
                "feedId": canonical["sourceFeedId"],
                "triggerType": canonical["triggerType"],
            },
            "youtubePublishResult": self._try_publish_to_youtube(
                youtube_payload, narration_asset_id, node_config, context
            ) if publish_to_youtube else {
                "attempted": False,
                "status": "skipped",
                "videoId": None,
                "error": None,
            },
        }

        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {"artifact": artifact},
            "error": None,
        }

    def _try_publish_to_youtube(self, payload: dict[str, Any], audio_asset_id: str | None, node_config: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        """
        Non-blocking YouTube publish attempt.
        Must never throw, never block, never fail the run.
        """
        try:
            import os
            import json
            import urllib.request
            import urllib.error

            tenant_id = clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None
            yt_block = self._check_provider_connected(tenant_id, "youtube")
            if yt_block:
                return {"attempted": False, "status": "blocked", "videoId": None, "error": yt_block.get("message", "YouTube provider not connected")}

            api_key = clean_text(os.environ.get("YOUTUBE_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
            if not api_key:
                return {"attempted": False, "status": "skipped", "videoId": None, "error": "YouTube API key not configured"}

            title = clean_text(payload.get("title") or "AIO PostBot Video")
            description = clean_text(payload.get("description") or "")
            tags = payload.get("tags") or []
            if not isinstance(tags, list):
                tags = []
            privacy = clean_text(payload.get("privacy") or "private")

            # Build upload metadata
            upload_meta = {
                "snippet": {
                    "title": title,
                    "description": description,
                    "tags": tags[:30],  # YouTube limit
                    "categoryId": "28",  # Science & Technology
                },
                "status": {
                    "privacyStatus": privacy,
                },
            }

            # If we have narration audio, upload as audio-only video
            if audio_asset_id:
                # Audio upload requires multipart form — use simple placeholder for now
                # Full audio+video upload needs google-auth-library (not yet in deps)
                return {
                    "attempted": True,
                    "status": "skipped",
                    "videoId": None,
                    "error": "Audio-only upload requires google-auth-library. Narration asset queued.",
                }

            # Fallback: create a minimal text-based video via YouTube Data API
            # This requires OAuth for uploads — API key only works for read operations
            # So we skip actual upload and return ready state
            return {
                "attempted": True,
                "status": "skipped",
                "videoId": None,
                "error": "YouTube upload requires OAuth credentials. Handoff payload ready for manual publish.",
            }

        except Exception as e:
            return {
                "attempted": True,
                "status": "failed",
                "videoId": None,
                "error": str(e)[:500],
            }

    def _postbot_image_prompt(self, platform: str, content: str, style: str) -> str:
        """Generate a platform-appropriate DALL-E image prompt. Normalized from n8n workflow prompts."""
        if platform == "facebook":
            return (
                f"Create a visually appealing, engaging image relevant to this content: {content[:500]}\n"
                f"The image should be 1200x630 pixels, suitable for Facebook. "
                f"Use bright colors, clear focal points, and element overlays to capture attention in the news feed. "
                f"Negative prompt: No text in image."
            )
        elif platform == "instagram":
            return (
                f"Generate a square image (1080x1080 pixels) in the style of {style} "
                f"that is highly visual and aesthetically pleasing for Instagram. "
                f"The image should be directly relevant to this content: {content[:500]}. "
                f"Focus on strong visuals. Negative prompt: No text in image."
            )
        elif platform == "linkedin":
            return (
                f"Create a professional and polished image in the style of {style} "
                f"with dimensions of 800x600 pixels, suitable for LinkedIn. "
                f"The image should relate to this content: {content[:500]}, "
                f"using a clean and modern design with muted colors for a professional image. "
                f"Negative prompt: No text in image."
            )
        return ""

    def _merge_transcript_metadata(self, metadata: dict[str, Any] | None, asset: dict[str, Any] | None) -> dict[str, Any]:
        merged = safe_clone(metadata) if isinstance(metadata, dict) else {}
        asset_metadata = safe_clone(asset.get("metadata")) if isinstance(asset, dict) and isinstance(asset.get("metadata"), dict) else {}
        if not asset_metadata:
            return merged
        if not merged:
            return asset_metadata
        meeting = merged.get("meeting") if isinstance(merged.get("meeting"), dict) else {}
        asset_meeting = asset_metadata.get("meeting") if isinstance(asset_metadata.get("meeting"), dict) else {}
        return {
            **asset_metadata,
            **merged,
            "meeting": {
                **asset_meeting,
                **meeting,
            },
        }

    def _meeting_title_from_metadata(self, metadata: dict[str, Any]) -> str:
        meeting = metadata.get("meeting") if isinstance(metadata.get("meeting"), dict) else {}
        return clean_text(metadata.get("meetingTitle") or metadata.get("title") or meeting.get("title"))

    def _meeting_id_from_metadata(self, metadata: dict[str, Any]) -> str:
        meeting = metadata.get("meeting") if isinstance(metadata.get("meeting"), dict) else {}
        return clean_text(metadata.get("meetingId") or metadata.get("meeting_id") or meeting.get("meetingId") or meeting.get("meeting_id"))

    def _truncate_transcript_value(self, value: str, limit: int) -> str:
        normalized = clean_text(value)
        if len(normalized) <= limit:
            return normalized
        return normalized[: max(limit - 3, 0)].rstrip() + "..."

    def _transcript_sentences(self, transcript_text: str, limit: int = 80) -> list[str]:
        normalized = clean_text(transcript_text)
        if not normalized:
            return []
        raw_parts = re.split(r"(?<=[.!?])\s+|\n+", normalized)
        sentences: list[str] = []
        seen: set[str] = set()
        for part in raw_parts:
            sentence = re.sub(r"\s+", " ", clean_text(part))
            if len(sentence) < 12:
                continue
            key = sentence.lower()
            if key in seen:
                continue
            seen.add(key)
            sentences.append(sentence)
            if len(sentences) >= limit:
                break
        return sentences

    def _infer_action_owner(self, sentence: str) -> str | None:
        owner_match = re.search(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:will|should|needs to|owns|to)\b", sentence)
        if owner_match:
            return clean_text(owner_match.group(1)) or None
        tagged_match = re.search(r"@([A-Za-z][A-Za-z0-9_-]+)", sentence)
        if tagged_match:
            return clean_text(tagged_match.group(1)) or None
        return None

    def _action_confidence(self, sentence: str) -> str:
        lower = sentence.lower()
        if any(token in lower for token in ("action item", "todo", "we will", "must", "owner", "next step")):
            return "high"
        if any(token in lower for token in ("should", "need to", "follow up", "please")):
            return "medium"
        return "low"

    def _extract_action_items(self, sentences: list[str]) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for sentence in sentences:
            lower = sentence.lower()
            starts_with_verb = any(lower.startswith(f"{verb} ") for verb in TRANSCRIPT_ACTION_VERBS)
            contains_action_signal = any(token in lower for token in ("action item", "todo", "follow up", "next step", "needs to", "need to", "should", "must", "we will"))
            if not starts_with_verb and not contains_action_signal:
                continue
            text = self._truncate_transcript_value(sentence, 180)
            key = text.lower()
            if key in seen:
                continue
            seen.add(key)
            items.append(
                {
                    "text": text,
                    "owner": self._infer_action_owner(sentence),
                    "confidence": self._action_confidence(sentence),
                }
            )
            if len(items) >= 8:
                break
        return items

    def _extract_topics(self, transcript_text: str, metadata: dict[str, Any]) -> list[str]:
        counts: dict[str, int] = {}
        words = re.findall(r"\b[a-zA-Z][a-zA-Z0-9-]{3,}\b", transcript_text.lower())
        for word in words:
            if word in TRANSCRIPT_STOPWORDS:
                continue
            counts[word] = counts.get(word, 0) + 1
        ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        topics: list[str] = []
        meeting_title = self._meeting_title_from_metadata(metadata)
        if meeting_title:
            topics.append(self._truncate_transcript_value(meeting_title, 80))
        for word, _count in ranked:
            label = word.replace("-", " ").title()
            if label.lower() in {item.lower() for item in topics}:
                continue
            topics.append(label)
            if len(topics) >= 5:
                break
        return topics[:5]

    def _highlight_label(self, text: str) -> str:
        lower = text.lower()
        if any(token in lower for token in ("decided", "decision", "approved", "agreed", "we will")):
            return "decision"
        if any(token in lower for token in ("important", "critical", "must", "need to", "priority")):
            return "important"
        if len(text) <= 140:
            return "quote"
        return "insight"

    def _extract_highlights(self, sentences: list[str], speaker_segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
        highlights: list[dict[str, Any]] = []
        if isinstance(speaker_segments, list):
            for segment in speaker_segments:
                if not isinstance(segment, dict):
                    continue
                text = self._truncate_transcript_value(clean_text(segment.get("text")), 220)
                if not text:
                    continue
                lower = text.lower()
                if not any(token in lower for token in ("decision", "decided", "agreed", "important", "must", "need", "quote", "key", "insight")) and len(highlights) >= 2:
                    continue
                highlights.append(
                    {
                        "start": segment.get("start"),
                        "end": segment.get("end"),
                        "text": text,
                        "label": self._highlight_label(text),
                    }
                )
                if len(highlights) >= 5:
                    break
        if highlights:
            return highlights
        for sentence in sentences[:4]:
            highlights.append(
                {
                    "start": None,
                    "end": None,
                    "text": self._truncate_transcript_value(sentence, 220),
                    "label": self._highlight_label(sentence),
                }
            )
        return highlights

    def _extract_summary(self, sentences: list[str], topics: list[str], action_items: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
        meeting_title = self._meeting_title_from_metadata(metadata)
        lead_sentences = sentences[:2]
        text = " ".join(lead_sentences)
        if meeting_title and text and meeting_title.lower() not in text.lower():
            text = f"{meeting_title}: {text}"
        text = self._truncate_transcript_value(text or "Transcript processed successfully.", 360)
        bullets: list[str] = []
        for sentence in sentences[:4]:
            bullets.append(self._truncate_transcript_value(sentence, 140))
            if len(bullets) >= 4:
                break
        if action_items and len(bullets) < 6:
            bullets.append(f"Next action: {self._truncate_transcript_value(action_items[0].get('text') or '', 110)}")
        if topics and len(bullets) < 6:
            bullets.append(f"Primary topics: {', '.join(topics[:3])}")
        deduped: list[str] = []
        seen: set[str] = set()
        for bullet in bullets:
            normalized = clean_text(bullet)
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            deduped.append(normalized)
        while len(deduped) < 3 and topics:
            next_topic = topics[len(deduped) - 1] if len(topics) >= len(deduped) else topics[-1]
            candidate = f"Discussion theme: {next_topic}"
            if candidate.lower() not in seen:
                seen.add(candidate.lower())
                deduped.append(candidate)
        return {
            "text": text,
            "bullets": deduped[:6],
        }

    def _extract_content_ideas(self, topics: list[str], metadata: dict[str, Any], summary_text: str) -> list[dict[str, Any]]:
        meeting_title = self._meeting_title_from_metadata(metadata) or "Transcript"
        seeds = topics[:3] or [meeting_title]
        content_types = ["short", "post", "clip"]
        ideas: list[dict[str, Any]] = []
        for index, seed in enumerate(seeds):
            normalized_seed = clean_text(seed) or meeting_title
            if index == 0:
                title = f"{normalized_seed}: Fast Take"
                hook = f"Turn the strongest takeaway from {meeting_title} into a fast, clear recap."
            elif index == 1:
                title = f"What {normalized_seed} Means Next"
                hook = f"Use the transcript to explain why {normalized_seed.lower()} matters and what changes next."
            else:
                title = f"{normalized_seed} Clip Idea"
                hook = f"Cut a tight moment around {normalized_seed.lower()} and pair it with the clearest quote."
            ideas.append(
                {
                    "title": self._truncate_transcript_value(title, 90),
                    "hook": self._truncate_transcript_value(hook or summary_text, 160),
                    "type": content_types[index % len(content_types)],
                }
            )
        return ideas

    def _generate_transcript_intelligence(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            transcript_missing = [entry for entry in missing if entry == "transcriptText" or entry.startswith("transcriptText:")]
            other_missing = [entry for entry in missing if entry not in transcript_missing]
            if other_missing:
                return self._service_error(step, "; ".join(missing), data={"status": "failed", "reason": "invalid_input"})
            payload["transcript_text"] = None
        transcript_raw = payload.get("transcript_text")
        if transcript_raw is not None and not isinstance(transcript_raw, str):
            data = {
                "status": "failed",
                "reason": "invalid_input",
                "assetId": clean_text(payload.get("asset_id") or payload.get("assetId")) or None,
                "sourceUrl": clean_text(payload.get("source_url") or payload.get("sourceUrl")) or None,
                "summary": {"text": "", "bullets": []},
                "actionItems": [],
                "topics": [],
                "highlights": [],
                "contentIdeas": [],
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": "Transcript text must be a string."}

        transcript_text = clean_text(transcript_raw)
        asset_id = clean_text(payload.get("asset_id") or payload.get("assetId")) or None
        source_url = clean_text(payload.get("source_url") or payload.get("sourceUrl")) or None
        speaker_segments = payload.get("speaker_segments") if isinstance(payload.get("speaker_segments"), list) else []
        asset = get_media_engine().get_asset(asset_id) if asset_id else None
        metadata = self._merge_transcript_metadata(payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}, asset)
        if asset and not source_url:
            source_url = clean_text(asset.get("source_url")) or None
        if not transcript_text:
            data = {
                "status": "failed",
                "reason": "missing_transcript",
                "assetId": asset_id,
                "sourceUrl": source_url,
                "summary": {"text": "", "bullets": []},
                "actionItems": [],
                "topics": [],
                "highlights": [],
                "contentIdeas": [],
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": "Transcript text is required."}

        working_text = transcript_text[:120000]
        sentences = self._transcript_sentences(working_text)
        action_items = self._extract_action_items(sentences)
        topics = self._extract_topics(working_text, metadata)
        summary = self._extract_summary(sentences, topics, action_items, metadata)
        highlights = self._extract_highlights(sentences, speaker_segments)
        content_ideas = self._extract_content_ideas(topics, metadata, summary.get("text") or "")
        data = {
            "status": "success",
            "assetId": asset_id,
            "sourceUrl": source_url,
            "summary": summary,
            "actionItems": action_items,
            "topics": topics,
            "highlights": highlights,
            "contentIdeas": content_ideas,
        }
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data, "error": None}

    def _generate_voice(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "assets": []})
        text_input = clean_text(payload.get("text") or payload.get("script") or payload.get("transcript_text"))
        if not text_input:
            return self._service_error(step, "Generate Voice requires text or script input.", data={"job": None, "assets": []})
        result = get_media_engine().render_audio(
            {
                **payload,
                "provider": clean_text(payload.get("provider")) or "elevenlabs",
                "title": clean_text(payload.get("title")) or "Voice Render",
                "text": text_input,
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": status, "data": result, "error": job.get("last_error")}

    def _generate_thumbnail(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "assets": []})
        if not clean_text(payload.get("title")):
            return self._service_error(step, "Generate Thumbnail requires a title.", data={"job": None, "assets": []})
        prompt = clean_text(payload.get("prompt")) or clean_text(payload.get("image")) or clean_text(payload.get("subtitle")) or f"Thumbnail for {clean_text(payload.get('title'))}"
        result = get_media_engine().render_media(
            {
                **payload,
                "provider": clean_text(payload.get("provider")) or "stub-render",
                "title": clean_text(payload.get("title")) or "Thumbnail",
                "asset_type": "thumbnail",
                "media_type": "image",
                "script": prompt,
                "metadata": {
                    **(payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}),
                    "thumbnail_title": clean_text(payload.get("title")),
                    "thumbnail_subtitle": clean_text(payload.get("subtitle")),
                    "thumbnail_background": clean_text(payload.get("image")),
                },
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": status, "data": result, "error": job.get("last_error")}

    def _generate_video(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "assets": []})
        if not clean_text(payload.get("templateId") or payload.get("template_id") or (self._normalized_service_config(step).get("templateId"))):
            return self._service_error(step, "Generate Video requires a templateId.", data={"job": None, "assets": []})
        if not clean_text(self._normalized_service_config(step).get("outputTarget") or self._normalized_service_config(step).get("output_target")):
            return self._service_error(step, "Generate Video requires an outputTarget.", data={"job": None, "assets": []})
        if not clean_text(payload.get("script")):
            return self._service_error(step, "Generate Video requires a script or prompt.", data={"job": None, "assets": []})
        result = get_media_engine().render_media(
            {
                **payload,
                "provider": clean_text(payload.get("provider")) or "stub-render",
                "title": clean_text(payload.get("title")) or "Generated Video",
                "media_type": "video",
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": status, "data": result, "error": job.get("last_error")}

    def _transcribe_media(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "artifact": None})
        config = self._normalized_service_config(step)
        provider_lock = get_transcription_provider_lock(runtime_tenant_settings(context))
        provider_id = resolve_transcription_provider_id_from_lock(provider_lock)
        if not provider_id:
            data = {
                "status": "transcription_disabled",
                "assetId": clean_text(payload.get("asset_id") or payload.get("assetId")) or None,
                "artifactId": None,
                "providerUsed": "disabled",
                "sourceUrl": clean_text(payload.get("source_url") or payload.get("sourceUrl")) or None,
                "transcriptText": None,
                "transcriptExcerpt": None,
                "reason": "transcription_disabled",
                "job": None,
                "artifact": None,
                "error": "Transcription is disabled in workspace settings.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        source_type = clean_text(config.get("sourceType") or config.get("source_type")).lower()
        asset_id = clean_text(payload.get("asset_id") or payload.get("assetId"))
        if not source_type and not asset_id:
            return self._service_error(step, "Transcribe Media requires a sourceType.", data={"job": None, "artifact": None})
        asset = None
        if source_type in {"asset", "asset_id"} or asset_id:
            if not asset_id:
                return self._service_error(step, "Transcribe Media requires an assetId when sourceType is asset.", data={"job": None, "artifact": None})
            asset = get_media_engine().get_asset(asset_id)
            if not asset:
                data = {
                    "status": "asset_not_found",
                    "assetId": asset_id,
                    "artifactId": None,
                    "providerUsed": provider_lock,
                    "sourceUrl": None,
                    "transcriptText": None,
                    "transcriptExcerpt": None,
                    "reason": "asset_not_found",
                    "job": None,
                    "artifact": None,
                    "error": f"Media asset '{asset_id}' was not found.",
                }
                return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
            if not clean_text(payload.get("source_url")):
                payload["source_url"] = clean_text(asset.get("source_url")) or None
            if not clean_text(payload.get("title")):
                payload["title"] = clean_text(asset.get("title")) or "Transcript Job"
            payload["source_asset_ids"] = [asset_id]
        if not clean_text(payload.get("source_url")) and not clean_text(payload.get("transcript_text")) and not payload.get("speaker_segments"):
            data = {
                "status": "missing_source",
                "assetId": asset_id or None,
                "artifactId": None,
                "providerUsed": provider_lock,
                "sourceUrl": clean_text(payload.get("source_url")) or None,
                "transcriptText": None,
                "transcriptExcerpt": None,
                "reason": "missing_source",
                "job": None,
                "artifact": None,
                "error": "Transcribe Media requires source_url, transcript_text, or speaker_segments.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "failed", "data": data, "error": data["error"]}
        result = get_media_engine().transcribe_media(
            {
                **payload,
                "provider": provider_id,
                "title": clean_text(payload.get("title")) or "Transcript Job",
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        artifact = result.get("artifact")
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        error_message = clean_text(job.get("last_error"))
        failure_reason = None
        lowered_error = error_message.lower()
        if status != "success":
            if "ffmpeg_not_available" in lowered_error:
                failure_reason = "ffmpeg_not_available"
            elif "ffmpeg_failed" in lowered_error:
                failure_reason = "ffmpeg_failed"
            elif "not configured" in lowered_error or "credentials are missing" in lowered_error:
                failure_reason = "provider_not_configured"
            elif "asset" in lowered_error and "not found" in lowered_error:
                failure_reason = "asset_not_found"
            elif "source_url" in lowered_error or "usable source" in lowered_error:
                failure_reason = "missing_source"
            else:
                failure_reason = "transcription_failed"
        transcript_text = clean_text((artifact or {}).get("transcript_text"))
        node_data = {
            "status": "complete" if status == "success" else failure_reason or (clean_text(job.get("status")) or "failed"),
            "assetId": asset_id or None,
            "artifactId": clean_text((artifact or {}).get("id")) or None,
            "providerUsed": provider_lock,
            "sourceUrl": clean_text(payload.get("source_url")) or None,
            "transcriptText": transcript_text or None,
            "transcriptExcerpt": transcript_text[:280] if transcript_text else None,
            "reason": failure_reason,
            "job": job,
            "artifact": artifact,
            "error": error_message or None,
        }
        
        brain_item_id = None
        if status == "success" and artifact:
            try:
                tenant_id = clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None
                transcript_text = artifact.get("transcript_text", "")
                if transcript_text and tenant_id:
                    brain_item_payload = {
                        "title": artifact.get("title") or "Meeting Transcript",
                        "category": "transcript",
                        "content": transcript_text,
                        "source_id": artifact.get("id"),
                        "status": "published",
                        "tags": ["MTG:TRANSCRIPT"],
                    }
                    if hasattr(self.provider, "create_brain_item"):
                        brain_item = self.provider.create_brain_item(brain_item_payload)
                        brain_item_id = brain_item.get("id")
            except Exception:
                pass
        
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": status,
            "data": node_data,
            "error": job.get("last_error"),
            "brainItemId": brain_item_id,
            "tags": ["MTG:TRANSCRIPT"] if brain_item_id else [],
        }

    def _ingest_meeting_artifacts(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(
                step,
                "; ".join(missing),
                data={"provider": None, "assets": [], "transcript_job": None, "transcript_artifact": None},
            )
        provider_id = clean_text(payload.get("provider")) or clean_text(self._trigger_payload(context).get("provider")) or "zoom"
        if not provider_id:
            return self._service_error(
                step,
                "Ingest Meeting requires a meetingProvider.",
                data={"provider": None, "assets": [], "transcript_job": None, "transcript_artifact": None},
            )
        if not clean_text(payload.get("meeting_id")):
            return self._service_error(
                step,
                "Ingest Meeting requires a meetingRef.",
                data={"provider": provider_id, "assets": [], "transcript_job": None, "transcript_artifact": None},
            )
        if not payload.get("recording_files") and not payload.get("drive_files") and not clean_text(payload.get("transcript_text")):
            return self._service_error(
                step,
                "Ingest Meeting requires recording_files, drive_files, or transcript_text.",
                data={"provider": provider_id, "assets": [], "transcript_job": None, "transcript_artifact": None},
            )
        result = get_media_engine().ingest_meeting_artifacts(
            {
                **payload,
                "provider": provider_id,
                "title": clean_text(payload.get("meeting_title")) or clean_text(payload.get("title")) or "Meeting Ingestion",
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        transcript_job = result.get("transcript_job") or {}
        transcript_artifact = result.get("transcript_artifact")
        failed = transcript_job and clean_text(transcript_job.get("status")) == "failed"
        
        brain_item_id = None
        if not failed and transcript_artifact:
            try:
                tenant_id = clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None
                transcript_text = transcript_artifact.get("transcript_text", "")
                if transcript_text and tenant_id:
                    brain_item_payload = {
                        "title": transcript_artifact.get("title") or "Meeting Transcript",
                        "category": "transcript",
                        "content": transcript_text,
                        "source_id": transcript_artifact.get("id"),
                        "status": "published",
                        "tags": ["MTG:TRANSCRIPT"],
                    }
                    if hasattr(self.provider, "create_brain_item"):
                        brain_item = self.provider.create_brain_item(brain_item_payload)
                        brain_item_id = brain_item.get("id")
            except Exception:
                pass
        
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "failed" if failed else "success",
            "data": result,
            "error": transcript_job.get("last_error") if failed else None,
            "brainItemId": brain_item_id,
            "tags": ["MTG:TRANSCRIPT"] if brain_item_id else [],
        }

    def _publish_asset(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        payload, missing = self._resolved_media_payload(step, context, runtime)
        if missing:
            return self._service_error(step, "; ".join(missing), data={"job": None, "artifact": None})
        previous_data = runtime.get("previous") if isinstance(runtime.get("previous"), dict) else {}
        configured_asset_ref = clean_text(payload.get("assetRef") or payload.get("asset_ref"))
        configured_artifact_ref = clean_text(payload.get("artifactRef") or payload.get("artifact_ref"))
        asset_ids = [configured_asset_ref] if configured_asset_ref else []
        artifact_ids = [configured_artifact_ref] if configured_artifact_ref else []
        if not asset_ids:
            asset_ids = [clean_text(item.get("id")) for item in (previous_data.get("assets") or []) if isinstance(item, dict) and clean_text(item.get("id"))]
        if not artifact_ids:
            previous_artifact = previous_data.get("artifact") if isinstance(previous_data.get("artifact"), dict) else {}
            previous_transcript_artifact = previous_data.get("transcript_artifact") if isinstance(previous_data.get("transcript_artifact"), dict) else {}
            artifact_ids = [item for item in [clean_text(previous_artifact.get("id")), clean_text(previous_transcript_artifact.get("id"))] if item]
        publish_target = clean_text(payload.get("publishTarget") or payload.get("publish_target") or payload.get("attachTarget") or payload.get("outputTarget"))
        if not publish_target:
            return self._service_error(step, "Publish Asset requires a publishTarget.", data={"job": None, "artifact": None})
        tenant_id = clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None
        target_block = self._check_provider_connected(tenant_id, publish_target)
        if target_block:
            return {
                "stepId": step.get("id"),
                "intent": step.get("intent"),
                "status": "blocked",
                "data": None,
                "error": target_block.get("message"),
                "providerKey": target_block.get("providerKey"),
                "providerStatus": target_block.get("providerStatus"),
                "reason": target_block.get("reason"),
            }
        if not asset_ids and not artifact_ids:
            return self._service_error(step, "Publish Asset requires an upstream asset or artifact.", data={"job": None, "artifact": None})
        result = get_media_engine().publish_asset(
            {
                **payload,
                "title": clean_text(payload.get("title")) or "Publish Asset",
                "publish_target": publish_target,
                "asset_ids": asset_ids,
                "artifact_ids": artifact_ids,
            },
            tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None,
            context={
                "run_id": runtime.get("runId"),
                "flow_name": context.get("flow_name"),
                "thread_id": context.get("thread_id") or self._trigger_payload(context).get("thread_id"),
                "contact_id": context.get("contact_id") or self._trigger_payload(context).get("contact_id"),
            },
        )
        job = result.get("job") or {}
        status = "success" if clean_text(job.get("status")) == "complete" else "failed"
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": status, "data": result, "error": job.get("last_error")}

    def _rss_ingest(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        """Fetch items from an RSS feed and return structured data."""
        try:
            import xml.etree.ElementTree as ET
            import urllib.request
            import urllib.parse
        except ImportError:
            return self._service_error(step, "XML parsing unavailable.", data={"items": [], "feed_title": None, "feed_url": None, "item_count": 0})

        node_config = step.get("config") or {}
        feed_url = clean_text(node_config.get("feedUrl") or node_config.get("feed_url") or node_config.get("url"))
        if not feed_url:
            return self._service_error(step, "RSS Feed URL is required.", data={"items": [], "feed_title": None, "feed_url": None, "item_count": 0})
        if not feed_url.startswith(("http://", "https://")):
            return self._service_error(step, f"Invalid RSS URL: {feed_url}", data={"items": [], "feed_title": None, "feed_url": None, "item_count": 0})

        item_limit = max(1, min(50, safe_int(node_config.get("itemLimit") or node_config.get("item_limit") or node_config.get("limit"), 10)))

        try:
            req = urllib.request.Request(feed_url, headers={"User-Agent": "AIO-CRM-Flow/1.0"})
            with urllib.request.urlopen(req, timeout=30) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except Exception as e:
            return self._service_error(step, f"Failed to fetch RSS feed: {e}", data={"items": [], "feed_title": None, "feed_url": feed_url, "item_count": 0})

        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            return self._service_error(step, f"Malformed RSS XML: {e}", data={"items": [], "feed_title": None, "feed_url": feed_url, "item_count": 0})

        items = []
        feed_title = None
        ns = {"atom": "http://www.w3.org/2005/Atom"}

        # RSS 2.0
        channel = root.find("channel")
        if channel is not None:
            feed_title_el = channel.find("title")
            feed_title = feed_title_el.text if feed_title_el is not None else None
            for item_el in channel.findall("item")[:item_limit]:
                title_el = item_el.find("title")
                link_el = item_el.find("link")
                desc_el = item_el.find("description")
                pub_el = item_el.find("pubDate")
                items.append({
                    "title": title_el.text if title_el is not None else "",
                    "link": link_el.text if link_el is not None else "",
                    "publishedAt": pub_el.text if pub_el is not None else "",
                    "summary": (desc_el.text or "")[:500] if desc_el is not None else "",
                    "feedUrl": feed_url,
                })
        # Atom
        else:
            feed_title_el = root.find("atom:feed/atom:title", ns) or root.find("{http://www.w3.org/2005/Atom}feed/title") or root.find("title")
            feed_title = feed_title_el.text if feed_title_el is not None else None
            entry_tag = "{http://www.w3.org/2005/Atom}entry"
            for entry_el in root.findall(entry_tag)[:item_limit]:
                title_el = entry_el.find("{http://www.w3.org/2005/Atom}title")
                link_el = entry_el.find("{http://www.w3.org/2005/Atom}link")
                summary_el = entry_el.find("{http://www.w3.org/2005/Atom}summary")
                pub_el = entry_el.find("{http://www.w3.org/2005/Atom}published") or entry_el.find("{http://www.w3.org/2005/Atom}updated")
                link_href = link_el.get("href", "") if link_el is not None else ""
                items.append({
                    "title": title_el.text if title_el is not None else "",
                    "link": link_href,
                    "publishedAt": pub_el.text if pub_el is not None else "",
                    "summary": (summary_el.text or "")[:500] if summary_el is not None else "",
                    "feedUrl": feed_url,
                })

        if not items:
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": {"items": [], "feed_title": feed_title, "feed_url": feed_url, "item_count": 0, "message": "Feed returned no items"}, "error": None}

        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": {"items": items, "feed_title": feed_title, "feed_url": feed_url, "item_count": len(items)}, "error": None}

    def _generate_image(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        """Generate an image from a text prompt via the media engine."""
        node_config = step.get("config") or {}
        prompt = clean_text(node_config.get("prompt") or node_config.get("text") or node_config.get("content"))
        if not prompt:
            return self._service_error(step, "Prompt is required for image generation.", data={"image_url": None, "provider": None, "status": "not_configured"})

        style = clean_text(node_config.get("style") or node_config.get("variant") or "")
        size = clean_text(node_config.get("size") or "1024x1024")

        try:
            media_engine = get_media_engine()
            result = media_engine.render_media({
                "media_type": "image",
                "title": prompt[:80],
                "prompt": prompt,
                "style": style,
                "size": size,
            }, tenant_id=clean_text((context.get("tenant") or {}).get("id")) if isinstance(context.get("tenant"), dict) else None)
            job = result.get("job") or {}
            status = "success" if clean_text(job.get("status")) == "complete" else "running"
            artifact = result.get("artifact") or {}
            return {
                "stepId": step.get("id"),
                "intent": step.get("intent"),
                "status": status,
                "data": {
                    "image_url": artifact.get("url") or artifact.get("imageUrl") or job.get("result_url"),
                    "prompt": prompt,
                    "provider": job.get("provider") or "stub-render",
                    "job_id": job.get("id"),
                },
                "error": job.get("last_error"),
            }
        except Exception as e:
            return self._service_error(step, f"Image generation failed: {e}", data={"image_url": None, "provider": None, "status": "failed"})

    def _filter(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        condition = self._extract_if_then_condition(step)
        operator = clean_text(condition.get("operator")).lower()
        left_operand = condition.get("left")
        right_operand = condition.get("right")
        unary_operators = {"is_empty", "is_not_empty"}
        binary_operators = {
            "equals",
            "not_equals",
            "greater_than",
            "greater_than_or_equal",
            "less_than",
            "less_than_or_equal",
            "contains",
            "not_contains",
        }
        supported_operators = unary_operators | binary_operators
        empty_data = {"result": None, "selectedTargets": [], "operator": operator or None, "left": None, "right": None, "passed": None}
        if not operator:
            return self._service_error(step, "Filter is missing an operator.", data=empty_data)
        if operator not in supported_operators:
            return self._service_error(step, f"Unsupported filter operator '{operator}'.", data=empty_data)
        if left_operand is None:
            return self._service_error(step, "Filter is missing the left operand.", data=empty_data)
        if operator in binary_operators and right_operand is None:
            return self._service_error(step, "Filter is missing the right operand.", data=empty_data)
        syntax_errors = self._token_syntax_errors(left_operand, "filter left operand")
        if operator in binary_operators:
            syntax_errors.extend(self._token_syntax_errors(right_operand, "filter right operand"))
        if syntax_errors:
            return self._service_error(step, syntax_errors[0], data=empty_data)

        left_value, left_missing = self._resolve_value(left_operand, context, runtime)
        if left_missing:
            if operator in unary_operators:
                left_value = None
            else:
                return self._service_error(step, f"Filter left operand could not resolve: {', '.join(left_missing)}.", data=empty_data)
        right_value = None
        if operator in binary_operators:
            right_value, right_missing = self._resolve_value(right_operand, context, runtime)
            if right_missing:
                return self._service_error(
                    step,
                    f"Filter right operand could not resolve: {', '.join(right_missing)}.",
                    data={"result": None, "selectedTargets": [], "operator": operator, "left": safe_clone(left_value), "right": None, "passed": None},
                )
        result, evaluation_error = self._evaluate_if_then_condition(operator, left_value, right_value)
        if evaluation_error:
            return self._service_error(
                step,
                evaluation_error,
                data={"result": None, "selectedTargets": [], "operator": operator, "left": safe_clone(left_value), "right": safe_clone(right_value), "passed": None},
            )

        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_id = clean_text(params.get("node_id") or step.get("id"))
        outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
        branch_status = "true" if result else "false"
        matched_targets, default_targets = self._branch_edge_targets(outgoing_edges, branch_status)
        if result:
            if matched_targets:
                selected_targets = matched_targets
            elif len(default_targets) <= 1:
                selected_targets = default_targets
            else:
                return self._service_error(
                    step,
                    "Filter routing is ambiguous. Use one default edge or label explicit true/false edges.",
                    data={"result": bool(result), "selectedTargets": [], "operator": operator, "left": safe_clone(left_value), "right": safe_clone(right_value), "passed": True},
                )
        else:
            selected_targets = matched_targets
        if outgoing_edges:
            self._apply_branch_selection(runtime=runtime, node_id=node_id, outgoing_edges=outgoing_edges, selected_targets=selected_targets, branch_status=branch_status)
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {
                "result": bool(result),
                "passed": bool(result),
                "operator": operator,
                "left": safe_clone(left_value),
                "right": safe_clone(right_value),
                "selectedTargets": selected_targets,
            },
            "metadata": {
                "service": self.service_registry.get("filter"),
            },
        }

    def _switch(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        definition = self._extract_switch_definition(step)
        source_operand = definition.get("source")
        empty_data = {"switchValue": None, "selectedTargets": [], "matchedCase": None}
        if source_operand is None:
            return self._service_error(step, "Switch is missing a source value.", data=empty_data)
        syntax_errors = self._token_syntax_errors(source_operand, "switch source")
        if syntax_errors:
            return self._service_error(step, syntax_errors[0], data=empty_data)
        switch_value, missing = self._resolve_value(source_operand, context, runtime)
        if missing:
            return self._service_error(
                step,
                f"Switch source could not resolve: {', '.join(missing)}.",
                data=empty_data,
            )
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_id = clean_text(params.get("node_id") or step.get("id"))
        outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
        if not outgoing_edges:
            return self._service_error(
                step,
                "Switch requires labeled outgoing edges.",
                data={"switchValue": safe_clone(switch_value), "selectedTargets": [], "matchedCase": None},
            )
        selected_targets, matched_case, route_error = self._resolve_switch_targets(outgoing_edges, switch_value)
        if route_error:
            return self._service_error(
                step,
                route_error,
                data={"switchValue": safe_clone(switch_value), "selectedTargets": [], "matchedCase": matched_case},
            )
        self._apply_branch_selection(runtime=runtime, node_id=node_id, outgoing_edges=outgoing_edges, selected_targets=selected_targets, branch_status=matched_case or "matched")
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {
                "switchValue": safe_clone(switch_value),
                "matchedCase": matched_case,
                "selectedTargets": selected_targets,
            },
            "metadata": {
                "service": self.service_registry.get("switch"),
            },
        }

    def _if_then(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        condition = self._extract_if_then_condition(step)
        operator = clean_text(condition.get("operator")).lower()
        left_operand = condition.get("left")
        right_operand = condition.get("right")
        unary_operators = {"is_empty", "is_not_empty"}
        binary_operators = {
            "equals",
            "not_equals",
            "greater_than",
            "greater_than_or_equal",
            "less_than",
            "less_than_or_equal",
            "contains",
            "not_contains",
        }
        supported_operators = unary_operators | binary_operators
        empty_data = {"result": None, "selectedTargets": [], "operator": operator or None, "left": None, "right": None}
        if not operator:
            return self._service_error(step, "If/Then condition is missing an operator.", data=empty_data)
        if operator not in supported_operators:
            return self._service_error(step, f"Unsupported if-then operator '{operator}'.", data=empty_data)
        if left_operand is None:
            return self._service_error(step, "If/Then condition is missing the left operand.", data=empty_data)
        if operator in binary_operators and right_operand is None:
            return self._service_error(step, "If/Then condition is missing the right operand.", data=empty_data)
        syntax_errors = self._token_syntax_errors(left_operand, "if-then left operand")
        if operator in binary_operators:
            syntax_errors.extend(self._token_syntax_errors(right_operand, "if-then right operand"))
        if syntax_errors:
            return self._service_error(step, syntax_errors[0], data=empty_data)

        left_value, left_missing = self._resolve_value(left_operand, context, runtime)
        if left_missing:
            if operator in unary_operators:
                left_value = None
            else:
                return self._service_error(
                    step,
                    f"If/Then left operand could not resolve: {', '.join(left_missing)}.",
                    data=empty_data,
                )
        right_value = None
        if operator in binary_operators:
            right_value, right_missing = self._resolve_value(right_operand, context, runtime)
            if right_missing:
                return self._service_error(
                    step,
                    f"If/Then right operand could not resolve: {', '.join(right_missing)}.",
                    data={"result": None, "selectedTargets": [], "operator": operator, "left": safe_clone(left_value), "right": None},
                )

        result, evaluation_error = self._evaluate_if_then_condition(operator, left_value, right_value)
        if evaluation_error:
            return self._service_error(
                step,
                evaluation_error,
                data={
                    "result": None,
                    "selectedTargets": [],
                    "operator": operator,
                    "left": safe_clone(left_value),
                    "right": safe_clone(right_value),
                },
            )

        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_id = clean_text(params.get("node_id") or step.get("id"))
        outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
        branch_status = "true" if result else "false"
        matched_targets, default_targets = self._branch_edge_targets(outgoing_edges, branch_status)
        if matched_targets:
            selected_targets = matched_targets
        elif len(default_targets) <= 1:
            selected_targets = default_targets
        else:
            return self._service_error(
                step,
                "If/Then branch routing is ambiguous. Label outgoing edges for true/false routing.",
                data={
                    "result": bool(result),
                    "operator": operator,
                    "left": safe_clone(left_value),
                    "right": safe_clone(right_value),
                    "selectedTargets": [],
                },
            )
        if outgoing_edges:
            selected_descendants = self._graph_descendants(runtime, selected_targets)
            alternate_targets = [
                clean_text(edge.get("target"))
                for edge in outgoing_edges
                if clean_text(edge.get("target")) and clean_text(edge.get("target")) not in selected_targets
            ]
            suppressed_nodes = self._graph_descendants(runtime, alternate_targets) - selected_descendants
            runtime.setdefault("suppressed_nodes", set()).update(suppressed_nodes)
            runtime.setdefault("branch_decisions", {})[node_id] = {
                "status": branch_status,
                "selected_targets": selected_targets,
            }
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "success",
            "data": {
                "result": bool(result),
                "operator": operator,
                "left": safe_clone(left_value),
                "right": safe_clone(right_value),
                "selectedTargets": selected_targets,
            },
            "metadata": {
                "service": self.service_registry.get("if_then"),
            },
        }

    def _time_delay(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        resolved_delay, delay_error = self._resolve_delay_config(step, context, runtime)
        if delay_error:
            return self._service_error(
                step,
                delay_error,
                data={"pauseReason": None, "resumeAt": None, "duration": None, "unit": None, "nextNodeId": None},
            )
        next_node_id, route_error = self._resolve_single_downstream_target(step)
        if route_error:
            return self._service_error(
                step,
                route_error,
                data={
                    "pauseReason": None,
                    "resumeAt": None,
                    "duration": resolved_delay["duration"],
                    "unit": resolved_delay["unit"],
                    "nextNodeId": None,
                },
            )
        delta = {
            "minutes": timedelta(minutes=resolved_delay["duration"]),
            "hours": timedelta(hours=resolved_delay["duration"]),
            "days": timedelta(days=resolved_delay["duration"]),
        }[resolved_delay["unit"]]
        resume_at = (datetime.now(UTC) + delta).isoformat()
        runtime["pause_state"] = {
            "pause_reason": "delay",
            "resume_at": resume_at,
            "next_node_id": next_node_id,
            "current_node_id": clean_text((step.get("parameters") or {}).get("node_id") or step.get("id")),
            "last_error": None,
        }
        return {
            "stepId": step.get("id"),
            "intent": step.get("intent"),
            "status": "paused",
            "message": "Execution paused until resume time.",
            "error": None,
            "data": {
                "pauseReason": "delay",
                "resumeAt": resume_at,
                "duration": resolved_delay["duration"],
                "unit": resolved_delay["unit"],
                "nextNodeId": next_node_id,
            },
            "metadata": {
                "service": self.service_registry.get("time_delay"),
            },
        }

    def _verification_branch(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        merged = self._merged_step_config(step)
        source = normalize_token(merged.get("source") or "previous") or "previous"
        verification_status = "unknown"
        if source == "contact_field":
            contact = self._lookup_contact(merged.get("contactId") or merged.get("contact_id") or context.get("contact_id"))
            verification_status = normalize_token((contact or {}).get("email_verification_status")) or "unknown"
        elif source == "node":
            source_node_id = clean_text(merged.get("sourceNodeId") or merged.get("source_node_id"))
            steps = runtime.get("steps") if isinstance(runtime.get("steps"), list) else []
            matched_step = next(
                (
                    item for item in reversed(steps)
                    if isinstance(item, dict)
                    and isinstance(item.get("parameters"), dict)
                    and clean_text(item["parameters"].get("node_id")) == source_node_id
                    and isinstance(item.get("data"), dict)
                ),
                None,
            )
            verification_status = normalize_token(((matched_step or {}).get("data") or {}).get("status")) or "unknown"
        else:
            previous = self._previous_step_result(runtime, intents={"verify_email"})
            verification_status = normalize_token((previous or {}).get("status")) or "unknown"
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_id = clean_text(params.get("node_id") or step.get("id"))
        outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
        matched_targets, default_targets = self._branch_edge_targets(outgoing_edges, verification_status)
        selected_targets = matched_targets or default_targets
        if outgoing_edges:
            selected_descendants = self._graph_descendants(runtime, selected_targets)
            alternate_targets = [clean_text(edge.get("target")) for edge in outgoing_edges if clean_text(edge.get("target")) and clean_text(edge.get("target")) not in selected_targets]
            suppressed_nodes = self._graph_descendants(runtime, alternate_targets) - selected_descendants
            runtime.setdefault("suppressed_nodes", set()).update(suppressed_nodes)
            runtime.setdefault("branch_decisions", {})[node_id] = {
                "status": verification_status,
                "selected_targets": selected_targets,
            }
        data = {
            "status": verification_status,
            "selectedTargets": selected_targets,
            "source": source,
        }
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}


def validate_prepared_flow_steps(raw_steps: list[dict[str, Any]]) -> dict[str, list[str]]:
    blockers: list[str] = []
    warnings: list[str] = []
    if not raw_steps:
        return {"blockers": ["Flow does not resolve any executable steps."], "warnings": []}

    executor = StepExecutor(provider=None)
    seen_node_ids: set[str] = set()
    supported_if_then_ops = {
        "equals",
        "not_equals",
        "greater_than",
        "greater_than_or_equal",
        "less_than",
        "less_than_or_equal",
        "contains",
        "not_contains",
        "is_empty",
        "is_not_empty",
    }

    for step in raw_steps:
        params = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        node_id = clean_text(params.get("node_id") or step.get("id"))
        node_label = clean_text(params.get("node_label")) or node_id or "Unnamed step"
        intent = clean_text(step.get("intent"))
        config = executor._normalized_service_config(step)
        outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []

        if node_id:
            if node_id in seen_node_ids:
                blockers.append(f"{node_label}: duplicate node id '{node_id}' detected in runtime plan.")
            seen_node_ids.add(node_id)

        if intent == "if_then":
            definition = executor._extract_if_then_condition(step)
            operator = clean_text(definition.get("operator")).lower()
            left = definition.get("left")
            right = definition.get("right")
            unary = operator in {"is_empty", "is_not_empty"}
            if not operator:
                blockers.append(f"{node_label}: If/Then condition is missing an operator.")
            elif operator not in supported_if_then_ops:
                blockers.append(f"{node_label}: unsupported If/Then operator '{operator}'.")
            if left is None:
                blockers.append(f"{node_label}: If/Then condition is missing the left operand.")
            if not unary and right is None:
                blockers.append(f"{node_label}: If/Then condition is missing the right operand.")
            blockers.extend(executor._token_syntax_errors(left, f"{node_label} left operand"))
            if not unary:
                blockers.extend(executor._token_syntax_errors(right, f"{node_label} right operand"))
            matched_true, default_targets = executor._branch_edge_targets(outgoing_edges, "true")
            matched_false, _ = executor._branch_edge_targets(outgoing_edges, "false")
            if outgoing_edges and not matched_true and not matched_false and len(default_targets) > 1:
                blockers.append(f"{node_label}: If/Then branch routing is ambiguous. Label outgoing edges for true/false routing.")
        elif intent == "filter":
            definition = executor._extract_if_then_condition(step)
            operator = clean_text(definition.get("operator")).lower()
            left = definition.get("left")
            right = definition.get("right")
            unary = operator in {"is_empty", "is_not_empty"}
            if not operator:
                blockers.append(f"{node_label}: Filter is missing an operator.")
            if left is None:
                blockers.append(f"{node_label}: Filter is missing the left operand.")
            if not unary and right is None:
                blockers.append(f"{node_label}: Filter is missing the right operand.")
            blockers.extend(executor._token_syntax_errors(left, f"{node_label} left operand"))
            if not unary:
                blockers.extend(executor._token_syntax_errors(right, f"{node_label} right operand"))
            matched_true, default_targets = executor._branch_edge_targets(outgoing_edges, "true")
            if outgoing_edges and not matched_true and len(default_targets) > 1:
                blockers.append(f"{node_label}: Filter routing is ambiguous. Use one default edge or label explicit true/false edges.")
        elif intent == "switch":
            definition = executor._extract_switch_definition(step)
            source = definition.get("source")
            if source is None:
                blockers.append(f"{node_label}: Switch is missing a source value.")
            blockers.extend(executor._token_syntax_errors(source, f"{node_label} switch source"))
            if not outgoing_edges:
                blockers.append(f"{node_label}: Switch requires labeled outgoing edges.")
            for edge in outgoing_edges:
                edge_label = clean_text(edge.get("filters") or ((edge.get("data") or {}) if isinstance(edge.get("data"), dict) else {}).get("filters") or edge.get("sourceHandle") or edge.get("label"))
                if not edge_label:
                    blockers.append(f"{node_label}: Switch routing requires labeled outgoing edges or explicit edge filters.")
                    break
        elif intent == "time_delay":
            blockers.extend(executor._token_syntax_errors(config.get("duration"), f"{node_label} delay duration"))
            blockers.extend(executor._token_syntax_errors(config.get("unit"), f"{node_label} delay unit"))
            if config.get("duration") in {None, ""}:
                blockers.append(f"{node_label}: Time-delay is missing a duration.")
            if config.get("unit") in {None, ""}:
                blockers.append(f"{node_label}: Time-delay is missing a unit.")
            _, route_error = executor._resolve_single_downstream_target(step)
            if route_error:
                blockers.append(f"{node_label}: {route_error}")
        elif intent == "generate_video":
            if not clean_text(config.get("templateId") or config.get("template_id")):
                blockers.append(f"{node_label}: Generate Video requires a templateId.")
            if not clean_text(config.get("outputTarget") or config.get("output_target")):
                blockers.append(f"{node_label}: Generate Video requires an outputTarget.")
            if not clean_text(config.get("script")) and not clean_text(config.get("prompt")):
                warnings.append(f"{node_label}: Generate Video has no script or prompt yet.")
        elif intent == "generate_script":
            if not clean_text(config.get("topic")):
                blockers.append(f"{node_label}: Generate Script requires a topic.")
            if not clean_text(config.get("length")) and not clean_text(config.get("duration")):
                warnings.append(f"{node_label}: Generate Script has no target length yet.")
        elif intent == "generate_run_of_show":
            if not clean_text(config.get("topic")):
                blockers.append(f"{node_label}: Generate Run of Show requires a topic.")
            if not clean_text(config.get("duration")):
                blockers.append(f"{node_label}: Generate Run of Show requires a duration.")
        elif intent == "generate_transcript_intelligence":
            if not clean_text(config.get("transcriptText") or config.get("transcript_text")):
                blockers.append(f"{node_label}: Transcript Intelligence requires transcriptText.")
        elif intent == "generate_voice":
            if not clean_text(config.get("text")) and not clean_text(config.get("script")) and not clean_text(config.get("scriptText")):
                blockers.append(f"{node_label}: Generate Voice requires text or script input.")
        elif intent == "text_to_speech":
            if not clean_text(config.get("text")) and not clean_text(config.get("script")) and not clean_text(config.get("scriptText")):
                blockers.append(f"{node_label}: Text to Speech requires text or script input.")
        elif intent == "generate_thumbnail":
            if not clean_text(config.get("title")):
                blockers.append(f"{node_label}: Generate Thumbnail requires a title.")
        elif intent == "publish_asset":
            if not clean_text(config.get("publishTarget") or config.get("publish_target")):
                blockers.append(f"{node_label}: Publish Asset requires a publishTarget.")
        elif intent in {"transcribe_media", "transcribe-media"}:
            if not clean_text(config.get("sourceType") or config.get("source_type")) and not clean_text(config.get("assetId") or config.get("asset_id")):
                blockers.append(f"{node_label}: Transcribe Media requires a sourceType.")
            if not clean_text(config.get("sourceRef") or config.get("source_ref")) and not clean_text(config.get("assetId") or config.get("asset_id")):
                blockers.append(f"{node_label}: Transcribe Media requires a sourceRef.")
        elif intent == "ingest_meeting_artifacts":
            if not clean_text(config.get("meetingProvider") or config.get("meeting_provider")):
                blockers.append(f"{node_label}: Ingest Meeting requires a meetingProvider.")
            if not clean_text(config.get("meetingRef") or config.get("meeting_ref")):
                blockers.append(f"{node_label}: Ingest Meeting requires a meetingRef.")

        if not outgoing_edges and intent not in {"send_email", "send_sms", "store_data", "http_request", "generate_script", "generate_run_of_show", "generate_transcript_intelligence", "generate_voice", "text_to_speech", "generate_thumbnail", "generate_video", "transcribe_media", "transcribe-media", "ingest_meeting_artifacts", "publish_asset", "create_booking", "update_booking", "cancel_booking", "get_booking", "verify_email", "verify_email_bulk", "wait_for_verification"}:
            warnings.append(f"{node_label}: no downstream node is connected.")

    return {"blockers": list(dict.fromkeys(blockers)), "warnings": list(dict.fromkeys(warnings))}


class ExecutionEngine:
    def __init__(self, provider: Any) -> None:
        self.provider = provider
        self.executor = StepExecutor(provider)

    def _serialize_runtime_context(self, context: dict[str, Any], runtime: dict[str, Any], tenant: dict[str, Any]) -> dict[str, Any]:
        next_context = json.loads(json.dumps(context or {}, default=str))
        next_context["tenant"] = json.loads(json.dumps(tenant or {}, default=str))
        next_context["run_vars"] = safe_clone(runtime.get("run_vars") or {})
        next_context["_runtime_previous"] = safe_clone(runtime.get("previous"))
        next_context["_runtime_node_results"] = safe_clone(runtime.get("node_results") or {})
        next_context["_runtime_branch_decisions"] = safe_clone(runtime.get("branch_decisions") or {})
        next_context["_runtime_suppressed_nodes"] = sorted(runtime.get("suppressed_nodes") or [])
        next_context["_runtime_graph_adjacency"] = safe_clone(runtime.get("graph_adjacency") or {})
        return next_context

    def run(self, raw_steps: list[dict[str, Any]], mode: str, command: str, context: dict[str, Any], actor: dict[str, Any], tenant: dict[str, Any], run_id: str | None = None) -> dict[str, Any]:
        import server
        from backend.adaptive_routing import AdaptiveRouting
        from backend.failure_analysis import classify_failure
        from backend.recovery_engine import RecoveryEngine
        
        router = AdaptiveRouting(self.provider)
        recovery_engine = RecoveryEngine(self.executor)
        trace = []
        resume_node_id = ""
        if mode == "resume" and run_id:
            run_state = getattr(self.provider, "get_ai_run")(run_id)
            if not run_state:
                raise ValueError(f"Run {run_id} not found to resume.")
            steps = run_state.get("steps") if isinstance(run_state.get("steps"), list) else json.loads(run_state.get("steps_json", "[]"))
            artifacts = run_state.get("artifacts") if isinstance(run_state.get("artifacts"), list) else json.loads(run_state.get("artifacts_json", "[]"))
            routing = run_state.get("routing") if isinstance(run_state.get("routing"), dict) else json.loads(run_state.get("routing_json", "{}"))
            trace = run_state.get("trace") if isinstance(run_state.get("trace"), list) else json.loads(run_state.get("trace_json", "[]"))
            stored_context = run_state.get("context") if isinstance(run_state.get("context"), dict) else json.loads(run_state.get("context_json", "{}"))
            stored_actor = run_state.get("actor") if isinstance(run_state.get("actor"), dict) else json.loads(run_state.get("actor_json", "{}"))
            context = {**stored_context, **(context or {})}
            actor = stored_actor or actor
            tenant = context.get("tenant") if isinstance(context.get("tenant"), dict) else tenant
            resume_node_id = clean_text(run_state.get("next_node_id"))
        else:
            if mode == "plan" or (not raw_steps and command):
                from backend.planner import create_execution_plan
                steps = create_execution_plan(command, context)
                trace.append({
                    "action": "plan_created",
                    "steps": len(steps),
                    "agent": "ALPHA",
                    "timestamp": datetime_now()
                })
            else:
                steps = normalize_parsed_steps(raw_steps)
            
            # Phase 16: Ensure ID consistency
            for s in steps:
                if not s.get("id"):
                    s["id"] = s.get("stepId") or f"step-{unique_suffix()}"

            artifacts = []
            routing = server.resolve_ai_run_routing(
                module=context.get("module", "comms"),
                surface=context.get("surface", "chat"),
                field=context.get("field", ""),
                intent="command",
                command_text=command,
                context=context
            )
            flow_id = context.get("flow_id") or context.get("flowId")
            flow_agent_chain = context.get("agent_chain") if isinstance(context.get("agent_chain"), list) else []
            if flow_id:
                routing["requested_agent"] = context.get("requested_agent") or routing.get("requested_agent")
                routing["executing_agent"] = flow_agent_chain[-1] if flow_agent_chain else context.get("active_agent") or routing.get("executing_agent")
                routing["delegate_chain"] = list(
                    dict.fromkeys((routing.get("delegate_chain") or []) + flow_agent_chain)
                )
            for step in steps:
                step_command = f"{step['intent']} {' '.join(str(v) for v in step.get('parameters', {}).values())}"
                specialist = server.choose_specialist_for_command(
                    module=context.get("module", "comms"),
                    surface=context.get("surface", "chat"),
                    field=context.get("field", ""),
                    command_text=step_command,
                    context=context
                )
                step["assignedAgent"] = step.get("assignedAgent") or specialist or "ALPHA"
                step["agentId"] = canonical_agent_id_for(step["assignedAgent"])
                
                # Phase 16: Adaptive Routing
                requested_agent_locked = bool(context.get("_requested_agent_locked") or flow_id)
                best_route = router.select_best_agent_for_step(step, {})
                if not requested_agent_locked and best_route["selectedAgent"] != step["assignedAgent"]:
                    trace.append({
                        "action": "adaptive_reroute",
                        "agent": "ALPHA",
                        "stepId": step.get("id"),
                        "details": {
                            "from": step["assignedAgent"],
                            "to": best_route["selectedAgent"],
                            "reason": best_route["reason"]
                        }
                    })
                    step["assignedAgent"] = best_route["selectedAgent"]
                    step["agentId"] = canonical_agent_id_for(step["assignedAgent"])
                    step["_routing_rationale"] = best_route["reason"]

                gate = check_step_gate(step, actor, tenant, context)
                step["requiresApproval"] = gate["requiresApproval"]
                step["riskLevel"] = gate.get("riskLevel", "low")

        if mode == "parse":
            return {"runId": run_id or f"run-{unique_suffix()}", "status": "success", "steps": steps, "artifacts": artifacts, "pendingApprovals": [], "trace": trace}

        if mode == "plan":
            return {"runId": run_id or f"run-{unique_suffix()}", "status": "success", "steps": steps, "artifacts": artifacts, "pendingApprovals": [s for s in steps if s.get("requiresApproval")], "trace": trace}

        run_state_status = "executing"
        final_run_id = run_id or f"run-{unique_suffix()}"
        
        runtime = {
            "runId": final_run_id,
            "command": command,
            "providerConfig": context.get("_provider_config"),
            "actor": actor,
            "tenant": tenant,
            "steps": steps,
            "artifacts": artifacts,
            "trace": trace,
            "retrievedContext": {}, # Phase 13: Propagation bucket
            "sharedContext": {
                "goal": command,
                "plan": [s.get("intent") for s in steps],
                "agentNotes": []
            },
            "node_results": safe_clone(context.get("_runtime_node_results") or {}),
            "previous": safe_clone(context.get("_runtime_previous")),
            "run_vars": json.loads(json.dumps(context.get("run_vars") or {})) if isinstance(context.get("run_vars"), dict) else {},
            "graph_adjacency": safe_clone(context.get("_runtime_graph_adjacency") or {}),
            "suppressed_nodes": set(context.get("_runtime_suppressed_nodes") or []),
            "branch_decisions": safe_clone(context.get("_runtime_branch_decisions") or {}),
            "pause_state": {},
        }
        for step in steps:
            if not step.get("status"):
                step["status"] = "pending"
        for step in steps:
            params = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
            node_id = clean_text(params.get("node_id") or step.get("id"))
            outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
            if node_id and node_id not in runtime["graph_adjacency"]:
                runtime["graph_adjacency"][node_id] = [
                    clean_text(edge.get("target"))
                    for edge in outgoing_edges
                    if clean_text(edge.get("target"))
                ]

        def persist_runtime_state(status_override: str | None = None) -> None:
            persisted_context = self._serialize_runtime_context(context, runtime, tenant)
            pause_state = runtime.get("pause_state") if isinstance(runtime.get("pause_state"), dict) else {}
            self._persist_run(
                final_run_id,
                command,
                mode,
                status_override or run_state_status,
                steps,
                artifacts,
                routing,
                trace,
                actor,
                tenant,
                persisted_context,
                pause_reason=pause_state.get("pause_reason"),
                resume_at=pause_state.get("resume_at"),
                next_node_id=pause_state.get("next_node_id"),
                current_node_id=pause_state.get("current_node_id") or runtime.get("current_node_id"),
                locked_until=None,
                last_error=pause_state.get("last_error") or next((s.get("error") for s in reversed(steps) if s.get("error")), None),
            )

        persist_runtime_state("executing")
        resume_pending = bool(resume_node_id)
        resume_found = not resume_pending
        for step in steps:
            # Skip natively completed steps
            if step.get("status") in ("success", "skipped"):
                continue
            params = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
            node_id = clean_text(params.get("node_id") or step.get("id"))
            if resume_pending:
                if node_id != resume_node_id:
                    continue
                resume_pending = False
                resume_found = True
            if node_id and node_id in runtime.get("suppressed_nodes", set()):
                step["status"] = "skipped"
                step["completedAt"] = datetime_now()
                self._audit_log(final_run_id, step, "execution_skipped", "branch_suppressed")
                continue
            
            # Step 4 & 7: Strict Approval Separation (No auto-promotion, except user manual 'approved')
            if step.get("requiresApproval") and step.get("status") != "approved":
                step["status"] = "awaiting_approval"
                run_state_status = "blocked"
                runtime["pause_state"] = {
                    "pause_reason": "approval",
                    "resume_at": None,
                    "next_node_id": node_id,
                    "current_node_id": node_id,
                    "last_error": None,
                }
                self._audit_log(final_run_id, step, "blocked", "awaiting_approval")
                persist_runtime_state("blocked")
                break
                
            step["status"] = "executing"
            started_at = time.time()
            step["startedAt"] = datetime_now()
            runtime["current_node_id"] = node_id
            
            self._audit_log(final_run_id, step, "execution_started", "pending")
            persist_runtime_state("executing")
            res = self.executor.execute(step, context, runtime)
            
            ended_at = time.time()
            duration_ms = int((ended_at - started_at) * 1000)
            
            step["status"] = res["status"]
            step["data"] = res.get("data")
            step["error"] = res.get("error")
            step["completedAt"] = datetime_now()
            step["durationMs"] = duration_ms
            
            # Execution trace map
            trace_entry = {
                "stepId": step.get("id"),
                "agent": step.get("assignedAgent"),
                "agentId": step.get("agentId"),
                "action": step.get("intent"),
                "timestamp": step["completedAt"],
                "status": step["status"],
                "chosenTool": res.get("chosenTool"),
                "intelligenceSummary": res.get("intelligenceSummary")
            }
            trace.append(trace_entry)
            
            # Phase 16: Self-Healing Loop
            failure = None
            if res["status"] in {"error", "failed"}:
                failure = classify_failure(step, res.get("error", "unknown"), runtime)
                healing = recovery_engine.attempt_recovery(step, failure, runtime, context)
                
                if healing.get("recoveryAttempted"):
                    trace.append({
                        "action": "recovery_attempt",
                        "agent": step["assignedAgent"],
                        "stepId": step.get("id"),
                        "details": {
                            "failureCategory": failure["category"],
                            "healingAction": healing["recoveryAction"],
                            "notes": healing["notes"]
                        }
                    })
                    # Re-queue / Re-run logic: For now, we wrap the execution call
                    # in a simple one-off retry if successful
                    logger.info(f"Self-healing: {healing['recoveryAction']}")
                    res = self.executor.execute(healing["updatedStep"], context, runtime)
                    step["status"] = res["status"]
                    step["_recovery_success"] = (res["status"] == "success")

            # Phase 14: Re-sync trace from runtime
            if "trace" in runtime:
                for entry in runtime["trace"]:
                    if entry not in trace:
                        trace.append(entry)
            
            # Phase 16: Persist Outcome
            outcome = {
                "run_id": final_run_id,
                "intent": step["intent"],
                "agent_name": step["assignedAgent"],
                "agent_id": step["agentId"],
                "status": step["status"],
                "error_category": failure["category"] if step["status"] in {"error", "failed"} and failure else None,
                "recovery_attempted": step.get("_recovery_attempts", 0) > 0,
                "recovery_success": step.get("_recovery_success", False),
                "duration_ms": duration_ms
            }
            if hasattr(self.provider, "save_step_outcome"):
                self.provider.save_step_outcome(outcome)
            
            self._audit_log(final_run_id, step, "execution_completed", step["status"])
            
            if step["status"] == "success":
                new_artifacts = normalize_execution_artifacts(step, res.get("data"))
                artifacts.extend(new_artifacts)
                
                # Phase 13: If this was a knowledge retrieval step, stick it in runtime for downstream
                if step.get("intent") == "query_vault":
                    runtime["retrievedContext"] = res.get("data", {})
                
            if step["status"] == "paused":
                run_state_status = "paused"
                self._audit_log(final_run_id, step, "execution_paused", (step.get("data") or {}).get("pauseReason") or "paused")
                persist_runtime_state("paused")
                break

            if step["status"] in {"error", "failed"}:
                run_state_status = "failed"
                self._audit_log(final_run_id, step, "execution_failed", step["error"])
                persist_runtime_state("failed")
                break

            persist_runtime_state("executing")

        if resume_pending and resume_node_id and not resume_found:
            run_state_status = "failed"
            runtime["pause_state"] = {
                "pause_reason": None,
                "resume_at": None,
                "next_node_id": resume_node_id,
                "current_node_id": None,
                "last_error": f"Resume node '{resume_node_id}' was not found in the persisted run.",
            }

        if run_state_status == "executing":
            run_state_status = "completed"

        # Phase 16: Post-run reflection summary
        learning_summary = {
            "whatWorked": [s["intent"] for s in steps if s["status"] == "success"],
            "whatFailed": [s["intent"] for s in steps if s["status"] in {"error", "failed"}],
            "recoveryInsights": [t["details"] for t in trace if t["action"] == "recovery_attempt"]
        }
        context["_learningSummary"] = learning_summary

        persisted_context = self._serialize_runtime_context(context, runtime, tenant)
        pause_state = runtime.get("pause_state") if isinstance(runtime.get("pause_state"), dict) else {}
        self._persist_run(
            final_run_id,
            command,
            mode,
            run_state_status,
            steps,
            artifacts,
            routing,
            trace,
            actor,
            tenant,
            persisted_context,
            pause_reason=pause_state.get("pause_reason"),
            resume_at=pause_state.get("resume_at"),
            next_node_id=pause_state.get("next_node_id"),
            current_node_id=pause_state.get("current_node_id") or runtime.get("current_node_id"),
            locked_until=None,
            last_error=pause_state.get("last_error") or next((s.get("error") for s in reversed(steps) if s.get("error")), None),
        )

        return {
            "runId": final_run_id,
            "status": run_state_status,
            "steps": steps,
            "artifacts": artifacts,
            "routing": routing,
            "trace": trace,
            "pendingApprovals": [ {
                "stepId": s.get("id"),
                "intent": s.get("intent"),
                "summary": s.get("intent"),
                "riskLevel": s.get("riskLevel", "low"),
                "reason": s.get("reason", "Needs approval.")
            } for s in steps if s.get("status") == "awaiting_approval" ]
        }
        
    def _audit_log(self, run_id: str, step: dict, action: str, result: str):
        payload = {
            "run_id": run_id,
            "step_id": step.get("id"),
            "agent": step.get("assignedAgent"),
            "agent_id": step.get("agentId"),
            "action": action,
            "result": result,
            "timestamp": datetime_now()
        }
        if hasattr(self.provider, "save_ai_audit_log"):
            self.provider.save_ai_audit_log(payload)
            
    def _persist_run(
        self,
        run_id: str,
        command: str,
        mode: str,
        status: str,
        steps: list,
        artifacts: list,
        routing: dict,
        trace: list,
        actor: dict,
        tenant: dict,
        context: dict,
        *,
        pause_reason: str | None = None,
        resume_at: str | None = None,
        next_node_id: str | None = None,
        current_node_id: str | None = None,
        locked_until: str | None = None,
        last_error: str | None = None,
    ) -> None:
        payload = {
            "id": run_id,
            "command": command,
            "mode": mode,
            "status": status,
            "pause_reason": pause_reason,
            "resume_at": resume_at,
            "next_node_id": next_node_id,
            "current_node_id": current_node_id,
            "locked_until": locked_until,
            "last_error": last_error,
            "steps_json": json.dumps(steps),
            "artifacts_json": json.dumps(artifacts),
            "pending_approvals_json": json.dumps([s for s in steps if s.get("status") == "awaiting_approval"]),
            "routing_json": json.dumps(routing),
            "trace_json": json.dumps(trace),
            "actor_json": json.dumps(actor),
            "context_json": json.dumps(context),
            "tenant_id": tenant.get("id"),
        }
        try:
            if getattr(self.provider, "get_ai_run", None) and self.provider.get_ai_run(run_id):
                self.provider.update_ai_run(run_id, payload)
            elif getattr(self.provider, "save_ai_run", None):
                self.provider.save_ai_run(payload)
        except Exception as exc:
            logger.error(f"Failed to persist run {run_id}: {exc}")


def resume_due_ai_runs(provider: Any, limit: int = 10, lock_seconds: int = 60) -> list[dict[str, Any]]:
    claimer = getattr(provider, "claim_due_ai_runs", None)
    if not claimer:
        return []
    resumed: list[dict[str, Any]] = []
    claimed_runs = claimer(pause_reason="delay", limit=limit, lock_seconds=lock_seconds)
    for run_state in claimed_runs:
        tenant_id = clean_text(run_state.get("tenant_id"))
        token = set_request_tenant_id(tenant_id)
        try:
            next_node_id = clean_text(run_state.get("next_node_id"))
            context = run_state.get("context") if isinstance(run_state.get("context"), dict) else {}
            actor = run_state.get("actor") if isinstance(run_state.get("actor"), dict) else {}
            tenant = context.get("tenant") if isinstance(context.get("tenant"), dict) else {"id": tenant_id}
            if not next_node_id:
                provider.update_ai_run(
                    run_state["id"],
                    {
                        "status": "failed",
                        "pause_reason": None,
                        "resume_at": None,
                        "next_node_id": None,
                        "current_node_id": None,
                        "locked_until": None,
                        "last_error": "Paused run is missing next_node_id and cannot resume.",
                    },
                )
                resumed.append({"runId": run_state["id"], "status": "failed"})
                continue
            provider.update_ai_run(
                run_state["id"],
                {
                    "status": "executing",
                    "pause_reason": None,
                    "resume_at": None,
                    "current_node_id": next_node_id,
                    "last_error": None,
                },
            )
            engine = ExecutionEngine(provider)
            result = engine.run(
                raw_steps=[],
                mode="resume",
                command=str(run_state.get("command") or ""),
                context=context,
                actor=actor,
                tenant=tenant,
                run_id=run_state["id"],
            )
            resumed.append({"runId": run_state["id"], "status": result.get("status")})
        except Exception as exc:
            provider.update_ai_run(
                run_state["id"],
                {
                    "status": "failed",
                    "pause_reason": None,
                    "resume_at": None,
                    "next_node_id": None,
                    "current_node_id": None,
                    "locked_until": None,
                    "last_error": str(exc),
                },
            )
            resumed.append({"runId": run_state["id"], "status": "failed", "error": str(exc)})
        finally:
            reset_request_tenant(token)
    return resumed


async def run_resume_worker(provider: Any, poll_interval_seconds: int = 5, batch_limit: int = 10, lock_seconds: int = 60) -> None:
    while True:
        try:
            await asyncio.to_thread(resume_due_ai_runs, provider, batch_limit, lock_seconds)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Resume worker iteration failed: %s", exc)
        await asyncio.sleep(max(1, poll_interval_seconds))
