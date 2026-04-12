import sys
sys.path.insert(0, r'D:\AIOCRM\backend')
import sqlite3
import json
import secrets

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
admin_emails = ['support@aiocrm.org', 'admin@aio.com', 'admin@aio.local']

with sqlite3.connect(db_path) as conn:
    conn.row_factory = sqlite3.Row
    now = '2026-04-12T03:30:00Z'
    tenant_id = 'tenant-primary'
    
    # 1. Ensure user-role in app_users is 'operator'
    for email in admin_emails:
        conn.execute("UPDATE app_users SET role = 'operator' WHERE lower(email) = lower(?)", (email,))
    
    # 2. Find the primary user
    user = conn.execute("SELECT id FROM app_users WHERE lower(email) = 'support@aiocrm.org'").fetchone()
    if user:
        user_id = user['id']
        # 3. Ensure membership in tenant-primary
        existing = conn.execute("SELECT id FROM memberships WHERE userId = ? AND tenantId = ?", (user_id, tenant_id)).fetchone()
        if not existing:
            conn.execute("INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt) VALUES (?, ?, ?, 'owner', ?, ?)",
                         (f"member-{secrets.token_hex(8)}", user_id, tenant_id, now, now))
        else:
            conn.execute("UPDATE memberships SET role = 'owner' WHERE userId = ? AND tenantId = ?", (user_id, tenant_id))

        # 4. Ensure a session exists for this user with currentTenantId = 'tenant-primary'
        # This forces the user into the admin workspace on refresh
        conn.execute("UPDATE app_sessions SET currentTenantId = ? WHERE userId = ?", (tenant_id, user_id))

    conn.commit()
    print("Database repaired for admin users.")
