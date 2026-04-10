
import requests
import json
import os

BASE_URL = "http://localhost:8001"

def verify_tags():
    # 1. Create asset via upload
    # Since I don't have a real file, I'll send dummy bytes
    files = {
        'file': ('verify_tags.txt', b'Verification content'),
        'tags': (None, 'TESTTAG,MixedCase,lower')
    }
    
    print("Ingesting asset with tags: [\"TESTTAG\", \"MixedCase\", \"lower\"]...")
    resp = requests.post(f"{BASE_URL}/api/media/upload", files=files)
    if resp.status_code != 200:
        print(f"FAILED to ingest: {resp.status_code} {resp.text}")
        return
    
    asset_id = resp.json()['data']['asset']['id']
    print(f"Asset created: {asset_id}")

    # 2. Check stored tags in state
    state_path = 'd:/AIOCRM/backend/media_engine_state.json'
    stored_tags = []
    if os.path.exists(state_path):
        with open(state_path, 'r') as f:
            state = json.load(f)
            asset = state.get('assets', {}).get(asset_id)
            if asset:
                stored_tags = asset.get('tags', [])
    
    # 3. Check tags from GET /api/vault
    vault_resp = requests.get(f"{BASE_URL}/api/vault")
    vault_tags = []
    if vault_resp.status_code == 200:
        assets = vault_resp.json().get('data', {}).get('assets', [])
        for a in assets:
            if a['id'] == asset_id:
                vault_tags = a.get('tags', [])
                break

    print("\nRESULTS:")
    print(f"Stored Tags (in JSON state): {stored_tags}")
    print(f"Returned Tags (from API): {vault_tags}")

if __name__ == "__main__":
    verify_tags()
