import json
import urllib.request
import urllib.error
import os

API_BASE = "http://localhost:8001/api"
FLOW_ID = "cold-outreach-test-123"

test_payload = {
    "command": "Cold Outreach Test Trigger",
    "lead": {
        "firstName": "Elon",
        "email": "elon@spacex.local",
        "keyword": "AI",
        "businessType": "agency"
    }
}

def trigger():
    url = f"{API_BASE}/flows/{FLOW_ID}/trigger/manual"
    headers = {
        "Content-Type": "application/json",
        "X-Tenant-Id": "tenant-primary",
        "Authorization": "Bearer 6e9456b4e779a3d8a860977a76522d1299d894d19c6b37dcc4fe57c0f42d7c09"
    }
    
    request_payload = {
        "command": test_payload["command"],
        "context": {
            "lead": test_payload["lead"]
        }
    }
    
    data = json.dumps(request_payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    
    print(f"Triggering flow {FLOW_ID}...")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            result = res_data.get("data", {})
            run_id = result.get("runId")
            print(f"Triggered successfully! Run ID: {run_id}")
            print(f"Initial State: {result.get('status')}")
            
            # Save runId for monitoring
            with open("last_run_id.txt", "w") as f:
                f.write(str(run_id))
                
            return run_id
    except urllib.error.HTTPError as e:
        print(f"Trigger failed with status {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    trigger()
