import sqlite3
import json
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

conn = sqlite3.connect(str(DB_PATH))
conn.row_factory = sqlite3.Row

print("=== STEP 1: VERIFY GLOBAL STORAGE PATH ===\n")

print("Storage: global_variables table in aio_crm.db")
print("Canonical read path: tenantSettings.globalVariables -> _canonical_global_variables()")
print("Runtime path: context.globals.* via orchestration.py _global_variables()\n")

rows = conn.execute("""
    SELECT id, tenantId, key, value, description, isSecret, isSystem, configJson
    FROM global_variables 
    WHERE tenantId = 'tenant-primary'
    ORDER BY key
""").fetchall()

print(f"Total global variables in DB: {len(rows)}\n")

print("=== ALL GLOBALS ===\n")
for row in rows:
    config = json.loads(row["configJson"]) if row["configJson"] else {}
    print(f"Key: {row['key']}")
    print(f"  value: {row['value'][:50] if row['value'] and len(row['value']) > 50 else row['value']}")
    print(f"  category: {config.get('category')}")
    print(f"  label: {config.get('label')}")
    print()

print("=== STEP 2: VERIFY CANONICAL STRUCTURED OBJECT ===\n")

templates_row = conn.execute("SELECT value FROM global_variables WHERE key = 'emailTemplates' AND tenantId = 'tenant-primary'").fetchone()

if templates_row:
    templates = json.loads(templates_row["value"])
    print("emailTemplates structured object:")
    print(json.dumps(templates, indent=2))
    
    for variant in ["variant1", "variant2", "variant3"]:
        if variant in templates:
            fields = templates[variant]
            print(f"\n{variant}:")
            for field, value in fields.items():
                print(f"  {field}: '{value}'")
else:
    print("ERROR: emailTemplates not found!")

conn.close()
