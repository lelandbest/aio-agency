import os
import re

file_path = r'd:\AIOCRM\backend\auth_store.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

new_chunk = """        if not rows:
            # --- LEGACY BOOTSTRAP / WORKSPACE RECOVERY (SESSION HYDRATE) ---
            user_row = conn.execute("SELECT role FROM app_users WHERE id = ?", (user_id,)).fetchone()
            if user_row and normalize_user_role(user_row["role"]) == "operator":
                now = utcnow_iso()
                default_tenant_id = self.default_tenant_id()
                primary_tenant = conn.execute("SELECT id FROM tenants WHERE id = ?", (default_tenant_id,)).fetchone()
                if not primary_tenant:
                    conn.execute(
                        "INSERT INTO tenants (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
                        (default_tenant_id, "Default Workspace", now, now)
                    )
                
                import secrets
                conn.execute(
                    "INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt) VALUES (?, ?, ?, 'owner', ?, ?)",
                    (f"member-{secrets.token_hex(8)}", user_id, default_tenant_id, now, now)
                )
                conn.commit()  # explicitly commit the recovery write during hydrate
                # Rerun membership query now that recovery is committed
                return self._tenant_memberships(conn, user_id, currentTenantId)
            # -------------------------------------------------------------
            return None, []"""

old_chunk_pattern = re.compile(r"        if not rows:\n            return None, \[\]")

content = old_chunk_pattern.sub(new_chunk, content)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print("Replaced successfully!")
