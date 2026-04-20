
import sqlite3
import json

try:
    conn = sqlite3.connect('d:/AIOCRM/backend/data/aio_crm.db')
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM global_variables WHERE key LIKE '%agent%' OR key LIKE '%ALPHA%' OR key LIKE '%CHARLIE%'")
    rows = cursor.fetchall()
    for k, v in rows:
        print(f"Key: {k}, Value: {v}")
except Exception as e:
    print(f"Error: {e}")
