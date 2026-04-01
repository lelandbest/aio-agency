import sqlite3
import json
import secrets
from datetime import datetime, timezone
import os
import hashlib

def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    resolved_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), resolved_salt.encode("utf-8"), 240000).hex()
    return digest, resolved_salt

db_path = r"d:\AIOCRM\backend\data\aio_crm.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

# 1. Create tenantMain if it doesn't exist
tenant_id = "tenantMain"
tenant_name = "Primary Tenant"
slug = "tenant-main"
now = utcnow_iso()

tenant = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
if not tenant:
    print(f"Creating tenant {tenant_id}...")
    conn.execute(
        "INSERT INTO tenants (id, name, slug, settingsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        (tenant_id, tenant_name, slug, "{}", now, now)
    )
else:
    print(f"Tenant {tenant_id} already exists.")

# 2. Create support@aiocrm.org if it doesn't exist
email = "support@aiocrm.org"
password = "aioadmin123"
user_id = "user-support-admin"
p_hash, p_salt = hash_password(password)

user = conn.execute("SELECT * FROM app_users WHERE email = ?", (email,)).fetchone()
if not user:
    print(f"Creating user {email}...")
    conn.execute(
        """
        INSERT INTO app_users (id, email, username, displayName, passwordHash, passwordSalt, authProvider, role, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, email, "support", "Support Admin", p_hash, p_salt, "local", "operator", now, now)
    )
    user = conn.execute("SELECT * FROM app_users WHERE email = ?", (email,)).fetchone()
else:
    print(f"User {email} already exists. Updating password...")
    conn.execute(
        "UPDATE app_users SET passwordHash = ?, passwordSalt = ?, updatedAt = ? WHERE email = ?",
        (p_hash, p_salt, now, email)
    )

# 3. Ensure membership for user in tenantMain as admin/owner
membership = conn.execute(
    "SELECT * FROM memberships WHERE userId = ? AND tenantId = ?",
    (user["id"], tenant_id)
).fetchone()

if not membership:
    print(f"Adding membership for {email} in {tenant_id}...")
    conn.execute(
        "INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
        (f"mem-{secrets.token_hex(4)}", user["id"], tenant_id, "admin", now, now)
    )
else:
    print(f"Membership exists. Ensuring admin role...")
    conn.execute(
        "UPDATE memberships SET role = ?, updatedAt = ? WHERE userId = ? AND tenantId = ?",
        ("admin", now, user["id"], tenant_id)
    )

conn.commit()
conn.close()
print("Bootstrap complete.")
