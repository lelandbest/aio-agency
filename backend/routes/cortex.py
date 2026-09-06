from __future__ import annotations

import json
import logging
from base64 import b64decode
from html import unescape
from html.parser import HTMLParser
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from backend.deps import (
    clean_text,
    get_auth_store,
    get_provider,
    get_request_tenant_id,
    require_capability,
)
from backend.media_library_models import (
    MediaAssetTagsUpdatePayload,
    MediaLibraryItemResponse,
    MediaLibraryResponse,
)
from backend.media_library_service import (
    list_media_library_items,
    update_media_library_item_tags,
)
from backend.media_engine import clone_json
from backend.cortex_service import cortex_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["cortex"])


# --- Text Extraction & MCP Helpers ---

class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(str(data or "").split())
        if text:
            self.parts.append(text)


def html_to_text(value: str) -> str:
    parser = _HTMLTextExtractor()
    parser.feed(value)
    parser.close()
    return " ".join(parser.parts).strip()


def normalize_ingest_text(value: str | None) -> str:
    lines = [" ".join(line.split()) for line in str(value or "").replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line).strip()


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


def extract_file_text(file_name: str | None, mime_type: str | None, content_base64: str | None) -> str | None:
    if not content_base64:
        raise ValueError("File content is required for Brain file ingest.")

    normalized_name = (file_name or "").lower()
    normalized_type = (mime_type or "").lower()

    text_extensions = (".txt", ".md", ".markdown", ".csv", ".vtt", ".json", ".xml")
    rich_text_extensions = (".rtf", ".doc", ".docx", ".pdf", ".xls", ".xlsx", ".odt")
    media_extensions = (".mp3", ".wav", ".m4a", ".mp4", ".mov", ".avi")
    image_extensions = (".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp")

    try:
        payload = b64decode(content_base64)
    except Exception as error:
        raise ValueError("Unable to decode uploaded file.") from error

    if normalized_name.endswith(text_extensions) or "text" in normalized_type or "json" in normalized_type:
        decoded = payload.decode("utf-8", errors="ignore")
        if "html" in normalized_type or normalized_name.endswith((".html", ".htm")):
            decoded = html_to_text(unescape(decoded))
        cleaned = " ".join(decoded.split()).strip()
        if not cleaned:
            raise ValueError("The uploaded text file appears to be empty.")
        return cleaned

    if normalized_name.endswith(rich_text_extensions) or normalized_name.endswith(media_extensions) or normalized_name.endswith(image_extensions):
        return None

    raise ValueError(f"File type '{normalized_name.split('.')[-1]}' is not yet supported for direct Brain ingestion.")


def _brain_value(record: dict[str, Any] | None, *keys: str) -> Any:
    source = record or {}
    for key in keys:
        value = source.get(key)
        if value is not None:
            return value
    return None


def resolve_brain_mcp_source(source_id: str) -> dict[str, Any]:
    provider = get_provider()
    source = next((item for item in provider.list_brain_sources() if item.get("id") == source_id), None)
    if not source:
        raise ValueError("MCP server not found.")
    if (_brain_value(source, "sourceType", "source_type") or "").strip().lower() != "mcp":
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
    provider = get_provider()
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


def probe_brain_mcp_source(source: dict[str, Any]) -> dict[str, Any]:
    source_id = str(source.get("id") or "").strip()
    try:
        payload = request_brain_mcp(source)
        set_brain_mcp_status(source_id, "active")
        return {"status": "active", "payload": payload}
    except Exception as exc:
        set_brain_mcp_status(source_id, "error")
        raise ValueError(f"MCP server health probe failed: {exc}") from exc


def query_brain_mcp_source(source: dict[str, Any], query: str, limit: int = 5) -> dict[str, Any]:
    payload = request_brain_mcp(source, payload={"query": query, "limit": limit})
    entries = []
    if isinstance(payload, list):
        entries = payload
    elif isinstance(payload, dict):
        for key in ["results", "data", "items"]:
            if isinstance(payload.get(key), list):
                entries = payload[key]
                break
        else:
            entries = [payload]
    return {
        "sourceId": source.get("id"),
        "label": source.get("label"),
        "results": entries[:limit],
    }


