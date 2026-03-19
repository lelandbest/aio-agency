import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from auth_store import AuthStore, default_auth_db_path
from data_provider import create_provider, get_request_tenant_id, reset_request_tenant, set_request_tenant_id
from oauth_connect import (
    GOOGLE_CALENDAR_SCOPE,
    GOOGLE_MAIL_SCOPE,
    MICROSOFT_CALENDAR_SCOPE,
    MICROSOFT_MAIL_SCOPE,
    backend_base_url,
    build_google_authorize_url,
    build_microsoft_authorize_url,
    exchange_google_code,
    exchange_microsoft_code,
    google_primary_calendar,
    google_profile,
    microsoft_primary_calendar,
    microsoft_profile,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

provider = create_provider()
auth_store = AuthStore(default_auth_db_path())
oauth_states: dict[str, dict[str, str]] = {}
GOOGLE_APP_AUTH_SCOPE = "openid email profile"


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("AIO CRM Backend starting up")
    logger.info("Environment: %s", os.getenv("ENVIRONMENT", "development"))
    logger.info("Provider: %s", provider.health())
    yield
    logger.info("AIO CRM Backend shutting down")

app = FastAPI(
    title="AIO CRM Backend",
    description="Local-first backend API for AIO CRM",
    version="1.1.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization", "X-Session-Token"],
)


class AuthBootstrapRequest(BaseModel):
    name: str
    email: str
    password: str


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthTenantSwitchRequest(BaseModel):
    tenant_id: str


class WorkspaceCreateRequest(BaseModel):
    name: str


class WorkspaceUpdateRequest(BaseModel):
    name: str


class WorkspaceMemberRequest(BaseModel):
    email: str
    role: str


class WorkspaceMemberUpdateRequest(BaseModel):
    role: str


class WorkspaceUserCreateRequest(BaseModel):
    username: str
    email: str
    password: str
    name: str
    role: str = "staff"
    create_workspace: bool = False
    workspace_name: str | None = None


class FormSubmissionRequest(BaseModel):
    form_data: dict[str, Any]


class ThreadCreateRequest(BaseModel):
    subject: str
    channel_type: str = "email"
    contact_id: str | None = None
    company_id: str | None = None
    body: str = ""
    status: str = "new"
    assignee: str = "ECHO"
    mailbox_id: str | None = None


class ThreadOpenRequest(BaseModel):
    contact_id: str
    channel_type: str = "email"
    subject: str | None = None
    body: str = ""
    force_new: bool = False
    mailbox_id: str | None = None


class ThreadMessageRequest(BaseModel):
    body: str
    channel_type: str | None = None
    sender_name: str = "AIO Flow"
    sender_email: str = "mission@aiocrm.local"
    recipients: list[str] = []
    direction: str = "outbound"


class ThreadStatusRequest(BaseModel):
    status: str


class ThreadAssignRequest(BaseModel):
    assignee_name: str | None = None
    assignee: str | None = None


class ThreadMailboxRequest(BaseModel):
    mailbox_id: str


class ThreadDraftRequest(BaseModel):
    mode: str = "reply"


class ThreadMeetingRequest(BaseModel):
    scheduled_at: str | None = None


class CalendarEventUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    start_time: str | None = None
    end_time: str | None = None
    status: str | None = None
    location_type: str | None = None
    location: str | None = None
    meeting_url: str | None = None


class CalendarSourceCreateRequest(BaseModel):
    name: str
    provider: str = "local-stub"
    sync_direction: str = "two-way"
    config: dict[str, Any] | None = None


class CalendarSourceUpdateRequest(BaseModel):
    name: str | None = None
    provider: str | None = None
    status: str | None = None
    sync_direction: str | None = None
    last_synced_at: str | None = None
    config: dict[str, Any] | None = None


class CalendarPushRequest(BaseModel):
    source_id: str | None = None


class CalendarEventReconcileRequest(BaseModel):
    strategy: str


