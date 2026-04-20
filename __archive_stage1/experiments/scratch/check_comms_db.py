import sqlite3
import json

db_path = r'd:\AIOCRM\backend\data\aio_crm.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("--- comms_provider_configs schema ---")
cursor.execute("PRAGMA table_info(comms_provider_configs)")
for row in cursor.fetchall():
    print(dict(row))

print("\n--- Current data ---")
cursor.execute("SELECT * FROM comms_provider_configs")
for row in cursor.fetchall():
    print(dict(row))

conn.close()
