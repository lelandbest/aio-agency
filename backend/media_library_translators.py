from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    from backend.media_library_models import MediaLibraryItem
    from backend.request_validators import convert_to_camelcase
except ModuleNotFoundError:
    from media_library_models import MediaLibraryItem
    from request_validators import convert_to_camelcase


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_media_type(*values: Any) -> str:
    hints: list[str] = []
    for value in values:
        text = _clean_text(value).lower()
        if not text:
            continue
        hints.append(text)
        parsed_suffix = Path(urlparse(text).path).suffix.lower().lstrip(".")
        if parsed_suffix:
            hints.append(parsed_suffix)

    for hint in hints:
        if hint.startswith("audio/"):
            return "audio"
        if hint.startswith("video/"):
            return "video"
        if hint.startswith("image/"):
            return "image"
        if hint.startswith("text/") or hint in {"application/json", "application/xml"}:
            return "document"

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
    document_hints = {
        "document",
        "txt",
        "text",
        "plain",
        "json",
        "xml",
        "csv",
        "md",
        "markdown",
        "pdf",
    }

    for hint in hints:
        normalized = hint.replace(".", "").replace("_", "-").replace("/", "-")
        if normalized in image_hints or normalized.endswith("-image"):
            return "image"
        if normalized in audio_hints or normalized.endswith("-audio"):
            return "audio"
        if normalized in video_hints or normalized.endswith("-video"):
            return "video"
        if normalized in document_hints or normalized.endswith("-document"):
            return "document"
    return "video"


def _camelcase_metadata(metadata: Any) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    return convert_to_camelcase(metadata)


def _camelcase_ingest_meta(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {
            "source": "system",
            "stage": "raw",
            "original": True,
            "convertedFrom": None,
            "conversionType": None,
        }
    normalized = convert_to_camelcase(value)
    return {
        "source": _clean_text(normalized.get("source")).lower() or "system",
        "stage": _clean_text(normalized.get("stage")).lower() or "raw",
        "original": bool(normalized.get("original")),
        "convertedFrom": _clean_text(normalized.get("convertedFrom")) or None,
        "conversionType": _clean_text(normalized.get("conversionType")) or None,
    }


def _resolve_source_url(record: dict[str, Any], asset_lookup: dict[str, dict[str, Any]]) -> str | None:
    source_url = _clean_text(record.get("source_url"))
    if source_url:
        return source_url
    source_asset_ids = record.get("source_asset_ids") if isinstance(record.get("source_asset_ids"), list) else []
    for source_asset_id in source_asset_ids:
        source_asset = asset_lookup.get(_clean_text(source_asset_id))
        if not source_asset:
            continue
        resolved_source_url = _clean_text(source_asset.get("source_url"))
        if resolved_source_url:
            return resolved_source_url
    return None


def _resolve_primary_source_asset(record: dict[str, Any], asset_lookup: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    source_asset_ids = record.get("source_asset_ids") if isinstance(record.get("source_asset_ids"), list) else []
    for source_asset_id in source_asset_ids:
        source_asset = asset_lookup.get(_clean_text(source_asset_id))
        if source_asset:
            return source_asset
    return None


def _build_artifact_metadata(record: dict[str, Any], *, artifact_type: str) -> dict[str, Any]:
    metadata = _camelcase_metadata(record.get("metadata"))

    if artifact_type == "publish":
        metadata = {
            **metadata,
            "publishTarget": _clean_text(record.get("publish_target")),
            "publicationStatus": _clean_text(record.get("publication_status")) or "published",
            "sourceAssetIds": list(record.get("source_asset_ids") or []),
            "sourceArtifactIds": list(record.get("source_artifact_ids") or []),
        }

    return metadata


def _resolve_media_type(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]], source_url: str | None = None) -> str:
    metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
    source_asset = _resolve_primary_source_asset(record, asset_lookup)
    source_asset_metadata = source_asset.get("metadata") if isinstance(source_asset, dict) and isinstance(source_asset.get("metadata"), dict) else {}
    return _normalize_media_type(
        record.get("media_type"),
        record.get("mime_type"),
        metadata.get("mime_type"),
        metadata.get("mimeType"),
        source_url,
        source_asset.get("media_type") if isinstance(source_asset, dict) else None,
        source_asset.get("source_url") if isinstance(source_asset, dict) else None,
        source_asset_metadata.get("mime_type"),
        source_asset_metadata.get("mimeType"),
    )