class MailboxCreateRequest(BaseModel):
    name: str
    address: str
    provider: str = "local-stub"
    inbound_enabled: bool = True
    outbound_enabled: bool = True
    config: dict[str, Any] | None = None


class MailboxUpdateRequest(BaseModel):
    name: str | None = None
    address: str | None = None
    provider: str | None = None
    status: str | None = None
    inbound_enabled: bool | None = None
    outbound_enabled: bool | None = None
    last_synced_at: str | None = None
    config: dict[str, Any] | None = None


class MailIngestRequest(BaseModel):
    subject: str
    body: str
    sender_name: str
    sender_email: str
    recipients: list[str] = []


class MailSendRequest(BaseModel):
    body: str
    mailbox_id: str | None = None
    sender_name: str = "AIO Flow"
    sender_email: str | None = None
    recipients: list[str] = []


def oauth_callback_url() -> str:
    return f"{backend_base_url().rstrip('/')}/api/oauth/callback"


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


def resolve_google_auth_client() -> dict[str, str] | None:
    env_client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
    env_client_secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    if env_client_id and env_client_secret:
        return {"client_id": env_client_id, "client_secret": env_client_secret}

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


def extract_session_token(request: Request) -> str | None:
    header_token = request.headers.get("X-Session-Token")
    if header_token:
        return header_token.strip()
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    query_token = request.query_params.get("session_token")
    if query_token:
        return query_token.strip()
    return None


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


def require_session(request: Request) -> dict[str, Any]:
    session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return session


def is_public_api_request(path: str) -> bool:
    if path in {"/api/", "/api/health", "/api/auth/status", "/api/auth/bootstrap", "/api/auth/login", "/api/auth/google/authorize", "/api/oauth/callback"}:
        return True
    if path.startswith("/api/forms/by-slug/"):
        return True
    if path.startswith("/api/forms/") and path.endswith("/submit"):
        return True
    return False


def allows_no_active_workspace(path: str) -> bool:
    if path in {"/api/auth/session", "/api/auth/session/tenant", "/api/workspaces"}:
        return True
    if path == "/api/workspaces":
        return True
    if path.startswith("/api/workspaces/"):
        return True
    return False


@app.middleware("http")
async def inject_tenant_context(request: Request, call_next):
    token = extract_session_token(request)
    session = auth_store.get_session(token) if token else None
    tenant_id = (session or {}).get("tenant", {}).get("id")
    request.state.session = session
    request.state.tenant_id = tenant_id
    if request.url.path.startswith("/api") and not is_public_api_request(request.url.path) and not session:
        return JSONResponse(status_code=401, content={"detail": "Authentication required."})
    if request.url.path.startswith("/api") and not is_public_api_request(request.url.path) and session and not tenant_id and not allows_no_active_workspace(request.url.path):
        return JSONResponse(status_code=403, content={"detail": "No active workspace selected."})
    context_token = set_request_tenant_id(tenant_id)
    try:
        return await call_next(request)
    finally:
        reset_request_tenant(context_token)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if os.getenv("DEBUG") == "true" else "An unexpected error occurred",
            "timestamp": utcnow_iso(),
        },
    )


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "message": "Backend is running",
        "timestamp": utcnow_iso(),
        "version": "1.1.0",
        "environment": os.getenv("ENVIRONMENT", "development"),
        "data_provider": provider.health(),
        "tenant_id": get_request_tenant_id(),
    }


@app.get("/api/")
async def root():
    return {
        "message": "AIO CRM Backend",
        "version": "1.1.0",
        "docs": "/docs",
        "health": "/api/health",
        "timestamp": utcnow_iso(),
    }


@app.get("/api/auth/status")
async def auth_status():
    google_client = resolve_google_auth_client()
    status = auth_store.auth_status()
    return {
        **status,
        "google_oauth_available": bool(google_client),
    }


