
import time
import requests
import json
import sqlite3

# Get latest session token
DB_PATH = r"D:\AIOCRM\backend\data\aio_crm.db"
with sqlite3.connect(DB_PATH) as conn:
    conn.row_factory = sqlite3.Row
    session_row = conn.execute("SELECT * FROM app_sessions ORDER BY createdAt DESC LIMIT 1").fetchone()
    TOKEN = session_row['token'] if session_row else None

BASE_URL = "http://localhost:8001/api/ai"
HEADERS = {"Authorization": f"Bearer {TOKEN}"} if TOKEN else {}

def test_request(name, endpoint, payload):
    print(f"--- Testing {name} ---")
    start_total = time.time()
    
    try:
        response = requests.post(f"{BASE_URL}/{endpoint}", json=payload, headers=HEADERS, timeout=60)
        end_total = time.time()
        
        duration = end_total - start_total
        print(f"Total Time: {duration:.2f}s")
        print(f"Status Code: {response.status_code}")
        
        result = response.json()
        print(f"Response: {json.dumps(result, indent=2)[:500]}...")
        
        return {
            "name": name,
            "total_time": duration,
            "result": result
        }
    except Exception as e:
        print(f"Error: {e}")
        return None

# CASE 1: CONVO
case1 = test_request("CONVO", "command", {
    "command": "hello",
    "context": {"intent": "conversation"}
})

# CASE 2: CONSULT
case2 = test_request("CONSULT", "command", {
    "command": "who am I speaking with?",
    "agent": "DELTA",
    "context": {"module": "agents", "surface": "command"}
})

# CASE 3: COMMAND
case3 = test_request("COMMAND", "command", {
    "command": "/run test",
    "context": {"module": "agents", "surface": "command"}
})
