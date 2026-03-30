import sqlite3
conn = sqlite3.connect('data/aio_crm.db')
rows = conn.execute('SELECT id, title, content FROM brain_items WHERE category="transcript"').fetchall()
print('Brain transcript items:', len(rows))
for r in rows:
    print(f'  {r[0]}: {r[1][:50]}')
conn.close()
