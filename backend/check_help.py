import sqlite3
import json

conn = sqlite3.connect('data/aio_crm.db')
conn.row_factory = sqlite3.Row

rows = conn.execute("SELECT id, title, category, tagsJson, content FROM brain_items").fetchall()

# Dump all help articles with full content
print("=== EXISTING HELP ARTICLES (META:DOC:HELP) ===\n")
for r in rows:
    tags = json.loads(r['tagsJson']) if r['tagsJson'] else []
    if 'META:DOC:HELP' in tags:
        print(f"ID: {r['id']}")
        print(f"Title: {r['title']}")
        print(f"Category: {r['category']}")
        print(f"Tags: {tags}")
        content = r['content'] or ''
        print(f"Content length: {len(content)} chars")
        print(f"Content preview (first 500):\n{content[:500]}")
        print("---")

# Check what tags exist across all items
all_tags = set()
for r in rows:
    tags = json.loads(r['tagsJson']) if r['tagsJson'] else []
    all_tags.update(tags)
print(f"\n=== ALL TAGS IN brain_items ===\n{sorted(all_tags)}")

# Check for expected doc types
expected_tags = ['META:DOC:SYSTEM', 'META:DOC:USER', 'META:DOC:SETUP']
for tag in expected_tags:
    found = any(tag in (json.loads(r['tagsJson']) if r['tagsJson'] else []) for r in rows)
    print(f"  {tag}: {'FOUND' if found else 'MISSING'}")

# Check for module docs
module_tags = [t for t in all_tags if t.startswith('META:DOC:MODULE:')]
print(f"\nModule doc tags: {module_tags if module_tags else 'NONE'}")

conn.close()