from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from backend.deps import (
    clean_text,
    extract_session_token,
    get_auth_store,
    get_provider,
    require_capability,
    require_session,
    safe_int,
    set_request_tenant_id,
    utcnow_iso,
)
from backend.oauth_connect import (
    backend_base_url,
    build_google_authorize_url,
    exchange_google_code,
    exchange_microsoft_code,
    google_calendar_list,
    google_profile,
    microsoft_calendar_list,
    microsoft_profile,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])

CURRENT_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = CURRENT_DIR.parent
EXPORTS_DIR = REPO_ROOT / "runtime" / "exports"
EXPORTS_DIR.mkdir(parents=True, exist_ok=True)

GOOGLE_APP_AUTH_SCOPE = "openid email profile"
OAUTH_STATE_TTL_SECONDS = 900


# --- Models ---

class AuthBootstrapRequest(BaseModel):
    name: str
    email: str
    password: str


class AuthForgotPasswordRequest(BaseModel):
    email: str


class AuthResetPasswordSubmitRequest(BaseModel):
    token: str
    newPassword: str


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthTenantSwitchRequest(BaseModel):
    tenant_id: str = Field(alias="tenantId")


class ProfileUpdateRequest(BaseModel):
    displayName: str
    phone: str | None = None
    locale: str | None = None
    timezone: str | None = None
    emailSignature: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(alias="currentPassword")
    new_password: str = Field(alias="newPassword")


class WorkspaceCreateRequest(BaseModel):
    name: str


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = None
    settings: dict[str, Any] | None = None


class WorkspaceMemberRequest(BaseModel):
    email: str
    role: str


class WorkspaceMemberUpdateRequest(BaseModel):
    role: str


class WorkspaceRoleCreateRequest(BaseModel):
    name: str
    description: str = ""
    capabilities: list[str] = []


class WorkspaceRoleUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    capabilities: list[str] | None = None


class WorkspaceRoleAssignmentRequest(BaseModel):
    entityType: str
    entityId: str


class WorkspaceUserCreateRequest(BaseModel):
    username: str
    email: str
    password: str
    name: str
    role: str = "staff"
    user_role: str = Field(default="operator", alias="userRole")
    create_workspace: bool = Field(default=False, alias="createWorkspace")
    workspace_name: str | None = Field(default=None, alias="workspaceName")


# --- Helper Functions ---

def oauth_callback_url() -> str:
    return f"{backend_base_url().rstrip('/')}/api/oauth/callback"


def oauth_state_secret() -> bytes:
    auth_store = get_auth_store()
    seed = (
        os.getenv("OAUTH_STATE_SECRET")
        or os.getenv("SECRET_KEY")
        or str(getattr(auth_store, "db_path", "") or "aio-crm-oauth-state")
    )
    return seed.encode("utf-8")


