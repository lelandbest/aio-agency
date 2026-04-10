
import sqlite3
import json
import os
import sys

# Paths
DB_PATH = 'd:/AIOCRM/backend/data/aio_crm.db' 
MEDIA_STATE_PATH = 'd:/AIOCRM/backend/data/media_engine_state.json'

def migrate_db():
    if not os.path.exists(DB_PATH):
        print(f"DB not found at {DB_PATH}, skipping...")
        return

    print(f"Migrating database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. tags table -> name and prefix to UPPERCASE
    print("Correcting 'tags' table...")
    tags = cursor.execute("SELECT id, name FROM tags").fetchall()
    for tag in tags:
        old_name = tag['name']
        new_name = old_name.strip().upper()
        if old_name != new_name:
            prefix = new_name.split(':', 1)[0] if ':' in new_name else ''
            cursor.execute("UPDATE tags SET name = ?, prefix = ? WHERE id = ?", (new_name, prefix, tag['id']))
            print(f"  TAG: {old_name} -> {new_name}")

    # 2. contacts table -> tagsJson
    print("Correcting 'contacts' table tagsJson...")
    contacts = cursor.execute("SELECT id, tagsJson FROM contacts WHERE tagsJson IS NOT NULL").fetchall()
    for contact in contacts:
        try:
            old_tags = json.loads(contact['tagsJson'] or '[]')
            if not isinstance(old_tags, list): continue
            new_tags = [str(t).strip().upper() for t in old_tags]
            if old_tags != new_tags:
                cursor.execute("UPDATE contacts SET tagsJson = ? WHERE id = ?", (json.dumps(new_tags), contact['id']))
        except:
            continue

    # 3. brain_items table -> tagsJson
    print("Correcting 'brain_items' table tagsJson...")
    items = cursor.execute("SELECT id, tagsJson FROM brain_items WHERE tagsJson IS NOT NULL").fetchall()
    for item in items:
        try:
            old_tags = json.loads(item['tagsJson'] or '[]')
            if not isinstance(old_tags, list): continue
            new_tags = [str(t).strip().upper() for t in old_tags]
            if old_tags != new_tags:
                cursor.execute("UPDATE brain_items SET tagsJson = ? WHERE id = ?", (json.dumps(new_tags), item['id']))
        except:
            continue
    
    conn.commit()
    conn.close()

def migrate_media_state():
    if not os.path.exists(MEDIA_STATE_PATH):
        print(f"Media state not found at {MEDIA_STATE_PATH}, skipping...")
        return

    print(f"Migrating media engine state: {MEDIA_STATE_PATH}")
    with open(MEDIA_STATE_PATH, 'r') as f:
        try:
            state = json.load(f)
        except:
            print("Failed to parse media state JSON")
            return

    modified = False
    assets = state.get('assets', [])
    if isinstance(assets, list):
        for asset in assets:
            if not isinstance(asset, dict): continue
            old_tags = asset.get('tags', [])
            if not isinstance(old_tags, list): continue
            new_tags = [str(t).strip().upper() for t in old_tags]
            if old_tags != new_tags:
                asset['tags'] = new_tags
                modified = True
                # print(f"  ASSET {asset.get('id')}: {old_tags} -> {new_tags}")
    elif isinstance(assets, dict):
        for asset_id, asset in assets.items():
            old_tags = asset.get('tags', [])
            if not isinstance(old_tags, list): continue
            new_tags = [str(t).strip().upper() for t in old_tags]
            if old_tags != new_tags:
                asset['tags'] = new_tags
                modified = True

    if modified:
        with open(MEDIA_STATE_PATH, 'w') as f:
            json.dump(state, f, indent=4)
        print("Media state updated.")
    else:
        print("No changes needed in media state.")

if __name__ == "__main__":
    migrate_db()
    migrate_media_state()
