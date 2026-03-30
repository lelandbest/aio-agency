import sqlite3
import json
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

CANONICAL_PREFIXES = {"AI", "AUT", "CRM", "CS", "MKT", "MKG", "MTG", "CP", "CD", "EVT", "OPS", "PM", "META", "ROLE"}

REQUIRED_SYSTEM_TAGS = {
    "META:AGENT": {"label": "AI Agent", "type": "system", "isLocked": 1},
    "META:ACCESS:INTERNAL": {"label": "Internal Access", "type": "system", "isLocked": 1},
    "META:DOC:HELP": {"label": "Help Documentation", "type": "system", "isLocked": 1},
    "CRM:HOT": {"label": "Hot Lead", "type": "system", "isLocked": 1},
    "CRM:WARM": {"label": "Warm Lead", "type": "system", "isLocked": 1},
    "CRM:COLD": {"label": "Cold Lead", "type": "system", "isLocked": 1},
    "ROLE:CMD": {"label": "Command Role", "type": "system", "isLocked": 1},
    "ROLE:BIZ": {"label": "Business Role", "type": "system", "isLocked": 1},
    "ROLE:CS": {"label": "Customer Service Role", "type": "system", "isLocked": 1},
    "ROLE:VIS": {"label": "Visitor Role", "type": "system", "isLocked": 1},
    "ROLE:COM": {"label": "Communications Role", "type": "system", "isLocked": 1},
    "ROLE:CPY": {"label": "Company Role", "type": "system", "isLocked": 1},
    "ROLE:DEV": {"label": "Developer Role", "type": "system", "isLocked": 1},
    "ROLE:FIN": {"label": "Finance Role", "type": "system", "isLocked": 1},
    "ROLE:OPS": {"label": "Operations Role", "type": "system", "isLocked": 1},
    "ROLE:SEO": {"label": "SEO Role", "type": "system", "isLocked": 1},
    "ROLE:HR": {"label": "HR Role", "type": "system", "isLocked": 1},
    "ROLE:SLS": {"label": "Sales Role", "type": "system", "isLocked": 1},
    "ROLE:DES": {"label": "Design Role", "type": "system", "isLocked": 1},
    "ROLE:SYS": {"label": "System Role", "type": "system", "isLocked": 1},
}

now = datetime.utcnow().isoformat()

results = {
    "created": [],
    "updated": [],
    "flagged": [],
    "errors": []
}

