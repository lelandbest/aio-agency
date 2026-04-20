"""
Full diagnostic: why is the user in client mode?
Check users, memberships, sessions, role_assignments, role_definitions.
"""
import sys, json
sys.path.insert(0, r'D:\AIOCRM\backend')
import sqlite3

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'

with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row

    print("=== USERS ===")
    for u in conn.execute("SELECT id, email, role, username FROM app_users").fetchall():
        print(f"  {u['id']} | {u['email']} | role={u['role']} | username={u['username']}")

    print("\n=== TENANTS ===")
    for t in conn.execute("SELECT id, name, archivedAt FROM tenants").fetchall():
        print(f"  {t['id']} | {t['name']} | archived={t['archivedAt']}")

    print("\n=== MEMBERSHIPS ===")
    for m in conn.execute("SELECT userId, tenantId, role FROM memberships").fetchall():
        print(f"  user={m['userId']} | tenant={m['tenantId']} | role={m['role']}")

    print("\n=== ROLE_DEFINITIONS ===")
    rows = conn.execute("SELECT id, tenantId, name, capabilitiesJson FROM role_definitions LIMIT 20").fetchall()
    if rows:
        for r in rows:
            caps = json.loads(r['capabilitiesJson'] or '[]')
            print(f"  {r['id']} | tenant={r['tenantId']} | name={r['name']} | caps={len(caps)}: {caps[:3]}...")
    else:
        print("  *** NO ROLE_DEFINITIONS ***")

    print("\n=== ROLE_ASSIGNMENTS ===")
    rows = conn.execute("SELECT tenantId, entityType, entityId, roleId FROM role_assignments LIMIT 20").fetchall()
    if rows:
        for r in rows:
            print(f"  tenant={r['tenantId']} | type={r['entityType']} | entity={r['entityId']} | role={r['roleId']}")
    else:
        print("  *** NO ROLE_ASSIGNMENTS ***")

    print("\n=== CURRENT SESSION (most recent) ===")
    s = conn.execute("""
        SELECT s.userId, s.currentTenantId, s.token, u.role AS userRole
        FROM app_sessions s JOIN app_users u ON u.id = s.userId
        ORDER BY s.createdAt DESC LIMIT 1
    """).fetchone()
    if s:
        print(f"  userId={s['userId']} | tenant={s['currentTenantId']} | userRole={s['userRole']}")

print("\n=== LIVE CAPABILITY RESOLVE ===")
from auth_store import AuthStore
store = AuthStore(db_path=db_path)

with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row
    session_row = conn.execute("SELECT token FROM app_sessions ORDER BY createdAt DESC LIMIT 1").fetchone()

if session_row:
    session = store.get_session(session_row['token'])
    tenant_id = (session or {}).get('tenant', {}).get('id')
    user_id = (session or {}).get('user', {}).get('id')
    user_role = (session or {}).get('user', {}).get('role')
    capabilities = session.get('capabilities', []) if session else []
    print(f"  tenant={tenant_id} | user={user_id} | user.role={user_role}")
    print(f"  capabilities ({len(capabilities)}): {sorted(capabilities)[:8]}")
    print(f"  has system.admin: {'system.admin' in capabilities}")
    print(f"  has system.omega: {'system.omega' in capabilities}")
    print(f"  has client.access: {'client.access' in capabilities}")
    # Frontend clientMode check = isClientRole(user.role) = role === 'client'
    print(f"\n  Frontend clientMode would be: {str(user_role).lower() == 'client'}")
