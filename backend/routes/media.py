from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import subprocess
from pathlib import Path
from typing import Any
from urllib import error as urlerror
from urllib import request as urlrequest

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from backend.deps import (
    clean_text,
    extract_session_token,
    get_auth_store,
    get_provider,
    require_capability,
    require_session,
)
from backend.media_engine import (
    build_audio_render_job,
    build_render_job,
    build_run_of_show_job,
    build_script_job,
    build_transcript_job,
    clone_json,
    get_media_engine,
    get_transcription_provider_lock,
    normalize_attachment_links,
    resolve_ffprobe_path,
    resolve_local_media_path,
    resolve_transcription_provider_id_from_lock,
)
from backend.media_library_models import (
    MediaLibraryMutationPayload,
    MediaLibraryMutationResponse,
)
from backend.media_library_service import get_media_library_item
from backend.media_render_registry import list_templates
from backend.canonical_settings import normalize_tenant_settings_payload

logger = logging.getLogger(__name__)

router = APIRouter(tags=["media"])

CURRENT_DIR = Path(__file__).resolve().parent.parent


# --- Request Models ---

class MediaProviderUpsertRequest(BaseModel):
    label: str | None = None
    baseUrl: str | None = None
    apiKey: str | None = None
    enabled: bool = False
    status: str | None = None
    config: dict[str, Any] | None = None


class MediaRenderRequest(BaseModel):
    provider: str | None = None
    templateId: str | None = None
    title: str | None = None
    assetType: str | None = None
    mediaType: str | None = "video"
    sourceUrl: str | None = None
    outputUrl: str | None = None
    script: str | None = None
    renderProfile: str | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None
    audioAssetId: str | None = None
    imageAssetIds: list[str] | None = None
    videoAssetIds: list[str] | None = None
    audioLayers: list[dict[str, Any]] | None = None


class MediaAudioGenerateRequest(BaseModel):
    audioSubtype: str
    prompt: str
    title: str | None = None
    duration: float | None = None
    metadata: dict[str, Any] | None = None


class MediaTranscriptRequest(BaseModel):
    provider: str | None = None
    title: str | None = None
    assetId: str | None = None
    sourceAssetIds: list[str] | None = None
    sourceUrl: str | None = None
    transcriptText: str | None = None
    speakerSegments: list[dict[str, Any]] | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None


class MediaIngestRequest(BaseModel):
    provider: str | None = None
    source: str | None = None
    meetingId: str | None = None
    meetingTitle: str | None = None
    recordingFiles: list[dict[str, Any]] | None = None
    driveFiles: list[dict[str, Any]] | None = None
    transcript: dict[str, Any] | None = None
    transcriptText: str | None = None
    speakerSegments: list[dict[str, Any]] | None = None
    transcriptionProvider: str | None = None
    autoTranscribe: bool = True
    attachments: list[dict[str, Any]] | None = None
    tags: list[str] | None = None
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
    outputUrl: str | None = None
    attachments: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None
    runId: str | None = None


class MediaPublishRequest(BaseModel):
    title: str | None = None
    publishTarget: str | None = None
    assetIds: list[str] | None = None
    artifactIds: list[str] | None = None
    attachments: list[dict[str, Any]] | None = None


# --- Helper Functions ---

def session_tenant_settings(tenant: dict[str, Any] | None) -> dict[str, Any]:
    tenant = tenant or {}
    candidate = tenant.get("tenant_settings") if isinstance(tenant.get("tenant_settings"), dict) else tenant.get("settings") or {}
    return normalize_tenant_settings_payload({"tenantSettings": candidate}, include_defaults=True)


def _resolve_media_file_path(kind: str, filename: str) -> Path:
    if not re.match(r"^[A-Za-z0-9._-]+$", filename):
        raise HTTPException(status_code=400, detail="Invalid media filename.")
    media_path = CURRENT_DIR / "data" / kind / filename
    if not media_path.exists() or not media_path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found.")
    return media_path


# --- Media Asset & File Serving Endpoints ---

@router.get("/api/media/assets")
async def list_media_assets(request: Request):
    require_capability(request, "studio.view", "Only workspace members can view media assets.")
    return {"data": get_media_engine().list_assets()}