def get_or_create_tag(name, details):
    normalized_name = name.upper()
    prefix = normalized_name.split(":")[0] if ":" in normalized_name else None
    
    existing = conn.execute(
        "SELECT * FROM tags WHERE name = ? COLLATE NOCASE",
        (normalized_name,)
    ).fetchone()
    
    if existing:
        return existing, False
    
    existing_case_insensitive = conn.execute(
        "SELECT * FROM tags WHERE name = ?",
        (name,)
    ).fetchone()
    
    if existing_case_insensitive:
        conn.execute("""
            UPDATE tags SET name = ?, prefix = ?, type = ?, isLocked = ?, label = ?, updatedAt = ?
            WHERE id = ?
        """, (normalized_name, prefix, details["type"], details["isLocked"], details.get("label", ""), now, existing_case_insensitive["id"]))
        results["updated"].append(f"{name} -> {normalized_name}")
        return conn.execute("SELECT * FROM tags WHERE id = ?", (existing_case_insensitive["id"],)).fetchone(), True
    
    tag_id = f"tag-{secrets.token_hex(6)}"
    import secrets
    conn.execute("""
        INSERT INTO tags (id, name, prefix, label, type, isLocked, tenantId, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (tag_id, normalized_name, prefix, details.get("label", ""), details["type"], details["isLocked"], "system", now))
    results["created"].append(normalized_name)
    return conn.execute("SELECT * FROM tags WHERE id = ?", (tag_id,)).fetchone(), True

import secrets

print("=== STEP 1: CHECKING/UPDATING SCHEMA ===\n")

columns = {col[1] for col in conn.execute("PRAGMA table_info(tags)").fetchall()}
if "updatedAt" not in columns:
    conn.execute("ALTER TABLE tags ADD COLUMN updatedAt TEXT")
    print("  Added updatedAt column")
if "prefix" not in columns:
    conn.execute("ALTER TABLE tags ADD COLUMN prefix TEXT")
    print("  Added prefix column")

print("\n=== STEP 2: CREATING/UPDATING REQUIRED SYSTEM TAGS ===\n")

for tag_name, details in REQUIRED_SYSTEM_TAGS.items():
    tag, was_created = get_or_create_tag(tag_name, details)
    if was_created and results["created"]:
        pass
    else:
        if tag["type"] != details["type"] or tag["isLocked"] != details["isLocked"]:
            conn.execute("""
                UPDATE tags SET type = ?, isLocked = ?, label = ?, updatedAt = ?
                WHERE id = ?
            """, (details["type"], details["isLocked"], details.get("label", ""), now, tag["id"]))
            results["updated"].append(f"{tag_name} (properties updated)")

print(f"  Created: {len(results['created'])}")
print(f"  Updated: {len(results['updated'])}")

print("\n=== STEP 3: BACKFILLING PREFIXES ===\n")

all_tags = conn.execute("SELECT id, name, prefix FROM tags").fetchall()
prefix_updated = 0

for tag in all_tags:
    name = tag["name"]
    current_prefix = tag["prefix"]
    
    if ":" in name:
        expected_prefix = name.split(":")[0].upper()
        if current_prefix != expected_prefix:
            conn.execute("UPDATE tags SET prefix = ?, updatedAt = ? WHERE id = ?", (expected_prefix, now, tag["id"]))
            prefix_updated += 1

print(f"  Prefixes backfilled: {prefix_updated}")

print("\n=== STEP 4: CHECKING FOR DUPLICATES ===\n")

dup_check = conn.execute("""
    SELECT LOWER(name) as name_lower, COUNT(*) as cnt 
    FROM tags 
    GROUP BY LOWER(name) 
    HAVING cnt > 1
""").fetchall()

if dup_check:
    for dup in dup_check:
        results["flagged"].append(f"Duplicate: {dup['name_lower']}")
        print(f"  DUPLICATE: {dup['name_lower']} ({dup['cnt']} rows)")
else:
    print("  No duplicates found")

print("\n=== STEP 5: FLAGGING NON-CANONICAL TAGS ===\n")

non_canonical = conn.execute("""
    SELECT id, name, prefix, type FROM tags 
    WHERE name NOT LIKE '%:%' 
    OR (prefix IS NOT NULL AND prefix NOT IN ({}))
""".format(",".join("?" * len(CANONICAL_PREFIXES))), list(CANONICAL_PREFIXES)).fetchall()

for tag in non_canonical:
    if tag["type"] != "system":
        results["flagged"].append(f"Non-canonical: {tag['name']} (type={tag['type']})")
        print(f"  FLAGGED: {tag['name']} | prefix={tag['prefix']} | type={tag['type']}")

conn.commit()

print("\n=== FINAL VALIDATION ===\n")

required_check = []
for tag_name in REQUIRED_SYSTEM_TAGS.keys():
    exists = conn.execute("SELECT name, isLocked, type FROM tags WHERE name = ?", (tag_name,)).fetchone()
    if exists:
        required_check.append(f"  {tag_name}: EXISTS (locked={exists['isLocked']}, type={exists['type']})")
    else:
        required_check.append(f"  {tag_name}: MISSING")

for line in required_check:
    print(line)

print("\n=== CURRENT STATE ===\n")

final_tags = conn.execute("SELECT name, prefix, type, isLocked FROM tags ORDER BY name").fetchall()
for tag in final_tags:
    lock = "LOCKED" if tag["isLocked"] else ""
    print(f"  {tag['name']} | {tag['prefix']} | {tag['type']} | {lock}")

conn.close()

print("\n=== SUMMARY ===")
print(f"Created: {len(results['created'])}")
print(f"Updated: {len(results['updated'])}")
print(f"Flagged: {len(results['flagged'])}")
