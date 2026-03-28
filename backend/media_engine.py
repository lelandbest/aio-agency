from __future__ import annotations

import json
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def unique_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def clean_text(value: Any) -> str:
    return str(value or "").strip()


def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(value))


def normalize_attachment_links(payload: dict[str, Any] | None, context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    links: list[dict[str, Any]] = []
    for raw_link in (payload or {}).get("attachments") or []:
        if isinstance(raw_link, dict) and clean_text(raw_link.get("id")):
            links.append(
                {
                    "kind": clean_text(raw_link.get("kind") or "record"),
                    "id": clean_text(raw_link.get("id")),
                    "label": clean_text(raw_link.get("label")),
                }
            )
    context = context or {}
    if clean_text(context.get("run_id")):
        links.append({"kind": "flow_run", "id": clean_text(context.get("run_id")), "label": clean_text(context.get("flow_name"))})
    if clean_text(context.get("thread_id")):
        links.append({"kind": "comms_thread", "id": clean_text(context.get("thread_id")), "label": clean_text(context.get("thread_subject"))})
    if clean_text(context.get("contact_id")):
        links.append({"kind": "crm_contact", "id": clean_text(context.get("contact_id")), "label": clean_text(context.get("contact_label"))})
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for link in links:
        key = (clean_text(link.get("kind")), clean_text(link.get("id")))
        if key in seen or not key[1]:
            continue
        seen.add(key)
        deduped.append(link)
    return deduped


def normalize_speaker_segments(raw_segments: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_segments, list):
        return []
    segments: list[dict[str, Any]] = []
    for index, segment in enumerate(raw_segments, start=1):
        if not isinstance(segment, dict):
            continue
        text = clean_text(segment.get("text") or segment.get("transcript") or segment.get("content"))
        if not text:
            continue
        segments.append(
            {
                "id": clean_text(segment.get("id")) or f"segment-{index}",
                "speaker": clean_text(segment.get("speaker") or segment.get("speaker_name") or segment.get("speakerLabel")) or "Unknown",
                "text": text,
                "start": segment.get("start") or segment.get("start_time") or segment.get("offset_start"),
                "end": segment.get("end") or segment.get("end_time") or segment.get("offset_end"),
            }
        )
    return segments


def build_media_asset(
    *,
    tenant_id: str | None,
    provider: str,
    asset_type: str,
    media_type: str,
    title: str,
    source_url: str | None = None,
    metadata: dict[str, Any] | None = None,
    attachments: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": unique_id("media-asset"),
        "tenant_id": tenant_id,
        "provider": provider,
        "asset_type": asset_type,
        "media_type": media_type,
        "title": title or "Media Asset",
        "source_url": source_url,
        "metadata": clone_json(metadata or {}),
        "attachments": clone_json(attachments or []),
        "created_at": utcnow_iso(),
        "updated_at": utcnow_iso(),
    }


def build_render_job(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    input_payload: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("render-job"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Render Job",
        "status": "queued",
        "input_payload": clone_json(input_payload),
        "attachments": clone_json(attachments),
        "output_asset_ids": [],
        "last_error": None,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
    }


def build_transcript_job(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    input_payload: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("transcript-job"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Transcript Job",
        "status": "queued",
        "input_payload": clone_json(input_payload),
        "attachments": clone_json(attachments),
        "artifact_id": None,
        "last_error": None,
        "created_at": now,
        "updated_at": now,
        "started_at": None,
        "completed_at": None,
    }


def build_transcript_artifact(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    transcript_text: str,
    speaker_segments: list[dict[str, Any]],
    timestamps: list[dict[str, Any]] | None,
    attachments: list[dict[str, Any]],
    source_asset_ids: list[str] | None = None,
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("transcript-artifact"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Transcript Artifact",
        "transcript_text": transcript_text,
        "speaker_segments": clone_json(speaker_segments),
        "timestamps": clone_json(timestamps or []),
        "attachments": clone_json(attachments),
        "source_asset_ids": list(source_asset_ids or []),
        "created_at": now,
        "updated_at": now,
    }


class MediaStateStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or (Path(__file__).resolve().parent / "data" / "media_engine_state.json")
        self._lock = Lock()

    def _empty_state(self) -> dict[str, Any]:
        return {
            "assets": [],
            "render_jobs": [],
            "transcript_jobs": [],
            "transcript_artifacts": [],
        }

    def _read_state(self) -> dict[str, Any]:
        if not self.path.exists():
            return self._empty_state()
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return self._empty_state()
        if not isinstance(payload, dict):
            return self._empty_state()
        state = self._empty_state()
        for key in state:
            if isinstance(payload.get(key), list):
                state[key] = payload[key]
        return state

    def _write_state(self, state: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(state, indent=2), encoding="utf-8")

    def upsert(self, collection: str, record: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            state = self._read_state()
            rows = state.setdefault(collection, [])
            record_id = clean_text(record.get("id"))
            now = utcnow_iso()
            payload = {**clone_json(record), "updated_at": now}
            for index, existing in enumerate(rows):
                if clean_text(existing.get("id")) == record_id:
                    rows[index] = payload
                    self._write_state(state)
                    return payload
            rows.append(payload)
            self._write_state(state)
            return payload

    def list(self, collection: str) -> list[dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            return clone_json(state.get(collection) or [])

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return self._read_state()


class BaseRenderProvider(ABC):
    provider_id = "stub-render"

    @abstractmethod
    def renderMedia(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class BaseTranscriptionProvider(ABC):
    provider_id = "elevenlabs_scribe"

    @abstractmethod
    def transcribeMedia(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class BaseMeetingIngestionProvider(ABC):
    provider_id = "zoom"

    @abstractmethod
    def ingestMeetingArtifacts(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class StubRenderProvider(BaseRenderProvider):
    provider_id = "stub-render"

    def renderMedia(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        title = clean_text(payload.get("title")) or clean_text(job.get("title")) or "Generated Video"
        return {
            "assets": [
                {
                    "asset_type": "render_output",
                    "media_type": clean_text(payload.get("media_type")) or "video",
                    "title": title,
                    "source_url": clean_text(payload.get("output_url")) or None,
                    "metadata": {
                        "stub": True,
                        "script": clean_text(payload.get("script")),
                        "render_profile": clean_text(payload.get("render_profile")) or "foundation",
                    },
                }
            ],
            "message": "Render job completed through the stub media provider.",
        }


class ElevenLabsScribeTranscriptionProvider(BaseTranscriptionProvider):
    provider_id = "elevenlabs_scribe"

    def transcribeMedia(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        transcript_text = clean_text(payload.get("transcript_text"))
        segments = normalize_speaker_segments(payload.get("speaker_segments"))
        if transcript_text:
            return {
                "transcript_text": transcript_text,
                "speaker_segments": segments,
                "timestamps": [{"start": item.get("start"), "end": item.get("end"), "speaker": item.get("speaker")} for item in segments],
                "message": "Transcript normalized from provided text.",
            }
        api_key = clean_text(payload.get("api_key"))
        if not api_key:
            raise ValueError("ElevenLabs Scribe API key is missing.")
        raise NotImplementedError("Live ElevenLabs Scribe transcription is not wired in this safe pass.")


class AwsTranscribeProvider(BaseTranscriptionProvider):
    provider_id = "aws_transcribe"

    def transcribeMedia(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        transcript_text = clean_text(payload.get("transcript_text"))
        segments = normalize_speaker_segments(payload.get("speaker_segments"))
        if transcript_text:
            return {
                "transcript_text": transcript_text,
                "speaker_segments": segments,
                "timestamps": [{"start": item.get("start"), "end": item.get("end"), "speaker": item.get("speaker")} for item in segments],
                "message": "Transcript normalized from provided text.",
            }
        if not clean_text(payload.get("access_key_id")) or not clean_text(payload.get("secret_access_key")):
            raise ValueError("AWS transcription credentials are missing.")
        raise NotImplementedError("Live AWS transcription is not wired in this safe pass.")


class ZoomMeetingIngestionProvider(BaseMeetingIngestionProvider):
    provider_id = "zoom"

    def ingestMeetingArtifacts(self, payload: dict[str, Any]) -> dict[str, Any]:
        recordings = payload.get("recording_files") or payload.get("recordings") or []
        transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
        transcript_text = clean_text(payload.get("transcript_text") or transcript.get("text") or transcript.get("transcript_text"))
        speaker_segments = normalize_speaker_segments(payload.get("speaker_segments") or transcript.get("speaker_segments") or transcript.get("segments"))
        return {
            "provider": self.provider_id,
            "meeting": {
                "meeting_id": clean_text(payload.get("meeting_id") or payload.get("id")),
                "title": clean_text(payload.get("meeting_title") or payload.get("title") or "Zoom Meeting"),
                "started_at": payload.get("started_at") or payload.get("start_time"),
            },
            "assets": [
                {
                    "asset_type": "meeting_recording",
                    "media_type": clean_text(item.get("media_type") or item.get("file_type") or "video").lower(),
                    "title": clean_text(item.get("title") or item.get("file_name") or "Zoom Recording"),
                    "source_url": clean_text(item.get("url") or item.get("download_url")),
                    "metadata": {
                        "recording_id": clean_text(item.get("id")),
                        "duration_seconds": item.get("duration_seconds") or item.get("recording_duration"),
                    },
                }
                for item in recordings
                if isinstance(item, dict)
            ],
            "transcript": {
                "transcript_text": transcript_text,
                "speaker_segments": speaker_segments,
            }
            if transcript_text or speaker_segments
            else None,
            "auto_transcribe": bool(payload.get("auto_transcribe", True)),
        }


class GoogleMeetDriveIngestionProvider(BaseMeetingIngestionProvider):
    provider_id = "google_meet_drive"

    def ingestMeetingArtifacts(self, payload: dict[str, Any]) -> dict[str, Any]:
        drive_files = payload.get("drive_files") or payload.get("recording_files") or payload.get("files") or []
        transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
        transcript_text = clean_text(payload.get("transcript_text") or transcript.get("text") or transcript.get("transcript_text"))
        speaker_segments = normalize_speaker_segments(payload.get("speaker_segments") or transcript.get("speaker_segments") or transcript.get("segments"))
        return {
            "provider": self.provider_id,
            "meeting": {
                "meeting_id": clean_text(payload.get("meeting_id") or payload.get("id")),
                "title": clean_text(payload.get("meeting_title") or payload.get("title") or "Google Meet"),
                "started_at": payload.get("started_at") or payload.get("start_time"),
                "drive_folder_id": clean_text(payload.get("drive_folder_id")),
            },
            "assets": [
                {
                    "asset_type": "meeting_recording",
                    "media_type": clean_text(item.get("media_type") or item.get("mime_type") or "video").lower(),
                    "title": clean_text(item.get("title") or item.get("name") or "Drive Meeting Artifact"),
                    "source_url": clean_text(item.get("url") or item.get("webViewLink") or item.get("downloadUrl")),
                    "metadata": {
                        "drive_file_id": clean_text(item.get("id")),
                        "mime_type": clean_text(item.get("mime_type") or item.get("mimeType")),
                    },
                }
                for item in drive_files
                if isinstance(item, dict)
            ],
            "transcript": {
                "transcript_text": transcript_text,
                "speaker_segments": speaker_segments,
            }
            if transcript_text or speaker_segments
            else None,
            "auto_transcribe": bool(payload.get("auto_transcribe", True)),
        }


class JitsiMeetingIngestionProvider(BaseMeetingIngestionProvider):
    provider_id = "jitsi"

    def ingestMeetingArtifacts(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("Jitsi meeting ingestion is stubbed only in this safe pass.")


class MediaEngine:
    def __init__(self, store: MediaStateStore | None = None) -> None:
        self.store = store or MediaStateStore()
        self.render_providers: dict[str, BaseRenderProvider] = {
            StubRenderProvider.provider_id: StubRenderProvider(),
        }
        self.transcription_providers: dict[str, BaseTranscriptionProvider] = {
            ElevenLabsScribeTranscriptionProvider.provider_id: ElevenLabsScribeTranscriptionProvider(),
            AwsTranscribeProvider.provider_id: AwsTranscribeProvider(),
        }
        self.ingestion_providers: dict[str, BaseMeetingIngestionProvider] = {
            ZoomMeetingIngestionProvider.provider_id: ZoomMeetingIngestionProvider(),
            GoogleMeetDriveIngestionProvider.provider_id: GoogleMeetDriveIngestionProvider(),
            JitsiMeetingIngestionProvider.provider_id: JitsiMeetingIngestionProvider(),
        }

    def list_assets(self) -> list[dict[str, Any]]:
        return self.store.list("assets")

    def list_render_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("render_jobs")

    def list_transcript_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("transcript_jobs")

    def list_transcript_artifacts(self) -> list[dict[str, Any]]:
        return self.store.list("transcript_artifacts")

    def render_media(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider")) or StubRenderProvider.provider_id
        provider = self.render_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown render provider '{provider_id}'.")
        attachments = normalize_attachment_links(payload, context)
        job = build_render_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.get("title")) or "Render Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("render_jobs", job)
        return self._process_render_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

    def _process_render_job(
        self,
        provider: BaseRenderProvider,
        job: dict[str, Any],
        payload: dict[str, Any],
        *,
        tenant_id: str | None,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        started = {**job, "status": "processing", "started_at": utcnow_iso()}
        self.store.upsert("render_jobs", started)
        try:
            result = provider.renderMedia(started, payload)
            assets: list[dict[str, Any]] = []
            for asset_payload in result.get("assets") or []:
                asset = build_media_asset(
                    tenant_id=tenant_id,
                    provider=provider.provider_id,
                    asset_type=clean_text(asset_payload.get("asset_type")) or "render_output",
                    media_type=clean_text(asset_payload.get("media_type")) or "video",
                    title=clean_text(asset_payload.get("title")) or clean_text(started.get("title")) or "Rendered Asset",
                    source_url=clean_text(asset_payload.get("source_url")) or None,
                    metadata=asset_payload.get("metadata") if isinstance(asset_payload.get("metadata"), dict) else {},
                    attachments=attachments,
                )
                assets.append(self.store.upsert("assets", asset))
            completed = {
                **started,
                "status": "complete",
                "completed_at": utcnow_iso(),
                "output_asset_ids": [asset["id"] for asset in assets],
                "result": {"message": result.get("message"), "asset_count": len(assets)},
                "last_error": None,
            }
            self.store.upsert("render_jobs", completed)
            return {"job": completed, "assets": assets}
        except Exception as error:
            failed = {
                **started,
                "status": "failed",
                "completed_at": utcnow_iso(),
                "last_error": str(error),
            }
            self.store.upsert("render_jobs", failed)
            return {"job": failed, "assets": []}

    def transcribe_media(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider")) or ElevenLabsScribeTranscriptionProvider.provider_id
        provider = self.transcription_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown transcription provider '{provider_id}'.")
        attachments = normalize_attachment_links(payload, context)
        job = build_transcript_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.get("title")) or "Transcript Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("transcript_jobs", job)
        return self._process_transcript_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

    def _process_transcript_job(
        self,
        provider: BaseTranscriptionProvider,
        job: dict[str, Any],
        payload: dict[str, Any],
        *,
        tenant_id: str | None,
        attachments: list[dict[str, Any]],
        source_asset_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        started = {**job, "status": "processing", "started_at": utcnow_iso()}
        self.store.upsert("transcript_jobs", started)
        try:
            result = provider.transcribeMedia(started, payload)
            artifact = build_transcript_artifact(
                tenant_id=tenant_id,
                provider=provider.provider_id,
                title=clean_text(payload.get("title")) or clean_text(started.get("title")) or "Transcript",
                transcript_text=clean_text(result.get("transcript_text")),
                speaker_segments=normalize_speaker_segments(result.get("speaker_segments")),
                timestamps=result.get("timestamps") if isinstance(result.get("timestamps"), list) else [],
                attachments=attachments,
                source_asset_ids=source_asset_ids,
            )
            stored_artifact = self.store.upsert("transcript_artifacts", artifact)
            completed = {
                **started,
                "status": "complete",
                "completed_at": utcnow_iso(),
                "artifact_id": stored_artifact["id"],
                "result": {"message": result.get("message"), "segment_count": len(stored_artifact.get("speaker_segments") or [])},
                "last_error": None,
            }
            self.store.upsert("transcript_jobs", completed)
            return {"job": completed, "artifact": stored_artifact}
        except Exception as error:
            failed = {
                **started,
                "status": "failed",
                "completed_at": utcnow_iso(),
                "last_error": str(error),
            }
            self.store.upsert("transcript_jobs", failed)
            return {"job": failed, "artifact": None}

    def ingest_meeting_artifacts(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider") or payload.get("source")) or ZoomMeetingIngestionProvider.provider_id
        provider = self.ingestion_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown meeting ingestion provider '{provider_id}'.")
        normalized = provider.ingestMeetingArtifacts(payload)
        attachments = normalize_attachment_links(payload, context)
        assets: list[dict[str, Any]] = []
        for asset_payload in normalized.get("assets") or []:
            asset = build_media_asset(
                tenant_id=tenant_id,
                provider=provider.provider_id,
                asset_type=clean_text(asset_payload.get("asset_type")) or "meeting_recording",
                media_type=clean_text(asset_payload.get("media_type")) or "video",
                title=clean_text(asset_payload.get("title")) or clean_text(normalized.get("meeting", {}).get("title")) or "Meeting Artifact",
                source_url=clean_text(asset_payload.get("source_url")) or None,
                metadata={
                    **(asset_payload.get("metadata") if isinstance(asset_payload.get("metadata"), dict) else {}),
                    "meeting": clone_json(normalized.get("meeting") or {}),
                },
                attachments=attachments,
            )
            assets.append(self.store.upsert("assets", asset))

        transcript = normalized.get("transcript") if isinstance(normalized.get("transcript"), dict) else None
        transcript_job = None
        transcript_artifact = None
        if transcript and (clean_text(transcript.get("transcript_text")) or normalize_speaker_segments(transcript.get("speaker_segments"))):
            transcript_result = self.transcribe_media(
                {
                    "provider": clean_text(payload.get("transcription_provider")) or ElevenLabsScribeTranscriptionProvider.provider_id,
                    "title": clean_text(normalized.get("meeting", {}).get("title")) or "Meeting Transcript",
                    "transcript_text": transcript.get("transcript_text"),
                    "speaker_segments": transcript.get("speaker_segments"),
                    "attachments": attachments,
                },
                tenant_id=tenant_id,
                context=context,
            )
            transcript_job = transcript_result.get("job")
            transcript_artifact = transcript_result.get("artifact")
        elif normalized.get("auto_transcribe") and assets:
            transcript_result = self.transcribe_media(
                {
                    "provider": clean_text(payload.get("transcription_provider")) or ElevenLabsScribeTranscriptionProvider.provider_id,
                    "title": clean_text(normalized.get("meeting", {}).get("title")) or "Meeting Transcript",
                    "source_url": assets[0].get("source_url"),
                    "attachments": attachments,
                },
                tenant_id=tenant_id,
                context=context,
            )
            transcript_job = transcript_result.get("job")
            transcript_artifact = transcript_result.get("artifact")
        return {
            "provider": provider.provider_id,
            "meeting": normalized.get("meeting") or {},
            "assets": assets,
            "transcript_job": transcript_job,
            "transcript_artifact": transcript_artifact,
        }


_MEDIA_ENGINE: MediaEngine | None = None


def get_media_engine() -> MediaEngine:
    global _MEDIA_ENGINE
    if _MEDIA_ENGINE is None:
        _MEDIA_ENGINE = MediaEngine()
    return _MEDIA_ENGINE
