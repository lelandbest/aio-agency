
import sqlite3

db_path = r'D:\AIOCRM\backend\data\aio_crm.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row

def check_schema():
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print("Tables:")
    for t in tables:
        print(f" - {t['name']}")
        columns = conn.execute(f"PRAGMA table_info({t['name']})").fetchall()
        for c in columns:
            print(f"   * {c['name']} ({c['type']})")

if __name__ == "__main__":
    check_schema()
