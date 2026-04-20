
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

# Patch 4: upload_local_media call to build (using attachments line as anchor)
old4 = """            attachments=normalize_attachment_links({}, context),
            content_hash=dedup_hash,
        )"""
new4 = """            attachments=normalize_attachment_links({}, context),
            tags=tags,
            content_hash=dedup_hash,
        )"""
patch_file(target, old4, new4)
