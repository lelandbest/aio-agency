
import urllib.request
import json

def test_canonical():
    try:
        req = urllib.request.Request("http://127.0.0.1:8001/api/settings/canonical")
        with urllib.request.urlopen(req) as response:
            body = response.read()
            print(f"Response length: {len(body)}")
            print(f"Content-Length Header: {response.headers.get('Content-Length')}")
            
            try:
                data = json.loads(body)
                print("Valid JSON: True")
                # Look for deep keys that were previously missing
                tenant = data.get("data", {}).get("tenantSettings", {})
                cats = tenant.get("categories")
                surfaces = tenant.get("surfaces")
                print(f"Has categories: {cats is not None}")
                print(f"Has surfaces: {surfaces is not None}")
                
            except json.JSONDecodeError as e:
                print(f"Valid JSON: False ({e})")
                
    except Exception as e:
        print(f"Error fetching: {e}")

if __name__ == "__main__":
    test_canonical()
