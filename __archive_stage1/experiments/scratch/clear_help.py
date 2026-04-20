import sqlite3
from pathlib import Path

db_path = r'd:\AIOCRM\backend\data\aio_crm.db'
if not Path(db_path).exists():
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cur = conn.execute("DELETE FROM brain_items WHERE tagsJson LIKE '%META:DOC:HELP%'")
conn.commit()
print(f"Deleted {cur.rowcount} items.")
conn.close()