@router.delete("/api/media/assets/{assetId}")
async def delete_media_asset(request: Request, assetId: str):
    require_capability(request, "system.manage", "Only workspace editors can delete media assets.")
    deleted = get_media_engine().delete_asset(assetId)
    if not deleted:
        raise HTTPException(status_code=404, detail="Asset not found")
    return {"success": True, "deletedId": assetId}


@router.get("/api/media/audio/{filename}")
async def serve_media_audio(filename: str):
    media_path = _resolve_media_file_path("audio", filename)
    guessed_type, _ = mimetypes.guess_type(media_path.name)
    if not guessed_type and media_path.suffix.lower() == ".wav":
        guessed_type = "audio/wav"
    return FileResponse(
        str(media_path),
        media_type=guessed_type or "audio/mpeg",
        headers={"Accept-Ranges": "bytes"}
    )


@router.get("/api/media/video/{filename}")
async def serve_media_video(filename: str):
    media_path = _resolve_media_file_path("video", filename)
    return FileResponse(str(media_path), media_type=mimetypes.guess_type(media_path.name)[0] or "video/mp4")


@router.get("/api/media/image/{filename}")
async def serve_media_image(request: Request, filename: str):
    try:
        require_capability(request, "system.view", "Only workspace members can access image files.")
    except HTTPException:
        pass
    media_path = _resolve_media_file_path("image", filename)
    if not media_path or not media_path.exists():
        raise HTTPException(status_code=404, detail="Image not found.")
    return FileResponse(str(media_path), media_type=mimetypes.guess_type(media_path.name)[0] or "image/png")


@router.get("/api/media/voice/{filename}")
async def serve_media_voice(filename: str):
    media_path = _resolve_media_file_path("voice", filename)
    guessed_type, _ = mimetypes.guess_type(media_path.name)
    if not guessed_type and media_path.suffix.lower() == ".wav":
        guessed_type = "audio/wav"
    return FileResponse(
        str(media_path),
        media_type=guessed_type or "audio/mpeg",
        headers={"Accept-Ranges": "bytes"}
    )


@router.post("/api/media/upload", response_model=MediaLibraryMutationResponse)
async def upload_media_file(request: Request):
    session = require_capability(request, "studio.create", "Only workspace staff or higher can upload media.")
    tenant = session.get("tenant") or {}
    try:
        content_type = request.headers.get("content-type") or ""
        if "multipart/form-data" not in content_type:
            raise HTTPException(status_code=400, detail="media upload expects multipart/form-data.")
        
        form = await request.form()
        file_field = form.get("file")
        if not file_field or not hasattr(file_field, "filename"):
            raise HTTPException(status_code=400, detail="No 'file' field provided in multipart form.")
             
        payload = await file_field.read()
        if not payload:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
            
        tags_raw = form.getlist("tags")
        tags = []
        for val in tags_raw:
            if isinstance(val, str) and "," in val:
                tags.extend([t.strip() for t in val.split(",") if t.strip()])
            elif isinstance(val, str):
                tags.append(val.strip())
        
        result = get_media_engine().upload_local_media(
            file_bytes=payload,
            filename=file_field.filename or "upload.bin",
            content_type=file_field.content_type,
            tenant_id=tenant.get("id"),
            tags=tags if tags else None,
            context={},
        )
        asset = result.get("asset") if isinstance(result, dict) else None
        deduplicated = bool(result.get("deduplicated")) if isinstance(result, dict) else False
        item = get_media_library_item(asset.get("id")) if isinstance(asset, dict) else None
        if not item:
            raise HTTPException(status_code=500, detail="Uploaded asset could not be resolved in the media library.")
        return MediaLibraryMutationResponse(data=MediaLibraryMutationPayload(asset=item, deduplicated=deduplicated))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


# --- Media Engine Jobs & Artifacts ---

@router.get("/api/media/render-jobs")
async def list_render_jobs(request: Request):
    require_capability(request, "system.view", "Only workspace members can view render jobs.")
    return {"data": get_media_engine().list_render_jobs()}


