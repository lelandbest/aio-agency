import os
import re

file_path = r'd:\AIOCRM\backend\auth_store.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_chunk = """        currentTenantId = tenant_row["tenantId"] if tenant_row else None
        
        # --- LEGACY BOOTSTRAP / WORKSPACE RECOVERY ---
        if not currentTenantId:
            user_row = conn.execute("SELECT role FROM app_users WHERE id = ?", (user_id,)).fetchone()
            if user_row and normalize_user_role(user_row["role"]) == "operator":
                default_tenant_id = self.default_tenant_id()
                primary_tenant = conn.execute("SELECT id FROM tenants WHERE id = ?", (default_tenant_id,)).fetchone()
                if not primary_tenant:
                    conn.execute(
                        "INSERT INTO tenants (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
                        (default_tenant_id, "Default Workspace", createdAt, createdAt)
                    )
                
                existing_member = conn.execute("SELECT id FROM memberships WHERE userId = ? AND tenantId = ?", (user_id, default_tenant_id)).fetchone()
                if not existing_member:
                    conn.execute(
                        "INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt) VALUES (?, ?, ?, 'owner', ?, ?)",
                        (f"member-{secrets.token_hex(8)}", user_id, default_tenant_id, createdAt, createdAt)
                    )
                currentTenantId = default_tenant_id
        # ---------------------------------------------
        
        conn.execute(
            \"\"\"
            INSERT INTO app_sessions (id, userId, token, provider, currentTenantId, createdAt, expiresAt, lastSeenAt, userAgent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            \"\"\",
            (session_id, user_id, token, provider, currentTenantId, createdAt, expiresAt, createdAt, user_agent),
        )"""

old_chunk_pattern = re.compile(
    r"        currentTenantId = tenant_row\[\"tenantId\"\] if tenant_row else None\n        conn\.execute\(\n            \"\"\"\n            INSERT INTO app_sessions \(id, userId, token, provider, currentTenantId, createdAt, expiresAt, lastSeenAt, userAgent\)\n            VALUES \(\?, \?, \?, \?, \?, \?, \?, \?, \?\)\n            \"\"\",\n            \(session_id, user_id, token, provider, currentTenantId, createdAt, expiresAt, createdAt, user_agent\),\n        \)"
)

content = old_chunk_pattern.sub(new_chunk, content)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print("Replaced successfully!")
