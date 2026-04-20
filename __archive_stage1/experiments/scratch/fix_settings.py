import os
import re

file_path = r'd:\AIOCRM\frontend\src\modules\Settings\index.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Chunk 1: Replace localStorage logic
new_chunk_1 = """  useEffect(() => {
    if (activeSettingsTab) {
      setSelection(buildSettingsSelectionFromLegacy(activeSettingsTab));
    } else {
      setSelection({ categoryId: null, itemId: null });
    }
  }, [activeSettingsTab]);

  useEffect(() => {
    if (!selection.categoryId) {
      return;
    }
    setOpenCategory(selection.categoryId);
  }, [selection.categoryId]);

  const activeCategory = categories.find((category) => category.id === selection.categoryId) || null;
  const activeItem = activeCategory?.items?.find((item) => item.id === selection.itemId) || null;
  const showLanding = !selection.itemId;"""

old_chunk_pattern_1 = re.compile(
    r"  useEffect\(\(\) => \{\n    if \(activeSettingsTab\) \{\n      setSelection\(buildSettingsSelectionFromLegacy\(activeSettingsTab\)\);\n      return;\n    \}\n    try \{\n      const saved = JSON\.parse\(localStorage\.getItem\(SETTINGS_SELECTION_KEY\) \|\| 'null'\);\n      if \(saved && typeof saved === 'object'\) \{\n        setSelection\(\{\n          categoryId: saved\.categoryId \|\| null,\n          itemId: saved\.itemId \|\| null,\n        \}\);\n      \}\n    \} catch \{\}\n  \}, \[activeSettingsTab\]\);\n\n  useEffect\(\(\) => \{\n    if \(!selection\.categoryId\) \{\n      return;\n    \}\n    setOpenCategory\(selection\.categoryId\);\n  \}, \[selection\.categoryId\]\);\n\n  useEffect\(\(\) => \{\n    try \{\n      localStorage\.setItem\(SETTINGS_SELECTION_KEY, JSON\.stringify\(selection\)\);\n    \} catch \{\}\n  \}, \[selection\]\);\n\n  const activeCategory = categories\.find\(\(category\) => category\.id === selection\.categoryId\) \|\| null;\n  const activeItem = activeCategory\?\.items\?\.find\(\(item\) => item\.id === selection\.itemId\) \|\| null;\n  const showLanding = !selection\.itemId;"
)

content = old_chunk_pattern_1.sub(new_chunk_1, content)


# Chunk 2: Replace toggleCategory
new_chunk_2 = """  const toggleCategory = (categoryId) => {
    setOpenCategory(openCategory === categoryId ? null : categoryId);
  };"""

old_chunk_pattern_2 = re.compile(
    r"  const toggleCategory = \(categoryId\) => \{\n    const isClosing = openCategory === categoryId;\n    setOpenCategory\(isClosing \? null : categoryId\);\n    setSelection\(isClosing \? \{ categoryId: null, itemId: null \} : \{ categoryId, itemId: null \}\);\n  \};"
)

content = old_chunk_pattern_2.sub(new_chunk_2, content)

with open(file_path, 'w', encoding='utf-8', newline='') as f:
    f.write(content)
print("Replaced successfully!")
