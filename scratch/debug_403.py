
import urllib.request
import json
import sqlite3
from urllib.error import HTTPError

with sqlite3.connect(r'D:\AIOCRM\backend\data\aio_crm.db') as conn:
    conn.row_factory = sqlite3.Row
    session = conn.execute("SELECT * FROM app_sessions ORDER BY createdAt DESC LIMIT 1").fetchone()
    token = session['token']

req = urllib.request.Request("http://127.0.0.1:8001/api/settings/canonical")
req.add_header("Authorization", f"Bearer {token}")
try:
    with urllib.request.urlopen(req) as response:
        print("Success:", json.loads(response.read().decode()))
except HTTPError as e:
    print(e.read().decode())
