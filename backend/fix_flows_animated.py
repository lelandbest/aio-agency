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
    anim_count = sum(1 for e in edges if e.get('animated'))
    print(f'{row[1]}: {len(edges)} edges, {anim_count} animated')
    
    # Fix: set all animated to false
    for e in edges:
        if isinstance(e, dict) and e.get('animated'):
            e['animated'] = False
    
    # Save back
    cur.execute('UPDATE flows SET edgesJson = ? WHERE id = ?', (json.dumps(edges), row[0]))

conn.commit()

# Verify
cur.execute('SELECT id, name, edgesJson FROM flows')
rows = cur.fetchall()
print('\nAfter fix:')
for row in rows:
    edges = json.loads(row[2])
    anim_count = sum(1 for e in edges if e.get('animated'))
    print(f'{row[1]}: {len(edges)} edges, {anim_count} animated')

conn.close()
print('\nDone. All flows fixed.')
