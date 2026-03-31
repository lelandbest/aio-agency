from __future__ import annotations

import hashlib
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


def generate_content_hash(content: Any) -> str:
    normalized = json.dumps(content, sort_keys=True, default=str)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


MEDIA_STAGES = ("temporary", "intermediate", "generated", "processing", "final")
MEDIA_SOURCES = ("transcription", "render", "script", "audio_render", "publish", "meeting_ingest", "manual", "import")

MediaValidationError = type("MediaValidationError", (ValueError,), {})


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
    source: str,
    stage: str = "final",
    linked_id: str | None = None,
    source_url: str | None = None,
    metadata: dict[str, Any] | None = None,
    attachments: list[dict[str, Any]] | None = None,
    content_hash: str | None = None,
    validate: bool = True,
) -> dict[str, Any]:
    if validate:
        if not clean_text(source):
            raise MediaValidationError("Media asset requires 'source' field.")
        if not clean_text(asset_type):
            raise MediaValidationError("Media asset requires 'asset_type' field.")
        if not clean_text(media_type):
            raise MediaValidationError("Media asset requires 'media_type' field.")
        if stage not in MEDIA_STAGES:
            raise MediaValidationError(f"Invalid stage '{stage}'. Must be one of: {', '.join(MEDIA_STAGES)}")

    asset_id = unique_id("media-asset")
    now = utcnow_iso()

    asset = {
        "id": asset_id,
        "tenant_id": tenant_id,
        "provider": provider,
        "asset_type": asset_type,
        "media_type": media_type,
        "title": title or "Media Asset",
        "source": source,
        "stage": stage,
        "linked_id": linked_id,
        "source_url": source_url,
        "metadata": clone_json(metadata or {}),
        "attachments": clone_json(attachments or []),
        "content_hash": content_hash,
        "created_at": now,
        "updated_at": now,
    }

    if not content_hash and source_url:
        asset["content_hash"] = generate_content_hash({"url": source_url, "type": asset_type})

    return asset


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


