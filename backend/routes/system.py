"""
AIO Nexus — System, Settings & Health Router
Decomposed from server.py monolith into clean modular domain router.
Provides:
- Health check & system diagnostics (/api/health, /api/system/health)
- Turnkey blueprint deployment & tenant provisioning (/api/blueprints, /api/tenants/deploy)
- Settings variables, system email templates, and canonical settings (/api/settings/*)
- Blueprint export and import (/api/settings/blueprint/*)
- Help desk tickets & broadcasts (/api/help/*)
- Omega failsafe & protocol governance (/api/omega/*)
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.deps import (
    auth_store,
    extract_session_token,
    provider,
    require_capability,
    require_operator,
    require_session,
    utcnow_iso,
)

logger = logging.getLogger("aio-nexus-system")

router = APIRouter(tags=["System & Settings"])

try:
    from backend.agent_definitions import AGENT_DEFINITIONS
    from backend.auth_store import AuthStore, default_auth_db_path
    from backend.data_provider import create_provider
    from backend.system_health import build_system_health
    from backend.tenant_deployment import DeploymentFailureError
except ModuleNotFoundError:
    from agent_definitions import AGENT_DEFINITIONS
    from auth_store import AuthStore, default_auth_db_path
    from data_provider import create_provider
    from system_health import build_system_health
    from tenant_deployment import DeploymentFailureError


# ── Pydantic Request Models ─────────────────────────────────────────────────

class TenantDeployRequest(BaseModel):
    tenantName: str
    blueprintId: Optional[str] = None
    blueprintPayload: Optional[dict[str, Any]] = None
    overrides: Optional[dict[str, Any]] = None
    switchToTenant: bool = False


class GlobalVariableUpsertRequest(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    isSecret: bool = False
    isSystem: bool = False
    label: Optional[str] = None
    category: Optional[str] = None
    editableByClient: bool = True


class CanonicalSettingsUpdateRequest(BaseModel):
    settings: dict[str, Any]


class TenantBlueprintImportRequest(BaseModel):
    blueprint: dict[str, Any]


class SystemEmailTemplateUpdateRequest(BaseModel):
    subject: Optional[str] = None
    sendTo: Optional[str] = None
    enabled: Optional[bool] = None
    bodyHtml: Optional[str] = None
    bodyText: Optional[str] = None
    config: Optional[dict[str, Any]] = None


class HelpTicketCreateRequest(BaseModel):
    subject: str
    content: Optional[str] = None
    priority: str = "normal"
    category: str = "general"


class HelpTicketUpdateRequest(BaseModel):
    subject: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None


class BroadcastMessageCreateRequest(BaseModel):
    type: str = "info"
    message: str
    is_active: int = 1
    expires_at: Optional[str] = None


class OmegaArmRequest(BaseModel):
    confirmationCode: str
    cancelCode: str


class OmegaCancelRequest(BaseModel):
    cancelCode: str


class OmegaExecuteRequest(BaseModel):
    confirmationCode: str


# ── Omega Helpers ───────────────────────────────────────────────────────────

def omega_local_data_paths() -> list[Path]:
    paths: dict[str, Path] = {}
    for candidate in [getattr(auth_store, "db_path", None), getattr(provider, "db_path", None)]:
        if not candidate:
            continue
        base_path = Path(candidate)
        for resolved in [
            base_path,
            Path(f"{base_path}-wal"),
            Path(f"{base_path}-shm"),
        ]:
            paths[str(resolved)] = resolved
    return list(paths.values())


def purge_local_app_data() -> list[str]:
    removed_paths: list[str] = []
    for path in omega_local_data_paths():
        if path.exists():
            path.unlink()
            removed_paths.append(str(path))
    return removed_paths


# ── Health & Diagnostics ────────────────────────────────────────────────────

@router.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "message": "AIO Nexus Backend is running",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0",
        "environment": os.getenv("APP_ENV", "production"),
        "data_provider": asdict(provider.get_status()) if hasattr(provider, "get_status") else None,
        "tenant_id": "tenant-primary",
        "debug_agent_count": len(AGENT_DEFINITIONS),
        "appliance": {
            "mode": "local_first",
            "cloud_agnostic": True,
            "zero_cloud_rent": True,
        },
    }


@router.get("/api/")
async def root():
    return {
        "message": "AIO Nexus",
        "version": "2.0.0",
        "status": "online",
    }


@router.get("/api/system/health")
async def get_system_health(request: Request):
    session = require_operator(request, "Only operators can view system health.")
    require_capability(request, "system.view", "Only workspace members can view system health.")
    token = extract_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        return build_system_health(
            token=token,
            session=session,
            auth_store=auth_store,
            provider=provider,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ── Blueprints & Deployments ────────────────────────────────────────────────

@router.get("/api/blueprints")
async def list_blueprints(request: Request):
    require_capability(request, "system.view", "Only workspace members can view blueprints.")
    try:
        return {"data": auth_store.list_blueprints()}
    except DeploymentFailureError as error:
        raise HTTPException(status_code=400, detail=error.payload) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/tenants/deploy")
async def deploy_tenant(request: Request, payload: TenantDeployRequest):
    require_capability(request, "system.admin", "Only workspace admins can deploy tenants.")
    token = extract_session_token(request)
    try:
        deployment = auth_store.deploy_tenant(
            token,
            payload.tenantName,
            blueprint_id=payload.blueprintId,
            blueprint_payload=payload.blueprintPayload,
            overrides=payload.overrides,
            switch_to_tenant=payload.switchToTenant,
        )
        return {"data": deployment}
    except DeploymentFailureError as error:
        raise HTTPException(status_code=400, detail=error.payload) from error
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.get("/api/tenants/{tenant_id}/deployment")
async def get_tenant_deployment(tenant_id: str, request: Request):
    token = extract_session_token(request)
    try:
        return {"data": auth_store.get_tenant_deployment(token, tenant_id)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


# ── Global Variables & System Emails ────────────────────────────────────────

@router.get("/api/settings/variables")
async def list_setting_variables(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view variables.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_global_variables(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/settings/variables")
async def upsert_setting_variable(request: Request, payload: GlobalVariableUpsertRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can manage variables.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.upsert_global_variable(token, tenant_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/settings/variables/{variable_id}")
async def delete_setting_variable(variable_id: str, request: Request):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can manage variables.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_global_variable(token, tenant_id, variable_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/settings/system-emails")
async def list_setting_system_emails(request: Request, search: Optional[str] = None):
    session = require_capability(request, "system.view", "Only workspace members can view system emails.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_system_email_templates(token, tenant_id, search=search)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/settings/system-emails/{template_id}")
async def update_setting_system_email(template_id: str, request: Request, payload: SystemEmailTemplateUpdateRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can manage system emails.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.update_system_email_template(token, tenant_id, template_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# ── Canonical Settings ───────────────────────────────────────────────────────

@router.get("/api/settings/canonical")
async def get_canonical_settings(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view settings.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    user_id = (session.get("user") or {}).get("id")
    try:
        return {"data": auth_store.get_canonical_settings_bundle(token, tenant_id, user_id=user_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/settings/canonical/tenant")
async def update_canonical_tenant_settings(request: Request, payload: CanonicalSettingsUpdateRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can manage tenant settings.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        updated = auth_store.update_tenant_settings(token, tenant_id, payload.settings)
        return {"data": updated}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.patch("/api/settings/canonical/user")
async def update_canonical_user_settings(request: Request, payload: CanonicalSettingsUpdateRequest):
    require_capability(request, "system.view", "Only signed-in users can update user settings.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.update_user_settings(token, payload.settings)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.get("/api/settings/blueprint/export")
async def export_tenant_blueprint_api(request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can export tenant blueprints.")
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.export_tenant_blueprint(tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/settings/blueprint/import")
async def import_tenant_blueprint_api(request: Request, payload: TenantBlueprintImportRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can import tenant blueprints.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        updated = auth_store.import_tenant_blueprint(token, tenant_id, payload.blueprint)
        return {"data": updated}
    except DeploymentFailureError as error:
        raise HTTPException(status_code=400, detail=error.payload) from error
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


# ── Help Desk & Broadcasts ──────────────────────────────────────────────────

@router.get("/api/help/tickets")
async def list_help_tickets(request: Request):
    session = require_session(request)
    user_id = (session.get("user") or {}).get("id")
    return {"data": provider.list_help_tickets(user_id=user_id)}


@router.post("/api/help/tickets")
async def create_help_ticket(request: Request, payload: HelpTicketCreateRequest):
    session = require_session(request)
    user_id = (session.get("user") or {}).get("id")
    ticket_data = {**payload.model_dump(), "user_id": user_id}
    ticket = provider.create_help_ticket(ticket_data)

    try:
        provider.create_brain_item({
            "title": f"Support Ticket: {payload.subject}",
            "content": f"Category: {payload.category}\nPriority: {payload.priority}\n\n{payload.content}",
            "category": "support_audit",
            "source": "helpdesk",
            "active": True,
        })
    except Exception as e:
        logger.error(f"Brain logging failed for ticket {ticket.get('id')}: {e}")

    category = (payload.category or "general").lower()
    routing_map = {
        "technical": "GHOST",
        "billing": "BRAVO",
        "feature": "HAMMER",
        "general": "CHARLIE",
    }
    assigned_agent = routing_map.get(category, "DELTA")
    ticket["assigned_agent"] = assigned_agent
    return {"data": ticket}


@router.patch("/api/help/tickets/{ticket_id}")
async def update_help_ticket(request: Request, ticket_id: str, payload: HelpTicketUpdateRequest):
    require_capability(request, "system.admin", "Only admins can update tickets.")
    ticket = provider.update_help_ticket(ticket_id, payload.model_dump(exclude_unset=True))
    return {"data": ticket}


@router.get("/api/help/broadcasts")
async def list_help_broadcasts(request: Request):
    return {"data": provider.list_broadcast_messages()}


@router.post("/api/help/broadcasts")
async def create_help_broadcast(request: Request, payload: BroadcastMessageCreateRequest):
    require_capability(request, "system.admin", "Only admins can create broadcasts.")
    broadcast = provider.create_broadcast_message(payload.model_dump())
    return {"data": broadcast}


# ── Omega Protocol Failsafe ──────────────────────────────────────────────────

@router.get("/api/omega/status")
async def omega_status(request: Request, limit: int = 12):
    session = require_capability(request, "system.omega", "Only workspace owners can access Omega controls.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.get_omega_protocol(token, tenant.get("id"))
        events = auth_store.list_omega_protocol_events(token, tenant.get("id"), limit=limit)
        return {"data": {"protocol": protocol, "events": events}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/omega/arm")
async def omega_arm(request: Request, payload: OmegaArmRequest):
    session = require_capability(request, "system.omega", "Only workspace owners can arm Omega.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.arm_omega_protocol(
            token,
            tenant.get("id"),
            payload.confirmationCode,
            payload.cancelCode,
            delay_minutes=5,
        )
        events = auth_store.list_omega_protocol_events(token, tenant.get("id"), limit=12)
        return {"data": {"protocol": protocol, "events": events}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/omega/cancel")
async def omega_cancel(request: Request, payload: OmegaCancelRequest):
    session = require_capability(request, "system.omega", "Only workspace owners can cancel Omega.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.cancel_omega_protocol(token, tenant.get("id"), payload.cancelCode)
        events = auth_store.list_omega_protocol_events(token, tenant.get("id"), limit=12)
        return {"data": {"protocol": protocol, "events": events}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/omega/execute")
async def omega_execute(request: Request, payload: OmegaExecuteRequest):
    session = require_capability(request, "system.omega", "Only workspace owners can execute Omega.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.verify_omega_execution(token, tenant.get("id"), payload.confirmationCode)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    removed_paths = purge_local_app_data()
    logger.warning(
        "OMEGA EXECUTED for tenant %s by user %s. Removed paths: %s",
        tenant.get("id"),
        protocol.get("verified_by_user_id"),
        removed_paths,
    )
    return {
        "data": {
            "status": "executed",
            "bootstrap_required": True,
            "removed_paths": removed_paths,
        }
    }


# ── Storage Location & Data Relocation Endpoints ───────────────────────────

class StorageRelocateRequest(BaseModel):
    newPath: str
    moveExisting: bool = True


@router.get("/api/system/storage-config")
async def get_storage_configuration(request: Request):
    require_session(request)
    try:
        from backend.storage_config import get_storage_info
        return {"data": get_storage_info()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to inspect storage: {e}")


@router.post("/api/system/storage-relocate")
async def relocate_storage_configuration(request: Request, payload: StorageRelocateRequest):
    require_operator(request)
    if not payload.newPath or not payload.newPath.strip():
        raise HTTPException(status_code=400, detail="Target storage path is required.")
    try:
        from backend.storage_config import relocate_storage
        result = relocate_storage(payload.newPath, move_existing=payload.moveExisting)
        return {"data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
