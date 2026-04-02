from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import wave
import zipfile
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


TRANSCRIPTION_PROVIDER_LOCK_FFMPEG = "ffmpeg_transcribe"
TRANSCRIPTION_PROVIDER_LOCK_ELEVENLABS = "elevenlabs_scribe"
TRANSCRIPTION_PROVIDER_LOCK_DISABLED = "disabled"
LEGACY_TRANSCRIPTION_PROVIDER_AWS = "aws_transcribe"
TRANSCRIPTION_PROVIDER_BACKEND_FFMPEG = "ffmpeg_transcribe"
TRANSCRIPTION_PROVIDER_BACKEND_ELEVENLABS = "elevenlabs_scribe"
VOSK_DEFAULT_MODEL_NAME = "vosk-model-small-en-us-0.15"
VOSK_DEFAULT_MODEL_URL = f"https://alphacephei.com/vosk/models/{VOSK_DEFAULT_MODEL_NAME}.zip"
_VOSK_MODEL_CACHE: Any | None = None
_VOSK_MODEL_CACHE_LOCK = Lock()


def normalize_transcription_provider_lock(value: Any) -> str:
    normalized = clean_text(value).lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "primary": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "default": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "internal": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "ffmpeg": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "ffmpeg_transcribe": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "remotion": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "remotion_ffmpeg": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "aws": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "aws_transcribe": TRANSCRIPTION_PROVIDER_LOCK_FFMPEG,
        "elevenlabs": TRANSCRIPTION_PROVIDER_LOCK_ELEVENLABS,
        "eleven_labs": TRANSCRIPTION_PROVIDER_LOCK_ELEVENLABS,
        "elevenlabs_scribe": TRANSCRIPTION_PROVIDER_LOCK_ELEVENLABS,
        "disabled": TRANSCRIPTION_PROVIDER_LOCK_DISABLED,
        "off": TRANSCRIPTION_PROVIDER_LOCK_DISABLED,
        "none": TRANSCRIPTION_PROVIDER_LOCK_DISABLED,
    }
    return aliases.get(normalized, TRANSCRIPTION_PROVIDER_LOCK_FFMPEG)


def transcription_provider_lock_label(value: Any) -> str:
    normalized = normalize_transcription_provider_lock(value)
    if normalized == TRANSCRIPTION_PROVIDER_LOCK_ELEVENLABS:
        return "elevenlabs"
    if normalized == TRANSCRIPTION_PROVIDER_LOCK_DISABLED:
        return "disabled"
    return "ffmpeg_transcribe"


def get_transcription_provider_lock(tenant_settings: dict[str, Any] | None) -> str:
    media = tenant_settings.get("media") if isinstance(tenant_settings, dict) and isinstance(tenant_settings.get("media"), dict) else {}
    return normalize_transcription_provider_lock(media.get("transcriptionProvider"))


def resolve_transcription_provider_id_from_lock(value: Any) -> str | None:
    normalized = normalize_transcription_provider_lock(value)
    if normalized == TRANSCRIPTION_PROVIDER_LOCK_DISABLED:
        return None
    if normalized == TRANSCRIPTION_PROVIDER_LOCK_ELEVENLABS:
        return TRANSCRIPTION_PROVIDER_BACKEND_ELEVENLABS
    return TRANSCRIPTION_PROVIDER_BACKEND_FFMPEG


def normalize_media_type_hint(*values: Any) -> str:
    hints = [clean_text(value).lower() for value in values if clean_text(value)]
    for hint in hints:
        if hint.startswith("audio/"):
            return "audio"
        if hint.startswith("video/"):
            return "video"
        if hint.startswith("image/"):
            return "image"
    image_hints = {
        "image",
        "jpg",
        "jpeg",
        "png",
        "gif",
        "bmp",
        "webp",
        "svg",
        "svg+xml",
        "tif",
        "tiff",
        "heic",
        "heif",
    }
    audio_hints = {
        "audio",
        "wav",
        "wave",
        "x-wav",
        "mp3",
        "mpeg",
        "m4a",
        "aac",
        "ogg",
        "oga",
        "opus",
        "flac",
        "aiff",
        "aif",
        "wma",
    }
    video_hints = {
        "video",
        "mp4",
        "mov",
        "m4v",
        "avi",
        "mkv",
        "webm",
        "wmv",
        "mpeg4",
        "quicktime",
    }
    for hint in hints:
        normalized = hint.replace(".", "").replace("_", "-").replace("/", "-")
        if normalized in image_hints or normalized.endswith("-image"):
            return "image"
        if normalized in audio_hints or normalized.endswith("-audio"):
            return "audio"
        if normalized in video_hints or normalized.endswith("-video"):
            return "video"
    return "video"


def classify_uploaded_media(*values: Any) -> str:
    return normalize_media_type_hint(*values)


def clone_json(value: Any) -> Any:
    return json.loads(json.dumps(value))