# --- Serialization Functions ---

def _serialize_brain_profile(record: dict[str, Any] | None) -> dict[str, Any]:
    source = record or {}
    return {
        "id": source.get("id"),
        "tenantId": source.get("tenantId"),
        "companyName": _brain_value(source, "companyName", "company_name") or "",
        "website": source.get("website") or "",
        "industry": source.get("industry") or "",
        "overview": source.get("overview") or "",
        "mission": source.get("mission") or "",
        "brandVoice": _brain_value(source, "brandVoice", "brand_voice") or "",
        "idealCustomer": _brain_value(source, "idealCustomer", "ideal_customer") or "",
        "valueProp": _brain_value(source, "valueProp", "value_prop") or "",
        "differentiation": _brain_value(source, "differentiation") or "",
        "painPoints": _brain_value(source, "painPoints", "pain_points") or "",
        "competitors": _brain_value(source, "competitors") or "",
        "marketingStrategy": _brain_value(source, "marketingStrategy", "marketing_strategy") or "",
        "workflow": _brain_value(source, "workflow") or "",
        "legalEntity": _brain_value(source, "legalEntity", "legal_entity") or "",
        "primaryBrand": _brain_value(source, "primaryBrand", "primary_brand") or "",
        "brandArchitecture": _brain_value(source, "brandArchitecture", "brand_architecture") or "",
        "legacyBrandNotes": _brain_value(source, "legacyBrandNotes", "legacy_brand_notes") or "",
        "brandUsageRules": _brain_value(source, "brandUsageRules", "brand_usage_rules") or "",
        "activeProvider": _brain_value(source, "activeProvider", "active_provider"),
        "activeModel": _brain_value(source, "activeModel", "active_model"),
        "createdAt": source.get("createdAt"),
        "updatedAt": source.get("updatedAt"),
    }


def _serialize_brain_source(record: dict[str, Any] | None) -> dict[str, Any]:
    source = record or {}
    return {
        "id": source.get("id"),
        "tenantId": source.get("tenantId"),
        "label": source.get("label") or "",
        "sourceType": _brain_value(source, "sourceType", "source_type") or "document",
        "status": source.get("status") or "draft",
        "location": source.get("location") or "",
        "notes": source.get("notes") or "",
        "metadata": clone_json(source.get("metadata") or {}),
        "graphX": _brain_value(source, "graphX", "graph_x"),
        "graphY": _brain_value(source, "graphY", "graph_y"),
        "createdAt": source.get("createdAt"),
        "updatedAt": source.get("updatedAt"),
    }


def _serialize_brain_item(record: dict[str, Any] | None) -> dict[str, Any]:
    source = record or {}
    tags = source.get("tags")
    return {
        "id": source.get("id"),
        "tenantId": source.get("tenantId"),
        "title": source.get("title") or "",
        "category": source.get("category") or "note",
        "content": source.get("content") or "",
        "sourceId": _brain_value(source, "sourceId", "source_id"),
        "status": source.get("status") or "draft",
        "tags": tags if isinstance(tags, list) else [],
        "metadata": clone_json(source.get("metadata") or {}),
        "graphX": _brain_value(source, "graphX", "graph_x"),
        "graphY": _brain_value(source, "graphY", "graph_y"),
        "createdAt": source.get("createdAt"),
        "updatedAt": source.get("updatedAt"),
    }


def _serialize_brain_link(record: dict[str, Any] | None) -> dict[str, Any]:
    source = record or {}
    return {
        "id": source.get("id"),
        "tenantId": source.get("tenantId"),
        "fromType": _brain_value(source, "fromType", "from_type") or "item",
        "fromId": _brain_value(source, "fromId", "from_id"),
        "toType": _brain_value(source, "toType", "to_type") or "item",
        "toId": _brain_value(source, "toId", "to_id"),
        "relationshipType": _brain_value(source, "relationshipType", "relationship_type") or "supports",
        "createdAt": source.get("createdAt"),
        "updatedAt": source.get("updatedAt"),
    }


