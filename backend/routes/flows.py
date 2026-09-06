from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.deps import (
    clean_text,
    get_auth_store,
    get_provider,
    get_request_tenant_id,
    require_capability,
    reset_request_tenant,
    set_request_tenant_id,
)
from backend.flow_graph_utils import (
    build_flow_execution_steps,
    flow_preflight_validation,
    resolve_flow_trigger_targets,
)
from backend.media_engine import clone_json, get_media_engine, normalize_controlled_tags, normalize_ingest_meta
from backend.orchestration import ExecutionEngine
from backend.cortex_service import cortex_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["flows"])


# --- Request Models ---

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
    runId: str | None = None


class FlowImportRequest(BaseModel):
    source: str
    templateJson: dict[str, Any]


class WorkflowJsonIngestRequest(BaseModel):
    ingestSource: str = "import"
    templateJson: Any | None = None
    jsonText: str | None = None
    assetId: str | None = None
    fileName: str | None = None
    title: str | None = None


class FlowFolderCreateRequest(BaseModel):
    name: str


class FlowFolderRenameRequest(BaseModel):
    name: str


# --- Helper Functions ---

def _camelcase_ingest_meta_value(value: dict[str, Any] | None) -> dict[str, Any]:
    normalized = normalize_ingest_meta(
        value,
        default_source="system",
        default_stage="raw",
        default_original=True,
        default_converted_from=None,
        default_conversion_type=None,
    )
    return {
        "source": normalized["source"],
        "stage": normalized["stage"],
        "original": bool(normalized["original"]),
        "convertedFrom": clean_text(normalized.get("converted_from")) or None,
        "conversionType": clean_text(normalized.get("conversion_type")) or None,
    }


def _extract_workflow_json_from_asset(asset: dict[str, Any]) -> Any:
    metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
    for key in ("workflow_json", "workflowJson", "content", "json"):
        value = metadata.get(key)
        if value is not None:
            return clone_json(value)
    for key in ("raw_json_text", "rawJsonText", "text", "content_text"):
        raw_text = clean_text(metadata.get(key))
        if raw_text:
            return json.loads(raw_text)
    raise ValueError("Stored asset does not contain recoverable workflow JSON content.")


