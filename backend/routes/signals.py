"""
AIO Nexus — Signals Router & Pipeline
Aggregates and delivers actionable signals across AI runs, verifications,
media render jobs, comms sessions, integrations, and system health alerts.
Enables instant triage, dismissals, and direct execution routing.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.deps import (
    auth_store,
    clean_text,
    extract_session_token,
    provider,
    require_capability,
    utcnow_iso,
)

logger = logging.getLogger("aio-nexus-signals")

router = APIRouter(tags=["Signals"])

try:
    from backend.flow_graph_utils import resolve_flow_trigger_targets
    from backend.media_engine import clone_json, get_media_engine
    from backend.routes.ai import project_engine_run_for_ui
    from backend.system_health import build_system_health
except ModuleNotFoundError:
    from flow_graph_utils import resolve_flow_trigger_targets
    from media_engine import clone_json, get_media_engine
    from routes.ai import project_engine_run_for_ui
    from system_health import build_system_health


class SignalExecuteRequest(BaseModel):
    signalType: str
    action: str  # "agent" | "flow" | "command"
    target: Optional[str] = None
    input: str | dict[str, Any] = ""
    context: dict[str, Any] = {}


def _signal_created_at(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return utcnow_iso()


def _signal_severity(raw_value: str | None, *, default: str = "medium") -> str:
    normalized = str(raw_value or "").strip().lower()
    if normalized in {"critical", "high", "medium", "low"}:
        return normalized
    if normalized in {"error", "failed", "failure", "warning"}:
        return "high"
    if normalized in {"info", "ready", "queued", "running", "pending", "completed"}:
        return "medium" if normalized in {"queued", "running", "pending"} else "low"
    return default


def _signal_action(label: str, action_type: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "label": label,
        "actionType": action_type,
        "payload": payload or {},
    }


def _signal_record(
    *,
    signal_id: str,
    signal_type: str,
    title: str,
    description: str,
    source: str,
    source_id: str,
    severity: str,
    created_at: str,
    module: str,
    entity_id: str | None,
    metadata: dict[str, Any] | None,
    actions: list[dict[str, Any]],
) -> dict[str, Any] | None:
    filtered_actions = [action for action in (actions or []) if isinstance(action, dict) and str(action.get("actionType") or "").strip()]
    if not filtered_actions:
        return None
    return {
        "id": signal_id,
        "type": signal_type,
        "title": title,
        "description": description,
        "source": source,
        "sourceId": source_id,
        "severity": _signal_severity(severity),
        "createdAt": created_at,
        "context": {
            "module": module,
            "entityId": entity_id,
            "metadata": metadata or {},
        },
        "actions": filtered_actions,
    }


def _append_signal(signals: list[dict[str, Any]], seen: set[str], signal: dict[str, Any] | None) -> None:
    if not signal:
        return
    dedupe_key = f"{signal.get('source')}:{signal.get('sourceId')}"
    if dedupe_key in seen:
        return
    seen.add(dedupe_key)
    signals.append(signal)


def _signal_view_detail(source: str, source_id: str) -> dict[str, Any]:
    return _signal_action("View Detail", "view_detail", {"source": source, "sourceId": source_id})


def _media_signal_actions(job_type: str, job: dict[str, Any]) -> list[dict[str, Any]]:
    job_id = str(job.get("id") or "").strip()
    actions: list[dict[str, Any]] = []
    input_payload = clone_json(job.get("input_payload") or job.get("inputPayload") or {})
    if str(job.get("status") or "").strip().lower() == "failed" and input_payload:
        actions.append(
            _signal_action(
                "Retry Job",
                "retry",
                {
                    "retryType": "media_job",
                    "jobType": job_type,
                    "inputPayload": input_payload,
                },
            )
        )
    actions.append(_signal_view_detail("studio", job_id))
    return actions


def _integration_issue_actions(category: str, provider_key: str | None, source: str, source_id: str) -> list[dict[str, Any]]:
    return [
        _signal_action(
            "Fix Config",
            "fix_config",
            {
                "integrationCategory": category,
                "providerKey": provider_key,
            },
        ),
        _signal_view_detail(source, source_id),
    ]


def _build_ai_run_signals() -> list[dict[str, Any]]:
    try:
        runs = [project_engine_run_for_ui(run) for run in provider.list_ai_runs(limit=80)]
    except Exception:
        runs = []
    signals: list[dict[str, Any]] = []
    seen: set[str] = set()
    for run in runs:
        if not run:
            continue
        run_id = str(run.get("id") or "").strip()
        if not run_id:
            continue
        status = str(run.get("status") or "").strip().lower()
        flow_id = str(run.get("flowId") or run.get("flow_id") or "").strip()
        flow_name = str(run.get("flowName") or run.get("flow_name") or "").strip() or "Untitled Flow"
        thread_id = str(run.get("thread_id") or run.get("threadId") or "").strip()
        result_text = clean_text(run.get("result") or run.get("output"))
        artifacts = run.get("artifacts") if isinstance(run.get("artifacts"), list) else []
        metadata_payload = run.get("metadata") if isinstance(run.get("metadata"), dict) else {}
        context_payload = metadata_payload.get("context") if isinstance(metadata_payload.get("context"), dict) else {}

        actions = []
        if status in {"failed", "error"} and flow_id:
            actions.append(
                _signal_action(
                    "Retry Flow",
                    "run_flow",
                    {
                        "flowId": flow_id,
                        "command": clean_text(run.get("command_text") or run.get("prompt")),
                        "context": context_payload,
                    },
                )
            )
        if thread_id:
            actions.append(_signal_action("Open Comms", "open_comms", {"threadId": thread_id}))
        actions.append(_signal_view_detail("ai_run", run_id))

        if status in {"failed", "error"}:
            _append_signal(
                signals,
                seen,
                _signal_record(
                    signal_id=f"signal-ai-run-{run_id}",
                    signal_type="error",
                    title=f"{flow_name} execution failed",
                    description=clean_text(result_text or ((artifacts[0] or {}).get("body") if artifacts else "") or "The execution run failed and requires review before it is retried."),
                    source="ai_run",
                    source_id=run_id,
                    severity="high",
                    created_at=_signal_created_at(run.get("updated_at"), run.get("created_at")),
                    module="flows",
                    entity_id=flow_id or run_id,
                    metadata={
                        "runId": run_id,
                        "flowId": flow_id or None,
                        "flowName": flow_name,
                        "agent": run.get("executing_agent") or run.get("agent_role"),
                        "status": status,
                        "result": result_text or None,
                    },
                    actions=actions,
                ),
            )
            continue

        if status in {"completed", "success"} and (result_text or artifacts):
            primary_actions = []
            if thread_id:
                primary_actions.append(_signal_action("Open Comms", "open_comms", {"threadId": thread_id}))
            primary_actions.append(_signal_view_detail("ai_run", run_id))
            _append_signal(
                signals,
                seen,
                _signal_record(
                    signal_id=f"signal-ai-result-{run_id}",
                    signal_type="opportunity",
                    title=f"{flow_name} result ready",
                    description=clean_text(result_text or ((artifacts[0] or {}).get("body") if artifacts else "") or "Execution completed with output ready for review."),
                    source="ai_run",
                    source_id=run_id,
                    severity="medium",
                    created_at=_signal_created_at(run.get("updated_at"), run.get("created_at")),
                    module="flows",
                    entity_id=flow_id or run_id,
                    metadata={
                        "runId": run_id,
                        "flowId": flow_id or None,
                        "flowName": flow_name,
                        "threadId": thread_id or None,
                        "artifactCount": len(artifacts),
                    },
                    actions=primary_actions,
                ),
            )
    return signals


def _build_verification_signals() -> list[dict[str, Any]]:
    lister = getattr(provider, "list_email_verification_tasks", None)
    if not lister:
        return []
    tasks = lister(limit=40) or []
    signals: list[dict[str, Any]] = []
    seen: set[str] = set()
    for task in tasks:
        if not isinstance(task, dict):
            continue
        task_id = str(task.get("id") or "").strip()
        if not task_id:
            continue
        status = str(task.get("status") or "").strip().lower()
        targets = task.get("targets") if isinstance(task.get("targets"), list) else []
        contact_ids = [str(item.get("contact_id") or item.get("contactId") or "").strip() for item in targets if str(item.get("contact_id") or item.get("contactId") or "").strip()]
        emails = [str(item.get("email") or "").strip() for item in targets if str(item.get("email") or "").strip()]
        last_error = clean_text(task.get("last_error") or task.get("lastError"))
        actions = []
        if status == "failed" and (contact_ids or emails):
            actions.append(
                _signal_action(
                    "Retry Verification",
                    "retry",
                    {
                        "retryType": "verification_bulk",
                        "mode": str(task.get("mode") or "power").strip() or "power",
                        "contactIds": contact_ids,
                        "emails": emails,
                    },
                )
            )
        if "not configured" in last_error.lower() or "api key" in last_error.lower():
            actions.append(_signal_action("Fix Config", "fix_config", {"integrationCategory": "email", "providerKey": "reoon-email-verification"}))
        actions.append(_signal_view_detail("verification", task_id))

        if status == "failed":
            _append_signal(
                signals,
                seen,
                _signal_record(
                    signal_id=f"signal-verification-failed-{task_id}",
                    signal_type="validation",
                    title="Email verification failed",
                    description=last_error or "A bulk email verification task failed before completion.",
                    source="verification",
                    source_id=task_id,
                    severity="high",
                    created_at=_signal_created_at(task.get("updatedAt"), task.get("createdAt")),
                    module="crm",
                    entity_id=task_id,
                    metadata={
                        "taskId": task_id,
                        "mode": task.get("mode"),
                        "submittedCount": task.get("submitted_count") or task.get("submittedCount") or 0,
                        "completedCount": task.get("completed_count") or task.get("completedCount") or 0,
                    },
                    actions=actions,
                ),
            )
    return signals


def _build_media_signals() -> list[dict[str, Any]]:
    try:
        engine = get_media_engine()
        job_groups = [
            ("render", engine.list_render_jobs(), "Render"),
            ("transcript", engine.list_transcript_jobs(), "Transcript"),
            ("script", engine.list_script_jobs(), "Script"),
            ("runOfShow", engine.list_run_of_show_jobs(), "Run of Show"),
            ("audioRender", engine.list_audio_render_jobs(), "Audio Render"),
            ("publish", engine.list_publish_jobs(), "Publish"),
        ]
    except Exception:
        return []

    signals: list[dict[str, Any]] = []
    seen: set[str] = set()
    for job_type, jobs, label in job_groups:
        for job in jobs or []:
            if not isinstance(job, dict):
                continue
            job_id = str(job.get("id") or "").strip()
            if not job_id:
                continue
            status = str(job.get("status") or "").strip().lower()
            created_at = _signal_created_at(job.get("completed_at"), job.get("updated_at"), job.get("created_at"))
            metadata = {
                "jobId": job_id,
                "jobType": job_type,
                "provider": job.get("provider"),
                "status": status,
                "artifactId": job.get("artifact_id") or job.get("artifactId"),
                "outputAssetIds": clone_json(job.get("output_asset_ids") or job.get("outputAssetIds") or []),
                "lastError": clean_text(job.get("last_error") or job.get("lastError")) or None,
            }
            actions = _media_signal_actions(job_type, job)
            if status == "failed":
                _append_signal(
                    signals,
                    seen,
                    _signal_record(
                        signal_id=f"signal-studio-failed-{job_id}",
                        signal_type="error",
                        title=f"{label} job failed",
                        description=clean_text(job.get("last_error") or job.get("lastError") or f"The {label.lower()} job failed before output was produced."),
                        source="studio",
                        source_id=job_id,
                        severity="high",
                        created_at=created_at,
                        module="studio",
                        entity_id=job_id,
                        metadata=metadata,
                        actions=actions,
                    ),
                )
                continue
            has_output = bool(metadata["artifactId"] or metadata["outputAssetIds"])
            if status == "complete" and has_output:
                _append_signal(
                    signals,
                    seen,
                    _signal_record(
                        signal_id=f"signal-studio-ready-{job_id}",
                        signal_type="opportunity",
                        title=f"{label} output ready",
                        description=f"The {label.lower()} job completed successfully and output is ready for review or use.",
                        source="studio",
                        source_id=job_id,
                        severity="medium",
                        created_at=created_at,
                        module="studio",
                        entity_id=job_id,
                        metadata=metadata,
                        actions=actions,
                    ),
                )
    return signals


def _build_integration_signals(token: str, tenant_id: str) -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    seen: set[str] = set()

    def append_config_signal(
        *,
        source: str,
        source_id: str,
        provider_key: str | None,
        category: str,
        title: str,
        description: str,
        severity: str = "high",
        created_at: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        _append_signal(
            signals,
            seen,
            _signal_record(
                signal_id=f"signal-{source}-{source_id}",
                signal_type="system",
                title=title,
                description=description,
                source=source,
                source_id=source_id,
                severity=severity,
                created_at=_signal_created_at(created_at),
                module="integrations",
                entity_id=source_id,
                metadata=metadata,
                actions=_integration_issue_actions(category, provider_key, source, source_id),
            ),
        )

    try:
        for config in auth_store.list_ai_provider_configs(token, tenant_id):
            status = str(config.get("status") or "").strip().lower()
            if status in {"error", "disconnected", "needs_config"} or (config.get("enabled") and clean_text(config.get("lastError"))):
                append_config_signal(
                    source="integration",
                    source_id=str(config.get("id") or config.get("providerKey") or "").strip(),
                    provider_key=str(config.get("providerKey") or "").strip() or None,
                    category="llms",
                    title=f"{config.get('label') or config.get('providerKey') or 'LLM provider'} needs attention",
                    description=clean_text(config.get("lastError") or f"The {config.get('label') or config.get('providerKey') or 'selected'} LLM provider is not healthy."),
                    created_at=config.get("updatedAt"),
                    metadata={"providerKey": config.get("providerKey"), "status": config.get("status")},
                )
    except Exception:
        pass

    try:
        for config in auth_store.list_automation_provider_configs(token, tenant_id):
            status = str(config.get("status") or "").strip().lower()
            if status in {"error", "disconnected", "needs_config"} or (config.get("enabled") and clean_text(config.get("lastError"))):
                append_config_signal(
                    source="integration",
                    source_id=str(config.get("id") or config.get("providerKey") or "").strip(),
                    provider_key=str(config.get("providerKey") or "").strip() or None,
                    category="automation",
                    title=f"{config.get('label') or config.get('providerKey') or 'Automation provider'} needs attention",
                    description=clean_text(config.get("lastError") or "Automation provider connectivity needs correction."),
                    created_at=config.get("updatedAt"),
                    metadata={"providerKey": config.get("providerKey"), "status": config.get("status")},
                )
    except Exception:
        pass

    return signals


def _build_comms_signals() -> list[dict[str, Any]]:
    signals: list[dict[str, Any]] = []
    seen: set[str] = set()
    try:
        from backend.comms_service import check_opt_out, list_call_sessions, list_sms_threads
    except ImportError:
        return signals

    try:
        threads = list_sms_threads(limit=100) or []
        sessions = list_call_sessions(limit=100) or []
        opt_outs = set()
        for thread in threads:
            if not isinstance(thread, dict):
                continue
            phone = thread.get("phoneNumber") or thread.get("phone_number")
            if not phone:
                continue
            opt_check = check_opt_out(phone)
            if opt_check.get("opted_out"):
                keyword = opt_check.get("keyword", "UNKNOWN")
                if phone not in opt_outs:
                    opt_outs.add(phone)
                    _append_signal(
                        signals,
                        seen,
                        _signal_record(
                            signal_id=f"signal-comms-optout-{phone}",
                            signal_type="compliance",
                            title="SMS opt-out detected",
                            description=f"Phone number {phone} has opted out of SMS (keyword: {keyword}).",
                            source="comms",
                            source_id=f"optout-{phone}",
                            severity="medium",
                            created_at=utcnow_iso(),
                            module="sms-voip",
                            entity_id=phone,
                            metadata={"phoneNumber": phone, "keyword": keyword},
                            actions=[_signal_view_detail("comms", f"optout-{phone}")],
                        ),
                    )

        for session in sessions:
            if not isinstance(session, dict):
                continue
            call_id = str(session.get("id") or "").strip()
            if not call_id:
                continue
            status = str(session.get("status") or "").strip().lower()
            if status == "failed":
                _append_signal(
                    signals,
                    seen,
                    _signal_record(
                        signal_id=f"signal-comms-call-failed-{call_id}",
                        signal_type="call",
                        title="Call session failed",
                        description=f"A call session failed: {session.get('disposition') or 'unknown error'}.",
                        source="comms",
                        source_id=call_id,
                        severity="high",
                        created_at=session.get("updatedAt") or session.get("createdAt") or utcnow_iso(),
                        module="sms-voip",
                        entity_id=call_id,
                        metadata={"callId": call_id, "disposition": session.get("disposition")},
                        actions=[_signal_view_detail("comms", call_id)],
                    ),
                )
    except Exception:
        pass

    return signals


def _build_system_signals(token: str, session: dict[str, Any]) -> list[dict[str, Any]]:
    health = build_system_health(
        token=token,
        session=session,
        auth_store=auth_store,
        provider=provider,
    )
    alerts = health.get("alerts") if isinstance(health.get("alerts"), list) else []
    signals: list[dict[str, Any]] = []
    seen: set[str] = set()
    supported_alert_types = {"config_issue", "deployment_failure", "inactive_flow", "booking_trigger_failure"}
    for alert in alerts:
        if not isinstance(alert, dict):
            continue
        alert_type = str(alert.get("type") or "").strip().lower()
        if alert_type not in supported_alert_types:
            continue
        source_id = str(alert.get("id") or alert.get("entityId") or "").strip()
        navigation_target = alert.get("navigationTarget") if isinstance(alert.get("navigationTarget"), dict) else {}
        actions = [_signal_view_detail("system", source_id or alert_type)]
        _append_signal(
            signals,
            seen,
            _signal_record(
                signal_id=f"signal-system-{source_id or alert_type}",
                signal_type="system",
                title=clean_text(alert.get("title") or "System alert"),
                description=clean_text(alert.get("message") or alert.get("suggestedAction") or "System state requires operator review."),
                source="system",
                source_id=source_id or alert_type,
                severity=_signal_severity(alert.get("severity"), default="high"),
                created_at=_signal_created_at(alert.get("timestamp")),
                module=str(navigation_target.get("module") or "signals"),
                entity_id=str(alert.get("entityId") or "").strip() or None,
                metadata={
                    "alertType": alert_type,
                    "entityType": alert.get("entityType"),
                    "suggestedAction": alert.get("suggestedAction"),
                },
                actions=actions,
            ),
        )
    return signals


def _build_actionable_signals(token: str, session: dict[str, Any]) -> list[dict[str, Any]]:
    tenant_id = str((session.get("tenant") or {}).get("id") or "").strip()
    dismissed_ids = auth_store.get_dismissed_signal_ids(tenant_id)
    aggregated = [
        *_build_ai_run_signals(),
        *_build_verification_signals(),
        *_build_media_signals(),
        *_build_comms_signals(),
        *_build_integration_signals(token, tenant_id),
        *_build_system_signals(token, session),
    ]
    aggregated = [s for s in aggregated if s.get("id") not in dismissed_ids]
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    aggregated.sort(key=lambda signal: str(signal.get("createdAt") or ""), reverse=True)
    aggregated.sort(key=lambda signal: severity_order.get(str(signal.get("severity") or "low").lower(), 4))
    return aggregated


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/api/signals")
async def list_actionable_signals(request: Request):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can view signals.")
    token = extract_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        return {"data": _build_actionable_signals(token, session)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/signals/{signal_id}/dismiss")
async def dismiss_signal(request: Request, signal_id: str):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can dismiss signals.")
    tenant_id = session.get("tenant", {}).get("id")
    auth_store.dismiss_signal(tenant_id, signal_id)
    return {"data": {"status": "dismissed", "signalId": signal_id}}


@router.post("/api/signals/archive")
async def archive_signals(request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can archive signals.")
    return {"data": {"status": "archived"}}


@router.post("/api/signals/execute")
async def execute_signal(request: Request, payload: SignalExecuteRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can execute signals.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    tenant_id = str(tenant.get("id") or "").strip()
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")

    signal_type = payload.signalType
    action = payload.action
    target = payload.target
    signal_input = payload.input
    incoming_context = payload.context or {}

    resolved_context = {
        **incoming_context,
        "signal": {
            "type": signal_type,
            "triggeredAt": utcnow_iso(),
            "source": "signal",
        },
    }

    result = None
    run_id = None
    status = "success"

    try:
        if action == "agent":
            if not target:
                raise ValueError("Agent target is required for agent action")
            resolved_context["source"] = "signal"
            resolved_context["signalType"] = signal_type
            command_text = str(signal_input) if signal_input else f"Process signal: {signal_type}"

            from backend.ai_service import ai_assist_service
            run_result = ai_assist_service.run_assist(
                command=command_text,
                agent=target,
                context=resolved_context,
                token=token,
                session=session,
                auth_store=auth_store,
                provider=provider,
            )
            result = run_result.get("result") or run_result
            run_id = run_result.get("runId") or run_result.get("run", {}).get("id")

        elif action == "flow":
            if not target:
                raise ValueError("Flow ID is required for flow action")
            flow = provider.get_flow(target)
            if not flow:
                raise ValueError(f"Flow not found: {target}")
            if flow.get("status") != "Active":
                raise ValueError(f"Flow is not active: {target}")

            from backend.orchestration import ExecutionEngine
            engine = ExecutionEngine(provider, auth_store)
            run_result = engine.run_flow(
                flow_id=target,
                trigger_type="signal_trigger",
                context=resolved_context,
                token=token,
            )
            result = run_result
            run_id = run_result.get("runId") or run_result.get("id")

        elif action == "command":
            resolved_context["source"] = "signal"
            resolved_context["signalType"] = signal_type
            command_text = str(signal_input) if signal_input else f"Process signal: {signal_type}"

            from backend.ai_service import ai_assist_service
            run_result = ai_assist_service.run_assist(
                command=command_text,
                agent=None,
                context=resolved_context,
                token=token,
                session=session,
                auth_store=auth_store,
                provider=provider,
            )
            result = run_result.get("result") or run_result
            run_id = run_result.get("runId") or run_result.get("run", {}).get("id")

        else:
            raise ValueError(f"Unknown action: {action}. Must be 'agent', 'flow', or 'command'")

    except Exception as e:
        status = "error"
        result = {"error": str(e)}

    return {
        "status": status,
        "signalType": signal_type,
        "action": action,
        "target": target,
        "runId": run_id,
        "result": result,
    }
