import sqlite3
import json
import os

db = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'aio_crm.db')
conn = sqlite3.connect(db)
cur = conn.cursor()

cur.execute('SELECT id, name, edgesJson FROM flows')
rows = cur.fetchall()

for row in rows:
    edges = json.loads(row[2])
    for e in edges:
        if isinstance(e, dict):
            e['animated'] = False
            e['style'] = {
                'stroke': 'var(--color-accent)',
                'strokeWidth': 2,
                'strokeDasharray': '8 4',
            }
    cur.execute('UPDATE flows SET edgesJson = ? WHERE id = ?', (json.dumps(edges), row[0]))

conn.commit()

# Verify
cur.execute('SELECT id, name, edgesJson FROM flows')
rows = cur.fetchall()
print('After fix:')
for row in rows:
    edges = json.loads(row[2])
    dashed = sum(1 for e in edges if e.get('style', {}).get('strokeDasharray'))
    print(f'{row[1]}: {len(edges)} edges, {dashed} dashed')

conn.close()
print('\nDone. All flows set to dashed.')
