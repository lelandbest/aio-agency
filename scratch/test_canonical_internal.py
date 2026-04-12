
import os
import sys
from pathlib import Path

# Add backend dir to sys.path so we can import server
dir_path = Path(r"D:\AIOCRM\backend")
sys.path.append(str(dir_path))
os.chdir(dir_path)

from fastapi.testclient import TestClient
from server import app

def test_canonical_internal():
    print("Initializing TestClient...")
    client = TestClient(app)
    print("Fetching /api/settings/canonical...")
    response = client.get("/api/settings/canonical")
    
    print(f"Status Code: {response.status_code}")
    
    body = response.content
    print(f"Response length: {len(body)}")
    print(f"Content-Length Header: {response.headers.get('content-length')}")
    
    import json
    try:
        data = json.loads(body)
        print("Valid JSON: True")
        tenant = data.get("data", {}).get("tenantSettings", {})
        cats = tenant.get("categories")
        surfaces = tenant.get("surfaces")
        print(f"Has categories: {cats is not None}")
        print(f"Has surfaces: {surfaces is not None}")
    except json.JSONDecodeError as e:
        print(f"Valid JSON: False ({e})")
        print(f"Tail of body: {body[-100:]}")

if __name__ == "__main__":
    test_canonical_internal()