@app.post("/api/auth/bootstrap")
async def bootstrap_auth(request: AuthBootstrapRequest):
    try:
        session = auth_store.bootstrap_owner(request.name, request.email, request.password)
        return {"session": session}
    except ValueError as error:
        detail = str(error)
        status_code = 409 if "already exists" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/auth/login")
async def login_auth(request: AuthLoginRequest):
    try:
        session = auth_store.login_with_password(request.email, request.password)
        return {"session": session}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.get("/api/auth/google/authorize")
async def authorize_google_auth():
    google_client = resolve_google_auth_client()
    if not google_client:
        raise HTTPException(status_code=400, detail="Google app sign-in is not configured yet.")

    state = uuid4().hex
    oauth_states[state] = {"kind": "auth", "provider": "google-auth"}
    return RedirectResponse(
        build_google_authorize_url(google_client["client_id"], oauth_callback_url(), state, GOOGLE_APP_AUTH_SCOPE)
    )


@app.get("/api/auth/session")
async def current_auth_session(request: Request):
    session = getattr(request.state, "session", None)
    if not session:
        token = extract_session_token(request)
        session = auth_store.get_session(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session not found or expired.")
    return {"session": session}


@app.patch("/api/auth/session/tenant")
async def switch_auth_tenant(request: Request, payload: AuthTenantSwitchRequest):
    token = extract_session_token(request)
    try:
        session = auth_store.switch_session_tenant(token, payload.tenant_id)
        return {"session": session}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/auth/session")
async def delete_auth_session(request: Request):
    token = extract_session_token(request)
    auth_store.logout(token)
    return {"success": True}


@app.get("/api/workspaces")
async def list_workspaces(request: Request):
    session = require_session(request)
    return {"data": session.get("tenants") or []}


@app.post("/api/workspaces")
async def create_workspace(request: Request, payload: WorkspaceCreateRequest):
    token = extract_session_token(request)
    try:
        return auth_store.create_workspace(token, payload.name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/workspaces/{workspace_id}")
async def rename_workspace(workspace_id: str, request: Request, payload: WorkspaceUpdateRequest):
    token = extract_session_token(request)
    try:
        return auth_store.rename_workspace(token, workspace_id, payload.name)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.get("/api/workspaces/{workspace_id}/memberships")
async def list_workspace_memberships(workspace_id: str, request: Request):
    token = extract_session_token(request)
    try:
        return {"data": auth_store.list_workspace_memberships(token, workspace_id)}
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.get("/api/users/access")
async def get_user_access(request: Request, email: str):
    token = extract_session_token(request)
    try:
        return {"data": auth_store.get_user_access_by_email(token, email)}
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/workspaces/{workspace_id}/memberships")
async def add_workspace_member(workspace_id: str, request: Request, payload: WorkspaceMemberRequest):
    token = extract_session_token(request)
    try:
        return auth_store.add_workspace_member(token, workspace_id, payload.email, payload.role)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/workspaces/{workspace_id}/users")
async def create_workspace_user(workspace_id: str, request: Request, payload: WorkspaceUserCreateRequest):
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
            payload.create_workspace,
            payload.workspace_name,
        )
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.patch("/api/workspaces/{workspace_id}/memberships/{membership_id}")
async def update_workspace_member(workspace_id: str, membership_id: str, request: Request, payload: WorkspaceMemberUpdateRequest):
    token = extract_session_token(request)
    try:
        return auth_store.update_workspace_member(token, workspace_id, membership_id, payload.role)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.delete("/api/workspaces/{workspace_id}/memberships/{membership_id}")
async def remove_workspace_member(workspace_id: str, membership_id: str, request: Request):
    token = extract_session_token(request)
    try:
        return auth_store.remove_workspace_member(token, workspace_id, membership_id)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.get("/api/oauth/callback")
async def oauth_callback(state: str, code: str | None = None, error: str | None = None, error_description: str | None = None):
    pending = oauth_states.pop(state, None)
    if not pending:
        return HTMLResponse(oauth_error_html("OAuth session expired or is invalid."), status_code=400)

    if error:
        description = error_description or error
        return HTMLResponse(oauth_error_html(f"Provider returned an error: {description}"), status_code=400)

    if not code:
        return HTMLResponse(oauth_error_html("Missing authorization code from provider."), status_code=400)

    try:
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

        if pending["provider"] == "google-calendar-oauth":
            token_data = exchange_google_code(config.get("client_id"), config.get("client_secret"), code, oauth_callback_url())
            access_token = token_data.get("access_token")
            primary_calendar = google_primary_calendar(access_token) if access_token else None
            profile = google_profile(access_token) if access_token else {}
            provider.update_calendar_source(
                source["id"],
                {
                    "config": {
                        **config,
                        "refresh_token": token_data.get("refresh_token") or config.get("refresh_token"),
                        "calendar_id": config.get("calendar_id") or (primary_calendar.get("id") if primary_calendar else "primary"),
                        "email": profile.get("emailAddress") or config.get("email"),
                    }
                },
            )
        elif pending["provider"] == "microsoft365-calendar":
            token_data = exchange_microsoft_code(config.get("client_id"), config.get("client_secret"), config.get("tenant_id") or "common", code, oauth_callback_url())
            access_token = token_data.get("access_token")
            profile = microsoft_profile(access_token) if access_token else {}
            user_id = profile.get("id") or config.get("user_id")
            primary_calendar = microsoft_primary_calendar(access_token, user_id) if access_token and user_id else None
            provider.update_calendar_source(
                source["id"],
                {
                    "config": {
                        **config,
                        "refresh_token": token_data.get("refresh_token") or config.get("refresh_token"),
                        "user_id": user_id,
                        "calendar_id": config.get("calendar_id") or (primary_calendar.get("id") if primary_calendar else None),
                    }
                },
            )
        else:
            raise ValueError("Unsupported calendar provider")

        provider.test_calendar_source(source["id"])
        return HTMLResponse(oauth_success_html("calendar", source["id"], pending["provider"]))
    except Exception as exc:
        return HTMLResponse(oauth_error_html(str(exc)), status_code=400)


@app.get("/api/contacts")
async def list_contacts():
    return {"data": provider.list_contacts()}


@app.post("/api/contacts")
async def create_contact(request: dict[str, Any]):
    try:
        return {"data": provider.create_contact(request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, request: dict[str, Any]):
    try:
        return {"data": provider.update_contact(contact_id, request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/contacts/{contact_id}/activities")
async def list_contact_activities(contact_id: str):
    return {"data": provider.list_contact_activities(contact_id)}


@app.get("/api/contacts/{contact_id}/form-submissions")
async def list_contact_form_submissions(contact_id: str):
    return {"data": provider.list_form_submissions(contact_id)}


@app.get("/api/companies")
async def list_companies():
    return {"data": provider.list_companies()}


@app.get("/api/calendars")
async def list_calendars():
    return {"data": provider.list_calendars()}


@app.get("/api/calendar/events")
async def list_calendar_events():
    return {"data": provider.list_calendar_events()}


@app.post("/api/calendar/events")
async def create_calendar_event(request: dict[str, Any]):
    try:
        return {"data": provider.create_calendar_event(request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/calendar/events/{event_id}")
async def update_calendar_event(event_id: str, request: CalendarEventUpdateRequest):
    try:
        return provider.update_calendar_event(event_id, request.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/calendar/events/{event_id}")
async def delete_calendar_event(event_id: str):
    try:
        provider.delete_calendar_event(event_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/events/{event_id}/push")
async def push_calendar_event(event_id: str, request: CalendarPushRequest):
    try:
        return provider.push_calendar_event(event_id, request.source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/events/{event_id}/reconcile")
async def reconcile_calendar_event(event_id: str, request: CalendarEventReconcileRequest):
    try:
        return provider.reconcile_calendar_event(event_id, request.strategy)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/calendar/sources")
async def list_calendar_sources():
    return {"data": provider.list_calendar_sources()}


@app.get("/api/calendar/providers")
async def list_calendar_providers():
    return {"data": provider.get_calendar_provider_catalog()}


@app.get("/api/calendar/sources/{source_id}/authorize")
async def authorize_calendar_source(source_id: str):
    source = next((item for item in provider.list_calendar_sources() if item["id"] == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Calendar source not found")

    config = source.get("config") or {}
    state = uuid4().hex
    oauth_states[state] = {"kind": "calendar", "resource_id": source_id, "provider": source.get("provider") or ""}
    redirect_uri = oauth_callback_url()

    if source.get("provider") == "google-calendar-oauth":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Google client_id in calendar source config")
        return RedirectResponse(build_google_authorize_url(client_id, redirect_uri, state, GOOGLE_CALENDAR_SCOPE))

    if source.get("provider") == "microsoft365-calendar":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Microsoft client_id in calendar source config")
        tenant_id = config.get("tenant_id") or "common"
        return RedirectResponse(build_microsoft_authorize_url(client_id, tenant_id, redirect_uri, state, MICROSOFT_CALENDAR_SCOPE))

    raise HTTPException(status_code=400, detail="This calendar provider does not support OAuth connect")


@app.post("/api/calendar/sources")
async def create_calendar_source(request: CalendarSourceCreateRequest):
    try:
        return provider.create_calendar_source(
            name=request.name,
            provider=request.provider,
            sync_direction=request.sync_direction,
            config=request.config,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/calendar/sources/{source_id}")
async def update_calendar_source(source_id: str, request: CalendarSourceUpdateRequest):
    try:
        return provider.update_calendar_source(source_id, request.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/calendar/sources/{source_id}")
async def delete_calendar_source(source_id: str, fallback_source_id: str | None = None):
    try:
        return provider.delete_calendar_source(source_id, fallback_source_id=fallback_source_id)
    except ValueError as error:
        detail = str(error)
        status_code = 400 if "fallback" in detail.lower() else 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/calendar/sources/{source_id}/disconnect")
async def disconnect_calendar_source(source_id: str):
    try:
        return {"source": provider.disconnect_calendar_source(source_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/sources/{source_id}/test-connection")
async def test_calendar_source(source_id: str):
    try:
        return provider.test_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/sources/{source_id}/sync")
async def sync_calendar_source(source_id: str):
    try:
        return provider.sync_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/sources/{source_id}/import")
async def import_calendar_source(source_id: str):
    try:
        return provider.import_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/mailboxes")
async def list_mailboxes():
    return {"data": provider.list_mailboxes()}


@app.get("/api/mailboxes/providers")
async def list_mailbox_providers():
    return {"data": provider.get_mail_provider_catalog()}


@app.get("/api/mailboxes/{mailbox_id}/authorize")
async def authorize_mailbox(mailbox_id: str):
    mailbox = next((item for item in provider.list_mailboxes() if item["id"] == mailbox_id), None)
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    config = mailbox.get("config") or {}
    state = uuid4().hex
    oauth_states[state] = {"kind": "mailbox", "resource_id": mailbox_id, "provider": mailbox.get("provider") or ""}
    redirect_uri = oauth_callback_url()

    if mailbox.get("provider") == "gmail-oauth":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Google client_id in mailbox config")
        return RedirectResponse(build_google_authorize_url(client_id, redirect_uri, state, GOOGLE_MAIL_SCOPE))

    if mailbox.get("provider") == "microsoft365-oauth":
        client_id = config.get("client_id")
        if not client_id:
            raise HTTPException(status_code=400, detail="Missing Microsoft client_id in mailbox config")
        tenant_id = config.get("tenant_id") or "common"
        return RedirectResponse(build_microsoft_authorize_url(client_id, tenant_id, redirect_uri, state, MICROSOFT_MAIL_SCOPE))

    raise HTTPException(status_code=400, detail="This mail provider does not support OAuth connect")


@app.post("/api/mailboxes")
async def create_mailbox(request: MailboxCreateRequest):
    try:
        mailbox = provider.create_mailbox(
            name=request.name,
            address=request.address,
            provider=request.provider,
            inbound_enabled=request.inbound_enabled,
            outbound_enabled=request.outbound_enabled,
            config=request.config,
        )
        return mailbox
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/mailboxes/{mailbox_id}")
async def update_mailbox(mailbox_id: str, request: MailboxUpdateRequest):
    try:
        return provider.update_mailbox(mailbox_id, request.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/mailboxes/{mailbox_id}")
async def delete_mailbox(mailbox_id: str, fallback_mailbox_id: str | None = None):
    try:
        return provider.delete_mailbox(mailbox_id, fallback_mailbox_id=fallback_mailbox_id)
    except ValueError as error:
        detail = str(error)
        status_code = 400 if "last mailbox" in detail.lower() or "fallback mailbox" in detail.lower() else 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/mailboxes/{mailbox_id}/disconnect")
async def disconnect_mailbox(mailbox_id: str):
    try:
        return {"mailbox": provider.disconnect_mailbox(mailbox_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/mailboxes/{mailbox_id}/events")
async def list_mailbox_events(mailbox_id: str):
    return {"data": provider.list_mail_events(mailbox_id=mailbox_id)}


@app.post("/api/mailboxes/{mailbox_id}/test-connection")
async def test_mailbox_connection(mailbox_id: str):
    try:
        return provider.test_mailbox_connection(mailbox_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/mailboxes/{mailbox_id}/sync")
async def sync_mailbox(mailbox_id: str):
    try:
        return provider.sync_mailbox(mailbox_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/mailboxes/{mailbox_id}/ingest")
async def ingest_mail_message(mailbox_id: str, request: MailIngestRequest):
    try:
        return provider.ingest_mail_message(
            mailbox_id=mailbox_id,
            subject=request.subject,
            body=request.body,
            sender_name=request.sender_name,
            sender_email=request.sender_email,
            recipients=request.recipients,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/tags")
async def list_tags():
    return {"data": provider.list_tags()}


@app.get("/api/form-folders")
async def list_form_folders():
    return {"data": provider.list_form_folders()}


@app.post("/api/form-folders")
async def create_form_folder(request: dict[str, Any]):
    try:
        return {"data": provider.create_form_folder(request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/form-folders/{folder_id}")
async def update_form_folder(folder_id: str, request: dict[str, Any]):
    try:
        return {"data": provider.update_form_folder(folder_id, request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/forms")
async def list_forms():
    return {"data": provider.list_forms()}


@app.post("/api/forms")
async def create_form(request: dict[str, Any]):
    try:
        return {"data": provider.create_form(request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/forms/{form_id}")
async def update_form(form_id: str, request: dict[str, Any]):
    try:
        return {"data": provider.update_form(form_id, request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/forms/{form_id}")
async def delete_form(form_id: str):
    try:
        provider.delete_form(form_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/cms/tables")
async def list_cms_tables():
    return {"data": provider.list_cms_tables()}


@app.get("/api/cms/tables/{slug}")
async def list_cms_table_data(slug: str):
    return {"data": provider.list_cms_table_data(slug)}


@app.get("/api/forms/by-slug/{slug}")
async def get_form_by_slug(slug: str):
    form = provider.get_form_by_slug(slug)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"data": form}


@app.get("/api/forms/{form_id}")
async def get_form_by_id(form_id: str):
    form = provider.get_form_by_id(form_id)
    if not form:
        raise HTTPException(status_code=404, detail="Form not found")
    return {"data": form}


@app.post("/api/forms/{form_id}/submit")
async def submit_form(form_id: str, request: FormSubmissionRequest):
    try:
        return provider.submit_form(form_id, request.form_data)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/booking-types")
async def list_booking_types():
    return {"data": provider.list_booking_types()}


@app.post("/api/booking-types")
async def create_booking_type(request: dict[str, Any]):
    try:
        return {"data": provider.create_booking_type(request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/booking-types/{booking_type_id}")
async def update_booking_type(booking_type_id: str, request: dict[str, Any]):
    try:
        return {"data": provider.update_booking_type(booking_type_id, request)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/booking-types/{booking_type_id}")
async def delete_booking_type(booking_type_id: str):
    try:
        provider.delete_booking_type(booking_type_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/comms/snapshot")
async def comms_snapshot():
    return provider.get_comms_snapshot()


@app.post("/api/comms/threads")
async def create_thread(request: ThreadCreateRequest):
    return provider.create_thread(
        subject=request.subject,
        channel_type=request.channel_type,
        contact_id=request.contact_id,
        company_id=request.company_id,
        body=request.body,
        status=request.status,
        assignee=request.assignee,
        mailbox_id=request.mailbox_id,
    )


@app.post("/api/comms/threads/open")
async def open_thread(request: ThreadOpenRequest):
    try:
        return provider.open_thread_for_contact(
            contact_id=request.contact_id,
            channel_type=request.channel_type,
            subject=request.subject,
            body=request.body,
            force_new=request.force_new,
            mailbox_id=request.mailbox_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/messages")
async def send_thread_message(thread_id: str, request: ThreadMessageRequest):
    return provider.send_thread_message(
        thread_id=thread_id,
        body=request.body,
        channel_type=request.channel_type,
        sender_name=request.sender_name,
        sender_email=request.sender_email,
        recipients=request.recipients,
        direction=request.direction,
    )


@app.post("/api/comms/threads/{thread_id}/send-email")
async def send_thread_email(thread_id: str, request: MailSendRequest):
    try:
        return provider.send_thread_via_mailbox(
            thread_id=thread_id,
            body=request.body,
            mailbox_id=request.mailbox_id,
            sender_name=request.sender_name,
            sender_email=request.sender_email,
            recipients=request.recipients,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/comms/threads/{thread_id}/status")
async def update_thread_status(thread_id: str, request: ThreadStatusRequest):
    return provider.update_thread_status(thread_id=thread_id, status=request.status)


@app.patch("/api/comms/threads/{thread_id}/assign")
async def assign_thread(thread_id: str, request: ThreadAssignRequest):
    assignee_name = request.assignee_name or request.assignee
    if not assignee_name:
        raise HTTPException(status_code=422, detail="assignee_name is required")
    return provider.assign_thread(thread_id=thread_id, assignee_name=assignee_name)


@app.patch("/api/comms/threads/{thread_id}/mailbox")
async def update_thread_mailbox(thread_id: str, request: ThreadMailboxRequest):
    return provider.update_thread_mailbox(thread_id=thread_id, mailbox_id=request.mailbox_id)


@app.post("/api/comms/threads/{thread_id}/summarize")
async def summarize_thread(thread_id: str):
    return provider.summarize_thread(thread_id=thread_id)


@app.post("/api/comms/threads/{thread_id}/draft")
async def create_thread_draft(thread_id: str, request: ThreadDraftRequest):
    return provider.create_thread_draft(thread_id=thread_id, mode=request.mode)


@app.post("/api/comms/threads/{thread_id}/create-deal")
async def create_deal_from_thread(thread_id: str):
    try:
        return provider.create_deal_from_thread(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/advance-stage")
async def advance_thread_stage(thread_id: str):
    try:
        return provider.advance_thread_stage(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/schedule-meeting")
async def schedule_thread_meeting(thread_id: str, request: ThreadMeetingRequest | None = None):
    try:
        return provider.schedule_thread_meeting(thread_id=thread_id, scheduled_at=request.scheduled_at if request else None)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info")