@router.post("/api/media/render-jobs")
async def create_render_job(request: Request, payload: MediaRenderRequest, background_tasks: BackgroundTasks):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create media jobs.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    try:
        engine = get_media_engine()
        provider_id = clean_text(payload.provider) or "remotion_local"
        attachments = normalize_attachment_links(payload.model_dump(exclude_none=True), {})
        job = build_render_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.title) or "Render Job",
            input_payload=payload.model_dump(exclude_none=True),
            attachments=attachments,
        )
        engine.store.upsert("render_jobs", job)
        background_tasks.add_task(engine.process_job, "render", job["id"], payload.model_dump(exclude_none=True), tenant_id)
        return {"data": {"job": job}}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/media/transcript-jobs")
async def list_transcript_jobs(request: Request):
    require_capability(request, "system.view", "Only workspace members can view transcript jobs.")
    return {"data": get_media_engine().list_transcript_jobs()}


@router.post("/api/media/transcript-jobs")
async def create_transcript_job(request: Request, payload: MediaTranscriptRequest, background_tasks: BackgroundTasks):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create transcript jobs.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    try:
        engine = get_media_engine()
        provider_lock = get_transcription_provider_lock(session_tenant_settings(tenant))
        provider_id = resolve_transcription_provider_id_from_lock(provider_lock)
        if not provider_id:
            raise HTTPException(status_code=400, detail="Transcription is disabled in workspace settings.")
        asset_id = clean_text(payload.assetId)
        source_asset_ids = [clean_text(item) for item in (payload.sourceAssetIds or []) if clean_text(item)]
        if asset_id and asset_id not in source_asset_ids:
            source_asset_ids.append(asset_id)
        asset = engine.get_asset(asset_id) if asset_id else None
        source_url = clean_text(payload.sourceUrl) or (clean_text(asset.get("source_url")) if isinstance(asset, dict) else None)
        transcript_text = clean_text(payload.transcriptText) or None
        speaker_segments = clone_json(payload.speakerSegments or [])
        attachments_payload = clone_json(payload.attachments or [])
        metadata_payload = clone_json(payload.metadata or {})
        title = clean_text(payload.title) or (clean_text(asset.get("title")) if isinstance(asset, dict) else None) or "Transcript Job"
        payload_data = {
            "provider": provider_id,
            "title": title,
            "templateId": None,
            "outputTarget": None,
            "source_url": source_url or None,
            "sourceUrl": source_url or None,
            "transcript_text": transcript_text,
            "transcriptText": transcript_text,
            "speaker_segments": speaker_segments,
            "speakerSegments": speaker_segments,
            "recording_files": None,
            "drive_files": None,
            "meeting_id": None,
            "meeting_title": None,
            "media_type": clean_text(asset.get("media_type")) if isinstance(asset, dict) else None,
            "script": None,
            "text": None,
            "topic": None,
            "tone": None,
            "duration": None,
            "context": None,
            "subtitle": None,
            "prompt": None,
            "voice": None,
            "style": None,
            "image": None,
            "assetRef": None,
            "asset_id": asset_id or None,
            "assetId": asset_id or None,
            "artifactRef": None,
            "publishTarget": None,
            "attachTarget": None,
            "metadata": metadata_payload,
            "attachments": attachments_payload,
            "auto_transcribe": True,
            "api_key": None,
            "access_key_id": None,
            "secret_access_key": None,
            "source_asset_ids": source_asset_ids,
            "sourceAssetIds": clone_json(source_asset_ids),
        }
        attachments = normalize_attachment_links(payload_data, {})
        job = build_transcript_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=title,
            input_payload=payload_data,
            attachments=attachments,
        )
        engine.store.upsert("transcript_jobs", job)
        background_tasks.add_task(engine.process_job, "transcript", job["id"], payload_data, tenant_id)
        return {"data": {"job": job}}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/media/transcript-artifacts")
async def list_transcript_artifacts(request: Request):
    require_capability(request, "system.view", "Only workspace members can view transcript artifacts.")
    return {"data": get_media_engine().list_transcript_artifacts()}


@router.get("/api/media/script-jobs")
async def list_script_jobs(request: Request):
    require_capability(request, "system.view", "Only workspace members can view script jobs.")
    return {"data": get_media_engine().list_script_jobs()}