def _serialize_brain_ingest(record: dict[str, Any] | None) -> dict[str, Any]:
    source = record or {}
    return {
        "id": source.get("id"),
        "tenantId": source.get("tenantId"),
        "sourceId": _brain_value(source, "sourceId", "source_id"),
        "ingestType": _brain_value(source, "ingestType", "ingest_type") or "text",
        "status": source.get("status") or "draft",
        "title": source.get("title") or "",
        "location": source.get("location") or "",
        "contentExcerpt": _brain_value(source, "contentExcerpt", "content_excerpt") or "",
        "contentLength": _brain_value(source, "contentLength", "content_length") or 0,
        "chunkCount": _brain_value(source, "chunkCount", "chunk_count") or 0,
        "error": source.get("error") or "",
        "createdAt": source.get("createdAt"),
        "updatedAt": source.get("updatedAt"),
    }


def _serialize_brain_overview(
    profile: dict[str, Any] | None,
    sources: list[dict[str, Any]],
    items: list[dict[str, Any]],
    links: list[dict[str, Any]],
    ingests: list[dict[str, Any]],
    all_ingests_count: int,
    categories: dict[str, int],
    source_statuses: dict[str, int],
) -> dict[str, Any]:
    serialized_sources = [_serialize_brain_source(item) for item in sources[:20]]
    serialized_items = [_serialize_brain_item(item) for item in items]
    serialized_links = [_serialize_brain_link(item) for item in links]
    serialized_ingests = [_serialize_brain_ingest(item) for item in ingests]
    return {
        "profile": _serialize_brain_profile(profile),
        "sources": serialized_sources,
        "items": serialized_items,
        "links": serialized_links,
        "ingests": serialized_ingests,
        "stats": {
            "sourceCount": len(sources),
            "knowledgeCount": len(items),
            "ingestCount": all_ingests_count,
            "activeCount": sum(1 for item in items if item.get("status") == "active"),
            "draftCount": sum(1 for item in items if item.get("status") == "draft"),
        },
        "categories": categories,
        "sourceStatuses": source_statuses,
        "recentItems": serialized_items[:6],
    }


def _brain_profile_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload or {}
    return {
        "company_name": source.get("companyName"),
        "website": source.get("website"),
        "industry": source.get("industry"),
        "overview": source.get("overview"),
        "mission": source.get("mission"),
        "brand_voice": source.get("brandVoice"),
        "ideal_customer": source.get("idealCustomer"),
        "value_prop": source.get("valueProp"),
        "differentiation": source.get("differentiation"),
        "pain_points": source.get("painPoints"),
        "competitors": source.get("competitors"),
        "marketing_strategy": source.get("marketingStrategy"),
        "workflow": source.get("workflow"),
        "legal_entity": source.get("legalEntity"),
        "primary_brand": source.get("primaryBrand"),
        "brand_architecture": source.get("brandArchitecture"),
        "legacy_brand_notes": source.get("legacyBrandNotes"),
        "brand_usage_rules": source.get("brandUsageRules"),
        "active_provider": source.get("activeProvider"),
        "active_model": source.get("activeModel"),
    }


def _brain_source_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload or {}
    return {
        "id": source.get("id"),
        "label": source.get("label"),
        "source_type": source.get("sourceType"),
        "status": source.get("status"),
        "location": source.get("location"),
        "notes": source.get("notes"),
        "metadata": clone_json(source.get("metadata") or {}),
        "graph_x": source.get("graphX"),
        "graph_y": source.get("graphY"),
        "createdAt": source.get("createdAt"),
    }


def _brain_item_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload or {}
    return {
        "id": source.get("id"),
        "title": source.get("title"),
        "category": source.get("category"),
        "content": source.get("content"),
        "source_id": source.get("sourceId"),
        "status": source.get("status"),
        "tags": source.get("tags"),
        "metadata": clone_json(source.get("metadata") or {}),
        "graph_x": source.get("graphX"),
        "graph_y": source.get("graphY"),
        "createdAt": source.get("createdAt"),
    }


