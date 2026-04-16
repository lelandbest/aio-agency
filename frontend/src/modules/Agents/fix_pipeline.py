
import os

filepath = r'd:\AIOCRM\frontend\src\modules\Agents\index.jsx'
with open(filepath, 'r', encoding='utf-8') as f:
    orig_lines = f.readlines()

# We want to find the Execution Stream section and fix the nesting.
# Section starts at: <div className="h-[58%] flex flex-col relative px-5 py-4 border border-white/10 rounded-[var(--radius-panel)] bg-black overflow-hidden">
# It's currently around line 1530-1550 (shifted).

start_search_idx = -1
for i, line in enumerate(orig_lines):
    if 'BOTTOM: SPECIALIST LIGHTBARS' in line:
        start_search_idx = i
        break

if start_search_idx == -1:
    print("FAILED: Could not find section.")
    exit(1)

# The content we want to replace is the entire 'relative z-10 flex-1' div.
div_start = -1
for i in range(start_search_idx, len(orig_lines)):
    if 'relative z-10 flex-1 flex flex-col justify-center overflow-hidden' in orig_lines[i]:
        div_start = i
        break

# The end of this section is the end of the view logic.
view_end = -1
for i in range(div_start, len(orig_lines)):
    if 'COMMAND VIEW (Session)' in orig_lines[i]:
        view_end = i
        break

if div_start == -1 or view_end == -1:
    print("FAILED: Could not find block.")
    exit(1)

# We'll just replace everything between 'Execution Stream' title and the end of the barracks view.
# Backtracking to find the start of the return (...) part or just replacing the whole div.

