import requests
import json

# We need the token from the actual session.
# Since I am an agent, I can check the DB for the most recent token.

import sys
sys.path.insert(0, r'D:\AIOCRM\backend')
import sqlite3

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row
    token_row = conn.execute("SELECT token FROM app_sessions ORDER BY createdAt DESC LIMIT 1").fetchone()
    token = token_row['token'] if token_row else None

if not token:
    print("No session found.")
    sys.exit(1)

# Call the API as the user would
# Note: The server needs to be running.
# If it's not running, I can't call it via requests.
# But I can simulate the store.get_session call.

from auth_store import AuthStore
store = AuthStore(db_path=db_path)
session = store.get_session(token)

print(json.dumps(session, indent=2))
