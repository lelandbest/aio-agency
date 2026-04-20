import sys
import sqlite3
import os

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

user = conn.execute("SELECT id, email, role FROM app_users WHERE email LIKE '%support@aiocrm.org%'").fetchone()
if not user:
    print("USER NOT FOUND")
else:
    print(f"USER: {dict(user)}")
    memberships = conn.execute("SELECT * FROM memberships WHERE userId = ?", (user['id'],)).fetchall()
    print(f"MEMBERSHIPS ({len(memberships)}):")
    for m in memberships:
        tenant = conn.execute("SELECT name FROM tenants WHERE id = ?", (m['tenantId'],)).fetchone()
        print(f" - Workspace: {tenant['name'] if tenant else 'Unknown'} | Role: {m['role']} | ID: {m['tenantId']}")

tenants = conn.execute("SELECT id, name FROM tenants").fetchall()
print(f"TOTAL TENANTS: {len(tenants)}")
for t in tenants:
    print(f" - {t['name']} ({t['id']})")
