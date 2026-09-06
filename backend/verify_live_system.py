"""
Live system verification script for AIO Nexus v2.
Tests all operational endpoints on http://localhost:8001 with real session auth.
"""

import json
import urllib.request
import urllib.error


def post(url, data, headers=None):
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=req_headers,
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=5.0) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    print("=== 1. Health Diagnostic Check ===")
    health = get("http://localhost:8001/api/health")
    print("  [OK] Status:", health["status"])
    print("  [OK] Version:", health["version"])
    print("  [OK] Zero Cloud Rent:", health["appliance"]["zero_cloud_rent"])
    print("  [OK] Local First Mode:", health["appliance"]["mode"])

    print("\n=== 2. Operator Authentication & Session ===")
    login_res = post(
        "http://localhost:8001/api/auth/login",
        {"email": "support@aiocrm.org", "password": "aioadmin123"}
    )
    token = login_res["session"]["token"]
    user = login_res["session"]["user"]
    print("  [OK] Authenticated:", user["email"], f"(role: {user['role']})")
    headers = {"X-Session-Token": token}

    print("\n=== 3. Turnkey SOB Blueprints ===")
    bps = get("http://localhost:8001/api/blueprints", headers=headers)
    blueprint_ids = [b["id"] for b in bps.get("data", [])]
    print("  [OK] Discovered Blueprints:", blueprint_ids)
    assert "podcast_creator" in blueprint_ids, "podcast_creator missing"
    assert "tech_director" in blueprint_ids, "tech_director missing"

    print("\n=== 4. Mobile Pocket Cockpit Endpoints ===")
    brief = get("http://localhost:8001/api/pocket/brief", headers=headers)
    print("  [OK] Pocket Brief Status:", brief.get("status"), "| Summary:", brief.get("summary"))
    cues = get("http://localhost:8001/api/pocket/cues", headers=headers)
    print("  [OK] Live Run-of-Show Cues Count:", len(cues.get("cues", [])))
    approvals = get("http://localhost:8001/api/pocket/approvals", headers=headers)
    print("  [OK] Approvals Queue Count:", approvals.get("count", 0))

    print("\n=== 5. Media Studio Engine ===")
    media_jobs = get("http://localhost:8001/api/media/render-jobs", headers=headers)
    print("  [OK] Media Engine Jobs:", len(media_jobs.get("data", [])))

    print("\n=== 6. Cortex Knowledge Vault ===")
    cortex = get("http://localhost:8001/api/brain/items", headers=headers)
    items = cortex.get("items", cortex.get("data", []))
    print("  [OK] Knowledge Items in Vault:", len(items))

    print("\n=== 7. CRM Dossiers & Contacts ===")
    crm = get("http://localhost:8001/api/contacts", headers=headers)
    contacts = crm.get("contacts", crm.get("data", []))
    print("  [OK] CRM Contacts Indexed:", len(contacts))

    print("\n=== 8. Unified Comms Snapshot ===")
    comms = get("http://localhost:8001/api/comms/snapshot", headers=headers)
    threads = comms.get("threads", [])
    print("  [OK] Comms Snapshot Threads:", len(threads))

    print("\n======================================================")
    print(">> ALL AIO NEXUS v2 SUBSYSTEMS ARE LIVE & FUNCTIONAL <<")
    print("======================================================")


if __name__ == "__main__":
    main()
