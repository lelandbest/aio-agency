from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

try:
    from backend.canonical_settings import validate_against_schema
except ModuleNotFoundError:
    from canonical_settings import validate_against_schema


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _now() -> datetime:
    return datetime.now(UTC)


def _run_status(raw_run: dict[str, Any]) -> str:
    status = str(raw_run.get("status") or "").strip().lower()
    if status in {"error", "failed", "failure"}:
        return "error"
    steps = raw_run.get("steps") if isinstance(raw_run.get("steps"), list) else []
    for step in reversed(steps):
        if not isinstance(step, dict):
            continue
        if str(step.get("status") or "").strip().lower() == "error":
            return "error"
    return "completed"


def _extract_run_error(raw_run: dict[str, Any]) -> str:
    steps = raw_run.get("steps") if isinstance(raw_run.get("steps"), list) else []
    for step in reversed(steps):
        if not isinstance(step, dict):
            continue
        if str(step.get("status") or "").strip().lower() != "error":
            continue
        direct = str(step.get("error") or "").strip()
        if direct:
            return direct
        data = step.get("data") if isinstance(step.get("data"), dict) else {}
        nested = str(data.get("error") or data.get("message") or "").strip()
        if nested:
            return nested
    return str(raw_run.get("result") or "").strip()


def _error_class(message: str | None) -> str:
    text = str(message or "").strip().lower()
    if not text:
        return "unknown_error"
    normalized = " ".join(text.split())
    normalized = normalized.replace("'", "").replace('"', "")
    for marker in [":", ";", "\n", " (", ","]:
        if marker in normalized:
            normalized = normalized.split(marker, 1)[0]
    return normalized[:80] or "unknown_error"


def _run_context(raw_run: dict[str, Any]) -> dict[str, Any]:
    return raw_run.get("context") if isinstance(raw_run.get("context"), dict) else {}


def _run_flow_id(raw_run: dict[str, Any]) -> str | None:
    context = _run_context(raw_run)
    flow = context.get("flow") if isinstance(context.get("flow"), dict) else {}
    value = context.get("flow_id") or context.get("flowId") or flow.get("id")
    text = str(value or "").strip()
    return text or None


def _run_flow_name(raw_run: dict[str, Any]) -> str | None:
    context = _run_context(raw_run)
    flow = context.get("flow") if isinstance(context.get("flow"), dict) else {}
    value = context.get("flow_name") or context.get("flowName") or flow.get("name")
    text = str(value or "").strip()
    return text or None


def _run_trigger_event(raw_run: dict[str, Any]) -> str | None:
    context = _run_context(raw_run)
    trigger = context.get("trigger_event") if isinstance(context.get("trigger_event"), dict) else {}
    value = trigger.get("type") or context.get("_system_event_type")
    text = str(value or "").strip()
    return text or None


def _flow_triggers(flow: dict[str, Any]) -> list[str]:
    triggers: list[str] = []
    for node in flow.get("nodes") if isinstance(flow.get("nodes"), list) else []:
        if str(node.get("type") or "").strip().lower() != "trigger":
            continue
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        config = data.get("config") if isinstance(data.get("config"), dict) else {}
        for candidate in [config.get("event"), data.get("templateId"), data.get("id"), data.get("label"), node.get("id")]:
            normalized = str(candidate or "").strip().lower().replace("-", "_").replace(" ", "_")
            if normalized and normalized not in triggers:
                triggers.append(normalized)
    return triggers


