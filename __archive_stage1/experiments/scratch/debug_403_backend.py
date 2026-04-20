
import sqlite3
import json
with sqlite3.connect(r'D:\AIOCRM\backend\data\aio_crm.db') as conn:
    conn.row_factory = sqlite3.Row
    session_row = conn.execute("SELECT * FROM app_sessions ORDER BY createdAt DESC LIMIT 1").fetchone()

from sys import path
path.append(r"D:\AIOCRM\backend")
from auth_store import AuthStore
store = AuthStore(db_path=r"D:\AIOCRM\backend\data\aio_crm.db")

session = store.get_session(session_row['token'])
tenant_id = (session or {}).get("tenant", {}).get("id")
user_id = (session.get("user") or {}).get("id") if session else None
print(f"tenant: {tenant_id}, user: {user_id}")
if tenant_id and user_id:
    caps = store.get_effective_capabilities(tenant_id, "user", user_id)
    print(f"capabilities from auth_store: {caps}")
    print(f"has system.view: {'system.view' in caps}")