def _brain_link_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload or {}
    return {
        "id": source.get("id"),
        "from_type": source.get("fromType"),
        "from_id": source.get("fromId"),
        "to_type": source.get("toType"),
        "to_id": source.get("toId"),
        "relationship_type": source.get("relationshipType"),
        "createdAt": source.get("createdAt"),
    }


def _brain_ingest_provider_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = payload or {}
    return {
        "source_id": source.get("sourceId"),
        "label": source.get("label"),
        "source_type": source.get("sourceType"),
        "status": source.get("status"),
        "location": source.get("location"),
        "notes": source.get("notes"),
        "ingest_type": source.get("ingestType"),
        "title": source.get("title"),
        "content": source.get("content"),
        "url": source.get("url"),
        "file_name": source.get("fileName"),
        "mime_type": source.get("mimeType"),
        "file_content_base64": source.get("fileContentBase64"),
    }


# --- Request Models ---

class BrainProfileUpdateRequest(BaseModel):
    companyName: str | None = None
    website: str | None = None
    industry: str | None = None
    overview: str | None = None
    mission: str | None = None
    brandVoice: str | None = None
    idealCustomer: str | None = None
    valueProp: str | None = None
    differentiation: str | None = None
    painPoints: str | None = None
    competitors: str | None = None
    marketingStrategy: str | None = None
    workflow: str | None = None
    legalEntity: str | None = None
    primaryBrand: str | None = None
    brandArchitecture: str | None = None
    legacyBrandNotes: str | None = None
    brandUsageRules: str | None = None


class BrainSourceRequest(BaseModel):
    label: str
    sourceType: str = "document"
    status: str = "draft"
    location: str = ""
    notes: str = ""
    metadata: dict[str, Any] | None = None
    graphX: float | None = None
    graphY: float | None = None


class BrainSourceUpdateRequest(BaseModel):
    label: str | None = None
    sourceType: str | None = None
    status: str | None = None
    location: str | None = None
    notes: str | None = None
    metadata: dict[str, Any] | None = None
    graphX: float | None = None
    graphY: float | None = None


class BrainItemRequest(BaseModel):
    title: str
    category: str = "note"
    content: str = ""
    sourceId: str | None = None
    status: str = "draft"
    tags: list[str] = []
    metadata: dict[str, Any] | None = None
    graphX: float | None = None
    graphY: float | None = None


class BrainItemUpdateRequest(BaseModel):
    title: str | None = None
    category: str | None = None
    content: str | None = None
    sourceId: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    metadata: dict[str, Any] | None = None
    graphX: float | None = None
    graphY: float | None = None


class BrainLinkRequest(BaseModel):
    fromType: str
    fromId: str
    toType: str
    toId: str
    relationshipType: str = "supports"


class BrainIngestRequest(BaseModel):
    sourceId: str | None = None
    label: str | None = None
    sourceType: str = "document"
    status: str | None = None
    location: str = ""
    notes: str = ""
    metadata: dict[str, Any] | None = None
    ingestType: str = "text"
    title: str | None = None
    content: str | None = None
    url: str | None = None
    fileName: str | None = None
    mimeType: str | None = None
    fileContentBase64: str | None = None


class BrainMCPQueryRequest(BaseModel):
    query: str
    limit: int = 5


class CortexSearchRequest(BaseModel):
    query: str
    limit: int = 5
    strategy: str = "hybrid"


# --- Endpoints ---

@router.get("/api/brain/overview")
async def get_brain_overview(request: Request):
    require_capability(request, "cortex.view", "Only workspace members can view AIO Brain.")
    provider = get_provider()
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
        "data": _serialize_brain_overview(
            profile=profile,
            sources=sources,
            items=items,
            links=provider.list_brain_links(limit=50),
            ingests=ingests,
            all_ingests_count=len(all_ingests),
            categories=categories,
            source_statuses=status_counts,
        )
    }


