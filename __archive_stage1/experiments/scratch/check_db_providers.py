
import sqlite3
import json

try:
    conn = sqlite3.connect('d:/AIOCRM/backend/data/aio_crm.db')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print(f"Tables: {tables}")
    
    table_names = [t[0] for t in tables]
    if 'media_provider_configs' in table_names:
        cursor.execute("SELECT providerKey, configJson FROM media_provider_configs")
        configs = cursor.fetchall()
        for k, c in configs:
            print(f"Provider: {k}")
            print(f"Config: {c}")
    else:
        print("media_provider_configs table NOT FOUND")
        
except Exception as e:
    print(f"Error: {e}")
