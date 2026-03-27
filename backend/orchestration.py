import json
import logging
import time
from datetime import datetime, UTC
from typing import Any
from uuid import uuid4
from backend.agent_runtime import AgentRegistry

logger = logging.getLogger(__name__)

def datetime_now() -> str:
    return datetime.now(UTC).isoformat()

def unique_suffix() -> str:
    return uuid4().hex[:10]

def normalize_parsed_steps(raw_steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    if not isinstance(raw_steps, list):
        return []
    
    for i, raw in enumerate(raw_steps):
        intent = str(raw.get("action") or raw.get("intent") or "unknown")
        parameters = raw.get("parameters") or raw.get("payload") or {}
        
        step_id = raw.get("id") or f"step-{unique_suffix()}"
        # Phase 12 Declarative Step
        is_write = intent in ("draft_email", "schedule_calendar", "add_contact", "add_crm_note")
        mutation_type = "create" if is_write else "none"
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
        handler = self.executors.get(intent)
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
        scheduled_at = params.get("scheduled_at") or params.get("time")
        if not thread_id:
            raise ValueError("Missing thread_id context for schedule_calendar.")
        res = getattr(self.provider, "schedule_thread_meeting")(thread_id, scheduled_at=scheduled_at)
        return {"stepId": step.get("id"), "intent": step.get("intent"), "status": "success", "data": res}

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
                requested_agent_locked = bool(context.get("_requested_agent_locked"))
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