@router.get("/api/brain/profile")
async def get_brain_profile(request: Request):
    require_capability(request, "cortex.view", "Only workspace members can view AIO Brain.")
    provider = get_provider()
    return {"data": _serialize_brain_profile(provider.get_brain_profile())}


@router.patch("/api/brain/profile")
async def update_brain_profile(request: Request, payload: BrainProfileUpdateRequest):
    require_capability(request, "cortex.edit", "Only workspace staff or higher can edit AIO Brain.")
    provider = get_provider()
    updated = provider.update_brain_profile(_brain_profile_provider_payload(payload.model_dump()))
    return {"data": _serialize_brain_profile(updated)}


@router.get("/api/brain/sources")
async def list_brain_sources(request: Request):
    require_capability(request, "cortex.view", "Only workspace members can view AIO Brain sources.")
    provider = get_provider()
    return {"data": [_serialize_brain_source(item) for item in provider.list_brain_sources()]}


@router.post("/api/brain/sources")
async def create_brain_source(request: Request, payload: BrainSourceRequest):
    require_capability(request, "cortex.edit", "Only workspace staff or higher can create AIO Brain sources.")
    provider = get_provider()
    created = provider.create_brain_source(_brain_source_provider_payload(payload.model_dump()))
    return {"data": _serialize_brain_source(created)}


