
import os

filepath = r'd:\AIOCRM\frontend\src\modules\Forms\index.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Line 1094 in the 1-indexed view is index 1093
# We want to replace from lines[1094] (index 1094 which is actually line 1095) up to 1106
# Wait, let's be extremely careful.

# Line 1094:                         <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-tertiary)]">
# Line 1095:               columns={tableColumns}

# New code to insert:
new_code = [
    '                          {(form.schema || []).length} field{(form.schema || []).length === 1 ? \'\' : \'s\'}\n',
    '                        </div>\n',
    '                      </div>\n',
    '                    </button>\n',
    '                  ))\n',
    '                ) : null}\n',
    '              </div>\n',
    '            </div>\n',
    '          </div>\n',
    '\n',
    '          <div className="module-content-stage px-2 pb-2">\n',
    '            <FolderTable\n',
    '              title="Saved Forms"\n',
    '              description="Browse folders, search forms, and open the full builder."\n',
    '              folders={folders.map(f => ({ ...f, expanded: allFoldersExpanded }))}\n',
    '              items={forms}\n'
]

# We are replacing lines 1095 to 1105 (indices 1094 to 1104)
# Let's verify the content of those lines first in the script.

print(f"DEBUG: line 1094: {lines[1093]!r}")
print(f"DEBUG: line 1095: {lines[1094]!r}")

# Replacement
lines[1094:1105] = new_code

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("SUCCESS: File fixed.")