def generate_content_hash(content: Any) -> str:
    normalized = json.dumps(content, sort_keys=True, default=str)
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def normalize_dedup_url(value: Any) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    parsed = urllib.parse.urlparse(raw)
    if not parsed.scheme and not parsed.netloc:
        return raw
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()
    if scheme == "http" and netloc.endswith(":80"):
        netloc = netloc[:-3]
    if scheme == "https" and netloc.endswith(":443"):
        netloc = netloc[:-4]
    path = parsed.path or ""
    query_items = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    normalized_query = urllib.parse.urlencode(sorted(query_items))
    return urllib.parse.urlunparse((scheme, netloc, path, "", normalized_query, ""))


def build_upload_dedup_hash(filename: str, payload: bytes, content_type: str | None = None) -> str:
    safe_name = Path(clean_text(filename) or "upload.bin").name.lower()
    first_chunk_hash = hashlib.sha256((payload or b"")[:65536]).hexdigest()[:16]
    return generate_content_hash(
        {
            "filename": safe_name,
            "size_bytes": len(payload or b""),
            "content_type": clean_text(content_type).lower(),
            "first_chunk_hash": first_chunk_hash,
        }
    )


def _backend_root() -> Path:
    return Path(__file__).resolve().parent


def _resolve_local_media_path(source_url: str) -> Path | None:
    if not clean_text(source_url):
        return None
    candidate = Path(source_url)
    if candidate.exists():
        return candidate
    backend_root = _backend_root()
    if source_url.startswith("/api/media/video/"):
        filename = source_url.split("/api/media/video/")[-1]
        resolved = backend_root / "data" / "video" / filename
        return resolved if resolved.exists() else None
    if source_url.startswith("/api/media/audio/"):
        filename = source_url.split("/api/media/audio/")[-1]
        resolved = backend_root / "data" / "audio" / filename
        return resolved if resolved.exists() else None
    if source_url.startswith("/api/media/image/"):
        filename = source_url.split("/api/media/image/")[-1]
        resolved = backend_root / "data" / "image" / filename
        return resolved if resolved.exists() else None
    return None


def resolve_local_media_path(source_url: str) -> Path | None:
    return _resolve_local_media_path(source_url)


def _resolve_media_binary_path(env_var: str, unavailable_reason: str, *, fallback_to_ffmpeg_sibling: bool = False) -> Path:
    configured = clean_text(os.getenv(env_var)).strip('"')
    if configured:
        candidate = Path(configured)
        if candidate.exists() and candidate.is_file():
            return candidate
        raise ValueError(f"{unavailable_reason}: {env_var} does not point to a valid binary.")
    if fallback_to_ffmpeg_sibling:
        ffmpeg_configured = clean_text(os.getenv("FFMPEG_PATH")).strip('"')
        if not ffmpeg_configured:
            raise ValueError(f"{unavailable_reason}: {env_var} is not configured and FFMPEG_PATH is not configured.")
        ffmpeg_candidate = Path(ffmpeg_configured)
        if not ffmpeg_candidate.exists() or not ffmpeg_candidate.is_file():
            raise ValueError(f"{unavailable_reason}: FFMPEG_PATH does not point to a valid ffmpeg binary.")
        sibling_name = "ffprobe.exe" if ffmpeg_candidate.suffix.lower() == ".exe" else "ffprobe"
        sibling_candidate = ffmpeg_candidate.with_name(sibling_name)
        if sibling_candidate.exists() and sibling_candidate.is_file():
            return sibling_candidate
        raise ValueError(f"{unavailable_reason}: FFPROBE_PATH is not configured and no sibling ffprobe binary was found next to FFMPEG_PATH.")
    raise ValueError(f"{unavailable_reason}: {env_var} is not configured.")


def resolve_ffmpeg_path() -> Path:
    return _resolve_media_binary_path("FFMPEG_PATH", "ffmpeg_not_available")


def resolve_ffprobe_path() -> Path:
    return _resolve_media_binary_path("FFPROBE_PATH", "ffprobe_not_available", fallback_to_ffmpeg_sibling=True)


