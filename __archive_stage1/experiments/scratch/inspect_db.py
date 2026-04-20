import sqlite3
import json

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
conn = sqlite3.connect(db_path)
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables:", tables)

# Find first session
session = None
if 'sessions' in tables:
    session = conn.execute("SELECT * FROM sessions LIMIT 1").fetchone()
elif 'auth_sessions' in tables:
    session = conn.execute("SELECT * FROM auth_sessions LIMIT 1").fetchone()

if session:
    print("Session found:", session[0])
else:
    print("No session found.")
conn.close()
