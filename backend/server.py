import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import sys
import time
from base64 import b64decode
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urlencode
from uuid import uuid4

import uvicorn
from dotenv import load_dotenv
from fastapi import BackgroundTasks, Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from automation_service import test_automation_provider
from auth_store import AuthStore, default_auth_db_path
from ai_service import ai_assist_service, get_ai_provider_catalog, list_ollama_models
from ai_routing import log_ai_route, resolve_ai_route, validate_ai_routing_config
from data_provider import create_provider, get_request_tenant_id, reset_request_tenant, set_request_tenant_id
from orchestration import ExecutionEngine, emit_system_event, run_resume_worker, validate_prepared_flow_steps
try:
    from backend.planner import create_booking_execution_plan
    from backend.agent_definitions import AGENT_DEFINITIONS, expand_agent_action_tokens, validate_agent_action
    from backend.agent_runtime import AgentRegistry
    from backend.canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
    from backend.cortext_service import cortext_service
    from backend.email_verifier_service import create_bulk_task as create_email_verifier_bulk_task, get_bulk_results as get_email_verifier_bulk_results, verify_single_email as verify_single_email_address
    from backend.operator_assist import generate_assist_response
    from backend.system_health import build_system_health
    from backend.tenant_deployment import DeploymentFailureError
    from backend.tools import AIOToolRegistry
    from backend.media_engine import get_media_engine
except ModuleNotFoundError:
    from planner import create_booking_execution_plan
    from agent_definitions import AGENT_DEFINITIONS, expand_agent_action_tokens, validate_agent_action
    from agent_runtime import AgentRegistry
    from canonical_settings import apply_calendar_event_defaults, normalize_tenant_settings_payload
    from cortext_service import cortext_service
    from email_verifier_service import create_bulk_task as create_email_verifier_bulk_task, get_bulk_results as get_email_verifier_bulk_results, verify_single_email as verify_single_email_address
    from operator_assist import generate_assist_response
    from system_health import build_system_health
    from tenant_deployment import DeploymentFailureError
    from tools import AIOToolRegistry
    from media_engine import get_media_engine
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
    google_calendar_list,
    google_primary_calendar,
    google_profile,
    microsoft_calendar_list,
    microsoft_primary_calendar,
    microsoft_profile,
)

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

provider = create_provider()
auth_store = AuthStore(default_auth_db_path())
GOOGLE_APP_AUTH_SCOPE = "openid email profile"
OAUTH_STATE_TTL_SECONDS = 900

AGENT_RUNTIME_REGISTRY: dict[str, dict[str, Any]] = {
    "ALPHA": {
        "registry_key": "ALPHA",
        "label": "Commander-in-Chief",
        "rank": "Commander",
        "role": "HQ",
        "specialization": "Commander-in-Chief",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": ["BRAVO", "CHARLIE", "DELTA", "ECHO", "FORGE", "GHOST", "ARCHER", "ATLAS", "RANGER", "SCOUT", "STRIKER", "VECTOR"],
        "tools": [
            "Mission Brief Generator",
            "Resource Allocation Optimizer",
            "Squad Performance Dashboard",
            "Integration Protocol Generator",
            "Strategic Directive Builder",
            "query_vault",
        ],
    },
    "BRAVO": {
        "registry_key": "BRAVO",
        "label": "Business Strategy",
        "rank": "AI Agent",
        "role": "Strategy",
        "specialization": "Business Strategy",
        "visibility": "visible",
        "capability_tier": "tier-2",
        "subordinates": [],
        "tools": ["Strategic Plan Generator", "SWOT Analysis Builder", "Growth Strategy Framework", "query_vault"],
    },
    "CHARLIE": {
        "registry_key": "CHARLIE",
        "label": "Customer Support",
        "rank": "AI Agent",
        "role": "Support",
        "specialization": "Customer Support",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["Support Script Generator", "FAQ Builder", "Customer Response Templates", "Support Ticket Optimizer", "query_vault"],
    },
    "DELTA": {
        "registry_key": "DELTA",
        "label": "Visual/Project Coordination",
        "rank": "AI Agent",
        "role": "Coordination",
        "specialization": "Visual/Project Coordination",
        "visibility": "visible",
        "capability_tier": "tier-2",
        "subordinates": [],
        "tools": ["Project Timeline Generator", "Resource Allocation Matrix", "Task Priority Framework", "query_vault"],
    },
    "ECHO": {
        "registry_key": "ECHO",
        "label": "Email/Comms/Socials",
        "rank": "AI Agent",
        "role": "Comms",
        "specialization": "Email/Comms/Socials",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["Email Template Generator", "Newsletter Builder", "Communication Plan Creator", "Social Campaign Builder", "query_vault"],
    },
    "FORGE": {
        "registry_key": "FORGE",
        "label": "Content/Copywriting",
        "rank": "AI Agent",
        "role": "Copy",
        "specialization": "Content/Copywriting",
        "visibility": "visible",
        "capability_tier": "tier-2",
        "subordinates": [],
        "tools": ["Article Generator", "Landing Page Copy Generator", "Brand Story Creator", "query_vault"],
    },
    "GHOST": {
        "registry_key": "GHOST",
        "label": "Systems Engineering",
        "rank": "AI Agent",
        "role": "Engineering",
        "specialization": "Systems Engineering",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["System Architecture Planner", "Automation Playbook Builder", "API Integration Design", "Security Hardening Checklist", "query_vault"],
    },
    "ARCHER": {
        "registry_key": "ARCHER",
        "label": "Analytics/Financial",
        "rank": "AI Agent",
        "role": "Analytics",
        "specialization": "Analytics/Financial",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["KPI Dashboard Generator", "Financial Report Builder", "ROI Calculator", "query_vault"],
    },
    "ATLAS": {
        "registry_key": "ATLAS",
        "label": "Logistics/Systems Mapping",
        "rank": "AI Agent",
        "role": "Logistics",
        "specialization": "Logistics/Systems Mapping",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["Deployment Coordination Plan", "Systems Map Builder", "Resource Movement Tracker", "Runbook Routing Matrix", "query_vault"],
    },
    "RANGER": {
        "registry_key": "RANGER",
        "label": "SEO/Content Optimization",
        "rank": "AI Agent",
        "role": "SEO",
        "specialization": "SEO/Content Optimization",
        "visibility": "visible",
        "capability_tier": "tier-2",
        "subordinates": [],
        "tools": ["SEO Blog Writer", "SEO Auditor", "Keyword Research Generator", "query_vault"],
    },
    "SCOUT": {
        "registry_key": "SCOUT",
        "label": "Hiring/Recruitment",
        "rank": "AI Agent",
        "role": "Recruitment",
        "specialization": "Hiring/Recruitment",
        "visibility": "visible",
        "capability_tier": "tier-2",
        "subordinates": [],
        "tools": ["Job Description Generator", "Interview Question Builder", "Candidate Assessment Template", "query_vault"],
    },
    "STRIKER": {
        "registry_key": "STRIKER",
        "label": "Sales/Negotiation",
        "rank": "AI Agent",
        "role": "Sales",
        "specialization": "Sales/Negotiation",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["Cold Email Generator", "Discovery Call Script Writer", "Proposal Builder", "Negotiation Advisor", "query_vault"],
    },
    "VECTOR": {
        "registry_key": "VECTOR",
        "label": "Graphics/Design",
        "rank": "AI Agent",
        "role": "Design",
        "specialization": "Graphics/Design",
        "visibility": "visible",
        "capability_tier": "tier-2",
        "subordinates": [],
        "tools": ["Image Generation", "Design Brief Builder", "Brand Style Guide Generator", "query_vault"],
    },
    "OMEGA": {
        "registry_key": "OMEGA",
        "label": "Emergency Governance",
        "rank": "Shadow Authority",
        "role": "Governance",
        "specialization": "Emergency Local Purge Control",
        "visibility": "hidden",
        "capability_tier": "restricted",
        "subordinates": [],
        "tools": ["Emergency Purge Arming", "Purge Countdown Control", "Emergency Cancel Validation", "Audit Seal Recorder"],
    },
}

VISIBLE_AGENT_KEYS = [key for key, value in AGENT_DEFINITIONS.items() if value.visibility != "hidden"]


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def safe_int(value: Any, default: int | None = None) -> int | None:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


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


def reset_runtime_stores() -> None:
    global provider, auth_store
    auth_store = AuthStore(default_auth_db_path())
    provider = create_provider()


def purge_local_app_data() -> list[str]:
    removed_paths: list[str] = []
    for path in omega_local_data_paths():
        if path.exists():
            path.unlink()
            removed_paths.append(str(path))
    reset_runtime_stores()
    return removed_paths


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(str(data or "").split())
        if text:
            self.parts.append(text)


def normalize_ingest_text(value: str | None) -> str:
    lines = [" ".join(line.split()) for line in str(value or "").replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line).strip()


