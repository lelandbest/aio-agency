from __future__ import annotations

from typing import Any

try:
    from backend.media_library_models import MediaLibraryItem
    from backend.request_validators import convert_to_camelcase
except ModuleNotFoundError:
    from media_library_models import MediaLibraryItem
    from request_validators import convert_to_camelcase


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _camelcase_metadata(metadata: Any) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    return convert_to_camelcase(metadata)


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


def _normalize_asset_source(record: dict[str, Any], source_url: str | None) -> str:
    raw_source = _clean_text(record.get("source")).lower()
    attachments = record.get("attachments") if isinstance(record.get("attachments"), list) else []
    normalized_url = _clean_text(source_url)

    if normalized_url.startswith("/api/media/"):
        return "generated"
    if normalized_url.startswith("http://") or normalized_url.startswith("https://"):
        return "url"
    if raw_source in {"upload", "uploaded", "file_upload", "file", "manual", "import"}:
        return "upload"
    if raw_source in {"audio_render", "render", "generated", "transcription", "meeting_ingest"}:
        return "generated"
    if any(_clean_text(item.get("type") or item.get("kind")).lower() in {"upload", "file"} for item in attachments if isinstance(item, dict)):
        return "upload"
    return "generated"


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


def translate_asset_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    asset_id = _clean_text(record.get("id"))
    if not asset_id:
        return None

    source_url = _resolve_source_url(record, asset_lookup)
    media_type = _clean_text(record.get("media_type")).lower() or "video"

    return MediaLibraryItem(
        assetId=asset_id,
        source=_normalize_asset_source(record, source_url),
        type="audio" if media_type == "audio" else "render",
        status=_clean_text(record.get("status")).lower() or "complete",
        sourceUrl=source_url,
        title=_clean_text(record.get("title")) or "Media Asset",
        recordKind="asset",
        artifactType=None,
        createdAt=record.get("created_at"),
        deleteType="asset",
        mediaType=media_type,
        metadata=_camelcase_metadata(record.get("metadata")),
    )


def translate_transcript_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    return MediaLibraryItem(
        assetId=artifact_id,
        source="generated",
        type="transcript",
        status="complete",
        sourceUrl=_resolve_source_url(record, asset_lookup),
        title=_clean_text(record.get("title")) or "Transcript",
        recordKind="artifact",
        artifactType="transcript",
        createdAt=record.get("created_at"),
        deleteType="transcript",
        mediaType="text",
        metadata=_build_artifact_metadata(record, artifact_type="transcript"),
    )


def translate_script_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    return MediaLibraryItem(
        assetId=artifact_id,
        source="generated",
        type="script",
        status="complete",
        sourceUrl=_resolve_source_url(record, asset_lookup),
        title=_clean_text(record.get("title")) or "Script",
        recordKind="artifact",
        artifactType="script",
        createdAt=record.get("created_at"),
        deleteType="script",
        mediaType="text",
        metadata=_build_artifact_metadata(record, artifact_type="script"),
    )


def translate_run_of_show_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    return MediaLibraryItem(
        assetId=artifact_id,
        source="generated",
        type="runOfShow",
        status="complete",
        sourceUrl=_resolve_source_url(record, asset_lookup),
        title=_clean_text(record.get("title")) or "Run of Show",
        recordKind="artifact",
        artifactType="runOfShow",
        createdAt=record.get("created_at"),
        deleteType="run_of_show",
        mediaType="text",
        metadata=_build_artifact_metadata(record, artifact_type="run_of_show"),
    )


def translate_publish_artifact_record(record: dict[str, Any], *, asset_lookup: dict[str, dict[str, Any]]) -> MediaLibraryItem | None:
    artifact_id = _clean_text(record.get("id"))
    if not artifact_id:
        return None

    return MediaLibraryItem(
        assetId=artifact_id,
        source="generated",
        type="publish",
        status=_clean_text(record.get("publication_status")).lower() or "published",
        sourceUrl=_resolve_source_url(record, asset_lookup),
        title=_clean_text(record.get("title")) or "Publish",
        recordKind="artifact",
        artifactType="publish",
        createdAt=record.get("created_at"),
        deleteType="publish",
        mediaType="text",
        metadata=_build_artifact_metadata(record, artifact_type="publish"),
    )
