import os

file_path = r'd:\AIOCRM\frontend\src\components\Sidebar.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if 'CustomEvent(\'aio:open-charlie\')' in line:
        # We need the indentation
        indent = line[:line.find('onClick')]
        # This will append it after the button definition
        # Actually it's better to find the end of the button
        pass

# Simpler: find the closing nav tag or similar
content = "".join(lines)
logout_code = """
                            <button 
                                onClick={onLogout}
                                className={`mt-2 p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-[var(--radius-card)] transition flex items-center gap-2 ${isCollapsed ? 'w-full flex justify-center' : ''}`}
                                title="Logout and Exit"
                            >
                                <X size={16} />
                                {!isCollapsed && <span className="text-xs font-bold uppercase tracking-widest">Logout System</span>}
                            </button>"""

if 'onLogout' not in content:
    target = "<span>Charlie</span>}"
    if target in content:
        # We insert after the end of that button's closing tag
        # Find the next </button>
        idx = content.find(target)
        if idx != -1:
            end_btn = content.find("</button>", idx)
            if end_btn != -1:
                insert_at = end_btn + 9 # end of </button>
                content = content[:insert_at] + logout_code + content[insert_at:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Sidebar updated with emergency logout button.")
