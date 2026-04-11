
import sqlite3
import json

try:
    conn = sqlite3.connect('d:/AIOCRM/backend/data/aio_crm.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT providerKey, enabled, apiKey FROM media_provider_configs WHERE providerKey='elevenlabs'")
    row = cursor.fetchone()
    if row:
        print(f"Provider: {row['providerKey']}")
        print(f"Enabled: {row['enabled']} (Type: {type(row['enabled'])})")
        print(f"API Key: {'SET' if row['apiKey'] else 'NOT SET'}")
    else:
        print("ElevenLabs record not found.")
        
except Exception as e:
    print(f"Error: {e}")