def _download_media_source(source_url: str, destination: Path) -> None:
    request = urllib.request.Request(
        source_url,
        headers={"User-Agent": "AIOCRM/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as handle:
            shutil.copyfileobj(response, handle)
    except urllib.error.HTTPError as error:
        raise ValueError(f"ffmpeg_failed: Unable to download source media ({error.code} {error.reason}).") from error
    except urllib.error.URLError as error:
        raise ValueError(f"ffmpeg_failed: Unable to download source media ({error.reason}).") from error
    except Exception as error:
        raise ValueError(f"ffmpeg_failed: Unable to download source media ({error}).") from error


def _prepare_audio_for_transcription(source_url: str) -> dict[str, str]:
    normalized_source_url = clean_text(source_url)
    if not normalized_source_url:
        raise ValueError("missing_source: source_url is required for FFmpeg media preparation.")
    ffmpeg_path = resolve_ffmpeg_path()
    temp_dir = Path(tempfile.mkdtemp(prefix="aio-transcribe-"))
    local_input_path = _resolve_local_media_path(normalized_source_url)
    working_input_path: Path
    if local_input_path:
        working_input_path = local_input_path
    else:
        parsed = urllib.parse.urlparse(normalized_source_url)
        suffix = Path(parsed.path).suffix or ".bin"
        working_input_path = temp_dir / f"input{suffix}"
        _download_media_source(normalized_source_url, working_input_path)
    output_path = temp_dir / "normalized-audio.wav"
    command = [
        str(ffmpeg_path),
        "-y",
        "-i",
        str(working_input_path),
        "-map_metadata",
        "-1",
        "-fflags",
        "+bitexact",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-flags:a",
        "+bitexact",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        str(output_path),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=180,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError("ffmpeg_failed: FFmpeg timed out while preparing audio.") from error
    except Exception as error:
        raise ValueError(f"ffmpeg_failed: FFmpeg could not be started ({error}).") from error
    if result.returncode != 0:
        details = clean_text(result.stderr or result.stdout) or "Unknown FFmpeg failure."
        raise ValueError(f"ffmpeg_failed: {details}")
    if not output_path.exists() or output_path.stat().st_size <= 0:
        raise ValueError("ffmpeg_failed: FFmpeg did not produce a usable audio file.")
    return {
        "prepared_audio_path": str(output_path),
        "cleanup_dir": str(temp_dir),
    }


def _resolve_local_stt_shell() -> str:
    for candidate in ("powershell", "pwsh"):
        resolved = shutil.which(candidate)
        if resolved:
            return resolved
    raise ValueError("transcription_failed: No local PowerShell runtime is available for ffmpeg_transcribe.")


def _download_file(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "AIOCRM/ffmpeg_transcribe"})
    with urllib.request.urlopen(request, timeout=300) as response, destination.open("wb") as output_stream:
        shutil.copyfileobj(response, output_stream)


def _resolve_vosk_model_path() -> Path:
    configured_path = clean_text(os.getenv("VOSK_MODEL_PATH"))
    if configured_path:
        candidate = Path(configured_path).expanduser()
        if candidate.exists() and candidate.is_dir():
            return candidate
        raise ValueError("transcription_failed: VOSK_MODEL_PATH does not point to a valid model directory.")

    model_root = Path(__file__).resolve().parent / "data" / "models"
    model_root.mkdir(parents=True, exist_ok=True)
    target_dir = model_root / VOSK_DEFAULT_MODEL_NAME
    if target_dir.exists() and target_dir.is_dir():
        return target_dir

    archive_path = model_root / f"{VOSK_DEFAULT_MODEL_NAME}.zip"
    download_url = clean_text(os.getenv("VOSK_MODEL_URL")) or VOSK_DEFAULT_MODEL_URL
    if not archive_path.exists():
        try:
            _download_file(download_url, archive_path)
        except Exception as error:
            raise ValueError(f"transcription_failed: Local Vosk model is unavailable and could not be downloaded ({error}).") from error
    try:
        with zipfile.ZipFile(archive_path, "r") as archive:
            archive.extractall(model_root)
    except Exception as error:
        raise ValueError(f"transcription_failed: Local Vosk model archive could not be extracted ({error}).") from error
    if target_dir.exists() and target_dir.is_dir():
        return target_dir
    raise ValueError("transcription_failed: Local Vosk model directory is missing after extraction.")


def _get_vosk_model() -> Any:
    global _VOSK_MODEL_CACHE
    with _VOSK_MODEL_CACHE_LOCK:
        if _VOSK_MODEL_CACHE is not None:
            return _VOSK_MODEL_CACHE
        try:
            from vosk import Model, SetLogLevel
        except Exception as error:
            raise ValueError(f"transcription_failed: Local Vosk runtime is unavailable ({error}).") from error
        model_path = _resolve_vosk_model_path()
        try:
            SetLogLevel(-1)
        except Exception:
            pass
        try:
            _VOSK_MODEL_CACHE = Model(str(model_path))
        except Exception as error:
            raise ValueError(f"transcription_failed: Local Vosk model could not be loaded ({error}).") from error
        return _VOSK_MODEL_CACHE


def _collect_vosk_segment(chunk: dict[str, Any]) -> dict[str, Any] | None:
    text = clean_text(chunk.get("text"))
    words = chunk.get("result") if isinstance(chunk.get("result"), list) else []
    if not text:
        return None
    start = words[0].get("start") if words and isinstance(words[0], dict) else None
    end = words[-1].get("end") if words and isinstance(words[-1], dict) else None
    confidence_values = [float(item.get("conf")) for item in words if isinstance(item, dict) and item.get("conf") is not None]
    confidence = round(sum(confidence_values) / len(confidence_values), 4) if confidence_values else None
    return {
        "start": start,
        "end": end,
        "speaker": "Speaker A",
        "text": text,
        "confidence": confidence,
    }


def _transcribe_with_vosk(prepared_audio_path: str) -> dict[str, Any]:
    audio_path = Path(clean_text(prepared_audio_path))
    if not audio_path.exists() or not audio_path.is_file():
        raise ValueError("ffmpeg_failed: Prepared audio file is missing before local transcription.")
    try:
        from vosk import KaldiRecognizer
    except Exception as error:
        raise ValueError(f"transcription_failed: Local Vosk runtime is unavailable ({error}).") from error
    model = _get_vosk_model()
    transcript_chunks: list[str] = []
    segments: list[dict[str, Any]] = []
    try:
        with wave.open(str(audio_path), "rb") as wav_file:
            recognizer = KaldiRecognizer(model, wav_file.getframerate())
            recognizer.SetWords(True)
            while True:
                data = wav_file.readframes(4000)
                if not data:
                    break
                if recognizer.AcceptWaveform(data):
                    chunk = json.loads(recognizer.Result() or "{}")
                    segment = _collect_vosk_segment(chunk)
                    if segment:
                        transcript_chunks.append(segment["text"])
                        segments.append(segment)
            final_chunk = json.loads(recognizer.FinalResult() or "{}")
            final_segment = _collect_vosk_segment(final_chunk)
            if final_segment:
                transcript_chunks.append(final_segment["text"])
                segments.append(final_segment)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError(f"transcription_failed: Local Vosk transcription failed ({error}).") from error
    transcript_text = clean_text(" ".join(transcript_chunks))
    if not transcript_text:
        raise ValueError("transcription_failed: Local ffmpeg_transcribe could not detect speech in the prepared audio.")
    normalized_segments = normalize_speaker_segments(segments)
    timestamps = [
        {"start": item.get("start"), "end": item.get("end"), "speaker": item.get("speaker")}
        for item in normalized_segments
    ]
    return {
        "transcript_text": transcript_text,
        "speaker_segments": normalized_segments,
        "timestamps": timestamps,
        "message": "Transcript generated by local ffmpeg_transcribe.",
    }


def _transcribe_with_windows_speech(prepared_audio_path: str) -> dict[str, Any]:
    audio_path = Path(clean_text(prepared_audio_path))
    if not audio_path.exists() or not audio_path.is_file():
        raise ValueError("ffmpeg_failed: Prepared audio file is missing before local transcription.")

    powershell_path = _resolve_local_stt_shell()
    script = r"""
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Speech
$audioPath = $env:AIOCRM_TRANSCRIBE_AUDIO_PATH
if ([string]::IsNullOrWhiteSpace($audioPath) -or -not (Test-Path $audioPath)) {
  throw 'Prepared audio path is missing.'
}
$recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | Select-Object -First 1
$engine = $null
try {
  if ($null -ne $recognizerInfo) {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizerInfo)
  } else {
    $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine
  }
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.SetInputToWaveFile($audioPath)
  $segments = @()
  $full = @()
  while ($true) {
    $result = $engine.Recognize()
    if ($null -eq $result) { break }
    $text = "$($result.Text)".Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { continue }
    $start = $null
    $end = $null
    if ($null -ne $result.Audio) {
      $start = [math]::Round($result.Audio.AudioPosition.TotalSeconds, 3)
      $end = [math]::Round(($result.Audio.AudioPosition + $result.Audio.Duration).TotalSeconds, 3)
    }
    $full += $text
    $segments += [pscustomobject]@{
      start = $start
      end = $end
      speaker = 'Speaker A'
      text = $text
      confidence = [math]::Round([double]$result.Confidence, 4)
    }
  }
  $timestamps = @($segments | ForEach-Object {
    [pscustomobject]@{
      start = $_.start
      end = $_.end
      speaker = $_.speaker
    }
  })
  [pscustomobject]@{
    transcript_text = (($full -join ' ').Trim())
    speaker_segments = $segments
    timestamps = $timestamps
    message = 'Transcript generated by Windows Speech.'
  } | ConvertTo-Json -Compress -Depth 6
}
finally {
  if ($null -ne $engine) {
    $engine.Dispose()
  }
}
"""
    encoded_script = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    environment = os.environ.copy()
    environment["AIOCRM_TRANSCRIBE_AUDIO_PATH"] = str(audio_path)
    try:
        result = subprocess.run(
            [powershell_path, "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded_script],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
            timeout=300,
            env=environment,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError("transcription_failed: Windows Speech transcription timed out.") from error
    except Exception as error:
        raise ValueError(f"transcription_failed: Windows Speech transcription could not be started ({error}).") from error

    if result.returncode != 0:
        details = clean_text(result.stderr or result.stdout) or "Windows Speech transcription failed."
        raise ValueError(f"transcription_failed: {details}")

    payload = json.loads(result.stdout or "{}")
    transcript_text = clean_text(payload.get("transcript_text"))
    speaker_segments = normalize_speaker_segments(payload.get("speaker_segments"))
    timestamps = payload.get("timestamps") if isinstance(payload.get("timestamps"), list) else []
    if not transcript_text and not speaker_segments:
        raise ValueError("transcription_failed: Windows Speech returned no transcript text.")
    if not transcript_text and speaker_segments:
        transcript_text = " ".join(clean_text(segment.get("text")) for segment in speaker_segments if clean_text(segment.get("text"))).strip()
    return {
        "transcript_text": transcript_text,
        "speaker_segments": speaker_segments,
        "timestamps": timestamps,
        "message": clean_text(payload.get("message")) or "Transcript generated by ffmpeg_transcribe.",
    }


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
    metadata = metadata if isinstance(metadata, dict) else {}
    source_url_value = clean_text(source_url)
    source_suffix = Path(urllib.parse.urlparse(source_url_value).path).suffix if source_url_value else ""
    normalized_media_type = normalize_media_type_hint(
        media_type,
        source_suffix,
        metadata.get("mime_type"),
        metadata.get("mimeType"),
        metadata.get("content_type"),
        metadata.get("contentType"),
    )

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
        "media_type": normalized_media_type,
        "title": title or "Media Asset",
        "source": source,
        "stage": stage,
        "linked_id": linked_id,
        "source_url": source_url_value or None,
        "metadata": clone_json(metadata),
        "attachments": clone_json(attachments or []),
        "content_hash": content_hash,
        "created_at": now,
        "updated_at": now,
    }

    if not content_hash and source_url_value:
        asset["content_hash"] = generate_content_hash({"url": source_url_value, "type": asset_type})

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

    def _same_tenant(self, left: dict[str, Any], right: dict[str, Any]) -> bool:
        return clean_text(left.get("tenant_id")) == clean_text(right.get("tenant_id"))

    def _provider_source_key(self, asset: dict[str, Any]) -> tuple[str, str] | None:
        metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
        provider = clean_text(asset.get("provider")).lower()
        source_id = clean_text(
            metadata.get("recording_id")
            or metadata.get("drive_file_id")
            or metadata.get("provider_asset_id")
            or metadata.get("providerAssetId")
            or metadata.get("source_id")
            or metadata.get("sourceId")
        )
        if provider and source_id:
            return provider, source_id
        return None

    def _upload_fingerprint(self, asset: dict[str, Any]) -> tuple[str, str, str] | None:
        metadata = asset.get("metadata") if isinstance(asset.get("metadata"), dict) else {}
        filename = clean_text(metadata.get("original_filename")).lower()
        size_bytes = clean_text(metadata.get("size_bytes") or metadata.get("sizeBytes"))
        content_hash = clean_text(asset.get("content_hash"))
        if filename and size_bytes and content_hash:
            return filename, size_bytes, content_hash
        return None

    def _find_duplicate_asset(self, rows: list[dict[str, Any]], payload: dict[str, Any]) -> dict[str, Any] | None:
        payload_content_hash = clean_text(payload.get("content_hash"))
        payload_url = normalize_dedup_url(payload.get("source_url"))
        payload_provider_source = self._provider_source_key(payload)
        payload_upload_fingerprint = self._upload_fingerprint(payload)

        for existing in rows:
            if not self._same_tenant(existing, payload):
                continue
            existing_content_hash = clean_text(existing.get("content_hash"))
            if payload_content_hash and existing_content_hash == payload_content_hash:
                return clone_json(existing)
            if payload_provider_source and self._provider_source_key(existing) == payload_provider_source:
                return clone_json(existing)
            if payload_url and normalize_dedup_url(existing.get("source_url")) == payload_url:
                return clone_json(existing)
            if payload_upload_fingerprint and self._upload_fingerprint(existing) == payload_upload_fingerprint:
                return clone_json(existing)
        return None

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
                duplicate = self._find_duplicate_asset(rows, payload)
                if duplicate:
                    return duplicate
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

    def get(self, collection: str, record_id: str) -> dict[str, Any] | None:
        with self._lock:
            state = self._read_state()
            for record in state.get(collection) or []:
                if clean_text(record.get("id")) == clean_text(record_id):
                    return clone_json(record)
        return None

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

    def _upload_audio_file(self, upload_url: str, headers: dict[str, str], audio_path: str, prompt: str) -> str:
        file_path = Path(audio_path)
        if not file_path.exists():
            raise ValueError(f"Prepared audio file '{audio_path}' is missing.")
        boundary = f"----AIOCRM{uuid4().hex}"
        mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        file_bytes = file_path.read_bytes()
        body = b"".join(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode("utf-8"),
                f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
                file_bytes,
                b"\r\n",
                f"--{boundary}--\r\n".encode("utf-8"),
            ]
        )
        request = urllib.request.Request(
            f"{upload_url}?prompt={urllib.parse.quote(prompt or '')}",
            data=body,
            headers={
                **headers,
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Content-Length": str(len(body)),
            },
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = json.loads(response.read().decode())
            return clean_text(payload.get("audio_id"))

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
        prepared_audio_path = clean_text(payload.get("prepared_audio_path") or payload.get("preparedAudioPath"))
        if prepared_audio_path and not Path(prepared_audio_path).exists():
            raise ValueError("ffmpeg_failed: Prepared audio file is missing before transcription handoff.")
        if not audio_url:
            raise ValueError("ElevenLabs Scribe requires source_url for live transcription.")

        request_id = job.get("id", "transcribe")

        upload_url = f"{self.BASE_URL}/v1/scribe/upload"
        headers = {
            "xi-api-key": apiKey,
        }
        
        try:
            if prepared_audio_path:
                audio_id = self._upload_audio_file(upload_url, headers, prepared_audio_path, clean_text(payload.get("prompt")))
            else:
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


class FfmpegTranscribeProvider(BaseTranscriptionProvider):
    provider_id = "ffmpeg_transcribe"

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
        prepared_audio_path = clean_text(payload.get("prepared_audio_path") or payload.get("preparedAudioPath"))
        if not prepared_audio_path:
            raise ValueError("missing_source: Prepared audio path is required for ffmpeg_transcribe.")
        return _transcribe_with_vosk(prepared_audio_path)


class ZoomMeetingIngestionProvider(BaseMeetingIngestionProvider):
    provider_id = "zoom"

    def ingestMeetingArtifacts(self, payload: dict[str, Any]) -> dict[str, Any]:
        recordings = payload.get("recordingFiles") or payload.get("recording_files") or payload.get("recordings") or []
        transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
        transcript_text = clean_text(payload.get("transcript_text") or transcript.get("text") or transcript.get("transcript_text"))
        speaker_segments = normalize_speaker_segments(payload.get("speaker_segments") or transcript.get("speaker_segments") or transcript.get("segments"))
        return {
            "provider": self.provider_id,
            "meeting": {
                "meeting_id": clean_text(payload.get("meetingId") or payload.get("meeting_id") or payload.get("id")),
                "title": clean_text(payload.get("meetingTitle") or payload.get("meeting_title") or payload.get("title") or "Zoom Meeting"),
                "started_at": payload.get("started_at") or payload.get("start_time"),
            },
            "assets": [
                {
                    "asset_type": "meeting_recording",
                    "media_type": normalize_media_type_hint(
                        item.get("media_type"),
                        item.get("mime_type"),
                        item.get("mimeType"),
                        item.get("file_type"),
                        item.get("fileType"),
                        Path(clean_text(item.get("url") or item.get("downloadUrl") or item.get("download_url"))).suffix,
                    ),
                    "title": clean_text(item.get("title") or item.get("file_name") or "Zoom Recording"),
                    "source_url": clean_text(item.get("url") or item.get("downloadUrl") or item.get("download_url")),
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
                    "media_type": normalize_media_type_hint(
                        item.get("media_type"),
                        item.get("mime_type"),
                        item.get("mimeType"),
                        item.get("file_type"),
                        item.get("fileType"),
                        Path(clean_text(item.get("url") or item.get("webViewLink") or item.get("downloadUrl"))).suffix,
                    ),
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
            FfmpegTranscribeProvider.provider_id: FfmpegTranscribeProvider(),
            # Legacy alias only. New settings and active routing must use ffmpeg_transcribe.
            LEGACY_TRANSCRIPTION_PROVIDER_AWS: FfmpegTranscribeProvider(),
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

    def get_asset(self, asset_id: str) -> dict[str, Any] | None:
        return self.store.get("assets", asset_id)

    def get_assets_by_pipeline(self, pipeline_type: str, pipeline_id: str) -> list[dict[str, Any]]:
        return self.store.get_assets_by_linked_id(f"{pipeline_type}-{pipeline_id}")

    def get_assets_by_run(self, run_id: str) -> list[dict[str, Any]]:
        return self.get_assets_by_pipeline("flow-run", run_id)

    def get_assets_by_flow(self, flow_id: str) -> list[dict[str, Any]]:
        return self.get_assets_by_pipeline("flow", flow_id)

    def upload_local_media(
        self,
        *,
        file_bytes: bytes,
        filename: str,
        content_type: str | None = None,
        tenant_id: str | None = None,
        title: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        safe_name = Path(clean_text(filename) or "upload.bin").name
        if not safe_name:
            raise ValueError("Uploaded file must include a filename.")
        payload = file_bytes or b""
        if not payload:
            raise ValueError("Uploaded file is empty.")

        guessed_content_type, _ = mimetypes.guess_type(safe_name)
        media_type = classify_uploaded_media(content_type, guessed_content_type, Path(safe_name).suffix)
        if media_type == "audio":
            storage_dir = _backend_root() / "data" / "audio"
            source_prefix = "/api/media/audio"
        elif media_type == "image":
            storage_dir = _backend_root() / "data" / "image"
            source_prefix = "/api/media/image"
        else:
            storage_dir = _backend_root() / "data" / "video"
            source_prefix = "/api/media/video"

        storage_dir.mkdir(parents=True, exist_ok=True)
        suffix = Path(safe_name).suffix or (
            mimetypes.guess_extension(content_type or "") or ".bin"
        )
        stored_filename = f"{uuid4().hex}{suffix.lower()}"
        storage_path = storage_dir / stored_filename
        storage_path.write_bytes(payload)

        dedup_hash = build_upload_dedup_hash(safe_name, payload, content_type or guessed_content_type)

        asset = build_media_asset(
            tenant_id=tenant_id,
            provider="local_upload",
            asset_type="uploaded_file",
            media_type=media_type,
            title=clean_text(title) or Path(safe_name).stem or "Uploaded File",
            source="upload",
            stage="final",
            source_url=f"{source_prefix}/{stored_filename}",
            metadata={
                "original_filename": safe_name,
                "mime_type": clean_text(content_type) or clean_text(guessed_content_type) or None,
                "size_bytes": len(payload),
            },
            attachments=normalize_attachment_links({}, context),
            content_hash=dedup_hash,
        )
        persisted = self.store.upsert_asset(asset, deduplicate=True)
        if clean_text(persisted.get("id")) != clean_text(asset.get("id")) and storage_path.exists():
            storage_path.unlink(missing_ok=True)
        return {
            "asset": persisted,
            "deduplicated": clean_text(persisted.get("id")) != clean_text(asset.get("id")),
        }

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
                    source="render",
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
        source_asset_ids = [clean_text(item) for item in (payload.get("source_asset_ids") or payload.get("sourceAssetIds") or []) if clean_text(item)]
        single_asset_id = clean_text(payload.get("asset_id") or payload.get("assetId"))
        if single_asset_id and single_asset_id not in source_asset_ids:
            source_asset_ids.append(single_asset_id)
        attachments = normalize_attachment_links(payload, context)
        job = build_transcript_job(
            tenant_id=tenant_id,
            provider=provider_id,
            title=clean_text(payload.get("title")) or "Transcript Job",
            input_payload=payload,
            attachments=attachments,
        )
        self.store.upsert("transcript_jobs", job)
        return self._process_transcript_job(
            provider,
            job,
            payload,
            tenant_id=tenant_id,
            attachments=attachments,
            source_asset_ids=source_asset_ids or None,
        )

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
        cleanup_dir = None
        try:
            provider_payload = clone_json(payload)
            asset_id = clean_text(provider_payload.get("asset_id") or provider_payload.get("assetId"))
            source_asset_ids_value = provider_payload.get("source_asset_ids") or provider_payload.get("sourceAssetIds") or []
            has_source_asset_ids = any(clean_text(item) for item in source_asset_ids_value) if isinstance(source_asset_ids_value, list) else False
            has_inline_transcript = bool(clean_text(provider_payload.get("transcript_text")) or normalize_speaker_segments(provider_payload.get("speaker_segments")))
            if (asset_id or has_source_asset_ids) and not has_inline_transcript:
                prepared_audio = _prepare_audio_for_transcription(clean_text(provider_payload.get("source_url") or provider_payload.get("sourceUrl")))
                cleanup_dir = prepared_audio.get("cleanup_dir")
                provider_payload["prepared_audio_path"] = prepared_audio.get("prepared_audio_path")
                provider_payload["preparedAudioPath"] = prepared_audio.get("prepared_audio_path")
            result = provider.transcribeMedia(started, provider_payload)
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
        finally:
            if cleanup_dir:
                shutil.rmtree(cleanup_dir, ignore_errors=True)

    def ingest_meeting_artifacts(self, payload: dict[str, Any], *, tenant_id: str | None = None, context: dict[str, Any] | None = None) -> dict[str, Any]:
        provider_id = clean_text(payload.get("provider") or payload.get("source")) or ZoomMeetingIngestionProvider.provider_id
        provider = self.ingestion_providers.get(provider_id)
        if not provider:
            raise ValueError(f"Unknown meeting ingestion provider '{provider_id}'.")
        normalized = provider.ingestMeetingArtifacts(payload)
        attachments = normalize_attachment_links(payload, context)
        assets: list[dict[str, Any]] = []
        deduplicated_asset_ids: list[str] = []
        for asset_payload in normalized.get("assets") or []:
            source_url = clean_text(asset_payload.get("source_url")) or None
            asset_metadata = {
                **(asset_payload.get("metadata") if isinstance(asset_payload.get("metadata"), dict) else {}),
                "meeting": clone_json(normalized.get("meeting") or {}),
            }
            provider_source_id = clean_text(
                asset_metadata.get("recording_id")
                or asset_metadata.get("drive_file_id")
                or asset_metadata.get("provider_asset_id")
                or asset_metadata.get("providerAssetId")
                or asset_metadata.get("source_id")
                or asset_metadata.get("sourceId")
            )
            content_hash = None
            if provider_source_id:
                content_hash = generate_content_hash(
                    {
                        "provider": provider.provider_id,
                        "source_id": provider_source_id,
                        "asset_type": clean_text(asset_payload.get("asset_type")) or "meeting_recording",
                    }
                )
            elif source_url:
                content_hash = generate_content_hash(
                    {
                        "provider": provider.provider_id,
                        "url": normalize_dedup_url(source_url),
                        "asset_type": clean_text(asset_payload.get("asset_type")) or "meeting_recording",
                    }
                )
            asset = build_media_asset(
                tenant_id=tenant_id,
                provider=provider.provider_id,
                asset_type=clean_text(asset_payload.get("asset_type")) or "meeting_recording",
                media_type=clean_text(asset_payload.get("media_type")) or "video",
                title=clean_text(asset_payload.get("title")) or clean_text(normalized.get("meeting", {}).get("title")) or "Meeting Artifact",
                source="meeting_ingest",
                source_url=source_url,
                metadata=asset_metadata,
                attachments=attachments,
                content_hash=content_hash,
            )
            persisted = self.store.upsert_asset(asset, deduplicate=True)
            if clean_text(persisted.get("id")) != clean_text(asset.get("id")):
                deduplicated_asset_ids.append(clean_text(persisted.get("id")))
            assets.append(persisted)

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
            "deduplicated": bool(deduplicated_asset_ids),
            "deduplicated_asset_ids": deduplicated_asset_ids,
            "transcript_job": transcript_job,
            "transcript_artifact": transcript_artifact,
        }

    def get_job(self, job_type: str, job_id: str) -> dict[str, Any] | None:
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
            return None
        return self.store.get(collection, job_id)

    def delete_asset(self, asset_id: str) -> bool:
        return self.store.delete_asset(asset_id)

    def delete_job(self, job_type: str, job_id: str) -> bool:
        return self.store.delete_job(job_type, job_id)

    def delete_artifact(self, artifact_type: str, artifact_id: str) -> bool:
        return self.store.delete_artifact(artifact_type, artifact_id)

    def process_job(self, job_type: str, job_id: str, payload: dict[str, Any], tenant_id: str | None = None) -> dict[str, Any]:
        """Runs the actual processing logic for a job. Suitable for BackgroundTasks."""
        job = self.get_job(job_type, job_id)
        if not job:
            return {"error": "Job not found"}

        context = {} # Optional context if needed
        attachments = normalize_attachment_links(payload, context)

        if job_type == "script":
            provider_id = job.get("provider") or StubScriptProvider.provider_id
            provider = self.script_providers.get(provider_id)
            if not provider: return {"error": f"Provider {provider_id} not found"}
            return self._process_script_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

        if job_type == "run_of_show":
            provider_id = job.get("provider") or StubRunOfShowProvider.provider_id
            provider = self.run_of_show_providers.get(provider_id)
            if not provider: return {"error": f"Provider {provider_id} not found"}
            return self._process_run_of_show_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

        if job_type == "audio":
            provider_id = job.get("provider") or ElevenLabsTTSProvider.provider_id
            provider = self.audio_render_providers.get(provider_id)
            if not provider: return {"error": f"Provider {provider_id} not found"}
            return self._process_audio_render_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

        if job_type == "render":
            provider_id = job.get("provider") or RemotionLocalRenderProvider.provider_id
            provider = self.render_providers.get(provider_id)
            if not provider: return {"error": f"Provider {provider_id} not found"}
            return self._process_render_job(provider, job, payload, tenant_id=tenant_id, attachments=attachments)

        if job_type == "transcript":
            provider_id = job.get("provider") or ElevenLabsScribeTranscriptionProvider.provider_id
            provider = self.transcription_providers.get(provider_id)
            if not provider: return {"error": f"Provider {provider_id} not found"}
            source_asset_ids = [clean_text(item) for item in (payload.get("source_asset_ids") or payload.get("sourceAssetIds") or []) if clean_text(item)]
            single_asset_id = clean_text(payload.get("asset_id") or payload.get("assetId"))
            if single_asset_id and single_asset_id not in source_asset_ids:
                source_asset_ids.append(single_asset_id)
            return self._process_transcript_job(
                provider,
                job,
                payload,
                tenant_id=tenant_id,
                attachments=attachments,
                source_asset_ids=source_asset_ids or None,
            )

        return {"error": f"Unsupported job type {job_type}"}


_MEDIA_ENGINE: MediaEngine | None = None


def get_media_engine() -> MediaEngine:
    global _MEDIA_ENGINE
    if _MEDIA_ENGINE is None:
        _MEDIA_ENGINE = MediaEngine()
    return _MEDIA_ENGINE