@router.post("/api/media/script-jobs")
async def create_script_job(request: Request, payload: MediaScriptRequest, background_tasks: BackgroundTasks):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create script jobs.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    try:
        engine = get_media_engine()
        provider_id = clean_text(payload.provider) or "stub_script"
        attachments = normalize_attachment_links(payload.model_dump(exclude_none=True), {})
        job = build_script_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.title) or clean_text(payload.topic) or "Script Job",
            input_payload=payload.model_dump(exclude_none=True),
            attachments=attachments,
        )
        engine.store.upsert("script_jobs", job)
        background_tasks.add_task(engine.process_job, "script", job["id"], payload.model_dump(exclude_none=True), tenant_id)
        return {"data": {"job": job}}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/media/script-artifacts")
async def list_script_artifacts(request: Request):
    require_capability(request, "system.view", "Only workspace members can view script artifacts.")
    return {"data": get_media_engine().list_script_artifacts()}


@router.get("/api/media/run-of-show-jobs")
async def list_run_of_show_jobs(request: Request):
    require_capability(request, "system.view", "Only workspace members can view run-of-show jobs.")
    return {"data": get_media_engine().list_run_of_show_jobs()}


@router.post("/api/media/run-of-show-jobs")
async def create_run_of_show_job(request: Request, payload: MediaRunOfShowRequest, background_tasks: BackgroundTasks):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create run-of-show jobs.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    try:
        engine = get_media_engine()
        provider_id = clean_text(payload.provider) or "stub_run_of_show"
        attachments = normalize_attachment_links(payload.model_dump(exclude_none=True), {})
        job = build_run_of_show_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.title) or clean_text(payload.topic) or "Run of Show Job",
            input_payload=payload.model_dump(exclude_none=True),
            attachments=attachments,
        )
        engine.store.upsert("run_of_show_jobs", job)
        background_tasks.add_task(engine.process_job, "run_of_show", job["id"], payload.model_dump(exclude_none=True), tenant_id)
        return {"data": {"job": job}}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/media/run-of-show-artifacts")
async def list_run_of_show_artifacts(request: Request):
    require_capability(request, "system.view", "Only workspace members can view run-of-show artifacts.")
    return {"data": get_media_engine().list_run_of_show_artifacts()}


@router.get("/api/media/audio-render-jobs")
async def list_audio_render_jobs(request: Request):
    require_capability(request, "system.view", "Only workspace members can view audio render jobs.")
    return {"data": get_media_engine().list_audio_render_jobs()}


@router.post("/api/media/audio-render-jobs")
async def create_audio_render_job(request: Request, payload: MediaAudioRenderRequest, background_tasks: BackgroundTasks):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create audio render jobs.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    provider_key = clean_text(payload.provider) or "elevenlabs"
    auth_store = get_auth_store()
    provider_cfg = auth_store.get_media_provider_config_by_provider_key(tenant_id, provider_key)
    if not provider_cfg:
        raise HTTPException(status_code=400, detail=f"Media provider '{provider_key}' not configured.")
    
    try:
        engine = get_media_engine()
        attachments = normalize_attachment_links(payload.model_dump(exclude_none=True), {})
        job = build_audio_render_job(
            tenant_id=tenant_id,
            provider=provider_key,
            title=clean_text(payload.title) or "Audio Render Job",
            input_payload=payload.model_dump(exclude_none=True),
            attachments=attachments,
        )
        engine.store.upsert("audio_render_jobs", job)
        background_tasks.add_task(engine.process_job, "audio", job["id"], payload.model_dump(exclude_none=True), tenant_id)
        return {"data": {"job": job}}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/media/audio-generate")
