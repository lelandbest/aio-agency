import sys
from pathlib import Path
import json
import sqlite3

# Adhere to existing backend paths
BACKEND_DIR = Path(r'D:\AIOCRM\backend')
sys.path.insert(0, str(BACKEND_DIR))

# Mock environment for server import
import os
os.environ["DATABASE_PATH"] = str(BACKEND_DIR / "data" / "aio_crm.db")
os.environ["AUTH_DATABASE_PATH"] = str(BACKEND_DIR / "data" / "auth.db")

try:
    from server import app, provider
    from fastapi.testclient import TestClient
except Exception as e:
    print(f"Error importing app: {e}")
    sys.exit(1)

client = TestClient(app)

# Bypass auth for verification script
import mock
from fastapi import Request

async def mock_require_capability(request: Request, capability_id: str, detail: str = ""):
    return {"user": {"id": "verify-bot"}, "tenant": {"id": "verify-tenant"}}

def run_verification():
    results = {
        "doc_count": 0,
        "doc_types": {"system": "no", "user_manual": "no", "setup_guide": "no"},
        "module_coverage": {
            "Composer": "no", "Studio": "no", "Forge": "no", 
            "CRM": "no", "Flows": "no", "Comms": "no"
        },
        "samples": [],
        "missing_test": "fail",
        "actions_taken": []
    }

    with mock.patch("server.require_capability", side_effect=mock_require_capability):
        # STEP 1: LOAD CURRENT DOCS
        resp = client.get("/api/help/articles")
        articles = resp.json().get("data", [])
        
        # STEP 2: GENERATE IF NEEDED
        if len(articles) < 10:
            results["actions_taken"].append("Docs count < 10. Triggering generation.")
            gen_resp = client.post("/api/help/generate-docs")
            results["actions_taken"].append(f"Generation result: {gen_resp.json().get('data', {}).get('message')}")
            
            # Reload
            resp = client.get("/api/help/articles")
            articles = resp.json().get("data", [])

        results["doc_count"] = len(articles)

        # STEP 3: COVERAGE CHECK
        titles = [a.get("title", "") for a in articles]
        tags = []
        for a in articles:
            tags.extend(a.get("tags", []))

        if "System Documentation" in titles: results["doc_types"]["system"] = "yes"
        if "User Manual" in titles: results["doc_types"]["user_manual"] = "yes"
        if "Setup Guide" in titles: results["doc_types"]["setup_guide"] = "yes"

        modules = ["Composer", "Studio", "Forge", "CRM", "Flows", "Comms"]
        for mod in modules:
            if any(mod in t for t in titles):
                results["module_coverage"][mod] = "yes"

        # STEP 4: QUALITY CHECK (3 random)
        import random
        if articles:
            sample_pool = random.sample(articles, min(3, len(articles)))
            for s in sample_pool:
                content = s.get("content", "")
                summary = "\n".join(content.split("\n")[:5])
                results["samples"].append({
                    "title": s.get("title"),
                    "summary": summary
                })

        # STEP 5: MISSING HELP TEST
        missing_payload = {"query": "How do I configure advanced pipeline routing?"}
        m_resp = client.post("/api/help/missing", json=missing_payload)
        if m_resp.status_code == 200 and m_resp.json().get("data", {}).get("captured"):
            results["missing_test"] = "pass"
            results["actions_taken"].append("Verified missing help capture.")

    # Output formatted report
    print("\n### DOC COUNT")
    print(f"- {results['doc_count']}")

    print("\n### DOC TYPES")
    print(f"- system: {results['doc_types']['system']}")
    print(f"- user manual: {results['doc_types']['user_manual']}")
    print(f"- setup guide: {results['doc_types']['setup_guide']}")

    print("\n### MODULE COVERAGE")
    for mod, covered in results["module_coverage"].items():
        print(f"- {mod}: {covered}")

    print("\n### SAMPLE ARTICLES")
    for s in results["samples"]:
        print(f"- {s['title']}")
        print(f"  {s['summary']}")

    print("\n### MISSING HELP TEST")
    print(f"- {results['missing_test']}")

    print("\n### ACTIONS TAKEN")
    for action in results["actions_taken"]:
        print(f"- {action}")

    status = "READY" if results["doc_count"] >= 10 and results["missing_test"] == "pass" else "NOT READY"
    print(f"\n### FINAL STATUS\n- {status}")

if __name__ == "__main__":
    run_verification()
