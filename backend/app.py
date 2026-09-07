"""
AIO Nexus — Core Application Factory
Assembles the modular FastAPI application with local-first neural appliance lifecycle,
tenant context injection, camelCase boundary enforcement, CORS preflights, and domain routers.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

# Ensure root is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

load_dotenv()

from backend.deps import (
    auth_store,
    extract_session_token,
    provider,
    utcnow_iso,
)
from backend.orchestration import run_resume_worker
from backend.data_provider import (
    get_request_tenant_id,
    reset_request_tenant,
    set_request_tenant_id,
)
from backend.request_validators import (
    convert_to_camelcase,
    detect_snake_case_keys,
)

# Import all domain routers
from backend.routes import (
    ai_router,
    auth_router,
    comms_router,
    cortex_router,
    crm_router,
    flows_router,
    media_router,
    pocket_router,
    signals_router,
    system_router,
)

logger = logging.getLogger("aio-nexus")


# ── Lifespan Management ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AIO Nexus Neural Appliance starting up")
    logger.info("Environment: %s", os.getenv("APP_ENV", "appliance"))
    logger.info("Data Provider Health: %s", provider.health())
    resume_worker = asyncio.create_task(run_resume_worker(provider))
    try:
        yield
    finally:
        resume_worker.cancel()
        try:
            await resume_worker
        except asyncio.CancelledError:
            pass
        logger.info("AIO Nexus Neural Appliance shut down cleanly")


# ── FastAPI App Factory ──────────────────────────────────────────────────────

app = FastAPI(
    title="AIO Nexus Neural Appliance",
    description="Local-first, cloud-agnostic autonomous business operations appliance for Single Operator Businesses.",
    version="2.0.0",
    lifespan=lifespan,
)


# ── Security & Route Permission Matchers ────────────────────────────────────

def is_public_api_request(path: str) -> bool:
    public_paths = {
        "/api/",
        "/api/health",
        "/api/auth/status",
        "/api/auth/bootstrap",
        "/api/auth/login",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
        "/api/auth/reset-password/validate",
        "/api/auth/google/authorize",
        "/api/oauth/callback",
    }
    if path in public_paths:
        return True
    if path.startswith("/api/forms/by-slug/"):
        return True
    if path.startswith("/api/forms/") and path.endswith("/submit"):
        return True
    if path.startswith("/api/media/audio/"):
        return True
    if path.startswith("/api/media/voice/"):
        return True
    if path.startswith("/api/media/video/"):
        return True
    if path.startswith("/api/media/image/"):
        return True
    return False


def allows_no_active_workspace(path: str) -> bool:
    if path in {"/api/auth/session", "/api/auth/session/tenant", "/api/workspaces"}:
        return True
    if path.startswith("/api/workspaces/"):
        return True
    return False


def is_client_allowed_api_request(method: str, path: str) -> bool:
    if is_public_api_request(path):
        return True
    if path in {"/api/", "/api/health"}:
        return True
    if path.startswith("/api/auth/"):
        return True
    if path == "/api/notifications" and method == "GET":
        return True
    if path == "/api/notifications/read-all" and method == "POST":
        return True
    if re.fullmatch(r"/api/notifications/[^/]+", path or "") and method in {"PATCH", "DELETE"}:
        return True
    if path == "/api/comms/snapshot" and method == "GET":
        return True
    if path == "/api/comms/threads" and method == "POST":
        return True
    if path == "/api/comms/threads/open" and method == "POST":
        return True
    if re.fullmatch(r"/api/comms/threads/[^/]+/messages", path or "") and method == "POST":
        return True
    if re.fullmatch(r"/api/comms/threads/[^/]+/send-email", path or "") and method == "POST":
        return True
    if re.fullmatch(r"/api/comms/threads/[^/]+/status", path or "") and method == "PATCH":
        return True
    if re.fullmatch(r"/api/comms/threads/[^/]+/schedule-meeting", path or "") and method == "POST":
        return True
    if path == "/api/calendars" and method == "GET":
        return True
    if path == "/api/calendar/events" and method in {"GET", "POST"}:
        return True
    if re.fullmatch(r"/api/calendar/events/[^/]+", path or "") and method in {"PATCH", "DELETE"}:
        return True
    if path == "/api/booking-types" and method == "GET":
        return True
    if re.fullmatch(r"/api/mailboxes/[^/]+/events", path or "") and method == "GET":
        return True
    if path in {"/api/mailboxes", "/api/mailboxes/providers"} and method == "GET":
        return True
    if path == "/api/ai/assist" and method == "POST":
        return True
    return False


# ── Middlewares ─────────────────────────────────────────────────────────────

@app.middleware("http")
async def inject_tenant_context(request: Request, call_next):
    token = extract_session_token(request)
    session = auth_store.get_session(token) if token else None
    tenant_id = (session or {}).get("tenant", {}).get("id")
    request.state.session = session
    request.state.tenant_id = tenant_id

    capabilities = set()
    if session and tenant_id:
        user_id = (session.get("user") or {}).get("id")
        if user_id:
            capabilities = auth_store.get_effective_capabilities(tenant_id, "user", user_id)
    request.state.capabilities = capabilities

    if request.method == "OPTIONS":
        context_token = set_request_tenant_id(tenant_id)
        try:
            return await call_next(request)
        finally:
            reset_request_tenant(context_token)

    if request.url.path.startswith("/api") and not is_public_api_request(request.url.path) and not session:
        return JSONResponse(status_code=401, content={"detail": "Authentication required."})

    if (
        request.url.path.startswith("/api")
        and not is_public_api_request(request.url.path)
        and session
        and not tenant_id
        and not allows_no_active_workspace(request.url.path)
    ):
        return JSONResponse(status_code=403, content={"detail": "No active workspace selected."})

    is_operator = ((session or {}).get("user") or {}).get("role") == "operator"
    if (
        request.url.path.startswith("/api")
        and session
        and not is_operator
        and "client.access" in capabilities
        and not is_client_allowed_api_request(request.method, request.url.path)
    ):
        return JSONResponse(status_code=403, content={"detail": "Client mode blocks this endpoint."})

    context_token = set_request_tenant_id(tenant_id)
    try:
        return await call_next(request)
    finally:
        reset_request_tenant(context_token)


PROTECTED_API_PREFIXES = [
    "/api/ai/command",
    "/api/ai/draft",
    "/api/ai/assist",
    "/api/flow",
    "/api/node",
    "/api/agent",
    "/api/integration",
    "/api/provider",
]


@app.middleware("http")
async def enforce_camelcase_request(request: Request, call_next):
    path = request.url.path
    should_validate = any(path.startswith(prefix) for prefix in PROTECTED_API_PREFIXES)

    if should_validate and request.method in ("POST", "PUT", "PATCH"):
        try:
            body = await request.body()
            if body:
                data = json.loads(body)
                violations = detect_snake_case_keys(data)
                if violations:
                    return JSONResponse(
                        status_code=400,
                        content={
                            "error": "invalidPayload",
                            "message": "snake_case keys are not allowed at API boundaries",
                            "invalidKeys": violations,
                        },
                    )
        except json.JSONDecodeError:
            pass

    return await call_next(request)


@app.middleware("http")
async def enforce_camelcase_response(request: Request, call_next):
    response = await call_next(request)

    if request.url.path.startswith("/api"):
        try:
            if hasattr(response, "body") and not isinstance(response, (StreamingResponse, FileResponse)):
                body = response.body
                if body:
                    data = json.loads(body)
                    converted = convert_to_camelcase(data)
                    new_body = json.dumps(converted).encode()

                    headers = dict(response.headers)
                    headers.pop("content-length", None)

                    return Response(
                        content=new_body,
                        status_code=response.status_code,
                        headers=headers,
                        media_type="application/json",
                    )
        except Exception as e:
            logger.error(f"Middleware casing error: {e}")
            pass

    return response


# ── CORS Middleware (Outer Layer) ───────────────────────────────────────────

CORS_CONFIG = {
    "allow_origins": ["*"],
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}

app.add_middleware(CORSMiddleware, **CORS_CONFIG)


# ── Global Exception Handler ────────────────────────────────────────────────

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


# ── Router Registrations ─────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(cortex_router)
app.include_router(crm_router)
app.include_router(comms_router)
app.include_router(media_router)
app.include_router(flows_router)
app.include_router(ai_router)
app.include_router(signals_router)
app.include_router(system_router)
app.include_router(pocket_router)


# ── Frontend Static & SPA Serving (Appliance Mode) ───────────────────────────

FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        # Let API routes, OpenAPI docs, and schema 404 naturally if unmatched
        if (
            full_path.startswith("api/")
            or full_path == "api"
            or full_path.startswith("docs")
            or full_path.startswith("redoc")
            or full_path.startswith("openapi.json")
        ):
            raise HTTPException(status_code=404, detail="Not Found")

        # Check if the requested path matches an actual file in dist (favicon, manifest, sw.js, images, pdfs, etc.)
        if full_path:
            candidate_file = FRONTEND_DIST / full_path
            if candidate_file.is_file():
                return FileResponse(candidate_file)

        # Fallback to SPA index.html for client-side routing
        index_file = FRONTEND_DIST / "index.html"
        if index_file.is_file():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend distribution bundle not found")


# ── Launcher Execution ───────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("backend.app:app", host=host, port=port, log_level="info", reload=False)
