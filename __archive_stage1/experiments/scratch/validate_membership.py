"""
Validate the full workspace membership recovery pipeline.
1. Check existing sessions for missing tenant linkage
2. Simulate what get_session would do 
3. Verify recovery auto-fires on hydrate
4. Verify capabilities come back correctly
"""
import sys
sys.path.insert(0, r'D:\AIOCRM\backend')
import sqlite3

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'

print("=== DB STATE ===")
with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row

    users = conn.execute("SELECT id, email, role FROM app_users").fetchall()
    print(f"\nUsers ({len(users)}):")
    for u in users:
        print(f"  {u['id']} | {u['email']} | role={u['role']}")

    memberships = conn.execute("SELECT userId, tenantId, role FROM memberships").fetchall()
    print(f"\nMemberships ({len(memberships)}):")
    for m in memberships:
        print(f"  user={m['userId']} tenant={m['tenantId']} role={m['role']}")

    tenants = conn.execute("SELECT id, name, archivedAt FROM tenants").fetchall()
    print(f"\nTenants ({len(tenants)}):")
    for t in tenants:
        print(f"  {t['id']} | {t['name']} | archived={t['archivedAt']}")

    sessions = conn.execute("SELECT id, userId, currentTenantId FROM app_sessions ORDER BY createdAt DESC LIMIT 5").fetchall()
    print(f"\nRecent Sessions ({len(sessions)}):")
    for s in sessions:
        print(f"  session={s['id']} user={s['userId']} tenant={s['currentTenantId']}")

print("\n=== LIVE SESSION HYDRATE ===")
from auth_store import AuthStore
store = AuthStore(db_path=db_path)

with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row
    latest_session = conn.execute("SELECT token FROM app_sessions ORDER BY createdAt DESC LIMIT 1").fetchone()

if latest_session:
    session = store.get_session(latest_session['token'])
    if session:
        print(f"  tenant: {session.get('tenant', {}).get('id')}")
        print(f"  user:   {session.get('user', {}).get('id')}")
        caps = session.get('capabilities', [])
        print(f"  capabilities count: {len(caps)}")
        print(f"  has system.view: {'system.view' in caps}")
        print(f"  has system.admin: {'system.admin' in caps}")
        print(f"  has system.omega: {'system.omega' in caps}")
    else:
        print("  Session returned None!")
else:
    print("  No sessions in DB")