def html_to_text(value: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(value)
    parser.close()
    return " ".join(parser.parts).strip()


def extract_url_text(url: str) -> tuple[str, str]:
    request = urlrequest.Request(
        url,
        headers={"User-Agent": "AIOCRM/1.0 (+local-first brain ingest)"},
        method="GET",
    )
    try:
        with urlrequest.urlopen(request, timeout=20) as response:
            content_type = response.headers.get("Content-Type", "")
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read()
    except (urlerror.HTTPError, urlerror.URLError, TimeoutError, OSError) as error:
        raise ValueError(f"Unable to fetch URL for Brain ingest: {error}") from error
    decoded = body.decode(charset, errors="ignore")
    text = html_to_text(unescape(decoded)) if "html" in content_type.lower() else decoded
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        raise ValueError("The URL did not return readable text.")
    return cleaned, content_type


def extract_file_text(file_name: str | None, mime_type: str | None, content_base64: str | None) -> str:
    if not content_base64:
        raise ValueError("File content is required for Brain file ingest.")
    
    normalized_name = (file_name or "").lower()
    normalized_type = (mime_type or "").lower()
    
    # Document / Text Formats
    text_extensions = (".txt", ".md", ".markdown", ".csv", ".vtt", ".json", ".xml")
    rich_text_extensions = (".rtf", ".doc", ".docx", ".pdf", ".xls", ".xlsx", ".odt")
    media_extensions = (".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi")
    image_extensions = (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp")

    try:
        payload = b64decode(content_base64)
    except Exception as error:  # pragma: no cover
        raise ValueError("Unable to decode uploaded file.") from error

    if normalized_name.endswith(text_extensions) or "text" in normalized_type or "json" in normalized_type:
        decoded = payload.decode("utf-8", errors="ignore")
        if "html" in normalized_type or normalized_name.endswith((".html", ".htm")):
            decoded = html_to_text(unescape(decoded))
        cleaned = " ".join(decoded.split()).strip()
        if not cleaned:
            raise ValueError("The uploaded text file appears to be empty.")
        return cleaned

    if normalized_name.endswith(rich_text_extensions):
        # Stub for complex document extraction (PDF, Word, Excel)
        return f"[DOCUMENT STUB] Content from '{normalized_name}' will be extracted via document-processing workflow. Metadata indexed for now."

    if normalized_name.endswith(media_extensions):
        # Stub for transcription service
        return f"[TRANSCRIPTION STUB] Audio/Video content from '{normalized_name}' is queued for transcription. Operating memory will be updated once complete."

    if normalized_name.endswith(image_extensions):
        # Stub for OCR/Image Analysis
        return f"[IMAGE STUB] Visual content from '{normalized_name}' is queued for OCR and scene analysis."

    raise ValueError(f"File type '{normalized_name.split('.')[-1]}' is not yet supported for direct Brain ingestion.")


def build_brain_assist_query(current_value: str, context: dict[str, Any], tenant: dict[str, Any]) -> str:
    parts: list[str] = []
    for value in [
        current_value,
        context.get("subject"),
        context.get("summary"),
        context.get("description"),
        context.get("label"),
        context.get("name"),
        context.get("company_name"),
        context.get("company"),
        context.get("notes"),
        (context.get("profile") or {}).get("company_name") if isinstance(context.get("profile"), dict) else "",
        tenant.get("name"),
    ]:
        text = " ".join(str(value or "").split()).strip()
        if text and text not in parts:
            parts.append(text)
    return " | ".join(parts[:4]).strip()


def summarize_runtime_excerpt(value: Any, fallback: str = "") -> str:
    text = " ".join(str(value or "").split()).strip()
    if not text:
        return fallback
    return f"{text[:277].rstrip()}..." if len(text) > 280 else text


def resolve_brain_mcp_source(source_id: str) -> dict[str, Any]:
    source = next((item for item in provider.list_brain_sources() if item.get("id") == source_id), None)
    if not source:
        raise ValueError("MCP server not found.")
    if (source.get("source_type") or "").strip().lower() != "mcp":
        raise ValueError("This Brain source is not an MCP server.")
    return source


def resolve_brain_mcp_endpoint(source: dict[str, Any]) -> str:
    endpoint = (source.get("location") or "").strip()
    if not endpoint:
        raise ValueError("This MCP server does not have an endpoint configured.")
    if not endpoint.lower().startswith(("http://", "https://")):
        raise ValueError("Only HTTP(S) MCP endpoints are supported right now.")
    return endpoint


def set_brain_mcp_status(source_id: str, status: str) -> dict[str, Any]:
    return provider.update_brain_source(source_id, {"status": status})


def request_brain_mcp(source: dict[str, Any], payload: dict[str, Any] | None = None, query_params: dict[str, Any] | None = None) -> Any:
    endpoint = resolve_brain_mcp_endpoint(source)
    if query_params:
        suffix = urlencode({key: value for key, value in query_params.items() if value not in (None, "")})
        if suffix:
            joiner = "&" if "?" in endpoint else "?"
            endpoint = f"{endpoint}{joiner}{suffix}"
    encoded = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urlrequest.Request(
        endpoint,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
            "User-Agent": "AIOCRM/1.0 (+brain-mcp-runtime)",
        },
        data=encoded,
        method="POST" if encoded is not None else "GET",
    )
    try:
        with urlrequest.urlopen(request, timeout=15) as response:
            content_type = response.headers.get("Content-Type", "")
            charset = response.headers.get_content_charset() or "utf-8"
            body = response.read()
    except (urlerror.HTTPError, urlerror.URLError, TimeoutError, OSError) as error:
        raise ValueError(f"Unable to reach MCP server: {error}") from error
    decoded = body.decode(charset, errors="ignore").strip()
    if not decoded:
        return {}
    if "json" in content_type.lower():
        try:
            return json.loads(decoded)
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(decoded)
    except json.JSONDecodeError:
        return {"content": decoded}


def normalize_brain_mcp_results(source: dict[str, Any], payload: Any, query: str, limit: int) -> list[dict[str, Any]]:
    entries: list[Any]
    if isinstance(payload, list):
        entries = payload
    elif isinstance(payload, dict):
        for key in ["results", "data", "items"]:
            value = payload.get(key)
            if isinstance(value, list):
                entries = value
                break
        else:
            entries = [payload]
    elif payload is None:
        entries = []
    else:
        entries = [payload]

    results: list[dict[str, Any]] = []
    for index, entry in enumerate(entries[: max(1, limit)], start=1):
        if isinstance(entry, dict):
            title = next(
                (
                    str(entry.get(key)).strip()
                    for key in ["title", "label", "name", "subject", "id"]
                    if str(entry.get(key) or "").strip()
                ),
                f"{source.get('label') or 'MCP'} result {index}",
            )
            excerpt = next(
                (
                    summarize_runtime_excerpt(entry.get(key))
                    for key in ["excerpt", "summary", "content", "text", "message", "result", "details"]
                    if summarize_runtime_excerpt(entry.get(key))
                ),
                summarize_runtime_excerpt(json.dumps(entry, default=str), "No MCP response content."),
            )
        else:
            title = f"{source.get('label') or 'MCP'} result {index}"
            excerpt = summarize_runtime_excerpt(entry, "No MCP response content.")
        results.append(
            {
                "id": f"{source.get('id')}-mcp-{index}",
                "kind": "mcp",
                "title": title,
                "excerpt": excerpt,
                "source_id": source.get("id"),
                "source_label": source.get("label") or "MCP Server",
                "score": max(1, limit - index + 1) + 5,
                "matched_terms": [query] if query else [],
                "runtime": True,
            }
        )
    return results


def probe_brain_mcp_source(source: dict[str, Any]) -> dict[str, Any]:
    attempts = [
        {"payload": {"action": "probe", "source_id": source.get("id"), "label": source.get("label")}},
        {"query_params": {"action": "probe"}},
    ]
    last_error: ValueError | None = None
    for attempt in attempts:
        try:
            response = request_brain_mcp(source, payload=attempt.get("payload"), query_params=attempt.get("query_params"))
            refreshed = set_brain_mcp_status(str(source.get("id")), "connected")
            message = ""
            if isinstance(response, dict):
                message = summarize_runtime_excerpt(
                    response.get("message") or response.get("status") or response.get("result") or response.get("content"),
                    "Connected",
                )
            else:
                message = summarize_runtime_excerpt(response, "Connected")
            return {"source": refreshed, "status": refreshed.get("status") or "connected", "message": message or "Connected"}
        except ValueError as error:
            last_error = error
    set_brain_mcp_status(str(source.get("id")), "error")
    raise ValueError(str(last_error or "Unable to reach MCP server."))


def query_brain_mcp_source(source: dict[str, Any], query: str, limit: int = 5) -> dict[str, Any]:
    resolved_query = " ".join(str(query or "").split()).strip()
    if not resolved_query:
        raise ValueError("A query is required to search this MCP server.")
    attempts = [
        {"payload": {"action": "query", "query": resolved_query, "limit": max(1, limit)}},
        {"query_params": {"action": "query", "query": resolved_query, "limit": max(1, limit)}},
    ]
    last_error: ValueError | None = None
    for attempt in attempts:
        try:
            response = request_brain_mcp(source, payload=attempt.get("payload"), query_params=attempt.get("query_params"))
            refreshed = set_brain_mcp_status(str(source.get("id")), "connected")
            return {
                "source": refreshed,
                "results": normalize_brain_mcp_results(refreshed, response, resolved_query, max(1, limit)),
            }
        except ValueError as error:
            last_error = error
    set_brain_mcp_status(str(source.get("id")), "error")
    raise ValueError(str(last_error or "Unable to query MCP server."))


def search_brain_mcp_memory(query: str, limit: int = 6) -> list[dict[str, Any]]:
    resolved_query = " ".join(str(query or "").split()).strip()
    if not resolved_query:
        return []
    results: list[dict[str, Any]] = []
    sources = [
        source
        for source in provider.list_brain_sources()
        if (source.get("source_type") or "").strip().lower() == "mcp" and (source.get("location") or "").strip()
    ]
    per_source_limit = max(1, min(3, limit))
    for source in sources[:4]:
        try:
            payload = query_brain_mcp_source(source, resolved_query, limit=per_source_limit)
        except ValueError:
            continue
        results.extend(payload.get("results") or [])
        if len(results) >= max(1, limit) * 2:
            break
    results.sort(key=lambda item: (item.get("score") or 0, item.get("title") or ""), reverse=True)
    return results[: max(1, limit)]


def collect_brain_memory_results(query: str, limit: int = 5, include_runtime: bool = False) -> list[dict[str, Any]]:
    stored_results = provider.search_brain_memory(query, limit=max(1, limit))
    runtime_results = search_brain_mcp_memory(query, limit=max(1, limit)) if include_runtime else []
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for entry in [*runtime_results, *stored_results]:
        key = (str(entry.get("kind") or ""), str(entry.get("id") or ""))
        if key in seen:
            continue
        seen.add(key)
        merged.append(entry)
        if len(merged) >= max(1, limit):
            break
    return merged


def inject_brain_context(query: str, context: dict[str, Any], tenant: dict[str, Any]) -> dict[str, Any]:
    """Injects vault context into the provided context dictionary."""
    if not query:
        return context

    # Limit query_vault results to 5 chunks and safe token cap
    brain_results = collect_brain_memory_results(query, limit=5, include_runtime=True)
    if brain_results:
        context["brain_memory"] = brain_results
        context["brain_memory_summary"] = "\n".join(
            [
                f"{entry.get('title')}: {str(entry.get('excerpt') or '')[:300]}..."
                for entry in brain_results
            ]
        )
        context["brain_memory_query"] = query
    return context


def list_runtime_agents(include_hidden: bool = False) -> list[dict[str, Any]]:
    keys = list(AGENT_DEFINITIONS.keys()) if include_hidden else VISIBLE_AGENT_KEYS
    agents = []
    conn = sqlite3.connect(provider.db_path)
    conn.row_factory = sqlite3.Row
    try:
        for key in keys:
            definition = AGENT_DEFINITIONS[key]
            agent = {
                "registry_key": definition.name,
                "name": definition.name,
                "label": definition.label,
                "rank": definition.rank,
                "role": definition.role,
                "specialization": definition.specialization,
                "visibility": definition.visibility,
                "capability_tier": definition.capability_tier,
                "subordinates": definition.subordinates,
                "tools": definition.tools,
                "capabilities": definition.capabilities,
                "agent_id": definition.agent_id,
            }
            row = conn.execute("SELECT id FROM agents WHERE registry_key = ?", (key,)).fetchone()
            if row:
                agent["id"] = row["id"]
            agents.append(agent)
    finally:
        conn.close()
    return agents


def normalize_agent_key(value: Any) -> str:
    resolved = " ".join(str(value or "").split()).strip().upper()
    return resolved if resolved in AGENT_DEFINITIONS else ""


def extract_requested_agent(command_text: str = "", explicit: str = "") -> str:
    direct = normalize_agent_key(explicit)
    if direct:
        return direct
    if not command_text:
        return ""
    command_upper = command_text.upper()
    for key in VISIBLE_AGENT_KEYS:
        if re.search(rf"\b{re.escape(key)}\b", command_upper):
            return key
    return ""


def resolve_permission_tier(command_text: str, field: str = "", intent: str = "") -> str:
    haystack = " ".join([str(command_text or ""), str(field or ""), str(intent or "")]).lower()
    if intent == "query_vault":
        return "safe"
    if any(term in haystack for term in ["assign", "archive", "close", "schedule", "create deal", "run workflow", "trigger workflow", "send "]):
        return "guarded"
    return "safe"


def choose_specialist_for_command(module: str, surface: str, field: str, command_text: str, context: dict[str, Any]) -> str:
    explicit_agent = extract_requested_agent(
        command_text,
        explicit=str(
            context.get("agent_role")
            or context.get("assignee")
            or context.get("selected_agent")
            or context.get("agent")
            or context.get("requested_agent")
            or ""
        ),
    )
    if explicit_agent and explicit_agent != "OMEGA":
        return explicit_agent
    haystack = " ".join(
        [
            str(command_text or ""),
            str(field or ""),
            str(surface or ""),
            str(module or ""),
            str(context.get("summary") or ""),
            str(context.get("subject") or ""),
            str(context.get("description") or ""),
            str(context.get("notes") or ""),
        ]
    ).lower()
    normalized_module = " ".join(str(module or "").split()).strip().lower()
    normalized_field = " ".join(str(field or "").split()).strip().lower()
    if normalized_module == "comms":
        if normalized_field in {"summary", "brief", "refresh-brief"}:
            return "CHARLIE"
        if normalized_field in {"draft-reply", "reply", "rewrite", "rewrite-draft"}:
            return "STRIKER"
        if normalized_field in {"extract", "extract-tasks", "schedule", "schedule-follow-up", "run-workflow", "workflow"}:
            return "ALPHA"
    if any(term in haystack for term in ["support", "ticket", "help desk", "customer success", "faq", "issue resolution", "service"]):
        return "CHARLIE"
    if any(term in haystack for term in ["email", "newsletter", "campaign", "social", "hashtag", "channel", "outreach", "response template"]):
        return "ECHO"
    if any(term in haystack for term in ["proposal", "deal", "close", "negotiat", "pipeline", "revenue", "follow-up", "discovery call", "sales"]):
        return "STRIKER"
    if any(term in haystack for term in ["strategy", "swot", "market", "positioning", "growth plan", "business model"]):
        return "BRAVO"
    if any(term in haystack for term in ["project", "timeline", "milestone", "coordinate", "meeting follow-up"]):
        return "DELTA"
    if any(term in haystack for term in ["logistics", "deployment", "runbook", "system map", "resource movement", "handoff"]):
        return "ATLAS"
    if any(term in haystack for term in ["api", "code", "devops", "infra", "bug", "engineering", "it ", "site", "automation", "integration"]):
        return "GHOST"
    if any(term in haystack for term in ["analytics", "financial", "roi", "kpi", "forecast", "reporting", "budget"]):
        return "ARCHER"
    if any(term in haystack for term in ["content", "copy", "article", "landing page", "brand story", "product description"]):
        return "FORGE"
    if any(term in haystack for term in ["seo", "keyword", "ranking", "meta description", "organic"]):
        return "RANGER"
    if any(term in haystack for term in ["hire", "recruit", "candidate", "interview", "onboarding"]):
        return "SCOUT"
    if any(term in haystack for term in ["design", "visual", "creative", "palette", "asset", "graphics", "style guide"]):
        return "VECTOR"
    if "comms" in haystack:
        return "CHARLIE"
    return "ALPHA"


def resolve_ai_run_routing(module: str, surface: str, field: str, intent: str, command_text: str, context: dict[str, Any]) -> dict[str, Any]:
    requested_agent = extract_requested_agent(command_text, explicit=str(context.get("requested_agent") or ""))
    if requested_agent == "OMEGA":
        requested_agent = ""
    executing_agent = choose_specialist_for_command(module, surface, field, command_text, context)
    permission_tier = resolve_permission_tier(command_text, field=field, intent=intent)
    intake_agent = "CHARLIE"
    dispatcher_agent = "ALPHA"
    delegate_chain = [intake_agent, dispatcher_agent]
    if requested_agent and requested_agent not in delegate_chain and requested_agent != executing_agent:
        delegate_chain.append(requested_agent)
    if executing_agent and executing_agent not in delegate_chain:
        delegate_chain.append(executing_agent)
    return {
        "intake_agent": intake_agent,
        "dispatcher_agent": dispatcher_agent,
        "requested_agent": requested_agent or None,
        "executing_agent": executing_agent,
        "delegate_chain": delegate_chain,
        "permission_tier": permission_tier,
    }


def build_ai_run_steps(
    *,
    brain_results: list[dict[str, Any]],
    applied_thread: dict[str, Any] | None = None,
    draft_text: str = "",
) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    if brain_results:
        runtime_count = sum(1 for item in brain_results if item.get("runtime"))
        steps.append(
            {
                "kind": "retrieval",
                "status": "completed",
                "label": "Brain retrieval",
                "summary": f"{len(brain_results)} memory match(es) pulled for context.",
                "runtime_hits": runtime_count,
            }
        )
        if runtime_count:
            steps.append(
                {
                    "kind": "tool",
                    "status": "completed",
                    "label": "MCP query",
                    "summary": f"{runtime_count} live MCP result(s) merged into the run context.",
                }
            )
    steps.append(
        {
            "kind": "generation",
            "status": "completed",
            "label": "AI assist",
            "summary": "Suggestion generated through the shared AI assist path.",
        }
    )
    if applied_thread:
        steps.append(
            {
                "kind": "writeback",
                "status": "completed",
                "label": "Thread writeback",
                "summary": "Thread brief and related Comms state updated from the run result.",
            }
        )
    if draft_text:
        steps.append(
            {
                "kind": "artifact",
                "status": "completed",
                "label": "Draft artifact",
                "summary": "A draft output was produced for operator review.",
            }
        )
    return steps


def extract_run_result_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return "\n".join(filter(None, (extract_run_result_text(item) for item in value))).strip()
    if isinstance(value, dict):
        for key in ("message", "suggestion", "summary", "content", "result", "output", "answer"):
            text = extract_run_result_text(value.get(key))
            if text:
                return text
        return "\n".join(
            filter(
                None,
                (
                    f"{str(key).replace('_', ' ').title()}: {extract_run_result_text(item)}".strip()
                    for key, item in value.items()
                ),
            )
        ).strip()
    return ""


def derive_agent_chain_from_steps(steps: list[dict[str, Any]]) -> list[str]:
    chain: list[str] = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        agent = str(step.get("assignedAgent") or step.get("agent") or "").strip().upper()
        if agent and agent not in chain:
            chain.append(agent)
    return chain


def extract_flow_graph(flow: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    spec = flow.get("spec") if isinstance(flow.get("spec"), dict) else {}
    spec_nodes = spec.get("nodes") if isinstance(spec.get("nodes"), list) else []
    spec_edges = spec.get("edges") if isinstance(spec.get("edges"), list) else []
    nodes = spec_nodes or (flow.get("nodes") if isinstance(flow.get("nodes"), list) else [])
    edges = spec_edges or (flow.get("edges") if isinstance(flow.get("edges"), list) else [])
    return nodes, edges


def order_flow_nodes(nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not nodes:
        return []
    node_map = {str(node.get("id")): node for node in nodes if node.get("id")}
    ordered_ids: list[str] = []
    indegree = {node_id: 0 for node_id in node_map}
    adjacency = {node_id: [] for node_id in node_map}

    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source in adjacency and target in indegree:
            adjacency[source].append(target)
            indegree[target] += 1

    queue = [node_id for node_id, degree in indegree.items() if degree == 0]
    queue.sort(key=lambda node_id: next((index for index, node in enumerate(nodes) if str(node.get("id")) == node_id), 0))

    while queue:
        node_id = queue.pop(0)
        ordered_ids.append(node_id)
        for target in adjacency.get(node_id, []):
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        if node_id and node_id not in ordered_ids:
            ordered_ids.append(node_id)

    return [node_map[node_id] for node_id in ordered_ids if node_id in node_map]


def infer_flow_step_agent(node: dict[str, Any], fallback_agent: str = "") -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    for candidate in (
        data.get("assignedAgent"),
        data.get("agent"),
        data.get("agentKey"),
        data.get("selectedAgent"),
        node.get("assignedAgent"),
        node.get("agent"),
    ):
        normalized = normalize_agent_key(candidate)
        if normalized:
            return normalized

    haystacks = [
        str(node.get("id") or ""),
        str(node.get("type") or ""),
        str(data.get("label") or ""),
        str(data.get("description") or ""),
        str(data.get("typeLabel") or ""),
    ]
    for agent_name in AGENT_DEFINITIONS.keys():
        for haystack in haystacks:
            if re.search(rf"\b{re.escape(agent_name)}\b", haystack, flags=re.IGNORECASE):
                return agent_name
    return normalize_agent_key(fallback_agent) or "ALPHA"


def parse_json_config(value: Any) -> dict[str, Any]:
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


def infer_flow_step_intent(node: dict[str, Any]) -> str:
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    config = data.get("config") if isinstance(data.get("config"), dict) else {}
    template_id = str(data.get("templateId") or node.get("templateId") or "").strip().lower().replace("-", "_")
    node_type = str(node.get("type") or "").strip().lower()
    action_type = str(
        config.get("actionType")
        or data.get("actionType")
        or ""
    ).strip().lower()
    logic_type = str(
        config.get("logicType")
        or data.get("logicType")
        or ""
    ).strip().lower()
    if action_type in {"create_booking", "update_booking", "cancel_booking", "get_booking", "verify_email", "verify_email_bulk", "generate_script", "generate_run_of_show", "generate_voice", "text_to_speech", "generate_thumbnail", "generate_video", "transcribe_media", "ingest_meeting_artifacts", "publish_asset"}:
        return action_type
    if action_type in {"set_variable", "send_email", "send_sms", "store_data", "http_request"}:
        return action_type
    if logic_type in {"if_then", "wait_for_verification", "verification_branch", "time_delay", "delay", "filter", "switch"}:
        return "time_delay" if logic_type in {"time_delay", "delay"} else logic_type
    if template_id in {"time_delay", "delay"}:
        return "time_delay"
    if template_id in {"filter", "switch"}:
        return template_id
    if template_id in {"set_variable", "send_email", "send_sms", "store_data", "http_request", "generate_script", "generate_run_of_show", "generate_voice", "text_to_speech", "generate_thumbnail", "generate_video", "transcribe_media", "ingest_meeting_artifacts", "publish_asset"}:
        return template_id
    if node_type == "webhook" and template_id == "webhook":
        return "webhook"
    return "agent_task"


def normalize_flow_trigger_key(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def trigger_node_event_keys(node: dict[str, Any]) -> set[str]:
    if str(node.get("type") or "").lower() != "trigger":
        return set()
    data = node.get("data") if isinstance(node.get("data"), dict) else {}
    config = data.get("config") if isinstance(data.get("config"), dict) else {}
    candidates = {
        config.get("event"),
        data.get("templateId"),
        data.get("id"),
        data.get("label"),
        node.get("id"),
    }
    keys: set[str] = set()
    for candidate in candidates:
        normalized = normalize_flow_trigger_key(candidate)
        if not normalized:
            continue
        keys.add(normalized)
        if normalized.endswith("_trigger"):
            keys.add(normalized[:-8])
    return keys


def resolve_flow_trigger_targets(flow: dict[str, Any], trigger_key: str) -> list[str]:
    normalized_key = normalize_flow_trigger_key(trigger_key)
    if not normalized_key:
        return []
    nodes, edges = extract_flow_graph(flow)
    outgoing_by_node: dict[str, list[str]] = {}
    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source and target:
            outgoing_by_node.setdefault(source, []).append(target)
    targets: list[str] = []
    seen: set[str] = set()
    for node in nodes:
        node_id = str(node.get("id") or "").strip()
        if not node_id or normalized_key not in trigger_node_event_keys(node):
            continue
        for target in outgoing_by_node.get(node_id, []):
            if target and target not in seen:
                seen.add(target)
                targets.append(target)
    return targets


def reachable_flow_node_ids(edges: list[dict[str, Any]], start_node_ids: list[str]) -> set[str]:
    outgoing_by_node: dict[str, list[str]] = {}
    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if source and target:
            outgoing_by_node.setdefault(source, []).append(target)
    reachable: set[str] = set()
    stack = [node_id for node_id in start_node_ids if node_id]
    while stack:
        node_id = stack.pop()
        if not node_id or node_id in reachable:
            continue
        reachable.add(node_id)
        for target in outgoing_by_node.get(node_id, []):
            if target not in reachable:
                stack.append(target)
    return reachable


def booking_event_payload(event: dict[str, Any] | None) -> dict[str, Any]:
    event = event or {}
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


def session_tenant_settings(tenant: dict[str, Any] | None) -> dict[str, Any]:
    tenant = tenant or {}
    candidate = tenant.get("tenant_settings") if isinstance(tenant.get("tenant_settings"), dict) else tenant.get("settings") or {}
    return normalize_tenant_settings_payload({"tenantSettings": candidate}, include_defaults=True)


def emit_booking_lifecycle_event(
    *,
    event_type: str,
    event: dict[str, Any],
    actor: dict[str, Any],
    tenant: dict[str, Any],
    provider_config: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    return emit_system_event(
        provider,
        {
            "type": event_type,
            "payload": booking_event_payload(event),
            "meta": {"depth": 0},
        },
        actor=actor,
        tenant=tenant,
        provider_config=provider_config,
    )


def build_flow_execution_steps(
    flow: dict[str, Any],
    command_text: str,
    fallback_agent: str = "",
    runtime_context: dict[str, Any] | None = None,
    start_node_ids: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    nodes, edges = extract_flow_graph(flow)
    ordered_nodes = order_flow_nodes(nodes, edges)
    outgoing_by_node: dict[str, list[dict[str, Any]]] = {}
    incoming_by_node: dict[str, list[dict[str, Any]]] = {}
    for edge in edges:
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if not source or not target:
            continue
        edge_data = edge.get("data") if isinstance(edge.get("data"), dict) else {}
        projected_edge = {
            "id": str(edge.get("id") or f"flow-edge-{uuid4().hex[:10]}"),
            "source": source,
            "target": target,
            "sourceHandle": edge.get("sourceHandle"),
            "targetHandle": edge.get("targetHandle"),
            "filters": edge_data.get("filters"),
            "data": edge_data,
        }
        outgoing_by_node.setdefault(source, []).append(projected_edge)
        incoming_by_node.setdefault(target, []).append(projected_edge)
    allowed_node_ids = reachable_flow_node_ids(edges, start_node_ids or []) if start_node_ids else None
    executable_nodes = [
        node for node in ordered_nodes
        if str(node.get("type") or "").lower() not in {"trigger", "frame", "note"}
        and (allowed_node_ids is None or str(node.get("id") or "").strip() in allowed_node_ids)
    ]
    raw_steps: list[dict[str, Any]] = []
    agent_chain: list[str] = []
    flow_id = str(flow.get("id") or "").strip()
    flow_name = str(flow.get("name") or "Untitled Flow").strip() or "Untitled Flow"
    step_count = len(executable_nodes)

    for index, node in enumerate(executable_nodes, start=1):
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        node_config = data.get("config") if isinstance(data.get("config"), dict) else {}
        action_intent = infer_flow_step_intent(node)
        node_id = str(node.get("id") or f"flow-node-{index}")
        node_label = str(data.get("label") or node.get("label") or f"Step {index}").strip() or f"Step {index}"
        node_description = str(data.get("description") or "").strip()
        assigned_agent = infer_flow_step_agent(node, fallback_agent or ("DELTA" if action_intent in {"create_booking", "update_booking", "cancel_booking", "get_booking"} else ""))
        agent_definition = AGENT_DEFINITIONS.get(assigned_agent) or AGENT_DEFINITIONS["ALPHA"]
        if assigned_agent not in agent_chain:
            agent_chain.append(assigned_agent)
        parameters: dict[str, Any] = {
            "original_command": command_text,
            "flow_id": flow_id,
            "flow_name": flow_name,
            "node_id": node_id,
            "node_type": str(node.get("type") or "action"),
            "node_label": node_label,
            "node_description": node_description,
            "step_index": index,
            "step_count": step_count,
            "node_config": node_config,
            "configuration": parse_json_config(node_config.get("configuration")),
            "outgoing_edges": outgoing_by_node.get(node_id, []),
            "incoming_edges": incoming_by_node.get(node_id, []),
            "trigger_event": runtime_context.get("trigger_event") if isinstance(runtime_context, dict) else None,
            "booking_event": runtime_context.get("booking_event") if isinstance(runtime_context, dict) else None,
        }
        if action_intent == "agent_task":
            step_command_parts = [
                f"Flow {flow_name} step {index} of {step_count}: {node_label}.",
                f"Operator command: {command_text}",
            ]
            if node_description:
                step_command_parts.append(f"Node description: {node_description}")
            if node_config.get("configuration"):
                step_command_parts.append(f"Node configuration: {node_config.get('configuration')}")
            if node_config.get("actionType"):
                step_command_parts.append(f"Action type: {node_config.get('actionType')}")
            parameters["command"] = " ".join(part for part in step_command_parts if part).strip()
        raw_steps.append(
            {
                "id": node_id,
                "intent": action_intent,
                "parameters": parameters,
                "assignedAgent": assigned_agent,
                "agentId": agent_definition.agent_id,
            }
        )
    return raw_steps, agent_chain


def validate_flow_graph(flow: dict[str, Any]) -> dict[str, list[str]]:
    blockers: list[str] = []
    warnings: list[str] = []
    nodes, edges = extract_flow_graph(flow)
    if not nodes:
        blockers.append("Flow has no nodes.")
        return {"blockers": blockers, "warnings": warnings}

    node_ids = {clean_text(node.get("id")) for node in nodes if clean_text(node.get("id"))}
    trigger_nodes = [node for node in nodes if clean_text(node.get("type")).lower() == "trigger"]
    if not trigger_nodes:
        blockers.append("Flow requires at least one trigger node.")

    for edge in edges:
        source = clean_text(edge.get("source"))
        target = clean_text(edge.get("target"))
        if not source or not target:
            blockers.append("Flow contains an edge without both source and target.")
            continue
        if source not in node_ids or target not in node_ids:
            blockers.append(f"Flow edge '{clean_text(edge.get('id')) or f'{source}->{target}'}' references a missing node.")

    if trigger_nodes:
        reachable = reachable_flow_node_ids(edges, [clean_text(node.get("id")) for node in trigger_nodes])
        for node in nodes:
            node_id = clean_text(node.get("id"))
            node_type = clean_text(node.get("type")).lower()
            if node_type in {"trigger", "frame", "note"}:
                continue
            if node_id and node_id not in reachable:
                blockers.append(f"Node '{clean_text((node.get('data') or {}).get('label')) or node_id}' is not reachable from any trigger.")
    return {"blockers": list(dict.fromkeys(blockers)), "warnings": list(dict.fromkeys(warnings))}


def flow_preflight_validation(flow: dict[str, Any], raw_steps: list[dict[str, Any]]) -> dict[str, list[str]]:
    graph_validation = validate_flow_graph(flow)
    step_validation = validate_prepared_flow_steps(raw_steps)
    return {
        "blockers": list(dict.fromkeys([*graph_validation["blockers"], *step_validation["blockers"]])),
        "warnings": list(dict.fromkeys([*graph_validation["warnings"], *step_validation["warnings"]])),
    }


def project_engine_run_for_ui(run: dict[str, Any] | None) -> dict[str, Any] | None:
    if not run:
        return None
    routing = run.get("routing") if isinstance(run.get("routing"), dict) else {}
    context = run.get("context") if isinstance(run.get("context"), dict) else {}
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    artifacts = run.get("artifacts") if isinstance(run.get("artifacts"), list) else []
    trace = run.get("trace") if isinstance(run.get("trace"), list) else []
    pending_approvals = run.get("pending_approvals") if isinstance(run.get("pending_approvals"), list) else []

    last_success = next((step for step in reversed(steps) if step.get("status") == "success"), None)
    last_error = next((step for step in reversed(steps) if step.get("status") == "error"), None)
    last_success_data = last_success.get("data") if isinstance(last_success, dict) and isinstance(last_success.get("data"), dict) else {}
    last_error_text = str((last_error or {}).get("error") or "").strip()
    result_text = (
        extract_run_result_text(last_success_data)
        or last_error_text
        or ""
    )
    delegate_chain = routing.get("delegate_chain")
    if not isinstance(delegate_chain, list):
        delegate_chain = []
    executing_agent = routing.get("executing_agent") or ""
    agent_chain = derive_agent_chain_from_steps(steps)
    for agent in agent_chain:
        if agent not in delegate_chain:
            delegate_chain.append(agent)
    if executing_agent and executing_agent not in delegate_chain:
        delegate_chain = [*delegate_chain, executing_agent]
    flow_id = str(
        context.get("flow_id")
        or context.get("flowId")
        or ((context.get("flow") or {}).get("id") if isinstance(context.get("flow"), dict) else "")
        or ""
    ).strip()
    flow_name = str(
        context.get("flow_name")
        or context.get("flowName")
        or ((context.get("flow") or {}).get("name") if isinstance(context.get("flow"), dict) else "")
        or ""
    ).strip()
    flow = {"id": flow_id, "name": flow_name} if flow_id else None
    projected_steps: list[dict[str, Any]] = []
    for index, step in enumerate(steps, start=1):
        if not isinstance(step, dict):
            continue
        step_parameters = step.get("parameters") if isinstance(step.get("parameters"), dict) else {}
        projected_steps.append(
            {
                **step,
                "step_index": step.get("step_index") or step.get("stepIndex") or step_parameters.get("step_index") or index,
                "agent": step.get("assignedAgent") or step.get("agent"),
                "output": extract_run_result_text(step.get("data")),
            }
        )
    return {
        "id": run.get("id"),
        "tenant_id": run.get("tenant_id"),
        "module": str(context.get("module") or "agents"),
        "surface": str(context.get("surface") or "command"),
        "field": str(context.get("field") or "command"),
        "intent": str(context.get("intent") or ("assist" if str(run.get("mode") or "").strip().lower() == "assist" else "command")),
        "status": run.get("status") or "completed",
        "agent_role": executing_agent or routing.get("requested_agent") or "ALPHA",
        "intake_agent": routing.get("intake_agent"),
        "dispatcher_agent": routing.get("dispatcher_agent"),
        "executing_agent": executing_agent or None,
        "requested_agent": routing.get("requested_agent"),
        "delegate_chain": delegate_chain,
        "agent_chain": agent_chain or delegate_chain,
        "permission_tier": routing.get("permission_tier"),
        "thread_id": str(context.get("thread_id") or "") or None,
        "contact_id": str(context.get("contact_id") or "") or None,
        "company_id": str(context.get("company_id") or "") or None,
        "command_text": run.get("command"),
        "provider_key": ((context.get("_provider_config") or {}).get("provider_key") if isinstance(context.get("_provider_config"), dict) else None),
        "provider_label": ((context.get("_provider_config") or {}).get("label") if isinstance(context.get("_provider_config"), dict) else None),
        "model": ((context.get("_provider_config") or {}).get("model") if isinstance(context.get("_provider_config"), dict) else None),
        "prompt": run.get("command"),
        "result": result_text,
        "output": result_text,
        "artifacts": artifacts,
        "steps": projected_steps,
        "step_count": int(context.get("step_count") or len(projected_steps) or 0),
        "flow": flow,
        "flow_id": flow_id or None,
        "flow_name": flow_name or None,
        "flowId": flow_id or None,
        "flowName": flow_name or None,
        "metadata": {
            "projection_source": "ai_engine_runs",
            "legacy_ai_runs_adapter": True,
            "scheduled_removal": "Remove compatibility projection after UI history consumers read ai_engine_runs natively.",
            "trace": trace,
            "context": context,
            "pending_approvals": pending_approvals,
        },
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
    }


def build_ai_run_artifacts(*, draft_text: str = "", thread: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    if draft_text:
        artifacts.append(
            {
                "artifact_type": "draft",
                "kind": "reply",
                "title": "AI Draft",
                "body": summarize_runtime_excerpt(draft_text, "Draft generated."),
            }
        )
    if thread and isinstance(thread.get("brief"), dict):
        brief = thread.get("brief") or {}
        artifacts.append(
            {
                "artifact_type": "brief",
                "kind": "thread-brief",
                "title": "AI Brief",
                "body": summarize_runtime_excerpt(
                    brief.get("summary") or brief.get("recommended_next_step"),
                    "Thread brief updated.",
                ),
            }
        )
    return artifacts


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("AIO CRM Backend starting up")
    logger.info("Environment: %s", os.getenv("ENVIRONMENT", "development"))
    logger.info("Provider: %s", provider.health())
    resume_worker = asyncio.create_task(run_resume_worker(provider))
    try:
        yield
    finally:
        resume_worker.cancel()
        try:
            await resume_worker
        except asyncio.CancelledError:
            pass
        logger.info("AIO CRM Backend shutting down")

app = FastAPI(
    title="AIO CRM Backend",
    description="Local-first backend API for AIO CRM",
    version="1.1.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        ",".join(
            [
                "http://localhost:5175",
                "http://127.0.0.1:5175",
                "http://0.0.0.0:5175",

                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://0.0.0.0:3000",
            ]
        ),
    ).split(",")
    if origin.strip()
]
# Add both normalized and trailing slash variants to the list for safety with CORSMiddleware
ALLOWED_ORIGINS = list(set(ALLOWED_ORIGINS + [f"{o}/" for o in ALLOWED_ORIGINS]))

# NOTE: CORSMiddleware is defined here but will be moved to after @app.middleware declarations
# to ensure it runs FIRST in the stack (LIFO ordering in FastAPI/Starlette).
# However, for clarity and baseline config, we keep the initialization logic here.
CORS_CONFIG = {
    "allow_origins": ALLOWED_ORIGINS,
    "allow_credentials": True,
    "allow_methods": ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    "allow_headers": ["Content-Type", "Authorization", "X-Session-Token", "X-Requested-With", "Accept", "Origin", "X-Tenant-Id"],
}


class AuthBootstrapRequest(BaseModel):
    name: str
    email: str
    password: str


class AuthForgotPasswordRequest(BaseModel):
    email: str


class AuthLoginRequest(BaseModel):
    email: str
    password: str


class AuthTenantSwitchRequest(BaseModel):
    tenant_id: str


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


class WorkspaceUserCreateRequest(BaseModel):
    username: str
    email: str
    password: str
    name: str
    role: str = "staff"
    user_role: str = "operator"
    create_workspace: bool = False
    workspace_name: str | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str
    phone: str | None = None
    locale: str | None = None
    timezone: str | None = None
    email_signature: str | None = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str


class GlobalVariableUpsertRequest(BaseModel):
    key: str
    value: str
    description: str | None = None
    is_secret: bool = False
    is_system: bool = False
    label: str | None = None
    category: str | None = None
    editable_by_client: bool = True


class CanonicalSettingsUpdateRequest(BaseModel):
    settings: dict[str, Any]


class TenantBlueprintImportRequest(BaseModel):
    blueprint: dict[str, Any]


class TenantDeployRequest(BaseModel):
    tenantName: str
    blueprintId: str | None = None
    blueprintPayload: dict[str, Any] | None = None
    overrides: dict[str, Any] | None = None
    switchToTenant: bool = False


class EmailVerifierConfigUpdateRequest(BaseModel):
    api_key: str | None = None
    enabled: bool | None = None
    auto_verify_contacts: bool | None = None
    default_mode: str | None = None


class EmailVerifierSingleRequest(BaseModel):
    email: str | None = None
    contact_id: str | None = None
    mode: str | None = None


class EmailVerifierBulkRequest(BaseModel):
    contact_ids: list[str] | None = None
    emails: list[str] | None = None
    mode: str | None = None


class BrainProfileUpdateRequest(BaseModel):
    company_name: str | None = None
    website: str | None = None
    industry: str | None = None
    overview: str | None = None
    mission: str | None = None
    brand_voice: str | None = None
    ideal_customer: str | None = None


class BrainSourceRequest(BaseModel):
    label: str
    source_type: str = "document"
    status: str = "draft"
    location: str = ""
    notes: str = ""
    graph_x: float | None = None
    graph_y: float | None = None


class BrainSourceUpdateRequest(BaseModel):
    label: str | None = None
    source_type: str | None = None
    status: str | None = None
    location: str | None = None
    notes: str | None = None
    graph_x: float | None = None
    graph_y: float | None = None


class BrainItemRequest(BaseModel):
    title: str
    category: str = "note"
    content: str = ""
    source_id: str | None = None
    status: str = "draft"
    tags: list[str] = []
    graph_x: float | None = None
    graph_y: float | None = None


class BrainItemUpdateRequest(BaseModel):
    title: str | None = None
    category: str | None = None
    content: str | None = None
    source_id: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    graph_x: float | None = None
    graph_y: float | None = None


class BrainLinkRequest(BaseModel):
    from_type: str
    from_id: str
    to_type: str
    to_id: str
    relationship_type: str = "supports"


class BrainIngestRequest(BaseModel):
    source_id: str | None = None
    label: str | None = None
    source_type: str = "document"
    status: str | None = None
    location: str = ""
    notes: str = ""
    ingest_type: str = "text"
    title: str | None = None
    content: str | None = None
    url: str | None = None
    file_name: str | None = None
    mime_type: str | None = None
    file_content_base64: str | None = None


class BrainMCPQueryRequest(BaseModel):
    query: str
    limit: int = 5


class SystemEmailTemplateUpdateRequest(BaseModel):
    subject: str | None = None
    send_to: str | None = None
    enabled: bool | None = None
    body_html: str | None = None
    body_text: str | None = None
    config: dict[str, Any] | None = None
    config: dict[str, Any] | None = None


class AIAssistRequest(BaseModel):
    module: str
    surface: str
    field: str
    intent: str = "draft"
    current_value: str = ""
    context: dict[str, Any] | None = None
    task: str | None = None
    route_hints: dict[str, Any] | None = None
    provider_override: dict[str, Any] | str | None = None


class OperatorAssistRequest(BaseModel):
    message: str
    context: dict[str, Any] | None = None


class AICommandRequest(BaseModel):
    command: str
    context: dict[str, Any] | None = None
    agent: str | None = None
    collabAgents: list[str] | None = None
    flow_id: str | None = None
    flowId: str | None = None


class OmegaArmRequest(BaseModel):
    confirmation_code: str
    cancel_code: str


class OmegaCancelRequest(BaseModel):
    cancel_code: str


class OmegaExecuteRequest(BaseModel):
    confirmation_code: str


class AIProviderUpsertRequest(BaseModel):
    label: str | None = None
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None
    enabled: bool = False
    is_default: bool = False
    status: str | None = None
    config: dict[str, Any] | None = None
    system_guardrails: str | None = None
    task_guardrails: str | None = None


class AIRoutingConfigRequest(BaseModel):
    features: dict[str, Any] | None = None
    tasks: dict[str, Any] | None = None
    fallback: dict[str, Any] | None = None
    version: int | None = None


class AutomationProviderUpsertRequest(BaseModel):
    label: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    enabled: bool = False
    status: str | None = None
    config: dict[str, Any] | None = None


class OllamaModelsRequest(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
    username: str | None = None
    password: str | None = None


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


class ThreadReportRequest(BaseModel):
    kind: str = "operator"


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
    provider: str = "google-calendar-oauth"
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
    provider: str = "gmail-oauth"
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

class TagCreateRequest(BaseModel):
    name: str
    label: str | None = None
    description: str | None = None
    color: str | None = None
    type: str = "user"

class TagUpdateRequest(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None


class ContactActivityCreateRequest(BaseModel):
    activity_type: str = "note"
    title: str = "Note"
    description: str = ""
    metadata: dict[str, Any] | None = None


class FlowSaveRequest(BaseModel):
    id: str | None = None
    name: str = "Untitled Flow"
    status: str = "Draft"
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    spec: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    createdBy: str | None = None
    lastEditedBy: str | None = None


class FlowDraftRequest(BaseModel):
    id: str | None = None
    createdAt: str | None = None
    createdBy: str | None = None
    intentSummary: str | None = None
    assumptions: list[str] | None = None
    requiredInputs: list[Any] | None = None
    draftSpec: dict[str, Any] | None = None
    validationPlan: dict[str, Any] | None = None
    activationChecklist: list[str] | None = None
    agentSnapshot: dict[str, Any] | None = None
    source: str | None = None
    metadata: dict[str, Any] | None = None


class FlowManualTriggerRequest(BaseModel):
    command: str | None = None
    context: dict[str, Any] | None = None


class MediaRenderRequest(BaseModel):
    provider: str | None = None
    title: str | None = None
    asset_type: str | None = None
    media_type: str | None = "video"
    source_url: str | None = None
    output_url: str | None = None
    script: str | None = None
    render_profile: str | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class MediaTranscriptRequest(BaseModel):
    provider: str | None = None
    title: str | None = None
    source_url: str | None = None
    transcript_text: str | None = None
    speaker_segments: list[dict[str, Any]] | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None
    api_key: str | None = None
    access_key_id: str | None = None
    secret_access_key: str | None = None


class MediaIngestRequest(BaseModel):
    provider: str | None = None
    source: str | None = None
    meeting_id: str | None = None
    meeting_title: str | None = None
    recording_files: list[dict[str, Any]] | None = None
    drive_files: list[dict[str, Any]] | None = None
    transcript: dict[str, Any] | None = None
    transcript_text: str | None = None
    speaker_segments: list[dict[str, Any]] | None = None
    transcription_provider: str | None = None
    auto_transcribe: bool = True
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class MediaScriptRequest(BaseModel):
    provider: str | None = None
    title: str | None = None
    topic: str | None = None
    tone: str | None = None
    duration: str | None = None
    context: str | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class MediaRunOfShowRequest(BaseModel):
    provider: str | None = None
    title: str | None = None
    topic: str | None = None
    duration: str | None = None
    context: str | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class MediaAudioRenderRequest(BaseModel):
    provider: str | None = None
    title: str | None = None
    text: str | None = None
    voice: str | None = None
    style: str | None = None
    output_url: str | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class MediaPublishRequest(BaseModel):
    title: str | None = None
    publish_target: str | None = None
    publishTarget: str | None = None
    asset_ids: list[str] | None = None
    artifact_ids: list[str] | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None

class MailSendRequest(BaseModel):
    mailbox_id: str
    body: str
    sender_name: str
    sender_email: str
    recipients: list[str] = []


class HelpTicketCreateRequest(BaseModel):
    subject: str
    content: str | None = None
    priority: str = "normal"
    category: str = "general"


class HelpTicketUpdateRequest(BaseModel):
    subject: str | None = None
    content: str | None = None
    status: str | None = None
    priority: str | None = None
    category: str | None = None


class BroadcastMessageCreateRequest(BaseModel):
    type: str = "info"
    message: str
    is_active: int = 1
    expires_at: str | None = None


def oauth_callback_url() -> str:
    return f"{backend_base_url().rstrip('/')}/api/oauth/callback"


def oauth_state_secret() -> bytes:
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


def get_current_user_id(request: Request) -> str:
    session = require_session(request)
    user = session.get("user") or {}
    user_id = str(user.get("id") or "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="Authenticated user id is required.")
    return user_id


WORKSPACE_VIEWER_ROLES = {"owner", "admin", "staff", "viewer"}
WORKSPACE_EDITOR_ROLES = {"owner", "admin", "staff"}
WORKSPACE_ADMIN_ROLES = {"owner", "admin"}


def resolve_session_user_role(session: dict[str, Any] | None) -> str:
    user = (session or {}).get("user") or {}
    return "client" if str(user.get("role") or "").strip().lower() == "client" else "operator"


def is_operator(session: dict[str, Any] | None) -> bool:
    return resolve_session_user_role(session) == "operator"


def is_client(session: dict[str, Any] | None) -> bool:
    return resolve_session_user_role(session) == "client"


def require_operator(request: Request, detail: str = "Only operators can perform this action.") -> dict[str, Any]:
    session = require_session(request)
    if not is_operator(session):
        raise HTTPException(status_code=403, detail=detail)
    return session


def require_workspace_role(request: Request, allowed_roles: set[str], detail: str = "You do not have permission to perform this action.") -> dict[str, Any]:
    session = require_session(request)
    tenant = session.get("tenant") or {}
    role = (tenant.get("role") or "").strip().lower()
    if not role or role not in allowed_roles:
        raise HTTPException(status_code=403, detail=detail)
    return session


def require_client_safe_surface(
    request: Request,
    operator_allowed_roles: set[str],
    detail: str,
) -> dict[str, Any]:
    session = require_session(request)
    if is_client(session):
        tenant = session.get("tenant") or {}
        role = (tenant.get("role") or "").strip().lower()
        if role not in WORKSPACE_VIEWER_ROLES:
            raise HTTPException(status_code=403, detail="Client account does not belong to the active workspace.")
        return session
    return require_workspace_role(request, operator_allowed_roles, detail)


def normalize_email_verifier_mode(value: str | None, *, default: str = "quick", bulk: bool = False) -> str:
    normalized = str(value or default).strip().lower() or default
    if bulk:
        return "power"
    return "power" if normalized == "power" else "quick"


def schedule_contact_email_auto_verify(background_tasks: BackgroundTasks, request: Request, contact: dict[str, Any]) -> None:
    tenant_id = getattr(request.state, "tenant_id", None)
    contact_id = str(contact.get("id") or "").strip()
    email = str(contact.get("email") or "").strip()
    if not tenant_id or not contact_id or not email:
        return
    config = provider.get_email_verifier_config(include_secret=True)
    if not config.get("enabled") or not config.get("auto_verify_contacts", True) or not config.get("api_key"):
        return
    background_tasks.add_task(run_contact_email_auto_verify, tenant_id, contact_id, email)


def run_contact_email_auto_verify(tenant_id: str, contact_id: str, email: str) -> None:
    context_token = set_request_tenant_id(tenant_id)
    background_provider = create_provider()
    try:
        config = background_provider.get_email_verifier_config(include_secret=True)
        if not config.get("enabled") or not config.get("auto_verify_contacts", True) or not config.get("api_key"):
            return
        result = verify_single_email_address(config["api_key"], email, "quick")
        background_provider.apply_email_verification_result(contact_id, result, expected_email=email)
        background_provider.mark_email_verifier_config_status(status="active", last_tested_at=result.get("verifiedAt"))
    except Exception as exc:
        logger.warning("Background email verification failed for contact %s: %s", contact_id, exc)
        try:
            background_provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        except Exception:
            pass
    finally:
        reset_request_tenant(context_token)


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
    if path == "/api/assist" and method == "POST":
        return True
    return False


def is_public_api_request(path: str) -> bool:
    if path in {"/api/", "/api/health", "/api/auth/status", "/api/auth/bootstrap", "/api/auth/login", "/api/auth/forgot-password", "/api/auth/google/authorize", "/api/oauth/callback"}:
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
    if request.url.path.startswith("/api") and session and is_client(session) and not is_client_allowed_api_request(request.method, request.url.path):
        return JSONResponse(status_code=403, content={"detail": "Client mode blocks this endpoint."})

    context_token = set_request_tenant_id(tenant_id)
    try:
        return await call_next(request)
    finally:
        reset_request_tenant(context_token)


# Move CORSMiddleware to be the outermost middleware by adding it LAST.
# This ensures it handles preflight before custom HTTP midleware runs its full logic.
app.add_middleware(CORSMiddleware, **CORS_CONFIG)


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


@app.get("/api/brain/overview")
async def get_brain_overview(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AIO Brain.")
    profile = provider.get_brain_profile()
    sources = provider.list_brain_sources()
    items = provider.list_brain_items(limit=100)
    if not items:
        request_tenant_id = get_request_tenant_id()
        if request_tenant_id:
            items = provider.list_brain_items(limit=100, tenant_id=request_tenant_id)
    all_ingests = provider.list_brain_ingests(limit=50)
    ingests = all_ingests[:12]
    categories: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    for item in items:
        categories[item.get("category") or "uncategorized"] = categories.get(item.get("category") or "uncategorized", 0) + 1
    for source in sources:
        status_counts[source.get("status") or "unknown"] = status_counts.get(source.get("status") or "unknown", 0) + 1
    return {
        "data": {
            "profile": profile,
            "sources": sources[:20],  # Limit sources
            "items": items,
            "links": provider.list_brain_links(limit=50),  # Limit links
            "ingests": ingests,
            "stats": {
                "source_count": len(sources),
                "knowledge_count": len(items),
                "ingest_count": len(all_ingests),
                "active_count": sum(1 for item in items if item.get("status") == "active"),
                "draft_count": sum(1 for item in items if item.get("status") == "draft"),
            },
            "categories": categories,
            "source_statuses": status_counts,
            "recent_items": items[:6],
        }
    }


@app.get("/api/brain/profile")
async def get_brain_profile(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AIO Brain.")
    return {"data": provider.get_brain_profile()}


@app.patch("/api/brain/profile")
async def update_brain_profile(request: Request, payload: BrainProfileUpdateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can edit AIO Brain.")
    return {"data": provider.update_brain_profile(payload.model_dump())}


@app.get("/api/brain/sources")
async def list_brain_sources(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AIO Brain sources.")
    return {"data": provider.list_brain_sources()}


@app.post("/api/brain/sources")
async def create_brain_source(request: Request, payload: BrainSourceRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create AIO Brain sources.")
    return {"data": provider.create_brain_source(payload.model_dump())}


@app.patch("/api/brain/sources/{source_id}")
async def update_brain_source(source_id: str, request: Request, payload: BrainSourceUpdateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can edit AIO Brain sources.")
    try:
        return {"data": provider.update_brain_source(source_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/brain/sources/{source_id}")
async def delete_brain_source(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can delete AIO Brain sources.")
    try:
        provider.delete_brain_source(source_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.post("/api/brain/mcp/{source_id}/probe")
async def probe_brain_mcp(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can connect Brain MCP servers.")
    try:
        source = resolve_brain_mcp_source(source_id)
        return {"data": probe_brain_mcp_source(source)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/brain/mcp/{source_id}/query")
async def query_brain_mcp(source_id: str, request: Request, payload: BrainMCPQueryRequest):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can query Brain MCP servers.")
    try:
        source = resolve_brain_mcp_source(source_id)
        return {"data": query_brain_mcp_source(source, payload.query, limit=max(1, payload.limit))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/brain/items")
async def list_brain_items(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AIO Brain knowledge.")
    return {"data": provider.list_brain_items()}


@app.post("/api/brain/items")
async def create_brain_item(request: Request, payload: BrainItemRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create AIO Brain knowledge.")
    return {"data": provider.create_brain_item(payload.model_dump())}


@app.patch("/api/brain/items/{item_id}")
async def update_brain_item(item_id: str, request: Request, payload: BrainItemUpdateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can edit AIO Brain knowledge.")
    try:
        return {"data": provider.update_brain_item(item_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.delete("/api/brain/items/{item_id}")
async def delete_brain_item(item_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can delete AIO Brain knowledge.")
    try:
        provider.delete_brain_item(item_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/brain/links")
async def list_brain_links(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AIO Brain graph links.")
    return {"data": provider.list_brain_links()}


@app.post("/api/brain/links")
async def create_brain_link(request: Request, payload: BrainLinkRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can edit AIO Brain graph links.")
    try:
        return {"data": provider.create_brain_link(payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/brain/links/{link_id}")
async def delete_brain_link(link_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can edit AIO Brain graph links.")
    try:
        provider.delete_brain_link(link_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/api/brain/ingests")
async def list_brain_ingests(request: Request, source_id: str | None = None, limit: int = 25):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AIO Brain ingest history.")
    return {"data": provider.list_brain_ingests(source_id=source_id, limit=limit)}


@app.post("/api/brain/ingests")
async def create_brain_ingest(request: Request, payload: BrainIngestRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can ingest Brain sources.")
    try:
        resolved_ingest_type = (payload.ingest_type or "text").strip().lower()
        extracted_text = ""
        location = payload.location
        if resolved_ingest_type == "url":
            target_url = (payload.url or payload.location or "").strip()
            if not target_url:
                raise ValueError("A URL is required for URL ingest.")
            extracted_text, _ = extract_url_text(target_url)
            location = target_url
        elif resolved_ingest_type == "file":
            extracted_text = extract_file_text(payload.file_name, payload.mime_type, payload.file_content_base64)
            location = payload.location or payload.file_name or ""
        else:
            extracted_text = normalize_ingest_text(payload.content)
            if not extracted_text:
                raise ValueError("Text content is required for Brain ingest.")
        return {
            "data": provider.ingest_brain_source(
                {
                    "source_id": payload.source_id,
                    "label": payload.label,
                    "source_type": payload.source_type,
                    "status": payload.status or "ready",
                    "location": location,
                    "notes": payload.notes,
                    "ingest_type": resolved_ingest_type,
                    "title": payload.title or payload.label or payload.file_name or payload.url,
                    "content": extracted_text,
                }
            )
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/ai/agents/definitions")
async def get_agent_definitions(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI Agent definitions.")
    defs = {key: value.to_dict() for key, value in AGENT_DEFINITIONS.items()}
    return {"data": defs}


# --- Help Desk Endpoints ---

@app.get("/api/help/tickets")
async def list_help_tickets(request: Request):
    user_id = get_current_user_id(request)
    return {"data": provider.list_help_tickets(user_id=user_id)}


@app.post("/api/help/tickets")
async def create_help_ticket(request: Request, payload: HelpTicketCreateRequest):
    user_id = get_current_user_id(request)
    tenant_id = get_request_tenant_id(request)
    ticket_data = {**payload.dict(), "user_id": user_id}
    ticket = provider.create_help_ticket(ticket_data)
    
    # 1. Brain Logging
    try:
        provider.create_brain_item({
            "title": f"Support Ticket: {payload.subject}",
            "content": f"Category: {payload.category}\nPriority: {payload.priority}\n\n{payload.content}",
            "category": "support_audit",
            "source": "helpdesk",
            "active": True
        })
    except Exception as e:
        logger.error(f"Brain logging failed for ticket {ticket['id']}: {e}")

    # 2. Agent Auto-Routing
    category = (payload.category or "general").lower()
    routing_map = {
        "technical": "GHOST",
        "billing": "BRAVO",
        "feature": "FORGE",
        "general": "CHARLIE"
    }
    assigned_agent = routing_map.get(category, "DELTA")
    
    # 3. Signal Creation
    try:
        emit_system_event(
            provider,
            {
                "type": "ticket_submitted",
                "payload": {
                    "ticket_id": ticket["id"],
                    "subject": payload.subject,
                    "agent": assigned_agent,
                    "priority": payload.priority
                }
            },
            tenant={"id": tenant_id}
        )
    except Exception as e:
        logger.error(f"Signal emission failed for ticket {ticket.get('id')}: {e}")

    # Charlie Servicing (v1 Handoff) - Now with specific agent context if needed
    try:
        configs = provider.list_ai_providers()
        active_config = next((c for c in configs if c.get("is_active")), None)
        
        servicing = ai_assist_service.service_help_ticket(ticket, provider_config=active_config)
        provider.update_help_ticket(ticket["id"], {
            "ai_note": servicing.get("ai_note"),
            "ai_draft": servicing.get("ai_draft"),
            "assigned_agent": assigned_agent
        })
        # Update the local ticket object for the response
        ticket.update(servicing)
        ticket["assigned_agent"] = assigned_agent
    except Exception as e:
        logger.error(f"AI servicing failed for ticket {ticket.get('id')}: {e}")

    return {"data": ticket}


@app.patch("/api/help/tickets/{ticket_id}")
async def update_help_ticket(request: Request, ticket_id: str, payload: HelpTicketUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only admins can update tickets.")
    ticket = provider.update_help_ticket(ticket_id, payload.dict(exclude_unset=True))
    return {"data": ticket}


@app.get("/api/help/broadcasts")
async def list_help_broadcasts(request: Request):
    return {"data": provider.list_broadcast_messages()}


@app.post("/api/help/broadcasts")
async def create_help_broadcast(request: Request, payload: BroadcastMessageCreateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only admins can create broadcasts.")
    broadcast = provider.create_broadcast_message(payload.dict())
    return {"data": broadcast}


# --- End Help Desk Endpoints ---


@app.post("/api/auth/bootstrap")
async def bootstrap_auth(request: Request, payload: AuthBootstrapRequest):
    try:
        session = auth_store.bootstrap_owner(payload.name, payload.email, payload.password, user_agent=request.headers.get("user-agent"))
        return {"session": session}
    except ValueError as error:
        detail = str(error)
        status_code = 409 if "already exists" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/auth/forgot-password")
async def forgot_password_auth(payload: AuthForgotPasswordRequest):
    email = payload.email.strip().lower()
    logger.info(f"Password recovery requested for: {email}")
    # In a real implementation, we would generate a token and send an email here.
    # For now, we return success to avoid user enumeration.
    return {"message": "If an account exists with that email, a password reset link has been sent."}


@app.post("/api/auth/login")
async def login_auth(request: Request, payload: AuthLoginRequest):
    try:
        session = auth_store.login_with_password(payload.email, payload.password, user_agent=request.headers.get("user-agent"))
        return {"session": session}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.get("/api/auth/google/authorize")
async def authorize_google_auth():
    google_client = resolve_google_auth_client()
    if not google_client:
        raise HTTPException(status_code=400, detail="Google app sign-in is not configured yet.")

    state = encode_oauth_state({"kind": "auth", "provider": "google-auth"})
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


@app.get("/api/auth/profile")
async def get_auth_profile(request: Request):
    token = extract_session_token(request)
    try:
        return {"data": auth_store.get_profile(token)}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.patch("/api/auth/profile")
async def update_auth_profile(request: Request, payload: ProfileUpdateRequest):
    token = extract_session_token(request)
    try:
        profile = auth_store.update_profile(token, payload.model_dump())
        session = auth_store.get_session(token)
        return {"data": profile, "session": session}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/auth/password")
async def update_auth_password(request: Request, payload: PasswordChangeRequest):
    token = extract_session_token(request)
    try:
        auth_store.change_password(token, payload.current_password, payload.new_password)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/auth/sessions")
async def list_auth_sessions(request: Request):
    token = extract_session_token(request)
    try:
        return {"data": auth_store.list_sessions(token)}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.delete("/api/auth/sessions/{session_id}")
async def revoke_auth_session(session_id: str, request: Request):
    token = extract_session_token(request)
    try:
        auth_store.revoke_session(token, session_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/auth/sessions/logout-others")
async def logout_other_auth_sessions(request: Request):
    token = extract_session_token(request)
    try:
        auth_store.logout_other_sessions(token)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/assist")
async def operator_assist(request: Request, payload: OperatorAssistRequest):
    session = require_client_safe_surface(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can use Operator Assist.")
    token = extract_session_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    tenant = session.get("tenant") or {}
    resolved_context = dict(payload.context or {})
    brain_query = build_brain_assist_query(payload.message, resolved_context, tenant)
    if brain_query:
        resolved_context = inject_brain_context(brain_query, resolved_context, tenant)
    try:
        return generate_assist_response(
            message=payload.message,
            context=resolved_context,
            token=token,
            session=session,
            auth_store=auth_store,
            provider=provider,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/system/health")
async def get_system_health(request: Request):
    session = require_operator(request, "Only operators can view system health.")
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view system health.")
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


# Canonical generic drafting path. This is the preferred route for AI-assisted writing,
# form completion, and content generation.
@app.post("/api/ai/draft")
async def ai_draft(request: Request, payload: AIAssistRequest):
    return await ai_assist_logic(request, payload)


# Legacy generic assist path. Marked as LEGACY; use `/api/ai/draft` for all new callers.
# Canonical grounded operator assist is `/api/assist`.
@app.post("/api/ai/assist")
async def ai_assist(request: Request, payload: AIAssistRequest):
    return await ai_assist_logic(request, payload)


async def ai_assist_logic(request: Request, payload: AIAssistRequest):
    # This logic powers both `/api/ai/draft` (canonical) and `/api/ai/assist` (legacy).
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can use AI workspace tools.")
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}
    tenant_id = str(tenant.get("id") or "").strip()
    resolved_module = str(payload.module or "").strip().lower() or "generic"
    resolved_surface = str(payload.surface or "").strip().lower() or "general"
    resolved_field = str(payload.field or "").strip().lower() or "content"
    resolved_intent = str(payload.intent or "").strip().lower() or "draft"
    resolved_context = dict(payload.context or {})
    route_hints = payload.route_hints if isinstance(payload.route_hints, dict) else None
    if not route_hints and isinstance(resolved_context.get("route_hints"), dict):
        route_hints = resolved_context.get("route_hints")
    provider_override = payload.provider_override
    if provider_override is None and isinstance(resolved_context, dict):
        provider_override = resolved_context.get("provider_override")
    try:
        route = resolve_ai_route(
            tenant_id=tenant_id,
            feature=resolved_module,
            task=str(payload.task or resolved_intent or "").strip() or None,
            provider_override=provider_override,
            route_hints=route_hints,
            auth_store=auth_store,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    log_ai_route(route)
    ai_provider = route.get("provider_config")
    routing = resolve_ai_run_routing(
        resolved_module,
        resolved_surface,
        field=resolved_field,
        intent=resolved_intent,
        command_text=payload.current_value,
        context=resolved_context,
    )
    resolved_agent_role = routing["executing_agent"]
    agent_definition = AGENT_DEFINITIONS.get(resolved_agent_role)
    if not agent_definition:
        raise HTTPException(status_code=400, detail=f"Agent '{resolved_agent_role}' is not available in the canonical runtime registry.")
    assist_policy_inputs = [resolved_intent, resolved_field]
    if resolved_intent in {"draft", "assist"} and resolved_field in {"content", "general"}:
        assist_policy_inputs.append("agent_task")
    assist_policy_error = validate_agent_action(
        agent_definition,
        *expand_agent_action_tokens(*assist_policy_inputs),
    )
    if assist_policy_error:
        raise HTTPException(status_code=403, detail=assist_policy_error)
    resolved_context.update(routing)
    resolved_context["route"] = {
        "provider_key": route.get("provider_key"),
        "provider_label": route.get("provider_label"),
        "model": route.get("model"),
        "route_source": route.get("route_source"),
        "reason": route.get("reason"),
        "feature": route.get("feature"),
        "task": route.get("task"),
    }
    brain_query = build_brain_assist_query(payload.current_value, resolved_context, tenant)
    if brain_query:
        resolved_context = inject_brain_context(brain_query, resolved_context, tenant)
        brain_results = resolved_context.get("brain_memory") or []
    result = ai_assist_service.assist(
        module=resolved_module,
        surface=resolved_surface,
        field=resolved_field,
        intent=resolved_intent,
        current_value=payload.current_value,
        context=resolved_context,
        actor=user,
        tenant=tenant,
        provider_config=ai_provider,
    )
    response = result.to_dict()
    response["route"] = {
        "provider_key": route.get("provider_key"),
        "provider_label": route.get("provider_label"),
        "model": route.get("model"),
        "route_source": route.get("route_source"),
        "reason": route.get("reason"),
        "feature": route.get("feature"),
        "task": route.get("task"),
    }
    applied_thread = None
    draft_text = ""
    if resolved_module == "comms" and resolved_context.get("thread_id"):
        action_metadata = {
            **(result.metadata or {}),
            "agent_name": resolved_agent_role,
        }
        applied = provider.apply_thread_ai_result(
            thread_id=str(resolved_context["thread_id"]),
            mode=resolved_field or "summary",
            suggestion=result.suggestion,
            metadata=action_metadata,
        )
        applied_thread = applied.get("thread")
        response["thread"] = applied_thread
        if applied.get("draft"):
            draft_text = str(applied["draft"])
            response["draft"] = draft_text
    run_artifacts = build_ai_run_artifacts(draft_text=draft_text, thread=applied_thread)
    run_steps = build_ai_run_steps(brain_results=brain_results, applied_thread=applied_thread, draft_text=draft_text)
    run_steps = [
        *run_steps,
        {
            "kind": "assist",
            "status": "completed",
            "label": "Assist response",
            "summary": result.suggestion,
            "agent": resolved_agent_role,
            "data": {
                "message": result.suggestion,
                "suggestion": result.suggestion,
                "content": result.suggestion,
                "metadata": result.metadata or {},
                "alternatives": result.alternatives,
                "rationale": result.rationale,
            },
        },
    ]
    canonical_run_id = f"run-{uuid4().hex[:10]}"
    canonical_context = {
        **resolved_context,
        "module": payload.module,
        "surface": payload.surface,
        "field": payload.field,
        "intent": payload.intent,
        "_provider_config": {
            "provider_key": route.get("provider_key"),
            "label": route.get("provider_label") or (ai_provider or {}).get("label"),
            "model": route.get("model"),
        },
    }
    provider.save_ai_run(
        {
            "id": canonical_run_id,
            "command": str(payload.current_value or resolved_context.get("command_text") or "").strip() or f"{payload.module}:{payload.surface}:{payload.field}",
            "mode": "assist",
            "status": "completed",
            "steps_json": json.dumps(run_steps),
            "artifacts_json": json.dumps(run_artifacts),
            "pending_approvals_json": json.dumps([]),
            "routing_json": json.dumps(routing),
            "trace_json": json.dumps(
                [
                    {
                        "action": "assist_response",
                        "agent": resolved_agent_role,
                        "provider_key": route.get("provider_key"),
                        "provider_label": route.get("provider_label") or (ai_provider or {}).get("label"),
                        "model": route.get("model"),
                        "timestamp": utcnow_iso(),
                    }
                ]
            ),
            "actor_json": json.dumps({"id": user.get("id"), "email": user.get("email")}),
            "context_json": json.dumps(canonical_context),
        }
    )
    run = project_engine_run_for_ui(provider.get_ai_run(canonical_run_id))
    response["run_id"] = run["id"]
    response["run"] = run
    return {"data": response, "run": run}


@app.get("/api/ai/runs")
async def list_ai_runs(request: Request, limit: int = 50, flow_id: str | None = None):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can view AI activity.")
    try:
        runs = [project_engine_run_for_ui(run) for run in provider.list_ai_runs(limit=limit)]
        normalized_flow_id = str(flow_id or "").strip()
        if normalized_flow_id:
            runs = [run for run in runs if run and str(run.get("flow_id") or run.get("flowId") or "").strip() == normalized_flow_id]
        return {"data": [run for run in runs if run]}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/ai/run/{run_id}")
async def get_ai_run(request: Request, run_id: str):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can view AI activity.")
    provider = create_provider()
    try:
        raw_run = provider.get_ai_run(run_id) if hasattr(provider, "get_ai_run") else None
        if not raw_run:
            # Compatibility fallback for providers without direct lookup; may miss older runs beyond this window.
            raw_run = next((run for run in provider.list_ai_runs(limit=200) if run.get("id") == run_id), None)
        run = project_engine_run_for_ui(raw_run)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return {"status": "success", "run": run}
    except HTTPException:
        raise
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/ai/agents")
async def list_ai_agents(request: Request, include_hidden: bool = False):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI agents.")
    tenant_role = ((session.get("tenant") or {}).get("role") or "").strip().lower()
    resolved_include_hidden = include_hidden and tenant_role == "owner"
    return {"data": list_runtime_agents(include_hidden=resolved_include_hidden)}


@app.get("/api/omega/status")
async def omega_status(request: Request, limit: int = 12):
    session = require_workspace_role(request, {"owner"}, "Only workspace owners can access Omega controls.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.get_omega_protocol(token, tenant.get("id"))
        events = auth_store.list_omega_protocol_events(token, tenant.get("id"), limit=limit)
        return {"data": {"protocol": protocol, "events": events}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/omega/arm")
async def omega_arm(request: Request, payload: OmegaArmRequest):
    session = require_workspace_role(request, {"owner"}, "Only workspace owners can arm Omega.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.arm_omega_protocol(
            token,
            tenant.get("id"),
            payload.confirmation_code,
            payload.cancel_code,
            delay_minutes=5,
        )
        events = auth_store.list_omega_protocol_events(token, tenant.get("id"), limit=12)
        return {"data": {"protocol": protocol, "events": events}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/omega/cancel")
async def omega_cancel(request: Request, payload: OmegaCancelRequest):
    session = require_workspace_role(request, {"owner"}, "Only workspace owners can cancel Omega.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.cancel_omega_protocol(token, tenant.get("id"), payload.cancel_code)
        events = auth_store.list_omega_protocol_events(token, tenant.get("id"), limit=12)
        return {"data": {"protocol": protocol, "events": events}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/omega/execute")
async def omega_execute(request: Request, payload: OmegaExecuteRequest):
    session = require_workspace_role(request, {"owner"}, "Only workspace owners can execute Omega.")
    token = extract_session_token(request)
    tenant = session.get("tenant") or {}
    try:
        protocol = auth_store.verify_omega_execution(token, tenant.get("id"), payload.confirmation_code)
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


@app.post("/api/ai/command")
async def ai_command(request: Request, payload: AICommandRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can run AI commands.")
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}
    ai_provider = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
    resolved_context = dict(payload.context or {})
    command_text = (payload.command or "").strip()
    if not command_text:
        raise HTTPException(status_code=400, detail="Command is required.")
    module = str(resolved_context.get("module") or "agents")
    surface = str(resolved_context.get("surface") or "command")
    requested_agent = normalize_agent_key(payload.agent or resolved_context.get("requested_agent"))
    collab_agents = [
        agent
        for agent in (
            normalize_agent_key(value)
            for value in (payload.collabAgents or resolved_context.get("collab_agents") or [])
        )
        if agent
    ]
    flow_id = str(payload.flow_id or payload.flowId or resolved_context.get("flow_id") or resolved_context.get("flowId") or "").strip() or None
    selected_flow = provider.get_flow(flow_id) if flow_id else None
    if flow_id and not selected_flow:
        return {
            "status": "error",
            "result": {"routing": None, "run": None, "run_id": None},
            "message": f"Flow '{flow_id}' is not available in the current workspace.",
        }
    if requested_agent == "OMEGA":
        return {
            "status": "error",
            "result": {"routing": None, "run": None, "run_id": None},
            "message": "OMEGA cannot be executed through the natural-language agent shell.",
        }
    if resolved_context.get("requested_agent") and not requested_agent:
        return {
            "status": "error",
            "result": {"routing": None, "run": None, "run_id": None},
            "message": f"Unknown agent '{resolved_context.get('requested_agent')}'.",
        }
    booking_command_steps = create_booking_execution_plan(command_text, resolved_context)
    booking_command_mode = any(
        term in " ".join(command_text.lower().split())
        for term in ("schedule", "book", "booking", "appointment", "meeting", "reschedule", "cancel meeting", "cancel booking", "upcoming bookings", "upcoming meetings")
    )
    if not ai_provider and not booking_command_mode and not selected_flow:
        return {
            "status": "error",
            "result": {"routing": None, "run": None, "run_id": None},
            "message": "No active AI provider is configured for agent execution.",
        }
    routing = resolve_ai_run_routing(
        module,
        surface,
        field="command",
        intent="command",
        command_text=command_text,
        context={**resolved_context, "requested_agent": requested_agent},
    )
    if routing["permission_tier"] == "dangerous":
        raise HTTPException(status_code=403, detail="Dangerous commands are blocked from natural-language routing. Use the dedicated Omega admin controls.")
    flow_raw_steps: list[dict[str, Any]] = []
    flow_agent_chain: list[str] = []
    if selected_flow:
        flow_raw_steps, flow_agent_chain = build_flow_execution_steps(selected_flow, command_text, requested_agent or routing["executing_agent"], runtime_context=resolved_context)
        if not flow_raw_steps:
            return {
                "status": "error",
                "result": {"routing": routing, "run": None, "run_id": None},
                "message": f"Flow '{selected_flow.get('name') or flow_id}' has no executable steps.",
            }

    executing_agent = requested_agent or (flow_agent_chain[-1] if flow_agent_chain else ("DELTA" if booking_command_mode else routing["executing_agent"]))
    agent_definition = AGENT_DEFINITIONS.get(executing_agent)
    if not agent_definition:
        return {
            "status": "error",
            "result": {"routing": routing, "run": None, "run_id": None},
            "message": f"Agent '{executing_agent}' is not available in the canonical runtime registry.",
        }
    resolved_context.update(routing)
    resolved_context["command_text"] = command_text
    resolved_context["requested_agent"] = requested_agent or routing["requested_agent"] or ""
    resolved_context["active_agent"] = resolved_context.get("active_agent") or executing_agent
    resolved_context["_provider_config"] = ai_provider
    resolved_context["_requested_agent_locked"] = bool(requested_agent or selected_flow)
    resolved_context["field"] = "command"
    if collab_agents:
        resolved_context["collab_agents"] = collab_agents
    if selected_flow:
        resolved_context["flow_id"] = selected_flow.get("id")
        resolved_context["flow_name"] = selected_flow.get("name") or "Untitled Flow"
        resolved_context["flow"] = {
            "id": selected_flow.get("id"),
            "name": selected_flow.get("name") or "Untitled Flow",
        }
        resolved_context["step_count"] = len(flow_raw_steps)
        resolved_context["agent_chain"] = flow_agent_chain
    brain_query = build_brain_assist_query(command_text, resolved_context, tenant)
    if brain_query:
        resolved_context = inject_brain_context(brain_query, resolved_context, tenant)
        brain_results = resolved_context.get("brain_memory") or []
    raw_steps = flow_raw_steps or [
        *(
            [
                {
                    "id": step.get("stepId") or f"cmd-{uuid4().hex[:10]}",
                    "intent": step.get("intent"),
                    "parameters": step.get("parameters") or {},
                    "assignedAgent": step.get("assignedAgent") or "DELTA",
                    "agentId": step.get("agentId") or "AGT-CRD-004",
                }
                for step in booking_command_steps
            ]
            if booking_command_mode
            else [
                {
                    "id": f"cmd-{uuid4().hex[:10]}",
                    "intent": "agent_task",
                    "parameters": {
                        "command": command_text,
                        "module": module,
                        "surface": surface,
                    },
                    "assignedAgent": executing_agent,
                    "agentId": agent_definition.agent_id,
                }
            ]
        )
    ]
    engine = ExecutionEngine(provider)
    try:
        engine_result = engine.run(
            raw_steps=raw_steps,
            mode="execute",
            command=command_text,
            context=resolved_context,
            actor=user,
            tenant=tenant,
        )
    except Exception as error:
        logger.exception("ExecutionEngine command run failed")
        return {
            "status": "error",
            "result": {"routing": routing, "run": None, "run_id": None},
            "message": str(error),
        }

    engine_steps = engine_result.get("steps") or []
    primary_step = next((step for step in reversed(engine_steps) if step.get("status") == "success"), None)
    error_step = next((step for step in engine_steps if step.get("status") == "error"), None)
    primary_data = primary_step.get("data") if isinstance(primary_step, dict) else {}
    if not isinstance(primary_data, dict):
        primary_data = {}
    agent_message = ""
    for key in ("message", "suggestion", "content"):
        text = " ".join(str(primary_data.get(key) or "").split()).strip()
        if text:
            agent_message = text
            break
    if not agent_message:
        agent_message = extract_run_result_text(primary_data)
    resolved_routing = engine_result.get("routing") or routing
    delegate_chain = list(
        dict.fromkeys(
            (resolved_routing.get("delegate_chain") or [])
            + flow_agent_chain
            + [executing_agent]
        )
    )
    run_status = "completed"
    response_status = "success"
    response_message = None
    if engine_result.get("status") != "completed":
        run_status = "failed"
        response_status = "error"
        response_message = str((error_step or {}).get("error") or "").strip()
        if not response_message and engine_result.get("pendingApprovals"):
            response_message = "Execution is blocked pending approval."
        if not response_message:
            response_message = f"ExecutionEngine ended with status '{engine_result.get('status')}'."
    elif not agent_message:
        run_status = "failed"
        response_status = "error"
        response_message = "ExecutionEngine completed without agent output."

    engine_run = provider.get_ai_run(engine_result.get("runId"))
    if engine_run:
        run = project_engine_run_for_ui(engine_run)
    else:
        run = project_engine_run_for_ui(
            {
                "id": engine_result.get("runId"),
                "tenant_id": tenant.get("id"),
                "command": command_text,
                "status": run_status,
                "routing": {**resolved_routing, "executing_agent": executing_agent, "requested_agent": requested_agent or resolved_routing.get("requested_agent"), "delegate_chain": delegate_chain},
                "steps": engine_steps,
                "artifacts": engine_result.get("artifacts") or [],
                "trace": engine_result.get("trace") or [],
                "pending_approvals": engine_result.get("pendingApprovals") or [],
                "context": resolved_context,
                "created_at": utcnow_iso(),
                "updated_at": utcnow_iso(),
            }
        )
    response = {
        "message": agent_message,
        "suggestion": agent_message,
        "result": primary_data,
        "routing": {**resolved_routing, "executing_agent": executing_agent, "requested_agent": requested_agent or resolved_routing.get("requested_agent"), "delegate_chain": delegate_chain},
        "steps": engine_steps,
        "artifacts": engine_result.get("artifacts") or [],
        "trace": engine_result.get("trace") or [],
        "pendingApprovals": engine_result.get("pendingApprovals") or [],
        "agent": {
            "name": executing_agent,
            "agentId": agent_definition.agent_id,
            "label": agent_definition.label,
        },
        "flow": (
            {
                "id": selected_flow.get("id"),
                "name": selected_flow.get("name") or "Untitled Flow",
            }
            if selected_flow
            else None
        ),
        "metadata": {
            "brain_query": brain_query,
            "brain_result_count": len(brain_results),
            "brain_memory": brain_results,
            "selected_agent_locked": bool(requested_agent),
            "result_metadata": primary_data.get("metadata") or {},
            "projection_source": "ai_engine_runs",
        },
        "run": run,
        "run_id": run["id"],
    }
    return {"status": response_status, "result": response, "message": response_message}


@app.get("/api/ai/providers/catalog")
async def list_ai_provider_catalog(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI provider options.")
    return {"data": get_ai_provider_catalog()}


@app.get("/api/ai/routing")
async def get_ai_routing_config(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI routing config.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        record = auth_store.get_ai_routing_record_for_tenant(tenant_id) if tenant_id else None
        provider_configs = auth_store.list_ai_provider_configs(token, tenant_id)
        normalized = validate_ai_routing_config((record or {}).get("config"), provider_configs)
        return {"data": {"config": normalized, "updated_at": (record or {}).get("updated_at")}}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.put("/api/ai/routing")
async def upsert_ai_routing_config(request: Request, payload: AIRoutingConfigRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage AI routing.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        provider_configs = auth_store.list_ai_provider_configs(token, tenant_id)
        normalized = validate_ai_routing_config(payload.model_dump(exclude_unset=True), provider_configs)
        record = auth_store.upsert_ai_routing_config(token, tenant_id, normalized)
        return {"data": record}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/ai/providers/ollama/models")
async def list_ollama_provider_models_post(request: Request, payload: OllamaModelsRequest):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI provider options.")
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES)
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    
    try:
        # Pass explicit base_url if provided, otherwise let list_ollama_models resolve from config
        if payload.base_url:
            print(f"[OllamaModels] POST Using explicit base_url: {payload.base_url}")
            models = list_ollama_models(
                base_url=payload.base_url,
                api_key=payload.api_key,
                username=payload.username,
                password=payload.password,
            )
        else:
            print(f"[OllamaModels] POST Resolving from config for tenant: {tenant_id}")
            models = list_ollama_models(
                tenant_id=tenant_id,
                api_key=payload.api_key,
                username=payload.username,
                password=payload.password,
            )
        return {"data": models}
    except ValueError as error:
        print(f"[OllamaModels] POST ERROR: {error}")
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/ai/providers")
async def list_ai_provider_configs(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view LLMs.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_ai_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.put("/api/ai/providers/{provider_key}")
async def upsert_ai_provider_config(provider_key: str, request: Request, payload: AIProviderUpsertRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage LLMs.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_ai_provider_config(token, tenant_id, provider_key, payload.model_dump())
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/ai/providers/{config_id}")
async def delete_ai_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can delete LLMs.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_ai_provider_config(token, tenant_id, config_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/ai/providers/{config_id}/test")
async def test_ai_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can test LLMs.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_ai_provider_config_for_tenant(tenant_id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="AI provider config not found")
    try:
        result = ai_assist_service.test_provider(config)
        updated = auth_store.save_ai_provider_test_result(
            tenant_id,
            config_id,
            status="connected",
            last_error=None,
            connected_identity=result.get("identity"),
        )
        return {"result": result, "data": updated}
    except ValueError as error:
        updated = auth_store.save_ai_provider_test_result(
            tenant_id,
            config_id,
            status="error",
            last_error=str(error),
        )
        raise HTTPException(status_code=400, detail=updated.get("last_error") or str(error)) from error


@app.get("/api/automation/providers")
async def list_automation_provider_configs(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view automation providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_automation_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.put("/api/automation/providers/{provider_key}")
async def upsert_automation_provider_config(provider_key: str, request: Request, payload: AutomationProviderUpsertRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage automation providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_automation_provider_config(token, tenant_id, provider_key, payload.model_dump())
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/automation/providers/{config_id}")
async def delete_automation_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can delete automation providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_automation_provider_config(token, tenant_id, config_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/automation/providers/{config_id}/test")
async def test_automation_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can test automation providers.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_automation_provider_config_for_tenant(tenant_id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Automation provider config not found")
    try:
        result = test_automation_provider(config)
        details = {
            "last_delivery_at": result.get("delivery_at"),
            "last_delivery_status": result.get("status"),
            "last_target_url": result.get("target_url"),
            "last_method": result.get("method"),
            "last_status_code": result.get("status_code"),
        }
        updated = auth_store.save_automation_provider_test_result(
            tenant_id,
            config_id,
            status="connected",
            last_error=None,
            details=details,
        )
        return {"result": result, "data": updated}
    except ValueError as error:
        updated = auth_store.save_automation_provider_test_result(
            tenant_id,
            config_id,
            status="error",
            last_error=str(error),
        )
        raise HTTPException(status_code=400, detail=updated.get("last_error") or str(error)) from error


@app.get("/api/workspaces")
async def list_workspaces(request: Request):
    session = require_session(request)
    return {"data": session.get("tenants") or []}


@app.get("/api/blueprints")
async def list_blueprints(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view blueprints.")
    try:
        return {"data": auth_store.list_blueprints()}
    except DeploymentFailureError as error:
        raise HTTPException(status_code=400, detail=error.payload) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/workspaces")
async def create_workspace(request: Request, payload: WorkspaceCreateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can create a new workspace.")
    token = extract_session_token(request)
    try:
        return auth_store.create_workspace(token, payload.name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/tenants/deploy")
async def deploy_tenant(request: Request, payload: TenantDeployRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can deploy tenants.")
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


@app.get("/api/tenants/{tenant_id}/deployment")
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


@app.patch("/api/workspaces/{workspace_id}")
async def rename_workspace(workspace_id: str, request: Request, payload: WorkspaceUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can rename a workspace.")
    token = extract_session_token(request)
    try:
        # Boundary: row identity updates (`name`, route-critical workspace fields) stay on
        # the tenant row; canonical settings updates belong in `tenantSettings`.
        return auth_store.rename_workspace(token, workspace_id, payload.name, payload.settings)
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.delete("/api/workspaces/{workspace_id}")
async def archive_workspace(workspace_id: str, request: Request):
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


@app.get("/api/workspaces/{workspace_id}/memberships")
async def list_workspace_memberships(workspace_id: str, request: Request):
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
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage members.")
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


@app.post("/api/workspaces/{workspace_id}/users")
async def create_workspace_user(workspace_id: str, request: Request, payload: WorkspaceUserCreateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can create users.")
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


@app.patch("/api/workspaces/{workspace_id}/memberships/{membership_id}")
async def update_workspace_member(workspace_id: str, membership_id: str, request: Request, payload: WorkspaceMemberUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage members.")
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


@app.delete("/api/workspaces/{workspace_id}/memberships/{membership_id}")
async def remove_workspace_member(workspace_id: str, membership_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage members.")
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


@app.get("/api/settings/variables")
async def list_setting_variables(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view variables.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_global_variables(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/settings/variables")
async def upsert_setting_variable(request: Request, payload: GlobalVariableUpsertRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage variables.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.upsert_global_variable(token, tenant_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/settings/variables/{variable_id}")
async def delete_setting_variable(variable_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage variables.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_global_variable(token, tenant_id, variable_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/settings/system-emails")
async def list_setting_system_emails(request: Request, search: str | None = None):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view system emails.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_system_email_templates(token, tenant_id, search=search)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/settings/system-emails/{template_id}")
async def update_setting_system_email(template_id: str, request: Request, payload: SystemEmailTemplateUpdateRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage system emails.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.update_system_email_template(token, tenant_id, template_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/settings/canonical")
async def get_canonical_settings(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view settings.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    user_id = (session.get("user") or {}).get("id")
    try:
        return {"data": auth_store.get_canonical_settings_bundle(token, tenant_id, user_id=user_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/settings/canonical/tenant")
async def update_canonical_tenant_settings(request: Request, payload: CanonicalSettingsUpdateRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage tenant settings.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        # Boundary: this route is for canonical tenant settings, including operational
        # metadata in `tenantSettings.internal`, not tenant row identity primitives.
        updated = auth_store.update_tenant_settings(token, tenant_id, payload.settings)
        return {"data": updated}
    except ValueError as error:
        detail = str(error)
        lowered = detail.lower()
        status_code = 403 if "permission" in lowered else 400
        if "not found" in lowered:
            status_code = 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.patch("/api/settings/canonical/user")
async def update_canonical_user_settings(request: Request, payload: CanonicalSettingsUpdateRequest):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only signed-in users can update user settings.")
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


@app.get("/api/settings/blueprint/export")
async def export_tenant_blueprint_api(request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can export tenant blueprints.")
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.export_tenant_blueprint(tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/settings/blueprint/import")
async def import_tenant_blueprint_api(request: Request, payload: TenantBlueprintImportRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can import tenant blueprints.")
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


@app.get("/api/oauth/callback")
async def oauth_callback(state: str, code: str | None = None, error: str | None = None, error_description: str | None = None):
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
        if tenant_token is not None:
            reset_request_tenant(tenant_token)


@app.get("/api/contacts")
async def list_contacts():
    return {"data": provider.list_contacts()}


@app.post("/api/contacts")
async def create_contact(request: Request, background_tasks: BackgroundTasks, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create contacts.")
    try:
        created = provider.create_contact(payload)
        schedule_contact_email_auto_verify(background_tasks, request, created)
        return {"data": created}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, request: Request, background_tasks: BackgroundTasks, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can update contacts.")
    try:
        updated = provider.update_contact(contact_id, payload)
        if "email" in payload:
            schedule_contact_email_auto_verify(background_tasks, request, updated)
        return {"data": updated}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/contacts/{contact_id}")
async def delete_contact(contact_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can delete contacts.")
    try:
        provider.delete_contact(contact_id)
        print(f"[DELETE] Contact deleted: {contact_id}")
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/contacts")
async def bulk_delete_contacts(request: Request, payload: dict[str, Any] = Body(...)):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace admins can bulk delete contacts.")
    ids = payload.get("ids", [])
    confirm = payload.get("confirm", "")
    
    try:
        if ids:
            result = provider.bulk_delete_contacts(ids)
            print(f"[BULK DELETE] contacts deleted: {result}")
            return {"success": True, "data": result}
        
        if confirm == "DELETE_ALL_CONTACTS":
            all_contacts = provider.list_contacts()
            contact_ids = [c["id"] for c in all_contacts]
            result = provider.bulk_delete_contacts(contact_ids)
            print(f"[BULK DELETE] All contacts deleted: {result}")
            return {"success": True, "data": result}
            
        raise HTTPException(status_code=400, detail="Either 'ids' list or 'confirm' string 'DELETE_ALL_CONTACTS' is required.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/contacts/{contact_id}/activities")
async def list_contact_activities(contact_id: str):
    return {"data": provider.list_contact_activities(contact_id)}


@app.post("/api/contacts/{contact_id}/activities")
async def create_contact_activity(contact_id: str, request: Request, payload: ContactActivityCreateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can add CRM activities.")
    try:
        return {"data": provider.create_contact_activity(contact_id, payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/email-verifier/config")
async def get_email_verifier_config(request: Request):
    require_operator(request, "Only operators can manage email verification.")
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view email verification settings.")
    return {"data": provider.get_email_verifier_config(include_secret=False)}


@app.patch("/api/email-verifier/config")
async def update_email_verifier_config(request: Request, payload: EmailVerifierConfigUpdateRequest):
    require_operator(request, "Only operators can manage email verification.")
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can update email verification settings.")
    data = payload.model_dump(exclude_unset=True)
    data["default_mode"] = normalize_email_verifier_mode(data.get("default_mode"), default="quick")
    if "enabled" in data and data.get("enabled") and not str(data.get("api_key") or provider.get_email_verifier_config(include_secret=True).get("api_key") or "").strip():
        raise HTTPException(status_code=400, detail="An API key is required to enable email verification.")
    return {"data": provider.upsert_email_verifier_config(data)}


@app.post("/api/email-verifier/config/test")
async def test_email_verifier_config(request: Request):
    require_operator(request, "Only operators can manage email verification.")
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can test email verification settings.")
    config = provider.get_email_verifier_config(include_secret=True)
    if not str(config.get("api_key") or "").strip():
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")
    try:
        verify_single_email_address(config["api_key"], "support@reoon.com", "quick")
        updated = provider.upsert_email_verifier_config({
            "api_key": config.get("api_key") or "",
            "enabled": config.get("enabled", False),
            "auto_verify_contacts": config.get("auto_verify_contacts", True),
            "default_mode": config.get("default_mode", "quick"),
            "last_tested_at": utcnow_iso(),
            "status": "active" if config.get("enabled") else "disabled",
            "last_error": None,
        })
        return {
            "result": {"success": True, "message": "Reoon connection verified."},
            "data": updated,
        }
    except ValueError as error:
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso(), last_error=str(error))
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.delete("/api/email-verifier/config")
async def delete_email_verifier_config(request: Request):
    require_operator(request, "Only operators can manage email verification.")
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can update email verification settings.")
    return {"data": provider.delete_email_verifier_config()}


@app.post("/api/email-verifier/verify")
async def verify_email_address(request: Request, payload: EmailVerifierSingleRequest):
    require_operator(request, "Only operators can verify emails.")
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can verify emails.")
    config = provider.get_email_verifier_config(include_secret=True)
    if not config.get("enabled") or not config.get("api_key"):
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")

    resolved_email = str(payload.email or "").strip().lower()
    if payload.contact_id and not resolved_email:
        targets = provider.resolve_email_verification_targets(contact_ids=[payload.contact_id])
        if not targets:
            raise HTTPException(status_code=400, detail="The contact does not have a verifiable email address.")
        resolved_email = str(targets[0].get("email") or "").strip().lower()
    if not resolved_email:
        raise HTTPException(status_code=400, detail="Email is required.")

    mode = normalize_email_verifier_mode(payload.mode, default=config.get("default_mode") or "quick")
    try:
        result = verify_single_email_address(config["api_key"], resolved_email, mode)
        provider.mark_email_verifier_config_status(status="active", last_tested_at=result.get("verifiedAt"))
        if payload.contact_id:
            updated_contact = provider.apply_email_verification_result(payload.contact_id, result, expected_email=resolved_email)
            return {"data": {**result, "contact": updated_contact}}
        return {"data": result}
    except ValueError as error:
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/api/email-verifier/bulk")
async def create_email_verifier_bulk(request: Request, payload: EmailVerifierBulkRequest):
    require_operator(request, "Only operators can verify emails.")
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can verify emails.")
    config = provider.get_email_verifier_config(include_secret=True)
    if not config.get("enabled") or not config.get("api_key"):
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")

    targets = provider.resolve_email_verification_targets(contact_ids=payload.contact_ids, emails=payload.emails)
    if not targets:
        raise HTTPException(status_code=400, detail="No verifiable emails were provided.")

    emails = [str(item.get("email") or "").strip().lower() for item in targets if str(item.get("email") or "").strip()]
    try:
        remote_task = create_email_verifier_bulk_task(
            config["api_key"],
            emails,
            normalize_email_verifier_mode(payload.mode, default="power", bulk=True),
            task_name=f"crm-{get_request_tenant_id()}",
        )
        provider.mark_email_verifier_config_status(status="active", last_tested_at=utcnow_iso())
        task = provider.create_email_verification_task({
            "provider_task_id": remote_task["providerTaskId"],
            "status": "queued",
            "mode": remote_task["mode"],
            "submitted_count": remote_task["submittedCount"],
            "completed_count": 0,
            "targets": targets,
        })
        return {"data": task}
    except ValueError as error:
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.get("/api/email-verifier/bulk/{task_id}")
async def get_email_verifier_bulk_task(task_id: str, request: Request):
    require_operator(request, "Only operators can verify emails.")
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view email verification tasks.")
    task = provider.get_email_verification_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Email verification task not found.")
    if task.get("status") in {"completed", "failed"} and task.get("completed_at"):
        return {"data": task}

    config = provider.get_email_verifier_config(include_secret=True)
    if not config.get("api_key"):
        task = provider.update_email_verification_task(task_id, {"status": "failed", "completed_at": utcnow_iso(), "last_error": "Email verifier API key is missing."})
        raise HTTPException(status_code=400, detail="Email verification is not configured for this tenant.")

    try:
        remote = get_email_verifier_bulk_results(config["api_key"], task.get("provider_task_id"))
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
            updates["completed_at"] = utcnow_iso()
            provider.apply_email_verification_task_results(task_id, remote["results"])
        task = provider.update_email_verification_task(task_id, updates)
        provider.mark_email_verifier_config_status(status="active", last_tested_at=utcnow_iso())
        return {"data": task}
    except ValueError as error:
        task = provider.update_email_verification_task(task_id, {"status": "failed", "completed_at": utcnow_iso(), "last_error": str(error)})
        provider.mark_email_verifier_config_status(status="error", last_tested_at=utcnow_iso())
        return {"data": task}


@app.get("/api/contacts/{contact_id}/form-submissions")
async def list_contact_form_submissions(contact_id: str):
    return {"data": provider.list_form_submissions(contact_id)}


@app.get("/api/companies")
async def list_companies():
    return {"data": provider.list_companies()}


@app.get("/api/flows")
async def list_flows(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view flows.")
    return {"data": provider.list_flows()}


@app.get("/api/flows/{flow_id}")
async def get_flow(flow_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view flows.")
    flow = provider.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return {"data": flow}


@app.put("/api/flows/{flow_id}")
async def save_flow(flow_id: str, request: Request, payload: FlowSaveRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can save flows.")
    flow_payload = {**payload.model_dump(), "id": flow_id}
    raw_steps, _ = build_flow_execution_steps(
        flow_payload,
        f"Save flow {flow_payload.get('name') or 'Untitled Flow'}",
        "ALPHA",
        runtime_context={},
    )
    preflight = flow_preflight_validation(flow_payload, raw_steps)
    if str(flow_payload.get("status") or "").strip().lower() == "active" and preflight["blockers"]:
        raise HTTPException(status_code=400, detail=f"Active flow validation failed: {'; '.join(preflight['blockers'])}")
    saved = provider.save_flow(flow_payload)
    return {"data": {**saved, "validation": preflight}}


@app.post("/api/flows/{flow_id}/trigger/manual")
async def trigger_flow_manually(flow_id: str, request: Request, payload: FlowManualTriggerRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manually trigger flows.")
    flow = provider.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    trigger_targets = resolve_flow_trigger_targets(flow, "manual_trigger")
    if not trigger_targets:
        raise HTTPException(status_code=400, detail="Flow does not contain a manual trigger with a downstream path.")
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}
    provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
    trigger_event = {
        "type": "manual_trigger",
        "payload": {
            "flow_id": flow_id,
            "flow_name": flow.get("name") or "Untitled Flow",
            "user_id": user.get("id"),
        },
        "meta": {"source": "manual", "depth": 0},
    }
    runtime_context = {
        **(payload.context or {}),
        "trigger_event": trigger_event,
        "manual_trigger": trigger_event["payload"],
    }
    command_text = (payload.command or "").strip() or f"Manual trigger for flow {flow.get('name') or 'Untitled Flow'}"
    raw_steps, flow_agent_chain = build_flow_execution_steps(
        flow,
        command_text,
        "ALPHA",
        runtime_context=runtime_context,
        start_node_ids=trigger_targets,
    )
    if not raw_steps:
        raise HTTPException(status_code=400, detail="Manual trigger did not resolve any executable nodes.")
    preflight = flow_preflight_validation(flow, raw_steps)
    if preflight["blockers"]:
        raise HTTPException(status_code=400, detail=f"Flow validation failed before execution: {'; '.join(preflight['blockers'])}")
    flow_context = {
        "module": "flows",
        "surface": "manual-trigger",
        "field": "trigger",
        "intent": "flow_trigger",
        "trigger_event": trigger_event,
        "flow_id": flow.get("id"),
        "flow_name": flow.get("name") or "Untitled Flow",
        "flow": {"id": flow.get("id"), "name": flow.get("name") or "Untitled Flow"},
        "step_count": len(raw_steps),
        "agent_chain": flow_agent_chain,
        "_provider_config": provider_config,
        "_requested_agent_locked": True,
        **runtime_context,
    }
    brain_query = build_brain_assist_query(command_text, flow_context, tenant)
    if brain_query:
        flow_context = inject_brain_context(brain_query, flow_context, tenant)
    result = ExecutionEngine(provider).run(
        raw_steps=raw_steps,
        mode="execute",
        command=command_text,
        context=flow_context,
        actor=user,
        tenant=tenant,
    )
    return {"data": {**result, "validation": preflight}}


@app.post("/api/flow-drafts")
async def save_flow_draft(request: Request, payload: FlowDraftRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can save flow drafts.")
    return {"data": provider.save_flow_draft(payload.model_dump())}


@app.get("/api/flow-drafts/{draft_id}")
async def get_flow_draft(draft_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can view flow drafts.")
    draft = provider.get_flow_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Flow draft not found.")
    return {"data": draft}


@app.delete("/api/flow-drafts/{draft_id}")
async def delete_flow_draft(draft_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage flow drafts.")
    provider.delete_flow_draft(draft_id)
    return {"success": True}


@app.delete("/api/flows/{flow_id}")
async def delete_flow(flow_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can delete flows.")
    try:
        provider.delete_flow(flow_id)
        print(f"[DELETE] Flow deleted: {flow_id}")
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/flows")
async def bulk_delete_flows(request: Request, payload: dict[str, Any] = Body(...)):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace admins can bulk delete flows.")
    ids = payload.get("ids", [])
    confirm = payload.get("confirm", "")
    
    try:
        if ids:
            result = provider.bulk_delete_flows(ids)
            print(f"[BULK DELETE] flows deleted: {result}")
            return {"success": True, "data": result}
            
        if confirm == "DELETE_ALL_FLOWS":
            all_flows = provider.list_flows()
            flow_ids = [f["id"] for f in all_flows]
            result = provider.bulk_delete_flows(flow_ids)
            print(f"[BULK DELETE] All flows deleted: {result}")
            return {"success": True, "data": result}
            
        raise HTTPException(status_code=400, detail="Either 'ids' list or 'confirm' string 'DELETE_ALL_FLOWS' is required.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/media/assets")
async def list_media_assets(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view media assets.")
    return {"data": get_media_engine().list_assets()}


@app.get("/api/media/render-jobs")
async def list_render_jobs(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view render jobs.")
    return {"data": get_media_engine().list_render_jobs()}


@app.get("/api/media/transcript-jobs")
async def list_transcript_jobs(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view transcript jobs.")
    return {"data": get_media_engine().list_transcript_jobs()}


@app.get("/api/media/transcript-artifacts")
async def list_transcript_artifacts(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view transcript artifacts.")
    return {"data": get_media_engine().list_transcript_artifacts()}


@app.get("/api/media/script-jobs")
async def list_script_jobs(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view script jobs.")
    return {"data": get_media_engine().list_script_jobs()}


@app.get("/api/media/script-artifacts")
async def list_script_artifacts(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view script artifacts.")
    return {"data": get_media_engine().list_script_artifacts()}


@app.get("/api/media/run-of-show-jobs")
async def list_run_of_show_jobs(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view run-of-show jobs.")
    return {"data": get_media_engine().list_run_of_show_jobs()}


@app.get("/api/media/run-of-show-artifacts")
async def list_run_of_show_artifacts(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view run-of-show artifacts.")
    return {"data": get_media_engine().list_run_of_show_artifacts()}


@app.get("/api/media/audio-render-jobs")
async def list_audio_render_jobs(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view audio render jobs.")
    return {"data": get_media_engine().list_audio_render_jobs()}


@app.get("/api/media/publish-jobs")
async def list_publish_jobs(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view publish jobs.")
    return {"data": get_media_engine().list_publish_jobs()}


@app.get("/api/media/publish-artifacts")
async def list_publish_artifacts(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view publish artifacts.")
    return {"data": get_media_engine().list_publish_artifacts()}


@app.post("/api/media/script-jobs")
async def create_script_job(request: Request, payload: MediaScriptRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create script jobs.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().generate_script(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/media/run-of-show-jobs")
async def create_run_of_show_job(request: Request, payload: MediaRunOfShowRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create run-of-show jobs.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().generate_run_of_show(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/media/audio-render-jobs")
async def create_audio_render_job(request: Request, payload: MediaAudioRenderRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create audio render jobs.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().render_audio(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/media/render-jobs")
async def create_render_job(request: Request, payload: MediaRenderRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create media jobs.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().render_media(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/media/transcript-jobs")
async def create_transcript_job(request: Request, payload: MediaTranscriptRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create transcript jobs.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().transcribe_media(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/media/meeting-ingestion")
async def ingest_meeting_media(request: Request, payload: MediaIngestRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can ingest meeting media.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().ingest_meeting_artifacts(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/media/publish-jobs")
async def create_publish_job(request: Request, payload: MediaPublishRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create publish jobs.")
    tenant = session.get("tenant") or {}
    try:
        result = get_media_engine().publish_asset(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant.get("id"),
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/calendars")
async def list_calendars():
    return {"data": provider.list_calendars()}


@app.get("/api/calendar/events")
async def list_calendar_events():
    return {"data": provider.list_calendar_events()}


@app.post("/api/calendar/events")
async def create_calendar_event(request: Request, payload: dict[str, Any]):
    session = require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create calendar events.")
    try:
        tenant = session.get("tenant") or {}
        user = session.get("user") or {}
        # Calendar defaults are applied here from canonical tenant settings before persistence.
        # Explicit request fields always win; defaults fill only missing event values.
        created = provider.create_calendar_event(apply_calendar_event_defaults(payload, session_tenant_settings(tenant)))
        provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
        emit_booking_lifecycle_event(
            event_type="booking_created",
            event=created,
            actor=user,
            tenant=tenant,
            provider_config=provider_config,
        )
        return {"data": created}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/calendar/events/{event_id}")
async def update_calendar_event(event_id: str, request: Request, payload: CalendarEventUpdateRequest):
    session = require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can update calendar events.")
    try:
        updated = provider.update_calendar_event(event_id, payload.model_dump(exclude_unset=True))
        tenant = session.get("tenant") or {}
        user = session.get("user") or {}
        provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
        emit_booking_lifecycle_event(
            event_type="booking_cancelled" if str(updated.get("status") or "").strip().lower() == "cancelled" else "booking_updated",
            event=updated,
            actor=user,
            tenant=tenant,
            provider_config=provider_config,
        )
        return updated
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/calendar/events/{event_id}")
async def delete_calendar_event(event_id: str, request: Request):
    session = require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can delete calendar events.")
    try:
        existing_event = next((item for item in provider.list_calendar_events() if item.get("id") == event_id), None)
        provider.delete_calendar_event(event_id)
        if existing_event:
            tenant = session.get("tenant") or {}
            user = session.get("user") or {}
            provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
            emit_booking_lifecycle_event(
                event_type="booking_cancelled",
                event=existing_event,
                actor=user,
                tenant=tenant,
                provider_config=provider_config,
            )
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/events/{event_id}/push")
async def push_calendar_event(event_id: str, request: Request, payload: CalendarPushRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can push calendar events.")
    try:
        return provider.push_calendar_event(event_id, payload.source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/events/{event_id}/reconcile")
async def reconcile_calendar_event(event_id: str, request: Request, payload: CalendarEventReconcileRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can reconcile calendar events.")
    try:
        return provider.reconcile_calendar_event(event_id, payload.strategy)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/calendar/sources")
async def list_calendar_sources():
    return {"data": provider.list_calendar_sources()}


@app.get("/api/calendar/providers")
async def list_calendar_providers():
    return {"data": provider.get_calendar_provider_catalog()}


@app.get("/api/calendar/sources/{source_id}/authorize")
async def authorize_calendar_source(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can connect calendar sources.")
    source = next((item for item in provider.list_calendar_sources() if item["id"] == source_id), None)
    if not source:
        raise HTTPException(status_code=404, detail="Calendar source not found")

    config = source.get("config") or {}
    tenant_id = clean_text(getattr(request.state, "tenant_id", None))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Workspace context is required before starting calendar OAuth.")
    state = encode_oauth_state(
        {
            "kind": "calendar",
            "resource_id": source_id,
            "provider": source.get("provider") or "",
            "tenant_id": tenant_id,
        }
    )
    redirect_uri = oauth_callback_url()

    if source.get("provider") in {"google-calendar-oauth", "google-meet-oauth"}:
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
async def create_calendar_source(request: Request, payload: CalendarSourceCreateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return provider.create_calendar_source(
            name=payload.name,
            provider=payload.provider,
            sync_direction=payload.sync_direction,
            config=payload.config,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/calendar/sources/{source_id}")
async def update_calendar_source(source_id: str, request: Request, payload: CalendarSourceUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return provider.update_calendar_source(source_id, payload.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/calendar/sources/{source_id}/available-calendars")
async def list_calendar_source_calendars(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return {"data": provider.list_calendar_source_calendars(source_id)}
    except ValueError as error:
        detail = str(error)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.delete("/api/calendar/sources/{source_id}")
async def delete_calendar_source(source_id: str, request: Request, fallback_source_id: str | None = None):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return provider.delete_calendar_source(source_id, fallback_source_id=fallback_source_id)
    except ValueError as error:
        detail = str(error)
        status_code = 400 if "fallback" in detail.lower() else 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/calendar/sources/{source_id}/disconnect")
async def disconnect_calendar_source(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return {"source": provider.disconnect_calendar_source(source_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/sources/{source_id}/test-connection")
async def test_calendar_source(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return provider.test_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/sources/{source_id}/sync")
async def sync_calendar_source(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
    try:
        return provider.sync_calendar_source(source_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/calendar/sources/{source_id}/import")
async def import_calendar_source(source_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage calendar sources.")
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
async def authorize_mailbox(mailbox_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can connect mailboxes.")
    mailbox = next((item for item in provider.list_mailboxes() if item["id"] == mailbox_id), None)
    if not mailbox:
        raise HTTPException(status_code=404, detail="Mailbox not found")

    config = mailbox.get("config") or {}
    tenant_id = clean_text(getattr(request.state, "tenant_id", None))
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Workspace context is required before starting mailbox OAuth.")
    state = encode_oauth_state(
        {
            "kind": "mailbox",
            "resource_id": mailbox_id,
            "provider": mailbox.get("provider") or "",
            "tenant_id": tenant_id,
        }
    )
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
async def create_mailbox(request: Request, payload: MailboxCreateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        mailbox = provider.create_mailbox(
            name=payload.name,
            address=payload.address,
            provider=payload.provider,
            inbound_enabled=payload.inbound_enabled,
            outbound_enabled=payload.outbound_enabled,
            config=payload.config,
        )
        return mailbox
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/mailboxes/{mailbox_id}")
async def update_mailbox(mailbox_id: str, request: Request, payload: MailboxUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        return provider.update_mailbox(mailbox_id, payload.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/mailboxes/{mailbox_id}")
async def delete_mailbox(mailbox_id: str, request: Request, fallback_mailbox_id: str | None = None):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        return provider.delete_mailbox(mailbox_id, fallback_mailbox_id=fallback_mailbox_id)
    except ValueError as error:
        detail = str(error)
        status_code = 400 if "last mailbox" in detail.lower() or "fallback mailbox" in detail.lower() else 404
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/mailboxes/{mailbox_id}/disconnect")
async def disconnect_mailbox(mailbox_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        return {"mailbox": provider.disconnect_mailbox(mailbox_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/mailboxes/{mailbox_id}/events")
async def list_mailbox_events(mailbox_id: str):
    return {"data": provider.list_mail_events(mailbox_id=mailbox_id)}


@app.post("/api/mailboxes/{mailbox_id}/test-connection")
async def test_mailbox_connection(mailbox_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        return provider.test_mailbox_connection(mailbox_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/mailboxes/{mailbox_id}/sync")
async def sync_mailbox(mailbox_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        return provider.sync_mailbox(mailbox_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/mailboxes/{mailbox_id}/ingest")
async def ingest_mail_message(mailbox_id: str, request: Request, payload: MailIngestRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage mailboxes.")
    try:
        return provider.ingest_mail_message(
            mailbox_id=mailbox_id,
            subject=payload.subject,
            body=payload.body,
            sender_name=payload.sender_name,
            sender_email=payload.sender_email,
            recipients=payload.recipients,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/help/articles")
async def list_help_articles():
    """Returns all brain items tagged META:DOC:HELP (tag-driven, not bin-based)."""
    all_items = provider.list_brain_items()
    return {"data": [item for item in all_items if "META:DOC:HELP" in (item.get("tags") or [])]}


@app.get("/api/agents")
async def list_agents():
    """Public agent listing — excludes hidden agents (OMEGA)."""
    import sqlite3, json
    from pathlib import Path
    db_path = str(Path(__file__).resolve().parent / "data" / "aio_crm.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, registry_key, name, rank, role_code, tags_json FROM agents WHERE is_hidden = 0 ORDER BY id"
    ).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}


@app.get("/api/agents/internal")
async def list_agents_internal(request: Request):
    """Internal agent listing — includes OMEGA. Requires editor role."""
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Internal endpoint requires editor role.")
    import sqlite3, json
    from pathlib import Path
    db_path = str(Path(__file__).resolve().parent / "data" / "aio_crm.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, registry_key, name, rank, role_code, is_hidden, tags_json FROM agents ORDER BY id"
    ).fetchall()
    conn.close()
    return {"data": [dict(r) for r in rows]}


@app.get("/api/tags")
async def list_tags(prefix: str | None = None):
    if prefix:
        return {"data": provider.get_tags_by_prefix(prefix)}
    return {"data": provider.list_tags()}


@app.post("/api/tags")
async def create_tag(request: Request, payload: TagCreateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace editors or higher can manage tags.")
    try:
        return {"data": provider.create_tag(payload.dict())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/tags/{tag_id}")
async def update_tag(tag_id: str, request: Request, payload: TagUpdateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace editors or higher can manage tags.")
    try:
        return {"data": provider.update_tag(tag_id, payload.dict(exclude_unset=True))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can delete tags.")
    try:
        provider.delete_tag(tag_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/form-folders")
async def list_form_folders():
    return {"data": provider.list_form_folders()}


@app.post("/api/form-folders")
async def create_form_folder(request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms.")
    try:
        return {"data": provider.create_form_folder(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/form-folders/{folder_id}")
async def update_form_folder(folder_id: str, request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms.")
    try:
        return {"data": provider.update_form_folder(folder_id, payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/form-folders/{folder_id}")
async def delete_form_folder(folder_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms.")
    try:
        return {"data": provider.delete_form_folder(folder_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/forms")
async def list_forms(summary: bool = False):
    if summary:
        return {"data": provider.list_forms_summary()}
    return {"data": provider.list_forms()}


@app.post("/api/forms")
async def create_form(request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms.")
    try:
        return {"data": provider.create_form(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/forms/{form_id}")
async def update_form(form_id: str, request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms.")
    try:
        return {"data": provider.update_form(form_id, payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/forms/{form_id}")
async def delete_form(form_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms.")
    try:
        provider.delete_form(form_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/forms")
async def bulk_delete_forms(request: Request, payload: dict[str, Any] = Body(...)):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace admins can bulk delete forms.")
    ids = payload.get("ids", [])
    confirm = payload.get("confirm", "")
    
    try:
        if ids:
            result = provider.bulk_delete_forms(ids)
            print(f"[BULK DELETE] forms deleted: {result}")
            return {"success": True, "data": result}
            
        if confirm == "DELETE_ALL_FORMS":
            all_forms = provider.list_forms()
            form_ids = [f["id"] for f in all_forms]
            result = provider.bulk_delete_forms(form_ids)
            print(f"[BULK DELETE] All forms deleted: {result}")
            return {"success": True, "data": result}
            
        raise HTTPException(status_code=400, detail="Either 'ids' list or 'confirm' string 'DELETE_ALL_FORMS' is required.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
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
async def create_booking_type(request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage booking types.")
    try:
        return {"data": provider.create_booking_type(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/booking-types/{booking_type_id}")
async def update_booking_type(booking_type_id: str, request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage booking types.")
    try:
        return {"data": provider.update_booking_type(booking_type_id, payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/booking-types/{booking_type_id}")
async def delete_booking_type(booking_type_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage booking types.")
    try:
        provider.delete_booking_type(booking_type_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/comms/snapshot")
async def comms_snapshot():
    return provider.get_comms_snapshot()


@app.post("/api/comms/threads")
async def create_thread(request: Request, payload: ThreadCreateRequest):
    require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    return provider.create_thread(
        subject=payload.subject,
        channel_type=payload.channel_type,
        contact_id=payload.contact_id,
        company_id=payload.company_id,
        body=payload.body,
        status=payload.status,
        assignee=payload.assignee,
        mailbox_id=payload.mailbox_id,
    )


@app.post("/api/comms/threads/open")
async def open_thread(request: Request, payload: ThreadOpenRequest):
    require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.open_thread_for_contact(
            contact_id=payload.contact_id,
            channel_type=payload.channel_type,
            subject=payload.subject,
            body=payload.body,
            force_new=payload.force_new,
            mailbox_id=payload.mailbox_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/messages")
async def send_thread_message(thread_id: str, request: Request, payload: ThreadMessageRequest):
    require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    return provider.send_thread_message(
        thread_id=thread_id,
        body=payload.body,
        channel_type=payload.channel_type,
        sender_name=payload.sender_name,
        sender_email=payload.sender_email,
        recipients=payload.recipients,
        direction=payload.direction,
    )


@app.post("/api/comms/threads/{thread_id}/send-email")
async def send_thread_email(thread_id: str, request: Request, payload: MailSendRequest):
    require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.send_thread_via_mailbox(
            thread_id=thread_id,
            body=payload.body,
            mailbox_id=payload.mailbox_id,
            sender_name=payload.sender_name,
            sender_email=payload.sender_email,
            recipients=payload.recipients,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/comms/threads/{thread_id}/status")
async def update_thread_status(thread_id: str, request: Request, payload: ThreadStatusRequest):
    require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    return provider.update_thread_status(thread_id=thread_id, status=payload.status)


@app.patch("/api/comms/threads/{thread_id}/assign")
async def assign_thread(thread_id: str, request: Request, payload: ThreadAssignRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    assignee_name = payload.assignee_name or payload.assignee
    if not assignee_name:
        raise HTTPException(status_code=422, detail="assignee_name is required")
    return provider.assign_thread(thread_id=thread_id, assignee_name=assignee_name)


@app.patch("/api/comms/threads/{thread_id}/mailbox")
async def update_thread_mailbox(thread_id: str, request: Request, payload: ThreadMailboxRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    return provider.update_thread_mailbox(thread_id=thread_id, mailbox_id=payload.mailbox_id)


@app.post("/api/comms/threads/{thread_id}/summarize")
async def summarize_thread(thread_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    return provider.summarize_thread(thread_id=thread_id)


@app.post("/api/comms/threads/{thread_id}/draft")
async def create_thread_draft(thread_id: str, request: Request, payload: ThreadDraftRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    return provider.create_thread_draft(thread_id=thread_id, mode=payload.mode)


@app.post("/api/comms/threads/{thread_id}/create-deal")
async def create_deal_from_thread(thread_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.create_deal_from_thread(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/advance-stage")
async def advance_thread_stage(thread_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.advance_thread_stage(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/schedule-meeting")
async def schedule_thread_meeting(thread_id: str, request: Request, payload: ThreadMeetingRequest | None = None):
    session = require_client_safe_surface(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        existing_events = provider.list_calendar_events(thread_id=thread_id)
        response = provider.schedule_thread_meeting(thread_id=thread_id, scheduled_at=payload.scheduled_at if payload else None)
        refreshed_events = provider.list_calendar_events(thread_id=thread_id)
        linked_event = refreshed_events[0] if refreshed_events else None
        if linked_event:
            tenant = session.get("tenant") or {}
            user = session.get("user") or {}
            provider_config = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
            emit_booking_lifecycle_event(
                event_type="booking_created" if not existing_events else "booking_updated",
                event=linked_event,
                actor=user,
                tenant=tenant,
                provider_config=provider_config,
            )
        return response
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/comms/threads/{thread_id}/reports")
async def create_thread_report(thread_id: str, request: Request, payload: ThreadReportRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.create_thread_report(thread_id=thread_id, kind=payload.kind)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/comms/threads/{thread_id}")
async def delete_thread(thread_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.delete_thread(thread_id=thread_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


# ============ ANALYTICS & REPORTING ============

@app.get("/api/analytics/summary")
async def get_analytics_summary(request: Request):
    """Get aggregate stats across all modules for report cards."""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role to access analytics.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id") or "default"
    token = extract_session_token(request)
    
    print(f"[AnalyticsAPI] session tenant: {tenant.get('id')}, effective: {tenant_id}")
    
    try:
        contacts = provider.list_contacts()
        print(f"[AnalyticsAPI] contacts fetched: {len(contacts)}")
        deals = [c for c in contacts if c.get("pipeline_stage")]
        threads = provider.get_comms_snapshot().get("threads", [])
        ai_runs = [project_engine_run_for_ui(run) for run in provider.list_ai_runs(limit=100)]
        ai_runs = [run for run in ai_runs if run]
        
        stages = {}
        stage_values = {}
        for c in deals:
            stage = c.get("pipeline_stage", "Unknown")
            stages[stage] = stages.get(stage, 0) + 1
            val = c.get("deal_value") or c.get("lead_score", 0) * 100
            stage_values[stage] = stage_values.get(stage, 0) + val
        
        sources = {}
        for c in contacts:
            src = c.get("source", "Unknown")
            sources[src] = sources.get(src, 0) + 1
        
        score_buckets = {"90+": 0, "70-89": 0, "50-69": 0, "<50": 0}
        for c in contacts:
            score = c.get("lead_score", 0)
            if score >= 90: score_buckets["90+"] += 1
            elif score >= 70: score_buckets["70-89"] += 1
            elif score >= 50: score_buckets["50-69"] += 1
            else: score_buckets["<50"] += 1
        
        quality_dist = {}
        for c in contacts:
            q = c.get("quality", "unknown")
            quality_dist[q] = quality_dist.get(q, 0) + 1
        
        engagement_dist = {}
        for c in contacts:
            e = c.get("engagement", "unknown")
            engagement_dist[e] = engagement_dist.get(e, 0) + 1
        
        return {
            "crm": {
                "total_contacts": len(contacts),
                "total_deals": len(deals),
                "avg_lead_score": round(sum(c.get("lead_score", 0) for c in contacts) / max(len(contacts), 1), 1),
                "stages": stages,
                "stage_values": stage_values,
                "score_distribution": score_buckets,
                "quality_distribution": quality_dist,
                "engagement_distribution": engagement_dist,
                "sources": sources,
                "recent_contacts": sorted(contacts, key=lambda x: x.get("updated_at", ""), reverse=True)[:10],
            },
            "comms": {
                "total_threads": len(threads),
                "active_threads": len([t for t in threads if t.get("status") == "active"]),
                "archived_threads": len([t for t in threads if t.get("status") == "archived"]),
            },
            "ai": {
                "total_runs": len(ai_runs),
                "runs_by_module": _group_by_module(ai_runs),
                "recent_runs": ai_runs[:10],
            },
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


def _group_by_module(runs):
    grouped = {}
    for run in runs:
        module = run.get("module", "unknown")
        grouped[module] = grouped.get(module, 0) + 1
    return grouped


# ============ CORTEX REPORT GENERATION ============

class CortexReportRequest(BaseModel):
    reportId: str
    prompt: str
    analytics: dict[str, Any] | None = None
    context: dict[str, Any] | None = None


@app.post("/api/cortex/generate-report")
async def generate_cortex_report(request: Request, payload: CortexReportRequest):
    """Generate AI-powered report using configured provider."""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role to generate reports.")
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}

    print(f"[CortexReportAPI] START {payload.reportId}")
    print(f"[CortexReportAPI] USER {user.get('id', 'none')}")
    print(f"[CortexReportAPI] TENANT {tenant.get('id', 'none')}")

    try:
        tenant_id = tenant.get("id")
        route_hints = {}
        if isinstance(payload.context, dict) and isinstance(payload.context.get("route_hints"), dict):
            route_hints = payload.context.get("route_hints", {})
        provider_override = payload.context.get("provider_override") if isinstance(payload.context, dict) else None
        try:
            route = resolve_ai_route(
                tenant_id=tenant_id,
                feature="cortex_reports",
                task="summarization",
                provider_override=provider_override,
                route_hints=route_hints or None,
                auth_store=auth_store,
            )
        except ValueError as error:
            print(f"[CortexReportAPI] ERROR {str(error)}")
            return {"success": False, "error": str(error), "data": None}
        log_ai_route(route)
        active_config = route.get("provider_config")
        if not active_config:
            return {"success": False, "error": "No AI provider routed.", "data": None}

        context_text = ""
        if payload.analytics:
            crm = payload.analytics.get("crm", {})
            comms = payload.analytics.get("comms", {})
            ai_data = payload.analytics.get("ai", {})

            context_text = f"""
SYSTEM DATA:
- CRM: {crm.get('total_contacts', 0)} contacts, {crm.get('total_deals', 0)} deals
- Stages: {json.dumps(crm.get('stages', {}))}
- Sources: {json.dumps(crm.get('sources', {}))}
- Lead Score Distribution: {json.dumps(crm.get('score_distribution', {}))}
- Comms: {comms.get('total_threads', 0)} threads, {comms.get('active_threads', 0)} active
- AI: {ai_data.get('total_runs', 0)} runs
"""

        full_prompt = f"""{payload.prompt}

{context_text}

Generate a comprehensive, actionable report following the output structure specified above. Use the provided data to inform your analysis."""

        print(f"[CortexReportAPI] CALL_AI provider={active_config.get('provider_key')}")

        result = ai_assist_service.generate_report(
            prompt=full_prompt,
            context={
                "analytics": payload.analytics,
                "reportId": payload.reportId,
            },
            actor=user,
            tenant=tenant,
            provider_config=active_config,
        )

        print("[CortexReportAPI] SUCCESS")
        return {"success": True, "data": result}

    except Exception as e:
        print(f"[CortexReportAPI] ERROR {str(e)}")
        logger.error(f"Report generation failed: {e}")
        return {"success": False, "error": str(e), "data": None}


# ============ EXTERNAL DATA INTAKE ============


class ExternalDataRequest(BaseModel):
    source: str
    data_type: str
    records: list[dict[str, Any]]
    metadata: dict[str, Any] | None = None


@app.post("/api/analytics/external-data")
async def ingest_external_data(request: Request, payload: ExternalDataRequest):
    """Import external data for analysis (CSV uploads, API feeds, etc.)"""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role to import data.")
    tenant = session.get("tenant") or {}
    
    try:
        data_id = auth_store.save_external_dataset(
            tenant_id=tenant.get("id") or "default",
            source=payload.source,
            data_type=payload.data_type,
            records=payload.records,
            metadata=payload.metadata or {}
        )
        return {"data": {"id": data_id, "source": payload.source, "record_count": len(payload.records)}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/analytics/external-data")
async def list_external_data(request: Request):
    """List all imported external datasets"""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role.")
    tenant = session.get("tenant") or {}
    
    try:
        datasets = auth_store.list_external_datasets(tenant_id=tenant.get("id") or "default")
        return {"data": datasets}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/analytics/external-data/{data_id}")
async def get_external_data(request: Request, data_id: str):
    """Get a specific external dataset"""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role.")
    
    try:
        dataset = auth_store.get_external_dataset(data_id)
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
        return {"data": dataset}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.delete("/api/analytics/external-data/{data_id}")
async def delete_external_data(request: Request, data_id: str):
    """Delete an external dataset"""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role.")
    
    try:
        auth_store.delete_external_dataset(data_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ============ CONTENT METRICS INTAKE ============

@app.post("/api/analytics/content-metrics")
async def ingest_content_metrics(request: Request, payload: dict[str, Any]):
    """Import content performance metrics for analysis"""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role.")
    tenant = session.get("tenant") or {}
    
    try:
        metrics_id = auth_store.save_content_metrics(
            tenant_id=tenant.get("id") or "default",
            platform=payload.get("platform", "unknown"),
            content_type=payload.get("content_type", "general"),
            metrics=payload.get("metrics", {}),
            date=payload.get("date")
        )
        return {"data": {"id": metrics_id, "platform": payload.get("platform")}}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/analytics/content-metrics")
async def list_content_metrics(request: Request, platform: str | None = None, limit: int = 50):
    """Get content metrics for analysis"""
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Need editor role.")
    tenant = session.get("tenant") or {}
    
    try:
        metrics = auth_store.list_content_metrics(
            tenant_id=tenant.get("id") or "default",
            platform=platform,
            limit=limit
        )
        return {"data": metrics}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# ============ ORDERS ============

@app.get("/api/orders")
async def list_orders(request: Request):
    """List all orders for the workspace."""
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Need viewer role to view orders.")
    try:
        return {"data": provider.list_orders()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

# ============ PAYMENT PROVIDERS ============

class PaymentProviderUpsertRequest(BaseModel):
    label: str | None = None
    enabled: bool = False
    status: str | None = None
    config: dict[str, Any] | None = None
    last_tested_at: str | None = None
    last_error: str | None = None

@app.get("/api/payments/providers")
async def list_payment_provider_configs(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view payment providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_payment_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@app.put("/api/payments/providers/{provider_key}")
async def upsert_payment_provider_config(provider_key: str, request: Request, payload: PaymentProviderUpsertRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage payment providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_payment_provider_config(token, tenant_id, provider_key, payload.model_dump())
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@app.delete("/api/payments/providers/{config_id}")
async def delete_payment_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can delete payment providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_payment_provider_config(token, tenant_id, config_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

@app.post("/api/payments/providers/{config_id}/test")
async def test_payment_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can test payment providers.")
    tenant_id = (session.get("tenant") or {}).get("id")
    config = auth_store.get_payment_provider_config_for_tenant(tenant_id, config_id)
    if not config:
        raise HTTPException(status_code=404, detail="Payment provider config not found")
    return {"result": {"success": True, "message": "Payment provider routed (Simulation)."}, "data": config}

class NotificationCreateRequest(BaseModel):
    type: str
    title: str
    message: str
    priority: str = "normal"
    link: str | None = None


class NotificationUpdateRequest(BaseModel):
    read: bool | None = None


@app.get("/api/notifications")
async def list_notifications(request: Request, limit: int = 50, unread_only: bool = False):
    """Get notifications for the current tenant."""
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES)
    token = extract_session_token(request)
    tenant_id = session.get("tenant_id") or session.get("tenant", {}).get("id")
    if not tenant_id:
        return {"data": [], "unread_count": 0}
    try:
        result = auth_store.list_notifications(token, tenant_id, limit=limit, unread_only=unread_only)
        return {"data": result["notifications"], "unread_count": result["unread_count"]}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/notifications")
async def create_notification(request: Request, payload: NotificationCreateRequest):
    """Create a notification for the current tenant."""
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES)
    token = extract_session_token(request)
    tenant_id = session.get("tenant_id") or session.get("tenant", {}).get("id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    try:
        notification = auth_store.create_notification(token, tenant_id, payload.model_dump())
        return {"data": notification}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/notifications/{notification_id}")
async def update_notification(notification_id: str, request: Request, payload: NotificationUpdateRequest):
    """Update a notification (mark as read)."""
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES)
    token = extract_session_token(request)
    tenant_id = session.get("tenant_id") or session.get("tenant", {}).get("id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    try:
        return {"data": auth_store.update_notification(token, tenant_id, notification_id, payload.read)}
    except ValueError as error:
        detail = str(error)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.post("/api/notifications/read-all")
async def mark_all_notifications_read(request: Request):
    """Mark all notifications as read for the current tenant."""
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES)
    token = extract_session_token(request)
    tenant_id = session.get("tenant_id") or session.get("tenant", {}).get("id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    try:
        return auth_store.mark_all_notifications_read(token, tenant_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/notifications/{notification_id}")
async def delete_notification(notification_id: str, request: Request):
    """Delete a notification."""
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES)
    token = extract_session_token(request)
    tenant_id = session.get("tenant_id") or session.get("tenant", {}).get("id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="No tenant context")
    try:
        return auth_store.delete_notification(token, tenant_id, notification_id)
    except ValueError as error:
        detail = str(error)
        status_code = 404 if "not found" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info")