def translate_asset_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    asset_id = _clean_text(record.get("id"))
    if not asset_id:
        return None

    source_url = _resolve_source_url(record, asset_lookup)
    media_type = _resolve_media_type(record, asset_lookup=asset_lookup, source_url=source_url)

    return MediaLibraryItem(
        assetId=asset_id,
        type="audio" if media_type == "audio" else "image" if media_type == "image" else "document" if media_type == "document" else "render",
        status=_clean_text(record.get("status")).lower() or "complete",
        sourceUrl=source_url,
        title=_clean_text(record.get("title")) or "Media Asset",
        recordKind="asset",
        artifactType=None,
        createdAt=record.get("created_at"),
        deleteType="asset",
        mediaType=media_type,
        tags=[_clean_text(tag).upper() for tag in (record.get("tags") or []) if _clean_text(tag)],
        ingestMeta=_camelcase_ingest_meta(record.get("ingest_meta")),
        metadata=_camelcase_metadata(record.get("metadata")),
    )


def translate_transcript_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    source_url = _resolve_source_url(record, asset_lookup)
    return MediaLibraryItem(
        assetId=artifact_id,
        type="transcript",
        status="complete",
        sourceUrl=source_url,
        title=_clean_text(record.get("title")) or "Transcript",
        recordKind="artifact",
        artifactType="transcript",
        createdAt=record.get("created_at"),
        deleteType="transcript",
        mediaType=_resolve_media_type(record, asset_lookup=asset_lookup, source_url=source_url),
        tags=[_clean_text(tag).upper() for tag in (record.get("tags") or []) if _clean_text(tag)],
        ingestMeta=_camelcase_ingest_meta(record.get("ingest_meta")),
        metadata=_build_artifact_metadata(record, artifact_type="transcript"),
    )


def translate_script_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    source_url = _resolve_source_url(record, asset_lookup)
    return MediaLibraryItem(
        assetId=artifact_id,
        type="script",
        status="complete",
        sourceUrl=source_url,
        title=_clean_text(record.get("title")) or "Script",
        recordKind="artifact",
        artifactType="script",
        createdAt=record.get("created_at"),
        deleteType="script",
        mediaType=_resolve_media_type(record, asset_lookup=asset_lookup, source_url=source_url),
        tags=[_clean_text(tag).upper() for tag in (record.get("tags") or []) if _clean_text(tag)],
        ingestMeta=_camelcase_ingest_meta(record.get("ingest_meta")),
        metadata=_build_artifact_metadata(record, artifact_type="script"),
    )


def translate_run_of_show_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    source_url = _resolve_source_url(record, asset_lookup)
    return MediaLibraryItem(
        assetId=artifact_id,
        type="runOfShow",
        status="complete",
        sourceUrl=source_url,
        title=_clean_text(record.get("title")) or "Run of Show",
        recordKind="artifact",
        artifactType="runOfShow",
        createdAt=record.get("created_at"),
        deleteType="run_of_show",
        mediaType=_resolve_media_type(record, asset_lookup=asset_lookup, source_url=source_url),
        tags=[_clean_text(tag).upper() for tag in (record.get("tags") or []) if _clean_text(tag)],
        ingestMeta=_camelcase_ingest_meta(record.get("ingest_meta")),
        metadata=_build_artifact_metadata(record, artifact_type="run_of_show"),
    )


def translate_publish_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    source_url = _resolve_source_url(record, asset_lookup)
    return MediaLibraryItem(
        assetId=artifact_id,
        type="publish",
        status=_clean_text(record.get("publication_status")).lower() or "published",
        sourceUrl=source_url,
        title=_clean_text(record.get("title")) or "Publish",
        recordKind="artifact",
        artifactType="publish",
        createdAt=record.get("created_at"),
        deleteType="publish",
        mediaType=_resolve_media_type(record, asset_lookup=asset_lookup, source_url=source_url),
        tags=[_clean_text(tag).upper() for tag in (record.get("tags") or []) if _clean_text(tag)],
        ingestMeta=_camelcase_ingest_meta(record.get("ingest_meta")),
        metadata=_build_artifact_metadata(record, artifact_type="publish"),
    )
