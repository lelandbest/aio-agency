from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from fastapi import HTTPException, Request

import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _BACKEND_DIR.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from backend.data_provider import create_provider, get_request_tenant_id, set_request_tenant_id, reset_request_tenant
from backend.auth_store import AuthStore, default_auth_db_path

logger = logging.getLogger(__name__)

_provider = None
_auth_store = None


def get_provider():
    global _provider
    if _provider is None:
        _provider = create_provider()
    return _provider


def get_auth_store() -> AuthStore:
    global _auth_store
    if _auth_store is None:
        _auth_store = AuthStore(default_auth_db_path())
    return _auth_store


auth_store = get_auth_store()
provider = get_provider()


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


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


def require_session(request: Request) -> dict[str, Any]:
    session = getattr(request.state, "session", None)
    if not session:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return session


def get_current_user_id(request: Request) -> str:
    session = require_session(request)
    user = session.get("user") or {}
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id is required.")
    return user_id


def require_capability(
    request: Request,
    capability_id: str,
    detail: str = "You do not have permission to perform this action.",
) -> dict[str, Any]:
    session = require_session(request)
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    user = session.get("user") or {}
    user_id = user.get("id")

    if not tenant_id or not user_id:
        raise HTTPException(status_code=403, detail="Active workspace and authenticated user are required.")

    capabilities = getattr(request.state, "capabilities", None)
    if capabilities is None:
        capabilities = get_auth_store().get_effective_capabilities(tenant_id, "user", user_id)
        request.state.capabilities = capabilities

    if capability_id not in capabilities:
        raise HTTPException(status_code=403, detail=detail)

    return session


def has_capability(request: Request, capability_id: str) -> bool:
    try:
        require_capability(request, capability_id)
        return True
    except HTTPException:
        return False


def is_client_context(request: Request) -> bool:
    return has_capability(request, "client.access")


def require_operator(request: Request, detail: str = "Only operators can perform this action.") -> dict[str, Any]:
    session = require_session(request)
    user = session.get("user") or {}
    if user.get("role") != "operator":
        raise HTTPException(status_code=403, detail=detail)
    return session