def encode_oauth_state(payload: dict[str, Any]) -> str:
    state_payload = {
        **payload,
        "iat": int(time.time()),
    }
    body_json = json.dumps(state_payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body = base64.urlsafe_b64encode(body_json).decode("ascii").rstrip("=")
    signature = hmac.new(oauth_state_secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def decode_oauth_state(state: str) -> dict[str, Any]:
    try:
        body, signature = str(state or "").split(".", 1)
    except ValueError as error:
        raise ValueError("OAuth state is missing or malformed.") from error
    expected_signature = hmac.new(oauth_state_secret(), body.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected_signature):
        raise ValueError("OAuth state signature is invalid.")
    padded = body + "=" * (-len(body) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception as error:
        raise ValueError("OAuth state payload is invalid.") from error
    issued_at = safe_int(payload.get("iat"))
    if not issued_at or (time.time() - issued_at) > OAUTH_STATE_TTL_SECONDS:
        raise ValueError("OAuth state is expired.")
    return payload


def oauth_success_html(kind: str, resource_id: str, provider_name: str, extra_payload: dict[str, Any] | None = None) -> str:
    payload = {"type": "aio-oauth", "status": "success", "kind": kind, "resourceId": resource_id, "provider": provider_name}
    payload.update(extra_payload or {})
    payload_json = json.dumps(payload)
    return f"""
    <!doctype html>
    <html>
      <body style="font-family: Arial, sans-serif; background:#0f1115; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh;">
        <div style="max-width:420px; text-align:center;">
          <h1 style="margin-bottom:12px;">Connection complete</h1>
          <p style="color:#b0b6c3;">You can close this window and return to AIO CRM.</p>
        </div>
        <script>
          if (window.opener) {{
            window.opener.postMessage({payload_json}, "*");
            window.close();
          }}
        </script>
      </body>
    </html>
    """


def oauth_error_html(message: str) -> str:
    return f"""
    <!doctype html>
    <html>
      <body style="font-family: Arial, sans-serif; background:#0f1115; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh;">
        <div style="max-width:480px; text-align:center;">
          <h1 style="margin-bottom:12px;">Connection failed</h1>
          <p style="color:#ff9f9f;">{message}</p>
        </div>
      </body>
    </html>
    """


def resolve_google_auth_client() -> dict[str, str] | None:
    env_client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    env_client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    if env_client_id and env_client_secret:
        return {"client_id": env_client_id, "client_secret": env_client_secret}

    provider = get_provider()
    for mailbox in provider.list_mailboxes():
        if mailbox.get("provider") != "gmail-oauth":
            continue
        config = mailbox.get("config") or {}
        if config.get("client_id") and config.get("client_secret"):
            return {"client_id": config["client_id"], "client_secret": config["client_secret"]}

    for source in provider.list_calendar_sources():
        if source.get("provider") != "google-calendar-oauth":
            continue
        config = source.get("config") or {}
        if config.get("client_id") and config.get("client_secret"):
            return {"client_id": config["client_id"], "client_secret": config["client_secret"]}

    return None


def _run_export_task(token: str, export_id: str):
    auth_store = get_auth_store()
    try:
        data = auth_store.export_account_data(token)
        file_path = EXPORTS_DIR / f"{export_id}.json"
        with open(file_path, "w") as f:
            json.dump(data, f)
    except Exception as e:
        logger.error(f"Async export {export_id} failed: {e}")


# --- Routes ---

@router.get("/api/auth/status")
async def auth_status():
    auth_store = get_auth_store()
    google_client = resolve_google_auth_client()
    status = auth_store.auth_status()
    return {
        **status,
        "google_oauth_available": bool(google_client),
    }


@router.post("/api/auth/bootstrap")
async def bootstrap_auth(request: Request, payload: AuthBootstrapRequest):
    auth_store = get_auth_store()
    try:
        session = auth_store.bootstrap_owner(payload.name, payload.email, payload.password, user_agent=request.headers.get("user-agent"))
        return {"session": session}
    except ValueError as error:
        detail = str(error)
        status_code = 409 if "already exists" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/auth/forgot-password")
async def forgot_password_auth(payload: AuthForgotPasswordRequest):
    auth_store = get_auth_store()
    email = payload.email.strip().lower()
    logger.info(f"Password recovery requested for: {email}")
    token_info = auth_store.create_password_reset_token(email)
    if token_info:
        logger.info(f"Password reset token created for {email}: {token_info['token']}")
    return {
        "message": "If an account exists with that email, a password reset link has been sent.",
        "resetToken": token_info["token"] if token_info else None,
    }


@router.get("/api/auth/reset-password/validate")
async def validate_reset_token_auth(token: str):
    auth_store = get_auth_store()
    try:
        token_info = auth_store.validate_password_reset_token(token)
        return {"valid": True, "email": token_info["email"]}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/auth/reset-password")
async def reset_password_auth(payload: AuthResetPasswordSubmitRequest):
    auth_store = get_auth_store()
    try:
        auth_store.reset_password_with_token(payload.token, payload.newPassword)
        return {"message": "Password reset successfully. You may now log in with your new password."}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/auth/login")
async def login_auth(request: Request, payload: AuthLoginRequest):
    auth_store = get_auth_store()
    try:
        session = auth_store.login_with_password(payload.email, payload.password, user_agent=request.headers.get("user-agent"))
        return {"session": session}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@router.get("/api/auth/google/authorize")
async def authorize_google_auth():
    google_client = resolve_google_auth_client()
    if not google_client:
        raise HTTPException(status_code=400, detail="Google app sign-in is not configured yet.")

    state = encode_oauth_state({"kind": "auth", "provider": "google-auth"})
    return RedirectResponse(
        build_google_authorize_url(google_client["client_id"], oauth_callback_url(), state, GOOGLE_APP_AUTH_SCOPE)
    )


@router.get("/api/auth/session")
async def current_auth_session(request: Request):
    auth_store = get_auth_store()
    session = getattr(request.state, "session", None)
    if not session:
        token = extract_session_token(request)
        session = auth_store.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found or expired.")
    return {"session": session}


@router.patch("/api/auth/session/tenant")
async def switch_auth_tenant(request: Request, payload: AuthTenantSwitchRequest):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        session = auth_store.switch_session_tenant(token, payload.tenant_id)
        return {"session": session}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/auth/session")
async def delete_auth_session(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    auth_store.logout(token)
    return {"success": True}


@router.get("/api/auth/profile")
async def get_auth_profile(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        return {"data": auth_store.get_profile(token)}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@router.patch("/api/auth/profile")
async def update_auth_profile(request: Request, payload: ProfileUpdateRequest):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        profile = auth_store.update_profile(token, payload.model_dump())
        session = auth_store.get_session(token)
        return {"data": profile, "session": session}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/auth/avatar")
async def upload_avatar(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        payload = await request.json()
        image_data = payload.get("imageData", "")
        mime_type = payload.get("mimeType", "image/png")
        allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
        if mime_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Unsupported image type. Allowed: {', '.join(allowed_types)}")
        data_url = f"data:{mime_type};base64,{image_data}"
        profile = auth_store.update_profile(token, {"avatarUrl": data_url})
        session = auth_store.get_session(token)
        return {"data": profile, "session": session}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/auth/avatar")
async def delete_avatar(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        profile = auth_store.update_profile(token, {"avatarUrl": None})
        session = auth_store.get_session(token)
        return {"data": profile, "session": session}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/auth/password")
async def update_auth_password(request: Request, payload: PasswordChangeRequest):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        auth_store.change_password(token, payload.current_password, payload.new_password)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/auth/export-data")
async def request_auth_export(request: Request, background_tasks: BackgroundTasks):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    session = auth_store.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    user_id = (session.get("user") or {}).get("id") or "sys"
    export_id = f"export-{user_id}-{int(time.time())}"
    
    background_tasks.add_task(_run_export_task, token, export_id)
    return {"data": {"exportId": export_id, "status": "processing"}}


@router.get("/api/auth/export-data/{export_id}/status")
async def get_export_status(export_id: str):
    file_path = EXPORTS_DIR / f"{export_id}.json"
    if file_path.exists():
        return {"data": {"status": "completed"}}
    return {"data": {"status": "processing"}}


@router.get("/api/auth/export-data/{export_id}/download")
async def download_export(export_id: str):
    file_path = EXPORTS_DIR / f"{export_id}.json"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Export not ready.")
    return FileResponse(file_path, filename="aio-account-export.json", media_type="application/json")


@router.delete("/api/auth/account")
async def delete_auth_account(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        deleted = auth_store.delete_account(token)
        if not deleted:
            raise HTTPException(status_code=400, detail="Unable to delete account.")
        return {"success": True, "message": "Account deleted successfully."}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/auth/sessions")
async def list_auth_sessions(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        return {"data": auth_store.list_sessions(token)}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@router.delete("/api/auth/sessions/{session_id}")
async def revoke_auth_session(session_id: str, request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        auth_store.revoke_session(token, session_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/auth/sessions/logout-others")
async def logout_other_auth_sessions(request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        auth_store.logout_other_sessions(token)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/user/export")
async def export_user_data(request: Request):
    require_capability(request, "system.view", "Only workspace members can export data.")
    return {"status": "success", "message": "Data bundle preparation started. You will receive an email when it is ready for download."}


@router.get("/api/users/access")
async def get_user_access(request: Request, email: str):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        return {"data": auth_store.get_user_access_by_email(token, email)}
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


# --- Workspace Routes ---

@router.get("/api/workspaces")
async def list_workspaces(request: Request):
    session = require_session(request)
    return {"data": session.get("tenants") or []}


@router.post("/api/workspaces")
async def create_workspace(request: Request, payload: WorkspaceCreateRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can create a new workspace.")
    token = extract_session_token(request)
    try:
        return auth_store.create_workspace(token, payload.name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/api/workspaces/{workspace_id:path}")
async def rename_workspace(workspace_id: str, request: Request, payload: WorkspaceUpdateRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can rename a workspace.")
    token = extract_session_token(request)
    try:
        return auth_store.rename_workspace(token, workspace_id, payload.name, payload.settings)
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.delete("/api/workspaces/{workspace_id:path}")
async def archive_workspace(workspace_id: str, request: Request):
    auth_store = get_auth_store()
    require_session(request)
    token = extract_session_token(request)
    try:
        return {"data": auth_store.archive_workspace(token, workspace_id)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered or "only workspace owners" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.get("/api/workspaces/{workspace_id:path}/memberships")
async def list_workspace_memberships(workspace_id: str, request: Request):
    auth_store = get_auth_store()
    token = extract_session_token(request)
    try:
        return {"data": auth_store.list_workspace_memberships(token, workspace_id)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/workspaces/{workspace_id:path}/memberships")
async def add_workspace_member(workspace_id: str, request: Request, payload: WorkspaceMemberRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage members.")
    token = extract_session_token(request)
    try:
        return auth_store.add_workspace_member(token, workspace_id, payload.email, payload.role)
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/workspaces/{workspace_id:path}/users")
async def create_workspace_user(workspace_id: str, request: Request, payload: WorkspaceUserCreateRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can create users.")
    token = extract_session_token(request)
    try:
        return auth_store.create_workspace_user(
            token,
            workspace_id,
            payload.username,
            payload.email,
            payload.password,
            payload.name,
            payload.role,
            payload.user_role,
            payload.create_workspace,
            payload.workspace_name,
        )
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.patch("/api/workspaces/{workspace_id:path}/memberships/{membership_id}")
async def update_workspace_member(workspace_id: str, membership_id: str, request: Request, payload: WorkspaceMemberUpdateRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage members.")
    token = extract_session_token(request)
    try:
        return auth_store.update_workspace_member(token, workspace_id, membership_id, payload.role)
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.delete("/api/workspaces/{workspace_id:path}/memberships/{membership_id}")
async def remove_workspace_member(workspace_id: str, membership_id: str, request: Request):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage members.")
    token = extract_session_token(request)
    try:
        return auth_store.remove_workspace_member(token, workspace_id, membership_id)
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.get("/api/workspaces/{workspace_id:path}/roles")
async def list_workspace_roles(workspace_id: str, request: Request):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage roles.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.list_workspace_roles(token, workspace_id)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/workspaces/{workspace_id:path}/roles")
async def create_workspace_role(workspace_id: str, request: Request, payload: WorkspaceRoleCreateRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage roles.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.create_workspace_role(token, workspace_id, payload.model_dump())}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.patch("/api/workspaces/{workspace_id:path}/roles/{role_id}")
async def update_workspace_role(workspace_id: str, role_id: str, request: Request, payload: WorkspaceRoleUpdateRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage roles.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.update_workspace_role(token, workspace_id, role_id, payload.model_dump(exclude_none=True))}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.post("/api/workspaces/{workspace_id:path}/roles/{role_id}/assignments")
async def attach_workspace_role(workspace_id: str, role_id: str, request: Request, payload: WorkspaceRoleAssignmentRequest):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage roles.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.attach_workspace_role(token, workspace_id, role_id, payload.entityType, payload.entityId)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@router.delete("/api/workspaces/{workspace_id:path}/roles/{role_id}/assignments")
async def detach_workspace_role(workspace_id: str, role_id: str, request: Request, entityType: str, entityId: str):
    auth_store = get_auth_store()
    require_capability(request, "system.admin", "Only workspace admins can manage roles.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.detach_workspace_role(token, workspace_id, role_id, entityType, entityId)}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


# --- OAuth Callback ---

@router.get("/api/oauth/callback")
async def oauth_callback(state: str, code: str | None = None, error: str | None = None, error_description: str | None = None):
    auth_store = get_auth_store()
    provider = get_provider()
    try:
        pending = decode_oauth_state(state)
    except Exception as exc:
        return HTMLResponse(oauth_error_html(str(exc)), status_code=400)

    if error:
        description = error_description or error
        return HTMLResponse(oauth_error_html(f"Provider returned an error: {description}"), status_code=400)

    if not code:
        return HTMLResponse(oauth_error_html("Missing authorization code from provider."), status_code=400)

    tenant_token = None
    try:
        tenant_id = clean_text(pending.get("tenant_id")) or None
        if pending.get("kind") in {"mailbox", "calendar"} and not tenant_id:
            raise ValueError("OAuth state is missing a bound tenant/workspace context.")
        if tenant_id:
            tenant_token = set_request_tenant_id(tenant_id)
        if pending["kind"] == "auth":
            google_client = resolve_google_auth_client()
            if pending["provider"] == "google-auth":
                if not google_client:
                    raise ValueError("Google app sign-in is not configured anymore.")
                token_data = exchange_google_code(google_client["client_id"], google_client["client_secret"], code, oauth_callback_url())
                access_token = token_data.get("access_token")
                profile = google_profile(access_token) if access_token else {}
                email = profile.get("email")
                if not email:
                    raise ValueError("Google did not return an email address for this account.")
                session = auth_store.login_with_google(
                    email=email,
                    name=profile.get("name"),
                    avatar_url=profile.get("picture"),
                    user_agent="oauth-popup",
                )
                return HTMLResponse(
                    oauth_success_html(
                        "auth",
                        session["id"],
                        "google-auth",
                        extra_payload={"session": session},
                    )
                )
            raise ValueError("Unsupported app auth provider")

        if pending["kind"] == "mailbox":
            mailbox = next((item for item in provider.list_mailboxes() if item["id"] == pending["resource_id"]), None)
            if not mailbox:
                raise ValueError("Mailbox not found")
            config = mailbox.get("config") or {}

            if pending["provider"] == "gmail-oauth":
                token_data = exchange_google_code(config.get("client_id"), config.get("client_secret"), code, oauth_callback_url())
                access_token = token_data.get("access_token")
                profile = google_profile(access_token) if access_token else {}
                provider.update_mailbox(
                    mailbox["id"],
                    {
                        "config": {
                            **config,
                            "refresh_token": token_data.get("refresh_token") or config.get("refresh_token"),
                            "connected_identity": profile.get("email") or profile.get("emailAddress") or config.get("connected_identity") or mailbox.get("address"),
                            "email": profile.get("email") or profile.get("emailAddress") or config.get("email") or mailbox.get("address"),
                        }
                    },
                )
            elif pending["provider"] == "microsoft365-oauth":
                token_data = exchange_microsoft_code(config.get("client_id"), config.get("client_secret"), config.get("tenant_id") or "common", code, oauth_callback_url())
                access_token = token_data.get("access_token")
                profile = microsoft_profile(access_token) if access_token else {}
                identity = profile.get("mail") or profile.get("userPrincipalName") or mailbox.get("address")
                provider.update_mailbox(
                    mailbox["id"],
                    {
                        "config": {
                            **config,
                            "refresh_token": token_data.get("refresh_token") or config.get("refresh_token"),
                            "connected_identity": identity,
                            "email": identity,
                            "user_id": profile.get("id") or config.get("user_id"),
                        }
                    },
                )
            else:
                raise ValueError("Unsupported mailbox provider")

            provider.test_mailbox_connection(mailbox["id"])
            return HTMLResponse(oauth_success_html("mailbox", mailbox["id"], pending["provider"]))

        source = next((item for item in provider.list_calendar_sources() if item["id"] == pending["resource_id"]), None)
        if not source:
            raise ValueError("Calendar source not found")
        config = source.get("config") or {}

        if pending["provider"] in {"google-calendar-oauth", "google-meet-oauth"}:
            token_data = exchange_google_code(config.get("client_id"), config.get("client_secret"), code, oauth_callback_url())
            access_token = token_data.get("access_token")
            available_calendars = google_calendar_list(access_token) if access_token else []
            profile = google_profile(access_token) if access_token else {}
            configured_calendar_id = clean_text(config.get("calendar_id")) or None
            selected_calendar = next((item for item in available_calendars if clean_text(item.get("id")) == configured_calendar_id), None)
            provider.update_calendar_source(
                source["id"],
                {
                    "config": {
                        **config,
                        "refresh_token": token_data.get("refresh_token") or config.get("refresh_token"),
                        "calendar_id": configured_calendar_id,
                        "email": profile.get("email") or config.get("email"),
                        "connected_identity": profile.get("email") or config.get("connected_identity") or config.get("email"),
                        "connected_calendar": (selected_calendar or {}).get("label"),
                        "available_calendars": available_calendars,
                    }
                },
            )
        elif pending["provider"] == "microsoft365-calendar":
            token_data = exchange_microsoft_code(config.get("client_id"), config.get("client_secret"), config.get("tenant_id") or "common", code, oauth_callback_url())
            access_token = token_data.get("access_token")
            profile = microsoft_profile(access_token) if access_token else {}
            user_id = profile.get("id") or config.get("user_id")
            available_calendars = microsoft_calendar_list(access_token, user_id) if access_token and user_id else []
            configured_calendar_id = clean_text(config.get("calendar_id")) or None
            selected_calendar = next((item for item in available_calendars if clean_text(item.get("id")) == configured_calendar_id), None)
            provider.update_calendar_source(
                source["id"],
                {
                    "config": {
                        **config,
                        "refresh_token": token_data.get("refresh_token") or config.get("refresh_token"),
                        "user_id": user_id,
                        "calendar_id": configured_calendar_id,
                        "connected_identity": profile.get("mail") or profile.get("userPrincipalName") or config.get("connected_identity"),
                        "connected_calendar": (selected_calendar or {}).get("label"),
                        "available_calendars": available_calendars,
                    }
                },
            )
        else:
            raise ValueError("Unsupported calendar provider")

        updated_source = next((item for item in provider.list_calendar_sources() if item["id"] == source["id"]), None) or source
        if ((updated_source.get("config") or {}).get("calendar_id")):
            provider.test_calendar_source(source["id"])
        return HTMLResponse(
            oauth_success_html(
                "calendar",
                source["id"],
                pending["provider"],
                extra_payload={
                    "calendarSelectionRequired": not bool(((updated_source.get("config") or {}).get("calendar_id"))),
                    "connectedIdentity": (updated_source.get("config") or {}).get("connected_identity"),
                    "connectedCalendar": (updated_source.get("config") or {}).get("connected_calendar"),
                },
            )
        )
    except Exception as exc:
        return HTMLResponse(oauth_error_html(str(exc)), status_code=400)
    finally:
        if tenant_token:
            from backend.data_provider import reset_request_tenant
            reset_request_tenant(tenant_token)
