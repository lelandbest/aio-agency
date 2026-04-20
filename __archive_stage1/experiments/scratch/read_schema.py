import sqlite3
db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
with sqlite3.connect(db_path) as conn:
    print(conn.execute("SELECT sql FROM sqlite_master WHERE name='app_sessions'").fetchone()[0])
    print("\n" + "="*20 + "\n")
    print(conn.execute("SELECT sql FROM sqlite_master WHERE name='app_users'").fetchone()[0])
