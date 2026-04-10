
import sys
import os
import json

# Add backend to path
sys.path.append('d:/AIOCRM/backend')

from media_engine import get_media_engine

def verify_tags_direct():
    me = get_media_engine()
    
    # Simulate upload
    result = me.upload_local_media(
        file_bytes=b"Verification content direct",
        filename="verify_direct.txt",
        content_type="text/plain",
        tenant_id="test-tenant",
        tags=["TESTTAG", "MixedCase", "lower"]
    )
    
    asset = result['asset']
    asset_id = asset['id']

    # 1. Stored tags in state
    state_path = 'd:/AIOCRM/backend/media_engine_state.json'
    stored_tags = []
    if os.path.exists(state_path):
        with open(state_path, 'r') as f:
            state = json.load(f)
            asset_record = state.get('assets', {}).get(asset_id)
            if asset_record:
                stored_tags = asset_record.get('tags', [])
    
    # 2. Normalized tags
    normalized_asset = me.get_asset(asset_id)
    normalized_tags = normalized_asset.get('tags', [])

    print("VERIFICATION SUCCESSFUL")
    print(f"STORED_TAGS: {json.dumps(stored_tags)}")
    print(f"RETURNED_TAGS: {json.dumps(normalized_tags)}")

if __name__ == "__main__":
    verify_tags_direct()