def ingest_workflow_json_pipeline(
    *,
    ingest_source: str = "import",
    template_json: Any = None,
    json_text: str | None = None,
    asset_id: str | None = None,
    file_name: str | None = None,
    title: str | None = None,
    tenant_id: str | None = None,
    created_by: str = "Current User",
) -> dict[str, Any]:
    provider_instance = get_provider()
    media_engine_instance = get_media_engine()
    tenant_token = set_request_tenant_id(tenant_id)

    try:
        normalized_ingest_source = clean_text(ingest_source).lower() or "import"
        if normalized_ingest_source not in {"nexus", "upload", "import", "system"}:
            raise ValueError("ingestSource must be one of nexus, upload, import, or system.")

        workflow_json: Any
        original_asset: dict[str, Any] | None = None

        if template_json is not None:
            workflow_json = clone_json(template_json)
        elif clean_text(json_text):
            try:
                workflow_json = json.loads(clean_text(json_text))
            except json.JSONDecodeError as error:
                raise ValueError(f"Malformed JSON input: {error.msg}") from error
        elif clean_text(asset_id):
            original_asset = media_engine_instance.get_asset(clean_text(asset_id))
            if not original_asset:
                raise ValueError(f"Workflow asset '{asset_id}' was not found.")
            workflow_json = _extract_workflow_json_from_asset(original_asset)
        else:
            raise ValueError("Provide templateJson, jsonText, or assetId.")

        from backend.flow_importer import detect_external_workflow_format, normalize_to_aio_flow, parse_external_template

        detection = detect_external_workflow_format(workflow_json)

        if original_asset:
            original_ingest_meta = original_asset.get("ingest_meta") if isinstance(original_asset.get("ingest_meta"), dict) else {}
            normalized_ingest_source = clean_text(original_ingest_meta.get("source")).lower() or normalized_ingest_source
        else:
            original_asset = media_engine_instance.ingest_workflow_json_asset(
                workflow_json,
                tenant_id=tenant_id,
                ingest_source=normalized_ingest_source,
                title=clean_text(title) or None,
                file_name=clean_text(file_name) or None,
                workflow_format=clean_text(detection.get("source")) or None,
                metadata={
                    "detected_workflow_format": clean_text(detection.get("source")) or None,
                    "detection_reason": clean_text(detection.get("reason")) or None,
                },
            )

        original_asset_id = clean_text(original_asset.get("id"))

        if not detection.get("supported") or not detection.get("convertible"):
            return {
                "detected": bool(detection.get("detected")),
                "supported": False,
                "converted": False,
                "originalPreserved": bool(original_asset_id),
                "originalAsset": original_asset,
                "convertedFlow": None,
                "lineage": {
                    "originalAssetId": original_asset_id or None,
                    "convertedFlowId": None,
                },
                "detection": detection,
                "validation": None,
                "reason": clean_text(detection.get("reason")) or "Unsupported workflow JSON format.",
            }

        parsed = parse_external_template(clean_text(detection.get("source")), workflow_json)
        normalized = normalize_to_aio_flow(parsed)
        normalized_flow = normalized.get("flow") if isinstance(normalized.get("flow"), dict) else {}
        imported_metadata = normalized_flow.get("metadata") if isinstance(normalized_flow.get("metadata"), dict) else {}
        converted_ingest_meta = _camelcase_ingest_meta_value(
            {
                "source": normalized_ingest_source,
                "stage": "structured",
                "original": False,
                "converted_from": original_asset_id or None,
                "conversion_type": f"{clean_text(detection.get('source'))}_to_aio_flow_template",
            }
        )
        flow_payload = {
            "name": clean_text(title) or clean_text(normalized_flow.get("name")) or f"Imported {clean_text(detection.get('label')) or 'Workflow'}",
            "status": "Draft",
            "nodes": normalized_flow.get("nodes") if isinstance(normalized_flow.get("nodes"), list) else [],
            "edges": normalized_flow.get("edges") if isinstance(normalized_flow.get("edges"), list) else [],
            "spec": None,
            "createdBy": created_by or "Current User",
            "lastEditedBy": created_by or "Current User",
            "metadata": {
                "tags": normalize_controlled_tags(None, ["cortex", "structured", normalized_ingest_source, "converted", "template"]),
                "ingestMeta": converted_ingest_meta,
                "importSourceFormat": clean_text(detection.get("source")),
                "originalAssetId": original_asset_id or None,
                "warnings": clone_json(imported_metadata.get("warnings") or []),
                "conversionSummary": clone_json(imported_metadata.get("conversionSummary") or {}),
            },
        }

        raw_steps, _ = build_flow_execution_steps(
            flow_payload,
            f"Imported workflow conversion for {flow_payload['name']}",
            "ALPHA",
            runtime_context={},
        )
        preflight = flow_preflight_validation(flow_payload, raw_steps)
        if preflight["blockers"]:
            return {
                "detected": True,
                "supported": True,
                "converted": False,
                "originalPreserved": bool(original_asset_id),
                "originalAsset": original_asset,
                "convertedFlow": None,
                "lineage": {
                    "originalAssetId": original_asset_id or None,
                    "convertedFlowId": None,
                },
                "detection": detection,
                "validation": preflight,
                "reason": "Converted flow failed AIO preflight validation.",
            }

        saved_flow = provider_instance.save_flow(flow_payload)
        return {
            "detected": True,
            "supported": True,
            "converted": True,
            "originalPreserved": bool(original_asset_id),
            "originalAsset": original_asset,
            "convertedFlow": {
                **saved_flow,
                "validation": preflight,
            },
            "lineage": {
                "originalAssetId": original_asset_id or None,
                "convertedFlowId": clean_text(saved_flow.get("id")) or None,
            },
            "detection": detection,
            "validation": preflight,
            "reason": "Workflow JSON preserved and converted into an AIO-native draft flow.",
        }
    finally:
        reset_request_tenant(tenant_token)


# --- Flow Endpoints ---

@router.get("/api/flows")
async def list_flows(request: Request):
    require_capability(request, "flows.view", "Only workspace members can view flows.")
    provider = get_provider()
    return {"data": provider.list_flows()}