def _alert(
    *,
    alert_id: str,
    severity: str,
    alert_type: str,
    title: str,
    message: str,
    entity_id: str | None,
    entity_type: str,
    timestamp: str | None,
    suggested_action: str,
    navigation_target: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = {
        "id": alert_id,
        "severity": severity,
        "type": alert_type,
        "title": title,
        "message": message,
        "entityId": entity_id,
        "entityType": entity_type,
        "timestamp": timestamp,
        "suggestedAction": suggested_action,
    }
    if navigation_target:
        payload["navigationTarget"] = navigation_target
    return payload


def build_system_health(
    *,
    token: str,
    session: dict[str, Any],
    auth_store: Any,
    provider: Any,
) -> dict[str, Any]:
    tenant = session.get("tenant") if isinstance(session.get("tenant"), dict) else {}
    tenant_id = str(tenant.get("id") or "").strip()
    if not tenant_id:
        raise ValueError("Active workspace is required.")

    now = _now()
    day_ago = now - timedelta(hours=24)
    week_ago = now - timedelta(days=7)

    bundle = auth_store.get_canonical_settings_bundle(token, tenant_id, user_id=(session.get("user") or {}).get("id"))
    validation_ok, validation_errors = validate_against_schema(
        "tenant-settings",
        {
            "system": bundle.get("systemSettings") or {},
            "tenant": bundle.get("tenantSettings") or {},
            "user": bundle.get("userSettings") or {},
            "fieldPolicies": bundle.get("fieldPolicies") or {},
        },
    )

    flows = provider.list_flows() if getattr(provider, "list_flows", None) else []
    raw_runs = provider.list_ai_runs(limit=200) if getattr(provider, "list_ai_runs", None) else []
    deployments = auth_store.list_tenant_deployments(token, tenant_id, limit=50)

    failed_runs_24h: list[dict[str, Any]] = []
    booking_failures_24h: list[dict[str, Any]] = []
    flow_failure_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    flow_index: dict[str, dict[str, Any]] = {}
    inactive_expected_flows: list[dict[str, Any]] = []
    alerts: list[dict[str, Any]] = []

    for flow in flows or []:
        if not isinstance(flow, dict):
            continue
        flow_id = str(flow.get("id") or "").strip()
        if flow_id:
            flow_index[flow_id] = flow
        metadata = flow.get("metadata") if isinstance(flow.get("metadata"), dict) else {}
        if metadata.get("deploymentManaged") and str(flow.get("status") or "").strip().lower() != "active":
            inactive_expected_flows.append(flow)

    for raw_run in raw_runs or []:
        if not isinstance(raw_run, dict):
            continue
        created_at = _parse_iso(raw_run.get("created_at"))
        if not created_at or created_at < day_ago:
            continue
        if _run_status(raw_run) != "error":
            continue
        flow_id = _run_flow_id(raw_run) or f"run:{raw_run.get('id')}"
        run_record = {
            "id": raw_run.get("id"),
            "flowId": _run_flow_id(raw_run),
            "flowName": _run_flow_name(raw_run),
            "triggerEvent": _run_trigger_event(raw_run),
            "error": _extract_run_error(raw_run) or "Execution failed without a structured error message.",
            "timestamp": raw_run.get("created_at"),
        }
        failed_runs_24h.append(run_record)
        flow_failure_groups[(flow_id, _error_class(run_record["error"]))].append(run_record)
        if str(run_record.get("triggerEvent") or "").strip().lower().startswith("booking_"):
            booking_failures_24h.append(run_record)

    repeated_failure_groups = {
        group_key: items
        for group_key, items in flow_failure_groups.items()
        if len(items) >= 2 and items[0].get("flowId")
    }

    failed_deployments_7d = []
    for deployment in deployments or []:
        timestamp = _parse_iso(deployment.get("timestamp"))
        if not timestamp or timestamp < week_ago:
            continue
        if str(deployment.get("status") or "").strip().lower() != "failed":
            continue
        failed_deployments_7d.append(deployment)

    if not validation_ok:
        alerts.append(
            _alert(
                alert_id="config-invalid-canonical-settings",
                severity="critical",
                alert_type="config_issue",
                title="Canonical settings validation failed",
                message="Canonical settings no longer satisfy the tenant settings schema.",
                entity_id=tenant_id,
                entity_type="settings",
                timestamp=now.isoformat(),
                suggested_action="Review canonical tenant settings and correct the invalid sections before further changes.",
                navigation_target={"module": "settings"},
            )
        )

    for flow in inactive_expected_flows[:5]:
        flow_id = str(flow.get("id") or "").strip() or None
        alerts.append(
            _alert(
                alert_id=f"inactive-flow-{flow_id or 'unknown'}",
                severity="warning",
                alert_type="inactive_flow",
                title=f"Expected flow '{flow.get('name') or flow_id or 'Untitled Flow'}' is inactive",
                message="A deployment-managed flow is not active, so its triggers will not execute.",
                entity_id=flow_id,
                entity_type="flow",
                timestamp=flow.get("updatedAt") or flow.get("updated_at"),
                suggested_action="Open Flows and reactivate the deployment-managed flow if it should still be running.",
                navigation_target={"module": "flows", "flowId": flow_id},
            )
        )

    for (group_id, error_class), items in list(repeated_failure_groups.items())[:5]:
        latest = sorted(items, key=lambda item: str(item.get("timestamp") or ""), reverse=True)[0]
        flow_name = latest.get("flowName") or group_id
        alerts.append(
            _alert(
                alert_id=f"repeated-failure-{group_id}-{error_class}",
                severity="critical",
                alert_type="degraded_flow",
                title=f"Flow '{flow_name}' is failing repeatedly",
                message=f"{len(items)} execution failures with the same error class were recorded for this flow in the last 24 hours.",
                entity_id=latest.get("flowId") or latest.get("id"),
                entity_type="flow",
                timestamp=latest.get("timestamp"),
                suggested_action="Open the flow and inspect recent run history to find the failing node or missing dependency.",
                navigation_target={"module": "flows", "flowId": latest.get("flowId")},
            )
        )

    repeated_run_ids = {item.get("id") for items in repeated_failure_groups.values() for item in items}
    standalone_failure_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for run in failed_runs_24h:
        if run.get("id") in repeated_run_ids:
            continue
        entity_key = str(run.get("flowId") or run.get("triggerEvent") or run.get("id") or "run")
        standalone_failure_groups[(entity_key, _error_class(run.get("error")))].append(run)

    for (entity_key, error_class), items in list(standalone_failure_groups.items())[:5]:
        latest = sorted(items, key=lambda item: str(item.get("timestamp") or ""), reverse=True)[0]
        alerts.append(
            _alert(
                alert_id=f"failed-run-group-{entity_key}-{error_class}",
                severity="warning",
                alert_type="failed_run",
                title=(
                    f"{len(items)} failed execution(s) for {latest.get('flowName') or latest.get('triggerEvent') or latest.get('id')}"
                    if len(items) > 1
                    else f"Execution run {latest.get('id')} failed"
                ),
                message=latest.get("error") or "Execution failed without a structured error message.",
                entity_id=latest.get("flowId") or latest.get("id"),
                entity_type="flow" if latest.get("flowId") else "run",
                timestamp=latest.get("timestamp"),
                suggested_action="Open recent AI activity and review the failing run group before retrying the same path.",
                navigation_target={"module": "aio-agents", "runId": latest.get("id")},
            )
        )

    if booking_failures_24h:
        latest_booking_failure = sorted(booking_failures_24h, key=lambda item: str(item.get("timestamp") or ""), reverse=True)[0]
        alerts.append(
            _alert(
                alert_id=f"booking-trigger-failures-{latest_booking_failure.get('flowId') or latest_booking_failure.get('id')}",
                severity="critical" if len(booking_failures_24h) >= 2 else "warning",
                alert_type="booking_trigger_failure",
                title="Booking-trigger execution failures detected",
                message=f"{len(booking_failures_24h)} booking-related execution failure(s) were recorded in the last 24 hours.",
                entity_id=latest_booking_failure.get("flowId") or latest_booking_failure.get("id"),
                entity_type="flow" if latest_booking_failure.get("flowId") else "run",
                timestamp=latest_booking_failure.get("timestamp"),
                suggested_action="Check the booking trigger flow and the failing booking event payload before new bookings are processed.",
                navigation_target={"module": "calendar"},
            )
        )

    for deployment in failed_deployments_7d[:5]:
        error_payload = deployment.get("error") if isinstance(deployment.get("error"), dict) else {}
        reason = str(error_payload.get("message") or error_payload.get("detail") or error_payload.get("code") or "Deployment failed.").strip()
        alerts.append(
            _alert(
                alert_id=f"deployment-failure-{deployment.get('deploymentId')}",
                severity="critical",
                alert_type="deployment_failure",
                title=f"Deployment {deployment.get('deploymentId')} failed",
                message=reason,
                entity_id=deployment.get("deploymentId"),
                entity_type="deployment",
                timestamp=deployment.get("timestamp"),
                suggested_action="Review the failed deployment validation details before attempting another tenant deployment.",
            )
        )

    severity_order = {"critical": 0, "warning": 1, "info": 2}
    alerts = sorted(
        alerts,
        key=lambda alert: (
            severity_order.get(str(alert.get("severity") or "info").lower(), 3),
            str(alert.get("timestamp") or ""),
        ),
        reverse=False,
    )[:12]

    degraded_flow_ids = {group_id for (group_id, _error_class_name) in repeated_failure_groups.keys()}
    degraded_flow_ids.update(str(flow.get("id") or "") for flow in inactive_expected_flows if flow.get("id"))

    summary = {
        "failedRuns24h": len(failed_runs_24h),
        "degradedFlows": len({item for item in degraded_flow_ids if item}),
        "inactiveExpectedFlows": len(inactive_expected_flows),
        "deploymentFailures7d": len(failed_deployments_7d),
    }

    # Status rules are intentionally explicit:
    # - critical: any critical alert, any invalid canonical settings, or 3+ failed runs in 24h
    # - warning: no critical issue, but at least one actionable warning remains
    # - healthy: no critical or warning alerts were generated from current tenant state
    severities = {str(alert.get("severity") or "").lower() for alert in alerts}
    if not validation_ok or "critical" in severities or summary["failedRuns24h"] >= 3:
        status = "critical"
    elif "warning" in severities:
        status = "warning"
    else:
        status = "healthy"

    response = {
        "status": status,
        "summary": summary,
        "alerts": alerts,
        "generatedAt": now.isoformat(),
    }
    if not validation_ok:
        response["configIntegrity"] = {
            "valid": False,
            "errors": validation_errors,
        }
    return response
