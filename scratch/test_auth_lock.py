
import os
import sys
from pathlib import Path

# Add backend dir to sys.path so we can import auth_store
dir_path = Path(r"D:\AIOCRM\backend")
sys.path.append(str(dir_path))
os.chdir(dir_path)

from auth_store import AuthStore
store = AuthStore(db_path=r"D:\AIOCRM\backend\data\aio_crm.db")

def test_login_path():
    try:
        # Actually I can't guess a real password or email. 
        # But I can invoke _create_session directly within an uncommitted connection to simulate lock scenario
        import sqlite3
        with store._connect() as conn:
            # begin write
            conn.execute("UPDATE app_users SET updatedAt = datetime('now') WHERE 1=0")
            
            # test session build
            users = conn.execute("SELECT * FROM app_users LIMIT 1").fetchall()
            if not users:
                print("No users to test")
                return
            
            user = users[0]
            print(f"Testing create_session for user {user['email']} inside uncommitted transaction")
            session = store._create_session(conn, user["id"], "test-provider", "test-agent")
            
            print(f"Session successfully built without lock!")
            print(f"Capabilities: {session.get('capabilities')}")
            
            # Rollback to avoid polluting db
            conn.rollback()

    except Exception as e:
        print(f"Error testing: {e}")

if __name__ == "__main__":
    test_login_path()