@router.patch("/api/brain/sources/{source_id}")
async def update_brain_source(source_id: str, request: Request, payload: BrainSourceUpdateRequest):
    require_capability(request, "cortex.edit", "Only workspace staff or higher can edit AIO Brain sources.")
    provider = get_provider()
    try:
        updated = provider.update_brain_source(source_id, _brain_source_provider_payload(payload.model_dump()))
        return {"data": _serialize_brain_source(updated)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/api/brain/sources/{source_id}")
async def delete_brain_source(source_id: str, request: Request):
    require_capability(request, "cortex.edit", "Only workspace staff or higher can delete AIO Brain sources.")
    provider = get_provider()
    try:
        provider.delete_brain_source(source_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/api/brain/mcp/{source_id}/probe")
async def probe_brain_mcp(source_id: str, request: Request):
    require_capability(request, "cortex.edit", "Only workspace staff or higher can connect Brain MCP servers.")
    try:
        source = resolve_brain_mcp_source(source_id)
        return {"data": probe_brain_mcp_source(source)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/brain/mcp/{source_id}/query")
async def query_brain_mcp(source_id: str, request: Request, payload: BrainMCPQueryRequest):
    require_capability(request, "cortex.execute", "Only workspace members can query Brain MCP servers.")
    try:
        source = resolve_brain_mcp_source(source_id)
        return {"data": query_brain_mcp_source(source, payload.query, limit=max(1, payload.limit))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/vault", response_model=MediaLibraryResponse)
async def list_vault_items(request: Request):
    require_capability(request, "system.view", "Only workspace members can view vault.")
    return {"data": list_media_library_items()}


@router.patch("/api/vault/assets/{asset_id}/tags", response_model=MediaLibraryItemResponse)
async def update_vault_asset_tags(request: Request, asset_id: str, payload: MediaAssetTagsUpdatePayload):
    require_capability(request, "system.manage", "Only workspace editors or higher can update asset tags.")
    updated_item = update_media_library_item_tags(asset_id, payload.tags)
    if not updated_item:
        raise HTTPException(status_code=404, detail=f"Media asset '{asset_id}' not found.")
    return {"data": updated_item}


@router.get("/api/brain/items")
async def list_brain_items(request: Request):
    require_capability(request, "system.view", "Only workspace members can view AIO Brain knowledge.")
    provider = get_provider()
    return {"data": [_serialize_brain_item(item) for item in provider.list_brain_items()]}


@router.post("/api/brain/items")
async def create_brain_item(request: Request, payload: BrainItemRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can create AIO Brain knowledge.")
    provider = get_provider()
    created = provider.create_brain_item(_brain_item_provider_payload(payload.model_dump()))
    return {"data": _serialize_brain_item(created)}


@router.patch("/api/brain/items/{item_id}")
async def update_brain_item(item_id: str, request: Request, payload: BrainItemUpdateRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can edit AIO Brain knowledge.")
    provider = get_provider()
    try:
        updated = provider.update_brain_item(item_id, _brain_item_provider_payload(payload.model_dump()))
        return {"data": _serialize_brain_item(updated)}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/api/brain/items/{item_id}")
async def delete_brain_item(item_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can delete AIO Brain knowledge.")
    provider = get_provider()
    try:
        provider.delete_brain_item(item_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/api/brain/links")
async def list_brain_links(request: Request):
    require_capability(request, "system.view", "Only workspace members can view AIO Brain graph links.")
    provider = get_provider()
    return {"data": [_serialize_brain_link(item) for item in provider.list_brain_links()]}


@router.post("/api/brain/links")
async def create_brain_link(request: Request, payload: BrainLinkRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can edit AIO Brain graph links.")
    provider = get_provider()
    try:
        created = provider.create_brain_link(_brain_link_provider_payload(payload.model_dump()))
        return {"data": _serialize_brain_link(created)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/brain/links/{link_id}")
async def delete_brain_link(link_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can edit AIO Brain graph links.")
    provider = get_provider()
    try:
        provider.delete_brain_link(link_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/api/brain/ingests")
async def list_brain_ingests(request: Request, sourceId: str | None = None, limit: int = 25):
    require_capability(request, "system.view", "Only workspace members can view AIO Brain ingest history.")
    provider = get_provider()
    ingests = provider.list_brain_ingests(source_id=sourceId, limit=limit)
    return {"data": [_serialize_brain_ingest(item) for item in ingests]}


@router.post("/api/brain/ingests")
async def create_brain_ingest(request: Request, payload: BrainIngestRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can ingest Brain sources.")
    provider = get_provider()
    try:
        resolved_ingest_type = (payload.ingestType or "text").strip().lower()
        extracted_text = ""
        location = payload.location
        if resolved_ingest_type == "url":
            target_url = (payload.url or payload.location or "").strip()
            if not target_url:
                raise ValueError("A URL is required for URL ingest.")
            extracted_text, _ = extract_url_text(target_url)
            location = target_url
        elif resolved_ingest_type == "file":
            file_text = extract_file_text(payload.fileName, payload.mimeType, payload.fileContentBase64)
            if file_text is None:
                raise ValueError("File type not supported for Brain ingest. Supported: TXT, MD, CSV, VTT, JSON, XML.")
            extracted_text = file_text
            location = payload.location or payload.fileName or ""
        else:
            extracted_text = normalize_ingest_text(payload.content)
            if not extracted_text:
                raise ValueError("Text content is required for Brain ingest.")
        created = provider.ingest_brain_source(
            _brain_ingest_provider_payload(
                {
                    "sourceId": payload.sourceId,
                    "label": payload.label,
                    "sourceType": payload.sourceType,
                    "status": payload.status or "ready",
                    "location": location,
                    "notes": payload.notes,
                    "ingestType": resolved_ingest_type,
                    "title": payload.title or payload.label or payload.fileName or payload.url,
                    "content": extracted_text,
                    "url": payload.url,
                    "fileName": payload.fileName,
                    "mimeType": payload.mimeType,
                    "fileContentBase64": payload.fileContentBase64,
                }
            )
        )
        return {"data": _serialize_brain_ingest(created)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/cortex/search")
async def cortex_search(request: Request, payload: CortexSearchRequest):
    require_capability(request, "cortex.view", "Only workspace members can search cortex vault.")
    tenant_id = request.state.tenant_id
    results = cortex_service.retrieve_context(
        query=payload.query,
        tenant=tenant_id,
        top_k=payload.limit,
        strategy=payload.strategy,
    )
    return {"data": results, "count": len(results), "strategy": payload.strategy}
