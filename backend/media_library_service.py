from __future__ import annotations

try:
    from backend.media_engine import get_media_engine
    from backend.media_library_models import MediaLibraryItem
    from backend.media_library_translators import (
        translate_asset_record,
        translate_publish_artifact_record,
        translate_run_of_show_artifact_record,
        translate_script_artifact_record,
        translate_transcript_artifact_record,
    )
except ModuleNotFoundError:
    from media_engine import get_media_engine
    from media_library_models import MediaLibraryItem
    from media_library_translators import (
        translate_asset_record,
        translate_publish_artifact_record,
        translate_run_of_show_artifact_record,
        translate_script_artifact_record,
        translate_transcript_artifact_record,
    )


def list_media_library_items() -> list[MediaLibraryItem]:
    engine = get_media_engine()
    assets = [asset for asset in engine.list_assets() if isinstance(asset, dict)]
    asset_lookup = {
        str(asset.get("id")).strip(): asset
        for asset in assets
        if str(asset.get("id") or "").strip()
    }

    items: list[MediaLibraryItem] = []

    for asset in assets:
        item = translate_asset_record(asset, asset_lookup=asset_lookup)
        if item:
            items.append(item)

    for record in engine.list_transcript_artifacts():
        if not isinstance(record, dict):
            continue
        item = translate_transcript_artifact_record(record, asset_lookup=asset_lookup)
        if item:
            items.append(item)

    for record in engine.list_script_artifacts():
        if not isinstance(record, dict):
            continue
        item = translate_script_artifact_record(record, asset_lookup=asset_lookup)
        if item:
            items.append(item)

    for record in engine.list_run_of_show_artifacts():
        if not isinstance(record, dict):
            continue
        item = translate_run_of_show_artifact_record(record, asset_lookup=asset_lookup)
        if item:
            items.append(item)

    for record in engine.list_publish_artifacts():
        if not isinstance(record, dict):
            continue
        item = translate_publish_artifact_record(record, asset_lookup=asset_lookup)
        if item:
            items.append(item)

    return sorted(items, key=lambda item: ((item.createdAt or ""), item.assetId), reverse=True)
