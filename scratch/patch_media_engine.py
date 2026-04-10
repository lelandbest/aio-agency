
import sys

def patch_file(path, old, new):
    with open(path, 'r') as f:
        content = f.read()
    if old in content:
        with open(path, 'w') as f:
            f.write(content.replace(old, new))
        print(f"SUCCESS: Patched {path}")
        return True
    else:
        print(f"FAILURE: Content not found in {path}")
        return False

target = 'd:/AIOCRM/backend/media_engine.py'

# Patch 1: build_media_asset params
old1 = """    attachments: list[dict[str, Any]] | None = None,
    content_hash: str | None = None,"""
new1 = """    attachments: list[dict[str, Any]] | None = None,
    tags: list[str] | None = None,
    content_hash: str | None = None,"""
patch_file(target, old1, new1)

# Patch 2: build_media_asset dict
old2 = """        "attachments": clone_json(attachments or []),
        "content_hash": content_hash,"""
new2 = """        "attachments": clone_json(attachments or []),
        "tags": clone_json(tags or []),
        "content_hash": content_hash,"""
patch_file(target, old2, new2)

# Patch 3: upload_local_media params
old3 = """        title: str | None = None,
        context: dict[str, Any] | None = None,"""
new3 = """        title: str | None = None,
        tags: list[str] | None = None,
        context: dict[str, Any] | None = None,"""
patch_file(target, old3, new3)

# Patch 4: upload_local_media call to build
old4 = """                ingest_source="upload",
                original=True,
                metadata=asset_metadata,"""
new4 = """                ingest_source="upload",
                original=True,
                tags=tags,
                metadata=asset_metadata,"""
patch_file(target, old4, new4)

# Patch 5: ingest_meeting_artifacts call to build
old5 = """                metadata=asset_metadata,
                attachments=attachments,
                content_hash=content_hash,"""
new5 = """                metadata=asset_metadata,
                attachments=attachments,
                tags=payload.get("tags") or payload.get("user_tags"),
                content_hash=content_hash,"""
patch_file(target, old5, new5)
