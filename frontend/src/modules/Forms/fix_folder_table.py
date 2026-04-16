
import os

filepath = r'd:\AIOCRM\frontend\src\modules\Forms\index.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Index 1105 in 1-indexed view is lines[1105].
# lines[1106] is indices 1106.
# Let's find "FolderTable" start and end.

start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '<FolderTable' in line and i > 1100:
        start_idx = i
    if '/>' in line and start_idx != -1 and i > start_idx:
        end_idx = i
        break

if start_idx == -1 or end_idx == -1:
    print("FAILED: Could not find FolderTable block.")
    exit(1)

new_folder_table = [
    '            <FolderTable\n',
    '              title="Saved Forms"\n',
    '              description="Browse folders, search forms, and open the full builder."\n',
    '              folders={folders.map(f => ({ ...f, expanded: allFoldersExpanded }))}\n',
    '              items={forms}\n',
    '              columns={tableColumns}\n',
    '              folderProperty="folderId"\n',
    '              onFolderToggle={toggleFolder}\n',
    '              onFolderRename={handleRenameFolder}\n',
    '              onFolderDelete={handleDeleteFolder}\n',
    '              onItemSelect={toggleFormSelection}\n',
    '              onSelectAll={toggleSelectAllForms}\n',
    '              selectedItems={selectedForms}\n',
    '              selectedFolders={selectedFolders}\n',
    '              onFolderSelect={toggleFolderSelection}\n',
    '              onCreateItem={createNewForm}\n',
    '              createItemLabel="Create Form"\n',
    '              actions={\n',
    '                (selectedForms.length + selectedFolders.length) > 0 && (\n',
    '                  <button\n',
    '                    onClick={bulkDeleteSelectedForms}\n',
    '                    className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold rounded border border-red-500/30 transition shadow-sm"\n',
    '                  >\n',
    '                    <Trash2 size={14} />\n',
    '                    <span>DELETE SELECTED ({selectedForms.length + selectedFolders.length})</span>\n',
    '                  </button>\n',
    '                )\n',
    '              }\n',
    '              showHeader={false}\n',
    '              searchQuery={tableSearch}\n',
    '              onSearchQueryChange={setTableSearch}\n',
    '            />\n'
]

lines[start_idx:end_idx+1] = new_folder_table

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("SUCCESS: FolderTable restored.")
