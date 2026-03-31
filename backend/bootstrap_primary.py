import sys
import os
import json
import secrets
from datetime import UTC, datetime
from pathlib import Path

# Add backend to path if needed
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from auth_store import AuthStore, hash_password, utcnow_iso, slugify, default_auth_db_path
except ImportError:
    # Fallback for direct execution
    from backend.auth_store import AuthStore, hash_password, utcnow_iso, slugify, default_auth_db_path

def bootstrap(email, password, tenant_name="Primary Workspace"):
    db_path = default_auth_db_path()
    auth = AuthStore(db_path)
    
    with auth._connect() as conn:
        now = utcnow_iso()
        
        # 0. Check if tenant-primary exists (for simple overrides)
        existing_primary = conn.execute("SELECT id FROM tenants WHERE id = 'tenant-primary'").fetchone()
        
        # 1. Create or Identify Tenant
        if existing_primary:
            tenant_id = "tenant-primary"
            print(f"USING EXISTING PRIMARY TENANT: {tenant_id}")
        else:
            tenant_id = f"tenant-{secrets.token_hex(4)}"
            slug = slugify(tenant_name)
            # Check if slug exists
            existing_tenant = conn.execute("SELECT id FROM tenants WHERE slug = ?", (slug,)).fetchone()
            if existing_tenant:
                 slug = f"{slug}-{secrets.token_hex(2)}"
                 
            conn.execute(
                "INSERT INTO tenants (id, name, slug, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
                (tenant_id, tenant_name, slug, now, now)
            )
            print(f"CREATED TENANT: {tenant_name} ({tenant_id}) [slug: {slug}]")
        
        # 2. Create or Update User
        user_id = f"user-{secrets.token_hex(4)}"
        password_hash, password_salt = hash_password(password)
        
        # Check if user exists
        row = conn.execute("SELECT id FROM app_users WHERE email = ?", (email,)).fetchone()
        if row:
            user_id = row['id']
            conn.execute(
                "UPDATE app_users SET passwordHash = ?, passwordSalt = ?, updatedAt = ? WHERE id = ?",
                (password_hash, password_salt, now, user_id)
            )
            print(f"UPDATED EXISTING USER PASSWORD: {email} ({user_id})")
        else:
            conn.execute(
                """
                INSERT INTO app_users (
                    id, email, displayName, passwordHash, passwordSalt, 
                    authProvider, role, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, email, email.split('@')[0], password_hash, password_salt, "local", "operator", now, now)
            )
            print(f"CREATED NEW USER: {email} ({user_id})")
        
        # 3. Create Membership (Owner)
        existing_membership = conn.execute(
            "SELECT id FROM memberships WHERE userId = ? AND tenantId = ?",
            (user_id, tenant_id)
        ).fetchone()
        
        if not existing_membership:
            membership_id = f"membership-{secrets.token_hex(8)}"
            conn.execute(
                "INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                (membership_id, user_id, tenant_id, "owner", now, now)
            )
            print(f"CREATED MEMBERSHIP: {user_id} -> {tenant_id} (owner)")
        else:
            conn.execute(
                "UPDATE memberships SET role = 'owner', updatedAt = ? WHERE id = ?",
                (now, existing_membership['id'])
            )
            print(f"PROMOTED EXISTING MEMBERSHIP TO OWNER: {user_id} -> {tenant_id}")
        
        conn.commit()
    
    print("\nSUCCESS: Manual bootstrap complete. You can now login with these credentials.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python bootstrap_primary.py <email> <password> [tenant_name]")
        print("Example: python backend/bootstrap_primary.py admin@example.com mypassword123")
        sys.exit(1)
    
    bootstrap(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Primary Workspace")
