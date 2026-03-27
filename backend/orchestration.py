import json
import logging
import time
import re
from datetime import datetime, UTC, timedelta
from typing import Any
from uuid import uuid4
try:
    from backend.agent_runtime import AgentRegistry
    from backend.canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
    from backend.email_verifier_service import (
        create_bulk_task as create_email_verifier_bulk_task,
        get_bulk_results as get_email_verifier_bulk_results,
        verify_single_email as verify_single_email_address,
    )
except ModuleNotFoundError:
    from agent_runtime import AgentRegistry
    from canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
    from email_verifier_service import (
        create_bulk_task as create_email_verifier_bulk_task,
        get_bulk_results as get_email_verifier_bulk_results,
        verify_single_email as verify_single_email_address,
    )

logger = logging.getLogger(__name__)

DIRECT_EXECUTION_INTENTS = {
    "query_vault",
    "schedule_calendar",
    "create_booking",
    "update_booking",
    "cancel_booking",
    "get_booking",
    "verify_email",
    "verify_email_bulk",
    "wait_for_verification",
    "verification_branch",
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
        if not match_flow_trigger_event(flow, event_type):
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
            
            "assignedAgent": raw.get("assignedAgent") or "ALPHA",
            "agentId": raw.get("agentId") or "AGT-CMD-001"
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
    if intent in {"verify_email", "verify_email_bulk", "wait_for_verification", "verification_branch"}:
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
    return artifacts

class StepExecutor:
    def __init__(self, provider: Any) -> None:
        self.provider = provider
        self.executors = {
            "draft_email": self._draft_email,
            "schedule_calendar": self._schedule_calendar,
            "create_booking": self._create_booking,
            "update_booking": self._update_booking,
            "cancel_booking": self._cancel_booking,
            "get_booking": self._get_booking,
            "add_contact": self._add_contact,
            "add_crm_note": self._add_crm_note,
            "query_vault": self._query_vault,
            "verify_email": self._verify_email,
            "verify_email_bulk": self._verify_email_bulk,
            "wait_for_verification": self._wait_for_verification,
            "verification_branch": self._verification_branch,
        }

    def _merged_step_config(self, step: dict[str, Any]) -> dict[str, Any]:
        params = step.get("parameters", {}) if isinstance(step.get("parameters"), dict) else {}
        node_config = json_object(params.get("node_config"))
        config = json_object(params.get("configuration"))
        return {**node_config, **config}

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

    def execute(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        intent = step.get("intent")
        handler = self.executors.get(intent)

        if intent in DIRECT_EXECUTION_INTENTS and handler:
            try:
                if intent in {"verify_email", "verify_email_bulk", "wait_for_verification", "verification_branch"}:
                    return handler(step, context, runtime)
                return handler(step, context)
            except Exception as exc:
                logger.error("Step execution failed: %s", exc)
                return {
                    "stepId": step.get("id"),
                    "intent": intent,
                    "status": "error",
                    "error": str(exc),
                    "data": None
                }
        
        # Step 1: Agent Runtime Execution
        assigned_agent = step.get("assignedAgent") or step.get("agentId")
        agent = AgentRegistry.get(assigned_agent)
        
        if agent:
            try:
                # Phase 12 Agent Execution
                return agent.execute(step, context, runtime)
            except NotImplementedError:
                # Agent exists but hasn't natively implemented the specific capability yet, safe fallback.
                pass
            except Exception as exc:
                logger.error("Agent %s failed: %s", assigned_agent, exc)
                return {
                    "stepId": step.get("id"),
                    "intent": intent,
                    "status": "error",
                    "error": str(exc),
                    "data": None
                }
        
        # Fallback to StepExecutor local method
        if not handler:
            return {
                "stepId": step.get("id"),
                "intent": intent,
                "status": "error",
                "error": f"Unsupported or unknown intent: {intent}",
                "data": None
            }
        try:
            return handler(step, context)
        except Exception as exc:
            logger.error("Step execution failed: %s", exc)
            return {
                "stepId": step.get("id"),
                "intent": intent,
                "status": "error",
                "error": str(exc),
                "data": None
            }

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

    def _verify_email(self, step: dict[str, Any], context: dict[str, Any], runtime: dict[str, Any]) -> dict[str, Any]:
        config = self._email_verifier_config()
        email, contact_id = self._resolve_single_verification_target(step, context, runtime)
        if not email:
            data = {
                "email": "",
                "status": "unknown",
                "score": None,
                "isSafe": False,
                "contactId": contact_id,
                "error": "No email was available for verification.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}
        if not config.get("enabled") or not config.get("api_key"):
            data = {
                "email": email,
                "status": "unknown",
                "score": None,
                "isSafe": False,
                "contactId": contact_id,
                "error": "Email verification is not configured for this tenant.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}
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
        except Exception as exc:
            data = {
                "email": email,
                "status": "unknown",
                "score": None,
                "isSafe": False,
                "contactId": contact_id,
                "error": str(exc),
            }
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}

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
                "status": "failed",
                "error": "No verifiable emails were available for bulk verification.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}
        if not config.get("enabled") or not config.get("api_key"):
            data = {
                "taskId": None,
                "submittedCount": 0,
                "status": "failed",
                "error": "Email verification is not configured for this tenant.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}
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
        except Exception as exc:
            data = {
                "taskId": None,
                "submittedCount": 0,
                "status": "failed",
                "error": str(exc),
            }
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}

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
                "status": "failed",
                "valid": 0,
                "risky": 0,
                "invalid": 0,
                "unknown": 0,
                "error": "No email verification task id was available.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}
        if not config.get("enabled") or not config.get("api_key"):
            data = {
                "taskId": task_id,
                "status": "failed",
                "valid": 0,
                "risky": 0,
                "invalid": 0,
                "unknown": 0,
                "error": "Email verification is not configured for this tenant.",
            }
            return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}
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
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": data}

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

class ExecutionEngine:
    def __init__(self, provider: Any) -> None:
        self.provider = provider
        self.executor = StepExecutor(provider)

    def run(self, raw_steps: list[dict[str, Any]], mode: str, command: str, context: dict[str, Any], actor: dict[str, Any], tenant: dict[str, Any], run_id: str | None = None) -> dict[str, Any]:
        import server
        from backend.adaptive_routing import AdaptiveRouting
        from backend.failure_analysis import classify_failure
        from backend.recovery_engine import RecoveryEngine
        
        router = AdaptiveRouting(self.provider)
        recovery_engine = RecoveryEngine(self.executor)
        trace = []
        if mode == "resume" and run_id:
            run_state = getattr(self.provider, "get_ai_run")(run_id)
            if not run_state:
                raise ValueError(f"Run {run_id} not found to resume.")
            steps = json.loads(run_state.get("steps_json", "[]"))
            artifacts = json.loads(run_state.get("artifacts_json", "[]"))
            routing = json.loads(run_state.get("routing_json", "{}"))
            trace = json.loads(run_state.get("trace_json", "[]"))
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
                if not step.get("agentId"):
                    step["agentId"] = f"AGT-{step['assignedAgent'][:3].upper()}-001"
                
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
                    step["agentId"] = best_route["agentId"]
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
            "graph_adjacency": {},
            "suppressed_nodes": set(),
            "branch_decisions": {},
        }
        for step in steps:
            params = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
            node_id = clean_text(params.get("node_id") or step.get("id"))
            outgoing_edges = params.get("outgoing_edges") if isinstance(params.get("outgoing_edges"), list) else []
            if node_id:
                runtime["graph_adjacency"][node_id] = [
                    clean_text(edge.get("target"))
                    for edge in outgoing_edges
                    if clean_text(edge.get("target"))
                ]
        
        for step in steps:
            # Skip natively completed steps
            if step.get("status") in ("success", "skipped"):
                continue
            params = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
            node_id = clean_text(params.get("node_id") or step.get("id"))
            if node_id and node_id in runtime.get("suppressed_nodes", set()):
                step["status"] = "skipped"
                step["completedAt"] = datetime_now()
                self._audit_log(final_run_id, step, "execution_skipped", "branch_suppressed")
                continue
            
            # Step 4 & 7: Strict Approval Separation (No auto-promotion, except user manual 'approved')
            if step.get("requiresApproval") and step.get("status") != "approved":
                step["status"] = "awaiting_approval"
                run_state_status = "blocked"
                self._audit_log(final_run_id, step, "blocked", "awaiting_approval")
                break
                
            step["status"] = "executing"
            started_at = time.time()
            step["startedAt"] = datetime_now()
            
            self._audit_log(final_run_id, step, "execution_started", "pending")
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
            if res["status"] == "error":
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
                "error_category": failure["category"] if res["status"] == "error" else None,
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
                
            if step["status"] == "error":
                run_state_status = "failed"
                self._audit_log(final_run_id, step, "execution_failed", step["error"])
                break
                
        if run_state_status == "executing":
            run_state_status = "completed"

        # Phase 16: Post-run reflection summary
        learning_summary = {
            "whatWorked": [s["intent"] for s in steps if s["status"] == "success"],
            "whatFailed": [s["intent"] for s in steps if s["status"] == "error"],
            "recoveryInsights": [t["details"] for t in trace if t["action"] == "recovery_attempt"]
        }
        context["_learningSummary"] = learning_summary

        self._persist_run(final_run_id, command, mode, run_state_status, steps, artifacts, routing, trace, actor, tenant, context)

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
            "runId": run_id,
            "stepId": step.get("id"),
            "agent": step.get("assignedAgent"),
            "agentId": step.get("agentId"),
            "action": action,
            "result": result,
            "timestamp": datetime_now()
        }
        if hasattr(self.provider, "save_ai_audit_log"):
            self.provider.save_ai_audit_log(payload)
            
    def _persist_run(self, run_id: str, command: str, mode: str, status: str, steps: list, artifacts: list, routing: dict, trace: list, actor: dict, tenant: dict, context: dict) -> None:
        payload = {
            "id": run_id,
            "command": command,
            "mode": mode,
            "status": status,
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
