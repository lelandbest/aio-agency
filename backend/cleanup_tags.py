import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

print("=== STEP 1: LOCATE TAGS ===\n")

tags_to_delete = ["Customer", "Hot Lead"]
found_tags = []
not_found = []
skipped = []

for tag_name in tags_to_delete:
    row = conn.execute(
        "SELECT * FROM tags WHERE name = ? COLLATE NOCASE",
        (tag_name,)
    ).fetchone()
    
    if row:
        found_tags.append(row)
        print(f"Found: {row['name']} (id={row['id']}, locked={row['isLocked']}, type={row['type']})")
    else:
        not_found.append(tag_name)
        print(f"Not found: {tag_name}")

print("\n=== STEP 2: VALIDATE SAFETY ===\n")

for tag in found_tags:
    name = tag["name"]
    is_locked = tag["isLocked"]
    tag_type = tag["type"]
    
    is_canonical = ":" in name
    is_system = tag_type == "system" or is_locked == 1
    
    if is_canonical or is_system:
        skipped.append(name)
        print(f"SKIPPED (safety): {name} - canonical={is_canonical}, system={is_system}")
    else:
        print(f"SAFE TO DELETE: {name} - canonical={is_canonical}, system={is_system}")

print("\n=== STEP 3: DELETE TAGS ===\n")

deleted = []
for tag in found_tags:
    if tag["name"] in skipped:
        continue
    
    tag_id = tag["id"]
    tag_name = tag["name"]
    
    conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
    conn.execute("DELETE FROM brain_item_tags WHERE tagId = ?", (tag_id,))
    
    deleted.append(tag_name)
    print(f"Deleted: {tag_name} (id={tag_id})")

conn.commit()

print("\n=== STEP 4: VERIFY CLEAN STATE ===\n")

remaining = conn.execute("SELECT name FROM tags ORDER BY name").fetchall()
remaining_names = [r["name"] for r in remaining]

for name in tags_to_delete:
    if name in remaining_names:
        print(f"FAIL: {name} still exists")
    else:
        print(f"CLEAN: {name} removed")

assocs = conn.execute("SELECT COUNT(*) as cnt FROM brain_item_tags").fetchone()
print(f"\nbrain_item_tags remaining: {assocs['cnt']}")

canonical_check = conn.execute("SELECT COUNT(*) as cnt FROM tags WHERE type = 'system'").fetchone()
print(f"Canonical system tags: {canonical_check['cnt']}")

print(f"\nRemaining tags: {len(remaining)}")
for r in remaining:
    print(f"  {r['name']}")

conn.close()

print("\n=== SUMMARY ===")
print(f"Deleted: {deleted}")
print(f"Not found: {not_found}")
print(f"Skipped: {skipped}")
