import sqlite3
import os

DB_PATH = r"D:\AIOCRM\backend\data\aio_crm.db"

def search():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    
    for table in tables:
        try:
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()
            for row in rows:
                if 'Cold Outreach Test Flow' in str(row):
                    print(f"Found in table '{table}': {row}")
        except Exception as e:
            pass
            
    conn.close()

if __name__ == "__main__":
    search()
