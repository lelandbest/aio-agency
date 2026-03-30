import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))

print("=== CURRENT TAG TABLE SCHEMA ===\n")

# Check schema
schema = conn.execute("PRAGMA table_info(tags)").fetchall()
for col in schema:
    print(f"  {col[1]}: {col[2]}")

print("\n=== CURRENT TAGS ===\n")

rows = conn.execute("SELECT id, name, prefix, label, type, isLocked, tenantId FROM tags ORDER BY name").fetchall()

if not rows:
    print("  No tags found")
else:
    for row in rows:
        print(f"  {row[1]} | prefix={row[2]} | type={row[4]} | locked={row[5]}")

print(f"\nTotal tags: {len(rows)}")

conn.close()