@router.get("/api/flows/{flow_id}")
async def get_flow(flow_id: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view flows.")
    provider = get_provider()
    flow = provider.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    return {"data": flow}


@router.get("/api/flows/{flow_id}/provider-statuses")
async def get_flow_provider_statuses(flow_id: str, request: Request):
    require_capability(request, "system.view", "Only workspace members can view flows.")
    provider = get_provider()
    flow = provider.get_flow(flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found.")
    tenant_id = (request.state.session or {}).get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=401, detail="Tenant context required.")
    SOCIAL_PROVIDER_NODES = {"publish_asset", "generate_postbot_content", "postbot_content"}
    steps = flow.get("steps") or []
    provider_keys = set()
    for step in steps:
        config = step.get("config") or {}
        intent = step.get("intent") or ""
        if intent in SOCIAL_PROVIDER_NODES:
            pt = config.get("publishTarget") or config.get("publish_target")
            if pt and pt not in {"internal.media", "local"}:
                provider_keys.add(pt)
        for plat in (config.get("targetPlatforms") or []):
            provider_keys.add(str(plat).lower())
        yt = config.get("publishToYouTube")
        if yt:
            provider_keys.add("youtube")
    statuses = {}
    auth_store = get_auth_store()
    for key in sorted(provider_keys):
        try:
            config = auth_store.get_social_provider_config(tenant_id, key)
            statuses[key] = config.get("status") if config else "notConnected"
        except Exception:
            statuses[key] = "unknown"
    return {"data": {"providers": statuses}}


@router.put("/api/flows/{flow_id}")
async def save_flow(flow_id: str, request: Request, payload: FlowSaveRequest):
    require_capability(request, "flows.edit", "Only workspace staff or higher can save flows.")
    provider = get_provider()
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


@router.delete("/api/flows/{flow_id}")
async def delete_flow(flow_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can delete flows.")
    provider = get_provider()
    try:
        provider.delete_flow(flow_id)
        return {"success": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/flows")
async def bulk_delete_flows(request: Request, payload: dict[str, Any] = Body(...)):
    require_capability(request, "system.manage", "Only workspace admins can bulk delete flows.")
    provider = get_provider()
    ids = payload.get("ids", [])
    confirm = payload.get("confirm", "")
    
    try:
        if ids:
            result = provider.bulk_delete_flows(ids)
            return {"success": True, "data": result}
        
        if confirm == "DELETE_ALL_FLOWS":
            all_flows = provider.list_flows()
            flow_ids = [f["id"] for f in all_flows]
            result = provider.bulk_delete_flows(flow_ids)
            return {"success": True, "data": result}
            
        raise HTTPException(status_code=400, detail="Either 'ids' list or 'confirm' string 'DELETE_ALL_FLOWS' is required.")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# --- Flow Drafts ---

@router.post("/api/flow-drafts")
async def save_flow_draft(request: Request, payload: FlowDraftRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can save flow drafts.")
    provider = get_provider()
    return {"data": provider.save_flow_draft(payload.model_dump())}


@router.get("/api/flow-drafts/{draft_id}")
async def get_flow_draft(draft_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can view flow drafts.")
    provider = get_provider()
    draft = provider.get_flow_draft(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Flow draft not found.")
    return {"data": draft}


@router.delete("/api/flow-drafts/{draft_id}")
async def delete_flow_draft(draft_id: str, request: Request):
    require_capability(request, "system.manage", "Only workspace staff or higher can manage flow drafts.")
    provider = get_provider()
    provider.delete_flow_draft(draft_id)
    return {"success": True}


# --- Flow Folders ---

@router.post("/api/flow-folders")
async def create_flow_folder(request: Request, payload: FlowFolderCreateRequest):
    require_capability(request, "system.manage", "Need editor role to create folders.")
    provider = get_provider()
    try:
        folder = provider.create_flow_folder(payload.name)
        return {"data": folder}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/api/flow-folders")
async def list_flow_folders(request: Request):
    require_capability(request, "system.view", "Need viewer role to view folders.")
    provider = get_provider()
    try:
        return {"data": provider.list_flow_folders()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/api/flow-folders/{folderId}")
async def rename_flow_folder(request: Request, folderId: str, payload: FlowFolderRenameRequest):
    require_capability(request, "system.manage", "Need editor role to rename folders.")
    provider = get_provider()
    try:
        folder = provider.rename_flow_folder(folderId, payload.name)
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
        return {"data": folder}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/api/flow-folders/{folderId}")
async def delete_flow_folder(request: Request, folderId: str):
    require_capability(request, "system.manage", "Need editor role to delete folders.")
    provider = get_provider()
    try:
        provider.delete_flow_folder(folderId)
        return {"success": True, "deletedId": folderId}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- Flow Import & Triggers ---

@router.post("/api/flows/import-template")
async def import_flow_template(request: Request, payload: FlowImportRequest):
    require_capability(request, "system.manage", "Only workspace staff or higher can import flow templates.")
    from backend.flow_importer import normalize_to_aio_flow, parse_external_template
    parsed = parse_external_template(payload.source, payload.templateJson)
    result = normalize_to_aio_flow(parsed)
    return result


@router.post("/api/flows/ingest-workflow-json")
async def ingest_workflow_json(request: Request, payload: WorkflowJsonIngestRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can ingest workflow JSON.")
    tenant = session.get("tenant") or {}
    user = session.get("user") or {}
    try:
        result = ingest_workflow_json_pipeline(
            ingest_source=payload.ingestSource,
            template_json=payload.templateJson,
            json_text=payload.jsonText,
            asset_id=payload.assetId,
            file_name=payload.fileName,
            title=payload.title,
            tenant_id=str(tenant.get("id") or "").strip() or None,
            created_by=clean_text(user.get("name")) or "Current User",
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    status_code = 200 if result.get("converted") or result.get("originalPreserved") else 422
    return JSONResponse(content={"data": result}, status_code=status_code)


@router.post("/api/flows/{flow_id}/trigger/manual")
async def trigger_flow_manually(flow_id: str, request: Request, payload: FlowManualTriggerRequest):
    session = require_capability(request, "flows.execute", "Only workspace staff or higher can manually trigger flows.")
    provider = get_provider()
    auth_store = get_auth_store()
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
    
    # Inject brain context
    try:
        brain_results = cortex_service.retrieve_context(command_text, tenant=tenant.get("id"), top_k=3)
        if brain_results:
            flow_context["brain_memory"] = brain_results
    except Exception as e:
        logger.warning(f"Error injecting cortex context into flow execution: {e}")

    result = ExecutionEngine(provider).run(
        raw_steps=raw_steps,
        mode="execute",
        command=command_text,
        context=flow_context,
        actor=user,
        tenant=tenant,
        run_id=payload.runId,
    )
    return {"data": {**result, "validation": preflight}}