new_content = [
    '                  <div className="relative z-10 flex-1 flex flex-col justify-center overflow-hidden">\n',
    '                    {activeRun ? (\n',
    '                      <div className="flex flex-col gap-6">\n',
    '                        {(() => {\n',
    '                          const PIPELINE = [\n',
    '                            { id: \'charlie_in\', label: \'Intake\', icon: Mail, color: \'text-amber-500\', bg: \'rgba(245,158,11,0.1)\' },\n',
    '                            { id: \'cortex_r\', label: \'Cortex\', icon: Database, color: \'text-slate-400\', bg: \'rgba(148,163,184,0.1)\', cortex: true },\n',
    '                            { id: \'alpha_orch\', label: \'Alpha\', icon: Layers, color: \'text-blue-500\', bg: \'rgba(59,130,246,0.1)\' },\n',
    '                            { id: \'agent\', label: activeRun.executingAgent || \'Agent\', icon: Bot, color: \'text-teal-400\', bg: \'rgba(45,212,191,0.1)\' },\n',
    '                            { id: \'alpha_qc\', label: \'QC Control\', icon: Shield, color: \'text-blue-500\', bg: \'rgba(59,130,246,0.1)\' },\n',
    '                            { id: \'cortex_w\', label: \'Cortex\', icon: Database, color: \'text-slate-400\', bg: \'rgba(148,163,184,0.1)\', cortex: true },\n',
    '                            { id: \'charlie_out\', label: \'Response\', icon: MessageSquare, color: \'text-amber-500\', bg: \'rgba(245,158,11,0.1)\' },\n',
    '                          ];\n',
    '\n',
    '                          const status = (activeRun.status || \'\').toLowerCase();\n',
    '                          const isComplete = [\'completed\', \'success\'].includes(status);\n',
    '                          const isNodeActive = (idx) => {\n',
    '                            if (isComplete) return false;\n',
    '                            if (activeRun.dispatcherAgent && idx === 2) return true;\n',
    '                            if (activeRun.executingAgent && idx === 3) return true;\n',
    '                            if (idx === 0) return true;\n',
    '                            return false;\n',
    '                          };\n',
    '                          \n',
    '                          // Simplified V1 index\n',
    '                          const activeIdx = isComplete ? 99 : activeRun.executingAgent ? 3 : activeRun.dispatcherAgent ? 2 : 0;\n',
    '\n',
    '                          return (\n',
    '                            <div className="flex items-center justify-center gap-0 w-full max-w-5xl mx-auto py-2">\n',
    '                              {PIPELINE.map((node, idx) => {\n',
    '                                const isActive = idx === activeIdx;\n',
    '                                const isCompleted = idx < activeIdx;\n',
    '                                const stateClass = isActive ? \'active\' : isCompleted ? \'completed\' : \'idle\';\n',
    '                                const Icon = node.icon || Box;\n',
    '\n',
    '                                return (\n',
    '                                  <React.Fragment key={node.id}>\n',
    '                                    <div \n',
    '                                      className={`\n',
    '                                        pipeline-node px-3 py-2 rounded-full flex items-center gap-2 min-w-[100px]\n',
    '                                        ${stateClass} ${node.color}\n',
    '                                      `}\n',
    '                                    >\n',
    '                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${node.bg} border border-white/5`}>\n',
    '                                        <Icon size={12} className={node.color} />\n',
    '                                      </div>\n',
    '                                      <div className="flex flex-col">\n',
    '                                        <span className="text-[8px] font-black uppercase tracking-widest leading-none mb-0.5">{node.label}</span>\n',
    '                                        <span className="text-[7px] font-mono opacity-40 uppercase tracking-tighter">{idx === 3 ? (activeRun.executingAgent || \'SPEC\') : node.id.split(\'_\')[0]}</span>\n',
    '                                      </div>\n',
    '                                    </div>\n',
    '                                    \n',
    '                                    {idx < PIPELINE.length - 1 && (\n',
    '                                      <div className={`flex-1 h-[1px] min-w-[12px] mx-1 ${isActive || isCompleted ? \'bg-white/20\' : \'bg-white/5\'} ${isActive ? \'flow-active-line\' : \'\'} ${node.color.replace(\'text-\', \'text-opacity-20 \')}`} style={{ color: isActive ? \'white\' : \'currentColor\' }}>\n',
    '                                      </div>\n',
    '                                    )}\n',
    '                                  </React.Fragment>\n',
    '                                );\n',
    '                              })}\n',
    '                            </div>\n',
    '                          );\n',
    '                        })()}\n',
    '\n',
    '                        <div className="grid grid-cols-4 gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--color-text-secondary)]">\n',
    '                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-black/40 text-center">\n',
    '                            Source: {selectedRoute?.source || \'OPERATOR\'}\n',
    '                          </div>\n',
    '                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-black/40 text-center">\n',
    '                            Intake: {activeRun?.intakeAgent || \'CHARLIE\'}\n',
    '                          </div>\n',
    '                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-black/40 text-center">\n',
    '                            Dispatch: {activeRun?.dispatcherAgent || \'ALPHA\'}\n',
    '                          </div>\n',
    '                          <div className="border border-[var(--color-border)] rounded px-3 py-2 bg-black/40 text-center">\n',
    '                            Result: {formatStatus(activeRun?.status || \'idle\')}\n',
    '                          </div>\n',
    '                        </div>\n',
    '                      </div>\n',
    '                    ) : (\n',
    '                      <div className="flex-1 flex items-center justify-center text-[10px] uppercase tracking-[0.4em] text-[var(--color-text-tertiary)] font-black opacity-30">\n',
    '                        Awaiting Canonical Intent Stream\n',
    '                      </div>\n',
    '                    )}\n',
    '                  </div>\n',
    '                </div>\n',
    '              </div>\n',
    '            );\n',
    '          })()}\n'
]

# We need to find where the barracks return starts.
# Actually, I'll just find the start of the 'BOTTOM: SPECIALIST LIGHTBARS' div.
lightbar_start = -1
for i in range(div_start - 20, div_start):
    if 'BOTTOM: SPECIALIST LIGHTBARS' in orig_lines[i]:
        lightbar_start = i
        break

# We replace from lightbar_start to the end of the barracks view.
orig_lines[lightbar_start:view_end] = new_content

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(orig_lines)

print("SUCCESS: Pipeline fixed.")
