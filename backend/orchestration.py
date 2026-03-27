import json
import logging
import time
from datetime import datetime, UTC, timedelta
from typing import Any
from uuid import uuid4
try:
    from backend.agent_runtime import AgentRegistry
    from backend.canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
except ModuleNotFoundError:
    from agent_runtime import AgentRegistry
    from canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload

logger = logging.getLogger(__name__)

DIRECT_EXECUTION_INTENTS = {
    "query_vault",
    "schedule_calendar",
    "create_booking",
    "update_booking",
    "cancel_booking",
    "get_booking",
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
            }
        }
        
        for step in steps:
            # Skip natively completed steps
            if step.get("status") in ("success", "skipped"):
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
