import sqlite3
import os

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

users = conn.execute("SELECT id, email, phone FROM app_users WHERE phone LIKE '%@%'").fetchall()
print(f"USERS WITH EMAIL IN PHONE: {len(users)}")
for u in users:
    print(dict(u))

# Also check for empty phone or specific users
admin = conn.execute("SELECT id, email, phone FROM app_users WHERE email LIKE '%support@aiocrm.org%'").fetchone()
if admin:
    print(f"ADMIN RECORD: {dict(admin)}")