def build_script_job(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    input_payload: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("script-job"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Script Job",
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


def build_script_artifact(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    script_text: str,
    structured_script: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("script-artifact"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Script Artifact",
        "script_text": script_text,
        "structured_script": clone_json(structured_script),
        "attachments": clone_json(attachments),
        "created_at": now,
        "updated_at": now,
    }


def build_run_of_show_job(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    input_payload: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("run-of-show-job"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Run of Show Job",
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


def build_run_of_show_artifact(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    run_of_show_text: str,
    structured_run_of_show: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("run-of-show-artifact"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Run of Show Artifact",
        "run_of_show_text": run_of_show_text,
        "structured_run_of_show": clone_json(structured_run_of_show),
        "attachments": clone_json(attachments),
        "created_at": now,
        "updated_at": now,
    }


def build_audio_render_job(
    *,
    tenant_id: str | None,
    provider: str,
    title: str,
    input_payload: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("audio-render-job"),
        "tenant_id": tenant_id,
        "provider": provider,
        "title": title or "Audio Render Job",
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


def build_publish_job(
    *,
    tenant_id: str | None,
    title: str,
    input_payload: dict[str, Any],
    attachments: list[dict[str, Any]],
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("publish-job"),
        "tenant_id": tenant_id,
        "provider": "internal-publish",
        "title": title or "Publish Job",
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


def build_publish_artifact(
    *,
    tenant_id: str | None,
    title: str,
    publish_target: str,
    attachments: list[dict[str, Any]],
    source_asset_ids: list[str] | None = None,
    source_artifact_ids: list[str] | None = None,
) -> dict[str, Any]:
    now = utcnow_iso()
    return {
        "id": unique_id("publish-artifact"),
        "tenant_id": tenant_id,
        "provider": "internal-publish",
        "title": title or "Publish Artifact",
        "publish_target": publish_target,
        "publication_status": "published",
        "attachments": clone_json(attachments),
        "source_asset_ids": list(source_asset_ids or []),
        "source_artifact_ids": list(source_artifact_ids or []),
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
            "script_jobs": [],
            "script_artifacts": [],
            "run_of_show_jobs": [],
            "run_of_show_artifacts": [],
            "audio_render_jobs": [],
            "publish_jobs": [],
            "publish_artifacts": [],
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

    def upsert(self, collection: str, record: dict[str, Any], deduplicate: bool = False) -> dict[str, Any]:
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
            if deduplicate and collection == "assets":
                content_hash = payload.get("content_hash")
                if content_hash:
                    for existing in rows:
                        if clean_text(existing.get("content_hash")) == content_hash:
                            return existing
            rows.append(payload)
            self._write_state(state)
            return payload

    def upsert_asset(self, asset: dict[str, Any], deduplicate: bool = True) -> dict[str, Any]:
        return self.upsert("assets", asset, deduplicate=deduplicate)

    def find_duplicate(self, content_hash: str) -> dict[str, Any] | None:
        with self._lock:
            state = self._read_state()
            for asset in state.get("assets") or []:
                if clean_text(asset.get("content_hash")) == content_hash:
                    return clone_json(asset)
        return None

    def list(self, collection: str) -> list[dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            return clone_json(state.get(collection) or [])

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return self._read_state()

    def cleanup_stale_assets(self, older_than_hours: int = 24) -> list[str]:
        with self._lock:
            state = self._read_state()
            cutoff = datetime.now(UTC).timestamp() - (older_than_hours * 3600)
            removed_ids: list[str] = []
            assets = state.get("assets") or []
            kept = []
            for asset in assets:
                stage = asset.get("stage")
                created_str = asset.get("created_at")
                if stage == "temporary":
                    try:
                        created = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                        if created.timestamp() < cutoff:
                            removed_ids.append(asset.get("id"))
                            continue
                    except (ValueError, AttributeError):
                        removed_ids.append(asset.get("id"))
                        continue
                kept.append(asset)
            if removed_ids:
                state["assets"] = kept
                self._write_state(state)
            return removed_ids

    def cleanup_by_linked_id(self, linked_id: str) -> int:
        with self._lock:
            state = self._read_state()
            assets = state.get("assets") or []
            kept = []
            removed = 0
            for asset in assets:
                if clean_text(asset.get("linked_id")) == linked_id:
                    removed += 1
                    continue
                kept.append(asset)
            if removed:
                state["assets"] = kept
                self._write_state(state)
            return removed

    def get_assets_by_linked_id(self, linked_id: str) -> list[dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            return [
                clone_json(a)
                for a in state.get("assets") or []
                if clean_text(a.get("linked_id")) == linked_id
            ]

    def get_assets_by_hash(self, content_hash: str) -> list[dict[str, Any]]:
        with self._lock:
            state = self._read_state()
            return [
                clone_json(a)
                for a in state.get("assets") or []
                if clean_text(a.get("content_hash")) == content_hash
            ]

    def delete(self, collection: str, record_id: str) -> bool:
        with self._lock:
            state = self._read_state()
            rows = state.get(collection) or []
            new_rows = [r for r in rows if clean_text(r.get("id")) != clean_text(record_id)]
            if len(new_rows) == len(rows):
                return False
            state[collection] = new_rows
            self._write_state(state)
            return True

    def delete_asset(self, asset_id: str) -> bool:
        return self.delete("assets", asset_id)

    def delete_job(self, job_type: str, job_id: str) -> bool:
        collection_map = {
            "render": "render_jobs",
            "transcript": "transcript_jobs",
            "script": "script_jobs",
            "run_of_show": "run_of_show_jobs",
            "audio": "audio_render_jobs",
            "publish": "publish_jobs",
        }
        collection = collection_map.get(job_type)
        if not collection:
            return False
        return self.delete(collection, job_id)

    def delete_artifact(self, artifact_type: str, artifact_id: str) -> bool:
        collection_map = {
            "transcript": "transcript_artifacts",
            "script": "script_artifacts",
            "run_of_show": "run_of_show_artifacts",
            "publish": "publish_artifacts",
        }
        collection = collection_map.get(artifact_type)
        if not collection:
            return False
        return self.delete(collection, artifact_id)


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


class BaseScriptProvider(ABC):
    provider_id = "stub-script"

    @abstractmethod
    def generateScript(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class BaseRunOfShowProvider(ABC):
    provider_id = "stub-run-of-show"

    @abstractmethod
    def generateRunOfShow(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class BaseAudioRenderProvider(ABC):
    provider_id = "elevenlabs_tts"

    @abstractmethod
    def renderAudio(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class RemotionLocalRenderProvider(BaseRenderProvider):
    provider_id = "stub-render"

    def renderMedia(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        import json
        import subprocess
        import os
        from pathlib import Path

        title = clean_text(payload.get("title")) or clean_text(job.get("title")) or "Generated Video"
        audioUrl = clean_text(payload.get("audioUrl") or payload.get("sourceUrl") or payload.get("audio_url") or payload.get("source_url"))
        transcript = clean_text(payload.get("transcript"))
        branding = payload.get("branding")
        
        props = {}
        if title:
            props["title"] = title
        if audioUrl:
            props["audioUrl"] = audioUrl
        if transcript:
            props["transcript"] = transcript
        if branding:
            props["branding"] = branding

        job_id = clean_text(job.get("id")) or unique_id("video")
        video_filename = f"{job_id}.mp4"
        video_dir = Path(__file__).resolve().parent / "data" / "video"
        video_dir.mkdir(parents=True, exist_ok=True)
        video_path = video_dir / video_filename

        frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
        remotion_cmd = [
            "npx.cmd" if os.name == "nt" else "npx",
            "remotion",
            "render",
            "remotion/index.ts",
            "VideoComposition",
            str(video_path),
            "--props",
            json.dumps(props),
            "--log=info"
        ]

        try:
            result = subprocess.run(
                remotion_cmd,
                cwd=str(frontend_dir),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=True
            )
        except subprocess.CalledProcessError as e:
            raise ValueError(f"Remotion render failed: {e.stderr or e.stdout}")
        except Exception as e:
            raise ValueError(f"Failed to execute Remotion: {str(e)}")

        if not video_path.exists():
            raise ValueError("Remotion render succeeded but output file is missing.")
            
        return {
            "assets": [
                {
                    "asset_type": clean_text(payload.get("assetType") or payload.get("asset_type")) or "render_output",
                    "media_type": clean_text(payload.get("mediaType") or payload.get("media_type")) or "video",
                    "title": title,
                    "source_url": f"/api/media/video/{video_filename}",
                    "metadata": {
                        "provider": "RemotionLocalRenderProvider",
                        "script": clean_text(payload.get("script")),
                        "renderProfile": clean_text(payload.get("renderProfile") or payload.get("render_profile")) or "foundation",
                    },
                }
            ],
            "message": "Render job completed through the Remotion local media provider.",
        }


class ElevenLabsScribeTranscriptionProvider(BaseTranscriptionProvider):
    provider_id = "elevenlabs_scribe"
    BASE_URL = "https://api.elevenlabs.io"

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
        
        try:
            import os
            apiKey = os.getenv("ELEVEN_LABS_API_KEY")
        except Exception:
            apiKey = None

        if not apiKey:
            raise ValueError("ElevenLabs Scribe provider is not configured. Add ELEVEN_LABS_API_KEY to environment.")

        audio_url = clean_text(payload.get("source_url"))
        if not audio_url:
            raise ValueError("ElevenLabs Scribe requires source_url for live transcription.")

        import urllib.request
        import urllib.error
        import json

        request_id = job.get("id", "transcribe")

        upload_url = f"{self.BASE_URL}/v1/scribe/upload"
        headers = {
            "xi-api-key": apiKey,
        }
        
        try:
            req = urllib.request.Request(
                f"{upload_url}?prompt={urllib.parse.quote(payload.get('prompt', ''))}",
                headers=headers,
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                upload_result = json.loads(response.read().decode())
                audio_id = upload_result.get("audio_id")
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise ValueError("ElevenLabs API key is invalid.")
            elif e.code == 402:
                raise ValueError("ElevenLabs API quota exceeded.")
            else:
                raise ValueError(f"ElevenLabs upload failed: {e.reason}")
        except Exception as e:
            raise ValueError(f"ElevenLabs upload error: {str(e)}")
        
        if not audio_id:
            raise ValueError("ElevenLabs failed to return audio_id after upload.")
        
        transcript_url = f"{self.BASE_URL}/v1/scribe/{audio_id}/transcript"
        
        try:
            req = urllib.request.Request(transcript_url, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=60) as response:
                result = json.loads(response.read().decode())
                text = result.get("text", "")
                speaker_segments = []
                timestamps = []
                
                if "words" in result:
                    current_speaker = "Speaker A"
                    for word in result["words"]:
                        if "speaker" in word:
                            current_speaker = word["speaker"]
                        speaker_segments.append({
                            "speaker": current_speaker,
                            "text": word.get("text", ""),
                            "start": word.get("start"),
                            "end": word.get("end"),
                        })
                        timestamps.append({
                            "start": word.get("start"),
                            "end": word.get("end"),
                            "speaker": current_speaker,
                        })
                
                return {
                    "transcript_text": text,
                    "speaker_segments": speaker_segments,
                    "timestamps": timestamps,
                    "message": "Transcript fetched from ElevenLabs Scribe.",
                }
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise ValueError("ElevenLabs API key is invalid.")
            elif e.code == 404:
                raise ValueError("Audio file not found or expired.")
            else:
                raise ValueError(f"ElevenLabs transcription failed: {e.reason}")
        except Exception as e:
            raise ValueError(f"ElevenLabs transcription error: {str(e)}")


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


class StubScriptProvider(BaseScriptProvider):
    provider_id = "stub-script"

    def generateScript(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        topic = clean_text(payload.get("topic")) or "Untitled Topic"
        tone = clean_text(payload.get("tone")) or "clear"
        duration = clean_text(payload.get("duration")) or "10 minutes"
        context = clean_text(payload.get("context")) or "General audience"
        title = clean_text(payload.get("title")) or f"{topic} Script"
        sections = [
            {"id": "intro", "label": "Intro", "summary": f"Frame {topic} in a {tone} voice.", "estimated_seconds": 45},
            {"id": "body", "label": "Main Segment", "summary": f"Expand the core talking points for a {duration} segment.", "estimated_seconds": 360},
            {"id": "cta", "label": "Close", "summary": "Wrap with the next action or takeaway.", "estimated_seconds": 45},
        ]
        script_text = "\n".join(
            [
                f"Title: {title}",
                f"Topic: {topic}",
                f"Tone: {tone}",
                f"Target Duration: {duration}",
                f"Context: {context}",
                "",
                "Opening:",
                f"Today we are covering {topic} with a {tone} angle tailored for {context}.",
                "",
                "Main Segment:",
                f"Break the story into three beats, keep the pacing aligned to roughly {duration}, and keep each transition explicit.",
                "",
                "Closing:",
                "Summarize the key point, reinforce the takeaway, and direct the audience to the next step.",
            ]
        )
        return {
            "artifact_title": title,
            "script_text": script_text,
            "structured_script": {
                "title": title,
                "topic": topic,
                "tone": tone,
                "duration": duration,
                "context": context,
                "sections": sections,
            },
            "message": "Script job completed through the stub script provider.",
        }


class StubRunOfShowProvider(BaseRunOfShowProvider):
    provider_id = "stub-run-of-show"

    def generateRunOfShow(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        title = clean_text(payload.get("title") or payload.get("topic")) or "Run of Show"
        duration = clean_text(payload.get("duration")) or "30 minutes"
        context = clean_text(payload.get("context")) or "Live production"
        segments = [
            {"order": 1, "label": "Cold Open", "duration": "2 minutes", "objective": "Set the theme and open strong."},
            {"order": 2, "label": "Core Segment", "duration": "18 minutes", "objective": f"Cover the main beats for {title}."},
            {"order": 3, "label": "Audience / CTA", "duration": "5 minutes", "objective": "Handle follow-up actions and close cleanly."},
        ]
        agenda_text = "\n".join(
            [f"{item['order']}. {item['label']} ({item['duration']}): {item['objective']}" for item in segments]
        )
        return {
            "artifact_title": title,
            "run_of_show_text": agenda_text,
            "structured_run_of_show": {
                "title": title,
                "duration": duration,
                "context": context,
                "segments": segments,
            },
            "message": "Run-of-show job completed through the stub planner provider.",
        }


class ElevenLabsTTSProvider(BaseAudioRenderProvider):
    provider_id = "elevenlabs_tts"
    BASE_URL = "https://api.elevenlabs.io"
    DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel
    _VOICE_NAME_MAP: dict[str, str] = {
        "rachel": "21m00Tcm4TlvDq8ikWAM",
        "domi": "AZnzlk1XvdvUeBnXmlld",
        "bella": "EXAVITQu4vr4xnSDxMaL",
        "adam": "pNInz6obpgDQGcFmaJgB",
        "sarah": "EXAVITQu4vr4xnSDxMaL",
        "antoni": "ErXwobaYiN019PkySvjV",
    }

    def _resolve_voice_id(self, voice: str) -> str:
        if not voice:
            return self.DEFAULT_VOICE_ID
        lower = voice.strip().lower()
        if lower in self._VOICE_NAME_MAP:
            return self._VOICE_NAME_MAP[lower]
        return voice.strip() or self.DEFAULT_VOICE_ID

    def renderAudio(self, job: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
        import urllib.request
        import urllib.error
        import os

        text = clean_text(payload.get("text") or payload.get("script_text") or payload.get("script"))
        if not text:
            raise ValueError("Audio render requires text or script input.")

        try:
            apiKey = os.getenv("ELEVEN_LABS_API_KEY")
        except Exception:
            apiKey = None

        if not apiKey:
            raise ValueError("ElevenLabs TTS provider is not configured. Add ELEVEN_LABS_API_KEY to environment.")

        voice = clean_text(payload.get("voice")) or "Rachel"
        voice_id = self._resolve_voice_id(voice)
        title = clean_text(payload.get("title")) or clean_text(job.get("title")) or "Voice Render"

        url = f"{self.BASE_URL}/v1/text-to-speech/{voice_id}"
        request_body = json.dumps({
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=request_body,
            headers={
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                audio_bytes = response.read()
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise ValueError("ElevenLabs API key is invalid.")
            elif e.code == 422:
                raise ValueError("ElevenLabs rejected the request. Check voice ID or text content.")
            elif e.code == 429:
                raise ValueError("ElevenLabs API quota exceeded or rate limited.")
            else:
                body_text = ""
                try:
                    body_text = e.read().decode("utf-8", errors="replace")
                except Exception:
                    pass
                raise ValueError(f"ElevenLabs TTS request failed ({e.code}): {body_text or e.reason}")
        except Exception as e:
            raise ValueError(f"ElevenLabs TTS connection error: {str(e)}")

        if not audio_bytes:
            raise ValueError("ElevenLabs returned an empty audio response.")

        audio_dir = Path(__file__).resolve().parent / "data" / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        job_id = clean_text(job.get("id")) or unique_id("audio")
        filename = f"{job_id}.mp3"
        audio_path = audio_dir / filename
        audio_path.write_bytes(audio_bytes)

        return {
            "assets": [
                {
                    "asset_type": "audio_render",
                    "media_type": "audio",
                    "title": title,
                    "source_url": f"/api/media/audio/{filename}",
                    "metadata": {
                        "provider": self.provider_id,
                        "voice": voice,
                        "voiceId": voice_id,
                        "modelId": "eleven_monolingual_v1",
                        "mimeType": "audio/mpeg",
                        "fileSizeBytes": len(audio_bytes),
                        "scriptExcerpt": text[:240],
                    },
                }
            ],
            "message": "Audio render completed via ElevenLabs TTS.",
        }



class MediaEngine:
    def __init__(self, store: MediaStateStore | None = None) -> None:
        self.store = store or MediaStateStore()
        self.render_providers: dict[str, BaseRenderProvider] = {
            RemotionLocalRenderProvider.provider_id: RemotionLocalRenderProvider(),
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
        self.script_providers: dict[str, BaseScriptProvider] = {
            StubScriptProvider.provider_id: StubScriptProvider(),
        }
        self.run_of_show_providers: dict[str, BaseRunOfShowProvider] = {
            StubRunOfShowProvider.provider_id: StubRunOfShowProvider(),
        }
        self.audio_render_providers: dict[str, BaseAudioRenderProvider] = {
            ElevenLabsTTSProvider.provider_id: ElevenLabsTTSProvider(),
        }

    def list_assets(self) -> list[dict[str, Any]]:
        return self.store.list("assets")

    def list_render_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("render_jobs")

    def list_transcript_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("transcript_jobs")

    def list_transcript_artifacts(self) -> list[dict[str, Any]]:
        return self.store.list("transcript_artifacts")

    def list_script_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("script_jobs")

    def list_script_artifacts(self) -> list[dict[str, Any]]:
        return self.store.list("script_artifacts")

    def list_run_of_show_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("run_of_show_jobs")

    def list_run_of_show_artifacts(self) -> list[dict[str, Any]]:
        return self.store.list("run_of_show_artifacts")

    def list_audio_render_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("audio_render_jobs")

    def list_publish_jobs(self) -> list[dict[str, Any]]:
        return self.store.list("publish_jobs")

    def list_publish_artifacts(self) -> list[dict[str, Any]]:
        return self.store.list("publish_artifacts")

    def get_assets_by_pipeline(self, pipeline_type: str, pipeline_id: str) -> list[dict[str, Any]]:
        return self.store.get_assets_by_linked_id(f"{pipeline_type}-{pipeline_id}")

    def get_assets_by_run(self, run_id: str) -> list[dict[str, Any]]:
        return self.get_assets_by_pipeline("flow-run", run_id)

    def get_assets_by_flow(self, flow_id: str) -> list[dict[str, Any]]:
        return self.get_assets_by_pipeline("flow", flow_id)

    def get_assets_by_agent(self, agent_id: str) -> list[dict[str, Any]]:
        return self.get_assets_by_pipeline("agent", agent_id)

    def group_assets_by_pipeline(self) -> dict[str, dict[str, list[dict[str, Any]]]]:
        assets = self.list_assets()
        groups: dict[str, dict[str, list[dict[str, Any]]]] = {
            "by_source": {},
            "by_stage": {},
            "by_linked_id": {},
        }
        for asset in assets:
            source = asset.get("source") or "unknown"
            stage = asset.get("stage") or "unknown"
            linked_id = asset.get("linked_id") or "unlinked"
            groups["by_source"].setdefault(source, []).append(asset)
            groups["by_stage"].setdefault(stage, []).append(asset)
            groups["by_linked_id"].setdefault(linked_id, []).append(asset)
        return groups

    def run_cleanup(self, older_than_hours: int = 24) -> dict[str, Any]:
        removed = self.store.cleanup_stale_assets(older_than_hours)
        return {"removed_temporary_assets": len(removed), "asset_ids": removed}

    def generate_script(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider")) or StubScriptProvider.provider_id
        provider = self.script_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown script provider '{provider_id}'.")
        attachments = normalize_attachment_links(payload, context)
        job = build_script_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.get("title")) or clean_text(payload.get("topic")) or "Script Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("script_jobs", job)
        return self._process_script_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

    def _process_script_job(
        self,
        provider: BaseScriptProvider,
        job: dict[str, Any],
        payload: dict[str, Any],
        *,
        tenant_id: str | None,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        started = {**job, "status": "processing", "started_at": utcnow_iso()}
        self.store.upsert("script_jobs", started)
        try:
            result = provider.generateScript(started, payload)
            artifact = build_script_artifact(
                tenant_id=tenant_id,
                provider=provider.provider_id,
                title=clean_text(result.get("artifact_title")) or clean_text(payload.get("title")) or clean_text(started.get("title")) or "Script Artifact",
                script_text=clean_text(result.get("script_text")),
                structured_script=result.get("structured_script") if isinstance(result.get("structured_script"), dict) else {},
                attachments=attachments,
            )
            stored_artifact = self.store.upsert("script_artifacts", artifact)
            completed = {
                **started,
                "status": "complete",
                "completed_at": utcnow_iso(),
                "artifact_id": stored_artifact["id"],
                "result": {"message": result.get("message"), "section_count": len((stored_artifact.get("structured_script") or {}).get("sections") or [])},
                "last_error": None,
            }
            self.store.upsert("script_jobs", completed)
            return {"job": completed, "artifact": stored_artifact}
        except Exception as error:
            failed = {
                **started,
                "status": "failed",
                "completed_at": utcnow_iso(),
                "last_error": str(error),
            }
            self.store.upsert("script_jobs", failed)
            return {"job": failed, "artifact": None}

    def generate_run_of_show(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider")) or StubRunOfShowProvider.provider_id
        provider = self.run_of_show_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown run-of-show provider '{provider_id}'.")
        attachments = normalize_attachment_links(payload, context)
        job = build_run_of_show_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.get("title")) or clean_text(payload.get("topic")) or "Run of Show Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("run_of_show_jobs", job)
        return self._process_run_of_show_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

    def _process_run_of_show_job(
        self,
        provider: BaseRunOfShowProvider,
        job: dict[str, Any],
        payload: dict[str, Any],
        *,
        tenant_id: str | None,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        started = {**job, "status": "processing", "started_at": utcnow_iso()}
        self.store.upsert("run_of_show_jobs", started)
        try:
            result = provider.generateRunOfShow(started, payload)
            artifact = build_run_of_show_artifact(
                tenant_id=tenant_id,
                provider=provider.provider_id,
                title=clean_text(result.get("artifact_title")) or clean_text(payload.get("title")) or clean_text(started.get("title")) or "Run of Show Artifact",
                run_of_show_text=clean_text(result.get("run_of_show_text")),
                structured_run_of_show=result.get("structured_run_of_show") if isinstance(result.get("structured_run_of_show"), dict) else {},
                attachments=attachments,
            )
            stored_artifact = self.store.upsert("run_of_show_artifacts", artifact)
            completed = {
                **started,
                "status": "complete",
                "completed_at": utcnow_iso(),
                "artifact_id": stored_artifact["id"],
                "result": {"message": result.get("message"), "segment_count": len((stored_artifact.get("structured_run_of_show") or {}).get("segments") or [])},
                "last_error": None,
            }
            self.store.upsert("run_of_show_jobs", completed)
            return {"job": completed, "artifact": stored_artifact}
        except Exception as error:
            failed = {
                **started,
                "status": "failed",
                "completed_at": utcnow_iso(),
                "last_error": str(error),
            }
            self.store.upsert("run_of_show_jobs", failed)
            return {"job": failed, "artifact": None}

    def render_audio(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider")) or ElevenLabsTTSProvider.provider_id
        provider = self.audio_render_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown audio render provider '{provider_id}'.")
        attachments = normalize_attachment_links(payload, context)
        job = build_audio_render_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.get("title")) or "Audio Render Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("audio_render_jobs", job)
        return self._process_audio_render_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

    def _process_audio_render_job(
        self,
        provider: BaseAudioRenderProvider,
        job: dict[str, Any],
        payload: dict[str, Any],
        *,
        tenant_id: str | None,
        attachments: list[dict[str, Any]],
    ) -> dict[str, Any]:
        started = {**job, "status": "processing", "started_at": utcnow_iso()}
        self.store.upsert("audio_render_jobs", started)
        linked_id = f"audio-render-{job['id']}"
        try:
            result = provider.renderAudio(started, payload)
            assets: list[dict[str, Any]] = []
            for asset_payload in result.get("assets") or []:
                asset = build_media_asset(
                    tenant_id=tenant_id,
                    provider=provider.provider_id,
                    asset_type=clean_text(asset_payload.get("asset_type")) or "audio_render",
                    media_type=clean_text(asset_payload.get("media_type")) or "audio",
                    title=clean_text(asset_payload.get("title")) or clean_text(started.get("title")) or "Audio Asset",
                    source="audio_render",
                    stage="final",
                    linked_id=linked_id,
                    source_url=clean_text(asset_payload.get("source_url")) or None,
                    metadata=asset_payload.get("metadata") if isinstance(asset_payload.get("metadata"), dict) else {},
                    attachments=attachments,
                )
                assets.append(self.store.upsert_asset(asset, deduplicate=True))
            completed = {
                **started,
                "status": "complete",
                "completed_at": utcnow_iso(),
                "output_asset_ids": [asset["id"] for asset in assets],
                "result": {"message": result.get("message"), "asset_count": len(assets)},
                "last_error": None,
            }
            self.store.upsert("audio_render_jobs", completed)
            return {"job": completed, "assets": assets}
        except Exception as error:
            failed = {
                **started,
                "status": "failed",
                "completed_at": utcnow_iso(),
                "last_error": str(error),
            }
            self.store.upsert("audio_render_jobs", failed)
            return {"job": failed, "assets": []}

    def publish_asset(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        attachments = normalize_attachment_links(payload, context)
        publish_target = clean_text(payload.get("publish_target") or payload.get("publishTarget"))
        asset_ids = [clean_text(item) for item in (payload.get("asset_ids") or []) if clean_text(item)]
        artifact_ids = [clean_text(item) for item in (payload.get("artifact_ids") or []) if clean_text(item)]
        job = build_publish_job(
            tenant_id=tenant_id,
            title=clean_text(payload.get("title")) or "Publish Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("publish_jobs", job)
        started = {**job, "status": "processing", "started_at": utcnow_iso()}
        self.store.upsert("publish_jobs", started)
        try:
            if not publish_target:
                raise ValueError("Publish target is missing.")
            if not asset_ids and not artifact_ids:
                raise ValueError("Publish Asset requires a source asset or artifact.")
            artifact = build_publish_artifact(
                tenant_id=tenant_id,
                title=clean_text(payload.get("title")) or "Published Asset",
                publish_target=publish_target,
                attachments=attachments,
                source_asset_ids=asset_ids,
                source_artifact_ids=artifact_ids,
            )
            stored_artifact = self.store.upsert("publish_artifacts", artifact)
            completed = {
                **started,
                "status": "complete",
                "completed_at": utcnow_iso(),
                "artifact_id": stored_artifact["id"],
                "result": {"message": "Asset publication tracked in the media workflow layer."},
                "last_error": None,
            }
            self.store.upsert("publish_jobs", completed)
            return {"job": completed, "artifact": stored_artifact}
        except Exception as error:
            failed = {
                **started,
                "status": "failed",
                "completed_at": utcnow_iso(),
                "last_error": str(error),
            }
            self.store.upsert("publish_jobs", failed)
            return {"job": failed, "artifact": None}

    def render_media(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider")) or RemotionLocalRenderProvider.provider_id
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
