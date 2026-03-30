import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

now = "2026-03-30T00:00:00+00:00"

required_tags = {
    "MTG:TRANSCRIPT": {"label": "Meeting Transcript", "type": "system"},
    "MTG:SUMMARY": {"label": "Meeting Summary", "type": "system"},
}

print("=== CHECKING/CREATING TAGS ===\n")

for tag_name, details in required_tags.items():
    existing = conn.execute("SELECT id, name FROM tags WHERE name = ?", (tag_name,)).fetchone()
    
    if existing:
        print(f"EXISTS: {tag_name}")
    else:
        tag_id = f"tag-{tag_name.lower().replace(':', '-')}"
        prefix = tag_name.split(":")[0]
        conn.execute("""
            INSERT INTO tags (id, tenantId, name, prefix, label, type, isLocked, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        """, (tag_id, "system", tag_name, prefix, details["label"], details["type"], now))
        print(f"CREATED: {tag_name}")

conn.commit()

print("\n=== VERIFYING ===\n")
all_mtg = conn.execute("SELECT name, prefix, type, isLocked FROM tags WHERE name LIKE 'MTG:%'").fetchall()
for tag in all_mtg:
    print(f"  {tag['name']} | {tag['prefix']} | {tag['type']} | locked={tag['isLocked']}")

conn.close()
