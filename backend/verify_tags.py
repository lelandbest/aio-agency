import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

print("=== RELATIONSHIP SAFETY CHECK ===\n")

print("1. brain_item_tags references:")
brain_refs = conn.execute("SELECT COUNT(*) as cnt FROM brain_item_tags").fetchone()
print(f"   Total references: {brain_refs['cnt']}")

if brain_refs['cnt'] > 0:
    sample_refs = conn.execute("""
        SELECT bit.itemId, bit.tagId, t.name as tag_name 
        FROM brain_item_tags bit 
        JOIN tags t ON bit.tagId = t.id 
        LIMIT 10
    """).fetchall()
    print("   Sample references:")
    for ref in sample_refs:
        print(f"     item {ref['itemId'][:8]}... -> {ref['tag_name']}")

print("\n2. contacts.tagsJson references:")
contacts_with_tags = conn.execute("SELECT COUNT(*) as cnt FROM contacts WHERE tagsJson IS NOT NULL AND tagsJson != ''").fetchone()
print(f"   Contacts with tagsJson: {contacts_with_tags['cnt']}")

print("\n3. All tables referencing tags:")
tables_with_tags = []
for table in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    table_name = table[0]
    try:
        cols = [c[1] for c in conn.execute(f"PRAGMA table_info({table_name})").fetchall()]
        if 'tagId' in cols or 'tagsJson' in cols or any('tag' in c.lower() for c in cols):
            cnt = conn.execute(f"SELECT COUNT(*) as cnt FROM {table_name}").fetchone()
            tables_with_tags.append((table_name, cnt['cnt']))
    except:
        pass

for t, cnt in tables_with_tags:
    print(f"   {t}: {cnt} rows")

print("\n=== FINAL CANONICAL TAG LIST ===\n")

system_tags = conn.execute("SELECT name, prefix, type, isLocked FROM tags WHERE type = 'system' ORDER BY name").fetchall()
print("SYSTEM TAGS (all locked):")
for tag in system_tags:
    print(f"  {tag['name']} | {tag['prefix']}")

user_tags = conn.execute("SELECT name, prefix, type, isLocked FROM tags WHERE type != 'system' ORDER BY name").fetchall()
print("\nUSER/NON-SYSTEM TAGS:")
for tag in user_tags:
    print(f"  {tag['name']} | {tag['prefix']} | {tag['type']}")

conn.close()

print("\n=== VALIDATION COMPLETE ===")
