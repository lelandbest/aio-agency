
import os
import sys
from pathlib import Path
import json

# Add backend dir to sys.path
dir_path = Path(r"D:\AIOCRM\backend")
sys.path.append(str(dir_path))
os.chdir(dir_path)

from auth_store import AuthStore
store = AuthStore(db_path=r"D:\AIOCRM\backend\data\aio_crm.db")

def verify_effective_caps():
    with store._connect() as conn:
        users = conn.execute("SELECT * FROM app_users").fetchall()
        print(f"Total Users: {len(users)}")
        
        for user in users:
            print(f"\nEvaluating user: {user['email']} / {user['id']}")
            memberships = conn.execute("SELECT * FROM memberships WHERE userId = ?", (user['id'],)).fetchall()
            for m in memberships:
                print(f"  Tenant: {m['tenantId']}, Role: {m['role']}")
                caps = store.get_effective_capabilities(m['tenantId'], "user", user['id'])
                print(f"  Effective Caps: {len(caps)} ({list(caps)[:5]}...)")
                
                # Check role_assignments
                ras = conn.execute("SELECT * FROM role_assignments WHERE tenantId = ? AND entityId = ?", (m['tenantId'], user['id'])).fetchall()
                print(f"  Role Assignments: {[r['roleId'] for r in ras]}")

if __name__ == "__main__":
    verify_effective_caps()
