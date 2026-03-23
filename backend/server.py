import json
import logging
import os
import re
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
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

from automation_service import test_automation_provider
from auth_store import AuthStore, default_auth_db_path
from ai_service import ai_assist_service, get_ai_provider_catalog, list_ollama_models
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

AGENT_RUNTIME_REGISTRY: dict[str, dict[str, Any]] = {
    "ALPHA": {
        "registry_key": "ALPHA",
        "label": "Commander-in-Chief",
        "rank": "Commander",
        "role": "HQ",
        "specialization": "Commander-in-Chief",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": ["BRAVO", "CHARLIE", "DELTA", "ECHO", "FORGE", "APEX", "ARCHER", "ATLAS", "RANGER", "SCOUT", "STRIKER", "VECTOR"],
        "tools": [
            "Mission Brief Generator",
            "Resource Allocation Optimizer",
            "Squad Performance Dashboard",
            "Integration Protocol Generator",
            "Strategic Directive Builder",
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
        "tools": ["Strategic Plan Generator", "SWOT Analysis Builder", "Growth Strategy Framework"],
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
        "tools": ["Support Script Generator", "FAQ Builder", "Customer Response Templates", "Support Ticket Optimizer"],
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
        "tools": ["Project Timeline Generator", "Resource Allocation Matrix", "Task Priority Framework"],
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
        "tools": ["Email Template Generator", "Newsletter Builder", "Communication Plan Creator", "Social Campaign Builder"],
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
        "tools": ["Article Generator", "Landing Page Copy Generator", "Brand Story Creator"],
    },
    "APEX": {
        "registry_key": "APEX",
        "label": "Coder/IT/Site Dev",
        "rank": "AI Agent",
        "role": "Engineering",
        "specialization": "Coder/IT/Site Dev",
        "visibility": "visible",
        "capability_tier": "tier-1",
        "subordinates": [],
        "tools": ["System Architecture Planner", "Automation Playbook Builder", "API Integration Design", "Security Hardening Checklist"],
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
        "tools": ["KPI Dashboard Generator", "Financial Report Builder", "ROI Calculator"],
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
        "tools": ["Deployment Coordination Plan", "Systems Map Builder", "Resource Movement Tracker", "Runbook Routing Matrix"],
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
        "tools": ["SEO Blog Writer", "SEO Auditor", "Keyword Research Generator"],
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
        "tools": ["Job Description Generator", "Interview Question Builder", "Candidate Assessment Template"],
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
        "tools": ["Cold Email Generator", "Discovery Call Script Writer", "Proposal Builder", "Negotiation Advisor"],
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
        "tools": ["Image Generation", "Design Brief Builder", "Brand Style Guide Generator"],
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

VISIBLE_AGENT_KEYS = [key for key, value in AGENT_RUNTIME_REGISTRY.items() if value.get("visibility") != "hidden"]


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


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
    oauth_states.clear()
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


def collect_brain_memory_results(query: str, limit: int = 6, include_runtime: bool = False) -> list[dict[str, Any]]:
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


def list_runtime_agents(include_hidden: bool = False) -> list[dict[str, Any]]:
    keys = AGENT_RUNTIME_REGISTRY.keys() if include_hidden else VISIBLE_AGENT_KEYS
    return [{**AGENT_RUNTIME_REGISTRY[key]} for key in keys]


def normalize_agent_key(value: Any) -> str:
    resolved = " ".join(str(value or "").split()).strip().upper()
    return resolved if resolved in AGENT_RUNTIME_REGISTRY else ""


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
    if any(term in haystack for term in ["wipe", "destroy", "purge", "kill switch", "delete from mailbox", "delete everywhere"]):
        return "dangerous"
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
        return "APEX"
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
    yield
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
                "http://localhost:5173",
                "http://127.0.0.1:5173",
                "http://0.0.0.0:5173",
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


class AIAssistRequest(BaseModel):
    module: str
    surface: str
    field: str
    intent: str = "draft"
    current_value: str = ""
    context: dict[str, Any] | None = None


class AICommandRequest(BaseModel):
    module: str
    surface: str
    command_text: str
    requested_agent: str | None = None
    context: dict[str, Any] | None = None


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


WORKSPACE_VIEWER_ROLES = {"owner", "admin", "staff", "viewer"}
WORKSPACE_EDITOR_ROLES = {"owner", "admin", "staff"}
WORKSPACE_ADMIN_ROLES = {"owner", "admin"}


def require_workspace_role(request: Request, allowed_roles: set[str], detail: str = "You do not have permission to perform this action.") -> dict[str, Any]:
    session = require_session(request)
    tenant = session.get("tenant") or {}
    role = (tenant.get("role") or "").strip().lower()
    if not role or role not in allowed_roles:
        raise HTTPException(status_code=403, detail=detail)
    return session


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
    items = provider.list_brain_items(limit=100)  # Limit initial load
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


@app.get("/api/brain/search")
async def search_brain_memory(request: Request, query: str, limit: int = 6, include_runtime: bool = False):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can query AIO Brain memory.")
    return {"data": collect_brain_memory_results(query, limit=max(1, limit), include_runtime=include_runtime)}


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


@app.post("/api/ai/assist")
async def ai_assist(request: Request, payload: AIAssistRequest):
    session = require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can use AI workspace tools.")
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}
    ai_provider = auth_store.get_default_ai_provider_config_for_tenant(tenant.get("id")) if tenant.get("id") else None
    resolved_module = (payload.module or "").strip().lower()
    resolved_context = dict(payload.context or {})
    routing = resolve_ai_run_routing(
        payload.module,
        payload.surface,
        field=payload.field,
        intent=payload.intent,
        command_text=payload.current_value,
        context=resolved_context,
    )
    resolved_agent_role = routing["executing_agent"]
    resolved_context.update(routing)
    brain_results: list[dict[str, Any]] = []
    brain_query = build_brain_assist_query(payload.current_value, resolved_context, tenant)
    if brain_query:
        brain_results = collect_brain_memory_results(brain_query, limit=5, include_runtime=True)
        if brain_results:
            resolved_context["brain_memory"] = brain_results
            resolved_context["brain_memory_summary"] = "\n".join(
                [
                    f"{entry.get('title')}: {entry.get('excerpt')}"
                    for entry in brain_results
                ]
            )
            resolved_context["brain_memory_query"] = brain_query
    result = ai_assist_service.assist(
        module=payload.module,
        surface=payload.surface,
        field=payload.field,
        intent=payload.intent,
        current_value=payload.current_value,
        context=resolved_context,
        actor=user,
        tenant=tenant,
        provider_config=ai_provider,
    )
    response = result.to_dict()
    applied_thread = None
    draft_text = ""
    if resolved_module == "comms" and resolved_context.get("thread_id"):
        applied = provider.apply_thread_ai_result(
            thread_id=str(resolved_context["thread_id"]),
            mode=(payload.field or "").strip().lower() or "summary",
            suggestion=result.suggestion,
            metadata=result.metadata or {},
        )
        applied_thread = applied.get("thread")
        response["thread"] = applied_thread
        if applied.get("draft"):
            draft_text = str(applied["draft"])
            response["draft"] = draft_text
    run_artifacts = build_ai_run_artifacts(draft_text=draft_text, thread=applied_thread)
    run_steps = build_ai_run_steps(brain_results=brain_results, applied_thread=applied_thread, draft_text=draft_text)
    run = auth_store.record_ai_run(
        user_id=user.get("id"),
        tenant_id=tenant.get("id"),
        module=payload.module,
        surface=payload.surface,
        field=payload.field,
        intent=payload.intent,
        status="completed",
        agent_role=resolved_agent_role,
        intake_agent=routing["intake_agent"],
        dispatcher_agent=routing["dispatcher_agent"],
        executing_agent=routing["executing_agent"],
        requested_agent=routing["requested_agent"],
        delegate_chain=routing["delegate_chain"],
        permission_tier=routing["permission_tier"],
        thread_id=str(resolved_context.get("thread_id") or "") or None,
        contact_id=str(resolved_context.get("contact_id") or "") or None,
        company_id=str(resolved_context.get("company_id") or "") or None,
        command_text=str(resolved_context.get("command_text") or "").strip() or None,
        provider_key=(ai_provider or {}).get("provider_key"),
        provider_label=(ai_provider or {}).get("label"),
        model=(ai_provider or {}).get("model"),
        prompt=result.prompt,
        result=result.suggestion,
        artifacts=run_artifacts,
        steps=run_steps,
        metadata={
            "alternatives": result.alternatives,
            "rationale": result.rationale,
            "context": resolved_context,
            "result_metadata": result.metadata or {},
            "brain_query": brain_query,
            "brain_result_count": len(brain_results),
        },
    )
    response["run_id"] = run["id"]
    response["run"] = run
    return {"data": response, "run": run}


@app.get("/api/ai/runs")
async def list_ai_runs(request: Request, limit: int = 50):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can view AI activity.")
    token = extract_session_token(request)
    try:
        return {"data": auth_store.list_ai_runs(token, limit=limit)}
    except ValueError as error:
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
    routing = resolve_ai_run_routing(
        payload.module,
        payload.surface,
        field="command",
        intent="command",
        command_text=payload.command_text,
        context={**resolved_context, "requested_agent": payload.requested_agent},
    )
    if routing["permission_tier"] == "dangerous":
        raise HTTPException(status_code=403, detail="Dangerous commands are blocked from natural-language routing. Use the dedicated Omega admin controls.")
    resolved_context.update(routing)
    resolved_context["command_text"] = payload.command_text
    brain_query = build_brain_assist_query(payload.command_text, resolved_context, tenant)
    brain_results: list[dict[str, Any]] = []
    if brain_query:
        brain_results = collect_brain_memory_results(brain_query, limit=5, include_runtime=True)
        if brain_results:
            resolved_context["brain_memory"] = brain_results
            resolved_context["brain_memory_summary"] = "\n".join(
                [f"{entry.get('title')}: {entry.get('excerpt')}" for entry in brain_results]
            )
            resolved_context["brain_memory_query"] = brain_query
    result = ai_assist_service.assist(
        module=payload.module,
        surface=payload.surface,
        field=routing["executing_agent"].lower(),
        intent="command",
        current_value=payload.command_text,
        context=resolved_context,
        actor=user,
        tenant=tenant,
        provider_config=ai_provider,
    )
    response = result.to_dict()
    applied_thread = None
    draft_text = ""
    if (payload.module or "").strip().lower() == "comms" and resolved_context.get("thread_id"):
        applied = provider.apply_thread_ai_result(
            thread_id=str(resolved_context["thread_id"]),
            mode="summary" if routing["executing_agent"] in {"CHARLIE", "ECHO"} else "draft",
            suggestion=result.suggestion,
            metadata=result.metadata or {},
        )
        applied_thread = applied.get("thread")
        response["thread"] = applied_thread
        if applied.get("draft"):
            draft_text = str(applied["draft"])
            response["draft"] = draft_text
    run = auth_store.record_ai_run(
        user_id=user.get("id"),
        tenant_id=tenant.get("id"),
        module=payload.module,
        surface=payload.surface,
        field="command",
        intent="command",
        status="completed",
        agent_role=routing["executing_agent"],
        intake_agent=routing["intake_agent"],
        dispatcher_agent=routing["dispatcher_agent"],
        executing_agent=routing["executing_agent"],
        requested_agent=routing["requested_agent"],
        delegate_chain=routing["delegate_chain"],
        permission_tier=routing["permission_tier"],
        thread_id=str(resolved_context.get("thread_id") or "") or None,
        contact_id=str(resolved_context.get("contact_id") or "") or None,
        company_id=str(resolved_context.get("company_id") or "") or None,
        command_text=payload.command_text.strip(),
        provider_key=(ai_provider or {}).get("provider_key"),
        provider_label=(ai_provider or {}).get("label"),
        model=(ai_provider or {}).get("model"),
        prompt=result.prompt,
        result=result.suggestion,
        artifacts=build_ai_run_artifacts(draft_text=draft_text, thread=applied_thread),
        steps=build_ai_run_steps(brain_results=brain_results, applied_thread=applied_thread, draft_text=draft_text),
        metadata={
            "alternatives": result.alternatives,
            "rationale": result.rationale,
            "context": resolved_context,
            "result_metadata": result.metadata or {},
            "brain_query": brain_query,
            "brain_result_count": len(brain_results),
        },
    )
    response["routing"] = routing
    response["run"] = run
    response["run_id"] = run["id"]
    return {"data": response, "run": run}


@app.get("/api/ai/providers/catalog")
async def list_ai_provider_catalog(request: Request):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI provider options.")
    return {"data": get_ai_provider_catalog()}


@app.get("/api/ai/providers/ollama/models")
async def list_ollama_provider_models(request: Request, base_url: str | None = None):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI provider options.")
    try:
        return {"data": list_ollama_models(base_url)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/ai/providers/ollama/models")
async def list_ollama_provider_models_post(request: Request, payload: OllamaModelsRequest):
    require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI provider options.")
    try:
        return {
            "data": list_ollama_models(
                payload.base_url,
                payload.api_key,
                payload.username,
                payload.password,
            )
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/ai/providers")
async def list_ai_provider_configs(request: Request):
    session = require_workspace_role(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view AI providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return {"data": auth_store.list_ai_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.put("/api/ai/providers/{provider_key}")
async def upsert_ai_provider_config(provider_key: str, request: Request, payload: AIProviderUpsertRequest):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage AI providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        config = auth_store.upsert_ai_provider_config(token, tenant_id, provider_key, payload.model_dump())
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/ai/providers/{config_id}")
async def delete_ai_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can delete AI providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    try:
        return auth_store.delete_ai_provider_config(token, tenant_id, config_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/ai/providers/{config_id}/test")
async def test_ai_provider_config(config_id: str, request: Request):
    session = require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can test AI providers.")
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


@app.post("/api/workspaces")
async def create_workspace(request: Request, payload: WorkspaceCreateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can create a new workspace.")
    token = extract_session_token(request)
    try:
        return auth_store.create_workspace(token, payload.name)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/workspaces/{workspace_id}")
async def rename_workspace(workspace_id: str, request: Request, payload: WorkspaceUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can rename a workspace.")
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
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage members.")
    token = extract_session_token(request)
    try:
        return auth_store.add_workspace_member(token, workspace_id, payload.email, payload.role)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
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
            payload.create_workspace,
            payload.workspace_name,
        )
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.patch("/api/workspaces/{workspace_id}/memberships/{membership_id}")
async def update_workspace_member(workspace_id: str, membership_id: str, request: Request, payload: WorkspaceMemberUpdateRequest):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage members.")
    token = extract_session_token(request)
    try:
        return auth_store.update_workspace_member(token, workspace_id, membership_id, payload.role)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
        raise HTTPException(status_code=status_code, detail=detail) from error


@app.delete("/api/workspaces/{workspace_id}/memberships/{membership_id}")
async def remove_workspace_member(workspace_id: str, membership_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_ADMIN_ROLES, "Only workspace admins can manage members.")
    token = extract_session_token(request)
    try:
        return auth_store.remove_workspace_member(token, workspace_id, membership_id)
    except ValueError as error:
        detail = str(error)
        status_code = 403 if "permission" in detail.lower() else 400
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
async def create_contact(request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create contacts.")
    try:
        return {"data": provider.create_contact(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/contacts/{contact_id}")
async def update_contact(contact_id: str, request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can update contacts.")
    try:
        return {"data": provider.update_contact(contact_id, payload)}
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
async def create_calendar_event(request: Request, payload: dict[str, Any]):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can create calendar events.")
    try:
        return {"data": provider.create_calendar_event(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.patch("/api/calendar/events/{event_id}")
async def update_calendar_event(event_id: str, request: Request, payload: CalendarEventUpdateRequest):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can update calendar events.")
    try:
        return provider.update_calendar_event(event_id, payload.model_dump(exclude_unset=True))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.delete("/api/calendar/events/{event_id}")
async def delete_calendar_event(event_id: str, request: Request):
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can delete calendar events.")
    try:
        provider.delete_calendar_event(event_id)
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


@app.get("/api/tags")
async def list_tags():
    return {"data": provider.list_tags()}


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
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
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
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
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
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
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
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
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
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
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
    require_workspace_role(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can operate Comms.")
    try:
        return provider.schedule_thread_meeting(thread_id=thread_id, scheduled_at=payload.scheduled_at if payload else None)
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
    
    try:
        contacts = provider.list_contacts()
        deals = [c for c in contacts if c.get("pipeline_stage")]
        threads = provider.get_comms_snapshot().get("threads", [])
        ai_runs = auth_store.list_ai_runs(token=None, limit=100)
        
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


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info")