async def generate_audio_asset_endpoint(request: Request, payload: MediaAudioGenerateRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can generate audio assets.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    audio_subtype = clean_text(payload.audioSubtype).lower() or "sfx"
    if audio_subtype not in {"music", "sfx"}:
        raise HTTPException(status_code=400, detail="audioSubtype must be 'music' or 'sfx'.")
    prompt = clean_text(payload.prompt)
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt is required.")
    try:
        engine = get_media_engine()
        generation_payload = {
            "audio_subtype": audio_subtype,
            "audioSubtype": audio_subtype,
            "prompt": prompt,
            "title": clean_text(payload.title) or f"{audio_subtype.upper()} — {prompt[:60]}",
            "duration": float(payload.duration) if payload.duration else None,
            "metadata": payload.metadata or {},
        }
        result = engine.generate_audio_asset(generation_payload, tenant_id=tenant_id)
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/media/publish-jobs")
async def list_publish_jobs(request: Request):
    require_capability(request, "system.view", "Only workspace members can view publish jobs.")
    return {"data": get_media_engine().list_publish_jobs()}


@router.post("/api/media/publish-jobs")
async def create_publish_job(request: Request, payload: MediaPublishRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can create publish jobs.")
    tenant = session.get("tenant") or {}
    tenant_id = tenant.get("id")
    publish_target = payload.publishTarget or ""
    INTERNAL_TARGETS = {"", "internal.media", "local", "null", "none"}
    if publish_target and publish_target.lower() not in INTERNAL_TARGETS:
        try:
            auth_store = get_auth_store()
            config = auth_store.get_social_provider_config(tenant_id, publish_target)
        except Exception:
            config = None
        if not config:
            return JSONResponse({
                "status": "blocked",
                "reason": "provider_missing",
                "providerKey": publish_target,
                "providerStatus": "notConnected",
                "message": f"Provider '{publish_target}' is not configured.",
            }, status_code=422)
        canonical_status = (config.get("status") or "").strip().lower()
        if canonical_status != "connected":
            reason_map = {
                "configured": "provider_configured_not_connected",
                "needsconfig": "provider_needs_config",
                "notconnected": "provider_not_connected",
                "reconnectrequired": "provider_reconnect_required",
                "disconnected": "provider_not_connected",
            }
            return JSONResponse({
                "status": "blocked",
                "reason": reason_map.get(canonical_status, "provider_not_connected"),
                "providerKey": publish_target,
                "providerStatus": canonical_status or "unknown",
                "message": f"Provider '{publish_target}' is {canonical_status or 'unknown'} (not connected).",
            }, status_code=422)
    try:
        result = get_media_engine().publish_asset(
            payload.model_dump(exclude_none=True),
            tenant_id=tenant_id,
            context={},
        )
        return {"data": result}
    except (ValueError, NotImplementedError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/api/media/publish-artifacts")
async def list_publish_artifacts(request: Request):
    require_capability(request, "system.view", "Only workspace members can view publish artifacts.")
    return {"data": get_media_engine().list_publish_artifacts()}


@router.get("/api/media/jobs/{jobType}/{jobId}")
async def get_media_job_status(request: Request, jobType: str, jobId: str):
    require_capability(request, "system.view", "Only workspace members can view media job status.")
    job = get_media_engine().get_job(jobType, jobId)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"data": job}


@router.delete("/api/media/jobs/{jobType}/{jobId}")
async def delete_media_job(request: Request, jobType: str, jobId: str):
    require_capability(request, "system.manage", "Only workspace editors can delete media jobs.")
    deleted = get_media_engine().delete_job(jobType, jobId)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"success": True, "deletedId": jobId}


@router.delete("/api/media/artifacts/{artifactType}/{artifactId}")
async def delete_media_artifact(request: Request, artifactType: str, artifactId: str):
    require_capability(request, "system.manage", "Only workspace editors can delete media artifacts.")
    deleted = get_media_engine().delete_artifact(artifactType, artifactId)
    if not deleted:
        raise HTTPException(status_code=404, detail="Artifact not found")
    return {"success": True, "deletedId": artifactId}


@router.post("/api/media/meeting-ingestion")
async def ingest_meeting_media(request: Request, payload: MediaIngestRequest):
    session = require_capability(request, "system.manage", "Only workspace staff or higher can ingest meeting media.")
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


@router.post("/api/media/probe")
async def probe_media_asset(request: Request, payload: dict[str, Any] = Body(...)):
    require_capability(request, "system.view", "Only workspace members can probe media assets.")
    source_url = clean_text(payload.get("sourceUrl") or payload.get("source_url") or "")
    asset_id = clean_text(payload.get("assetId") or payload.get("asset_id") or "")

    if asset_id and not source_url:
        assets = get_media_engine().list_assets()
        match = next((a for a in assets if clean_text(a.get("id")) == asset_id), None)
        if not match:
            raise HTTPException(status_code=404, detail="Asset not found.")
        source_url = clean_text(match.get("source_url") or "")

    if not source_url:
        raise HTTPException(status_code=400, detail="sourceUrl or assetId with a known URL is required.")

    local_path = resolve_local_media_path(source_url)
    probe_result: dict[str, Any] = {
        "sourceUrl": source_url,
        "probeStatus": "unavailable",
        "probeMethod": None,
        "duration": None,
        "mediaType": None,
        "hasVideo": None,
        "hasAudio": None,
        "width": None,
        "height": None,
        "codecSummary": None,
        "fileSize": None,
        "waveformStatus": "unavailable",
    }

    target = str(local_path) if local_path else source_url
    if local_path:
        try:
            probe_result["fileSize"] = os.path.getsize(local_path)
        except OSError:
            pass

    try:
        ffprobe_path = resolve_ffprobe_path()
        cmd = [
            str(ffprobe_path), "-v", "quiet", "-print_format", "json",
            "-show_streams", "-show_format", target,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            streams = data.get("streams") or []
            fmt = data.get("format") or {}
            has_video = any(s.get("codec_type") == "video" for s in streams)
            has_audio = any(s.get("codec_type") == "audio" for s in streams)
            video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
            audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)
            duration_raw = fmt.get("duration") or (video_stream or audio_stream or {}).get("duration")
            try:
                duration_val = round(float(duration_raw), 3) if duration_raw else None
            except (TypeError, ValueError):
                duration_val = None
            codecs = list({s.get("codec_name") for s in streams if s.get("codec_name")})
            probe_result.update({
                "probeStatus": "ok",
                "probeMethod": "ffprobe",
                "duration": duration_val,
                "mediaType": "video" if has_video else ("audio" if has_audio else "unknown"),
                "hasVideo": has_video,
                "hasAudio": has_audio,
                "width": video_stream.get("width") if video_stream else None,
                "height": video_stream.get("height") if video_stream else None,
                "codecSummary": ", ".join(codecs) if codecs else None,
                "fileSize": probe_result["fileSize"] or (int(fmt["size"]) if fmt.get("size") else None),
                "waveformStatus": "pending" if has_audio else "not_applicable",
                "container": fmt.get("format_name"),
            })
        else:
            probe_result["probeStatus"] = "ffprobe_error"
            probe_result["probeMethod"] = "ffprobe"
            probe_result["probeError"] = clean_text(result.stderr or result.stdout) or "ffprobe failed."
    except ValueError as error:
        probe_result["probeStatus"] = "ffprobe_not_installed"
        probe_result["probeMethod"] = None
        probe_result["probeError"] = str(error)
    except subprocess.TimeoutExpired:
        probe_result["probeStatus"] = "ffprobe_timeout"
        probe_result["probeMethod"] = "ffprobe"
    except Exception as exc:
        probe_result["probeStatus"] = "error"
        probe_result["probeError"] = str(exc)

    return {"data": probe_result}


# --- Render Templates & Media Providers ---

@router.get("/api/media/render-templates")
async def get_media_render_templates(request: Request):
    require_capability(request, "system.view", "Only workspace viewers can list media templates.")
    return {"data": {"templates": list_templates()}}


@router.get("/api/media/providers")
async def list_media_provider_configs(request: Request):
    session = require_capability(request, "system.view", "Only workspace members can view media providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    auth_store = get_auth_store()
    try:
        return {"data": auth_store.list_media_provider_configs(token, tenant_id)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/api/media/providers/{providerKey}")
async def upsert_media_provider_config(providerKey: str, request: Request, payload: MediaProviderUpsertRequest):
    session = require_capability(request, "system.admin", "Only workspace admins can manage media providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    auth_store = get_auth_store()
    try:
        config = auth_store.upsert_media_provider_config(token, tenant_id, providerKey, payload.model_dump())
        return {"data": config}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/api/media/providers/{configId}")
async def delete_media_provider_config(configId: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can delete media providers.")
    token = extract_session_token(request)
    tenant_id = (session.get("tenant") or {}).get("id")
    auth_store = get_auth_store()
    try:
        return auth_store.delete_media_provider_config(token, tenant_id, configId)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/api/media/providers/{configId}/test")
async def test_media_provider_config(configId: str, request: Request):
    session = require_capability(request, "system.admin", "Only workspace admins can test media providers.")
    tenant_id = (session.get("tenant") or {}).get("id")
    auth_store = get_auth_store()
    config = auth_store.get_media_provider_config_for_tenant(tenant_id, configId)
    if not config:
        raise HTTPException(status_code=404, detail="Media provider config not found")
    try:
        apiKey = config.get("apiKey")
        if not apiKey:
            raise ValueError("API key is required for testing.")
        base_url = (config.get("baseUrl") or "https://api.elevenlabs.io").rstrip("/")
        provider_config = config.get("config") if isinstance(config.get("config"), dict) else {}
        voice_id_map = {
            "rachel": "21m00Tcm4TlvDq8ikWAM",
            "domi": "AZnzlk1XvdvUeBnXmlld",
            "bella": "EXAVITQu4vr4xnSDxMaL",
            "adam": "pNInz6obpgDQGcFmaJgB",
            "antoni": "ErXwobaYiN019PkySvjV",
        }
        configured_voice = str(provider_config.get("voiceId") or provider_config.get("charlieVoice") or provider_config.get("voice") or "").strip()
        voice_id = voice_id_map.get(configured_voice.lower(), configured_voice) if configured_voice else "21m00Tcm4TlvDq8ikWAM"
        request_body = json.dumps({
            "text": "Connection test.",
            "model_id": "eleven_turbo_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }).encode("utf-8")
        req = urlrequest.Request(
            f"{base_url}/v1/text-to-speech/{voice_id}",
            data=request_body,
            headers={"xi-api-key": apiKey, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            method="POST",
        )
        try:
            with urlrequest.urlopen(req, timeout=15) as resp:
                audio_bytes = resp.read()
        except urlerror.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")[:300] if hasattr(e, "read") else ""
            raise ValueError(f"ElevenLabs test synthesis failed: HTTP {e.code} {body}")
        if not audio_bytes:
            raise ValueError("ElevenLabs test synthesis returned no audio.")
        result = {"status": "connected", "message": "ElevenLabs connected. Demo voice synthesis is available."}
        details = {"provider": config.get("providerKey"), "voiceId": voice_id, "testMode": "tts", "audioBytes": len(audio_bytes)}
        updated = auth_store.save_media_provider_test_result(
            tenant_id,
            configId,
            status="connected",
            lastError=None,
            details=details,
        )
        return {"result": result, "data": updated}
    except ValueError as error:
        updated = auth_store.save_media_provider_test_result(
            tenant_id,
            configId,
            status="error",
            lastError=str(error),
        )
        raise HTTPException(status_code=400, detail=updated.get("lastError") or str(error)) from error


@router.post("/api/media/voice-preview")
async def preview_elevenlabs_voice(request: Request, payload: dict):
    session = require_capability(request, "system.view", "Only workspace members can preview voices.")
    tenant_id = (session.get("tenant") or {}).get("id")
    auth_store = get_auth_store()
    voice_id = (payload.get("voiceId") or "21m00Tcm4TlvDq8ikWAM").strip()
    text = (payload.get("text") or "Hello, this is a voice preview.").strip()
    model = (payload.get("model") or "eleven_turbo_v2").strip()
    config = auth_store.get_media_provider_config_by_provider_key(tenant_id, "elevenlabs")
    if not config:
        raise HTTPException(status_code=400, detail="ElevenLabs not configured for this workspace.")
    apiKey = config.get("apiKey")
    if not apiKey:
        raise HTTPException(status_code=400, detail="ElevenLabs API key not found.")
    base_url = (config.get("baseUrl") or "https://api.elevenlabs.io").rstrip("/")
    body = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }).encode("utf-8")
    req = urlrequest.Request(f"{base_url}/v1/text-to-speech/{voice_id}", data=body, headers={
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urlrequest.urlopen(req, timeout=30) as resp:
            audio_bytes = resp.read()
    except urlerror.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")[:300] if hasattr(e, "read") else ""
        raise HTTPException(status_code=400, detail=f"ElevenLabs preview error: {err_body}")
    from fastapi.responses import Response
    return Response(content=audio_bytes, media_type="audio/mpeg")
