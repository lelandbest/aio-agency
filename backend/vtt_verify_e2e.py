"""
VTT End-to-End Verification Script
"""
import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"
MEDIA_STATE_PATH = Path(__file__).parent / "data" / "media_engine_state.json"

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

print("=" * 60)
print("VTT END-TO-END VERIFICATION")
print("=" * 60)

# ============================================================
# PART 1: CHECK CURRENT STATE
# ============================================================

print("\n[1] CHECKING TAGS")
print("-" * 40)

mtg_tags = conn.execute("SELECT name, isLocked, type FROM tags WHERE name LIKE 'MTG:%'").fetchall()
for tag in mtg_tags:
    print(f"  {tag['name']}: locked={tag['isLocked']}, type={tag['type']}")

print("\n[2] CHECKING BRAIN ITEMS FOR TRANSCRIPTS")
print("-" * 40)

brain_transcripts = conn.execute("""
    SELECT id, title, category, content, tagsJson, sourceId, updatedAt 
    FROM brain_items 
    WHERE category = 'transcript'
""").fetchall()

if brain_transcripts:
    print(f"  Found {len(brain_transcripts)} transcript brain items:")
    for item in brain_transcripts:
        tags = json.loads(item['tagsJson']) if item['tagsJson'] else []
        print(f"    - {item['id']}")
        print(f"      title: {item['title']}")
        print(f"      content: {item['content'][:80]}...")
        print(f"      tags: {tags}")
        print(f"      sourceId: {item['sourceId']}")
else:
    print("  NO transcript brain items found")

print("\n[3] CHECKING MEDIA ENGINE STATE FOR TRANSCRIPTS")
print("-" * 40)

if MEDIA_STATE_PATH.exists():
    media_state = json.loads(MEDIA_STATE_PATH.read_text())
    transcript_artifacts = media_state.get("transcript_artifacts", [])
    print(f"  Found {len(transcript_artifacts)} transcript artifacts in transient state")
    for ta in transcript_artifacts[:3]:
        print(f"    - {ta['id']}: {ta.get('title', 'N/A')}")
        print(f"      transcript: {ta.get('transcript_text', 'N/A')[:50]}...")

print("\n[4] CHECKING ORCHESTRATION CODE PATHS")
print("-" * 40)

# Read orchestration to check both paths
import re

orchestration_code = Path(__file__).parent / "orchestration.py"
if orchestration_code.exists():
    code = orchestration_code.read_text()
    
    # Check transcribe_media for brain_items
    transcribe_section = re.search(r'def _transcribe_media\(.*?\n(?:.*?\n)*?.*?return', code, re.MULTILINE)
    if transcribe_section:
        has_brain_items = 'create_brain_item' in transcribe_section.group()
        has_tag = 'MTG:TRANSCRIPT' in transcribe_section.group()
        print(f"  transcribe_media path:")
        print(f"    - brainItems persistence: {'YES' if has_brain_items else 'NO'}")
        print(f"    - MTG:TRANSCRIPT tag: {'YES' if has_tag else 'NO'}")
    
    # Check ingest_meeting_artifacts for brain_items
    ingest_section = re.search(r'def _ingest_meeting_artifacts\(.*?\n(?:.*?\n)*?.*?return', code, re.MULTILINE)
    if ingest_section:
        has_brain_items = 'create_brain_item' in ingest_section.group()
        has_tag = 'MTG:TRANSCRIPT' in ingest_section.group()
        print(f"  ingest_meeting_artifacts path:")
        print(f"    - brainItems persistence: {'YES' if has_brain_items else 'NO'}")
        print(f"    - MTG:TRANSCRIPT tag: {'YES' if has_tag else 'NO'}")

print("\n[5] CHECKING RESPONSE CONTRACT")
print("-" * 40)

# Check what transcribe_media returns
if transcribe_section:
    returns_brain_item_id = 'brainItemId' in transcribe_section.group()
    returns_tags = 'tags' in transcribe_section.group()
    print(f"  transcribe_media returns:")
    print(f"    - brainItemId: {'YES' if returns_brain_item_id else 'NO'}")
    print(f"    - tags array: {'YES' if returns_tags else 'NO'}")

# Check what ingest_meeting_artifacts returns
if ingest_section:
    returns_brain_item_id = 'brainItemId' in ingest_section.group()
    returns_tags = 'tags' in ingest_section.group()
    print(f"  ingest_meeting_artifacts returns:")
    print(f"    - brainItemId: {'YES' if returns_brain_item_id else 'NO'}")
    print(f"    - tags array: {'YES' if returns_tags else 'NO'}")

conn.close()

print("\n" + "=" * 60)
print("VERIFICATION COMPLETE")
print("=" * 60)
