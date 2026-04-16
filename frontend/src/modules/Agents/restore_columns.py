
import os

filepath = r'd:\AIOCRM\frontend\src\modules\Agents\index.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start and end of the right column within the BARRACKS view.
# Right column starts at: {/* RIGHT - Activity Panel (Monitors & Lightbars) */}
# And ends before: {/* COMMAND VIEW (Session) */}

col_start = -1
for i, line in enumerate(lines):
    if 'RIGHT - Activity Panel (Monitors & Lightbars)' in line:
        col_start = i
        break

col_end = -1
for i in range(col_start, len(lines)):
    if 'COMMAND VIEW (Session)' in line: # Careful: loop line
        pass
    if 'COMMAND VIEW (Session)' in lines[i]:
        col_end = i
        break

if col_start == -1 or col_end == -1:
    print(f"FAILED: start={col_start}, end={col_end}")
    exit(1)

# We need to construct the clean right column.
# I'll preserve the monitor panels from the current file lines 1425 to 1533 approx.
# I'll preserve the execution stream pipeline from line 1537 to 1618 approx.

# Since the file is already messy, I'll extract THE PANELS and THE PIPELINE carefully.

panels_content = []
panels_start = -1
for i in range(col_start, col_end):
    if '{/* USER MONITOR */}' in lines[i]:
        panels_start = i
        break

panels_end = -1
for i in range(panels_start, col_end):
    if 'No active execution' in lines[i]:
        # Alpha monitor ends after this.
        for j in range(i, i+10):
            if '</div>' in lines[j] and '</div>' in lines[j+1] and '</div>' in lines[j+2]:
                # This doesn't work if they are on same line or shifted.
                pass
        # I'll just look for the next DIV that has 'relative z-10 flex-1 flex flex-col justify-center'
        pass
    if 'relative z-10 flex-1 flex flex-col justify-center overflow-hidden' in lines[i]:
        panels_end = i
        break

if panels_start == -1 or panels_end == -1:
    print(f"FAILED PANELS: start={panels_start}, end={panels_end}")
    exit(1)

# Extract monitors (USER, CHARLIE, ALPHA)
monitors_block = lines[panels_start:panels_end]
# Remove any accidental extra closing divs at the very end of monitors_block.
# We want just the 3 monitor containers.

pipeline_start = panels_end # It starts right after.
pipeline_end = col_end

# NOW BUILD THE CLEAN COLUMN
new_col = [
    '              {/* RIGHT - Activity Panel (Monitors & Lightbars) */}\n',
    '              <div className="flex-1 min-h-0 min-w-0 w-1/2 flex flex-col gap-6 overflow-hidden">\n',
    '\n',
    '                {/* TOP: COMMAND MONITORS */}\n',
    '                <div className="h-[42%] flex flex-col gap-2 overflow-hidden">\n',
    '                  <div className="relative z-10 flex items-center justify-between mb-1 shrink-0">\n',
    '                    <h3 className="text-[9px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)] font-bold flex items-center gap-2">\n',
    '                      <Terminal size={10} className="text-blue-500" /> Command Monitors\n',
    '                    </h3>\n',
    '                  </div>\n',
    '                  <div className="flex-1 flex gap-4 overflow-hidden">\n'
]

new_col.extend(monitors_block)

# We closed USER, CHARLIE, ALPHA panels inside the block.
# Now close the PanelRow and MonitorSection.
new_col.extend([
    '                  </div>\n',
    '                </div>\n',
    '\n',
    '                {/* BOTTOM: EXECUTION STREAM */}\n',
    '                <div className="h-[58%] flex flex-col relative px-5 py-4 border border-white/10 rounded-[var(--radius-panel)] bg-black overflow-hidden">\n',
    '                  <div className="relative z-10 flex items-center justify-between mb-4 shrink-0">\n',
    '                    <h3 className="text-[9px] uppercase tracking-[0.24em] text-[var(--color-text-tertiary)] font-bold flex items-center gap-2">\n',
    '                      <Activity size={10} className="text-blue-500" /> Execution Stream\n',
    '                    </h3>\n',
    '                  </div>\n'
])

# Now the Pipeline block.
# We need to find where the Pipeline block ends (it ends at col_end).
new_col.extend(lines[pipeline_start:col_end])

# Close the Execution Stream container and the Right Column.
new_col.extend([
    '                </div>\n',
    '              </div>\n'
])

# REPLACE
lines[col_start:col_end] = new_col

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("SUCCESS: Right column fully restored and labeled.")
