import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))

print("=== VERIFYING PHASE 2 GLOBALS ===\n")

rows = conn.execute("""
    SELECT key, value, description, configJson 
    FROM global_variables 
    WHERE tenantId = 'tenant-primary' 
    ORDER BY key
""").fetchall()

print(f"Total global variables: {len(rows)}\n")

print("Phase 2 globals:")
for row in rows:
    key, value, description, config_json = row
    config = json.loads(config_json) if config_json else {}
    print(f"  {key}")
    print(f"    label: {config.get('label')}")
    print(f"    category: {config.get('category')}")
    if key == "emailTemplates":
        print(f"    value (parsed): {json.dumps(json.loads(value), indent=4)}")
    print()

print("\n=== VERIFY RUNTIME ACCESS ===\n")

variables = {}
for row in rows:
    key, value, _, _ = row
    variables[key] = value

print(f"Globals dict: {list(variables.keys())}")

if "emailTemplates" in variables:
    templates = json.loads(variables["emailTemplates"])
    print(f"\nStructured access: emailTemplates.variant1.subject = '{templates.get('variant1', {}).get('subject', 'NOT SET')}'")

print("\n=== LEGACY FLAT KEY ACCESS ===\n")
for key in ["emailSubject1", "emailSubject2", "emailSubject3"]:
    if key in variables:
        print(f"Legacy {key} = '{variables[key]}'")

conn.close()
print("\n=== VERIFICATION COMPLETE ===")
