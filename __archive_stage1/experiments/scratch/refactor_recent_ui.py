import os

path = r'd:\AIOCRM\frontend\src\modules\Help\index.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Refactor the Recent Intel container
target = '<div className="max-w-4xl mx-auto grid grid-cols-2 gap-8 pt-4 pb-2">'
replacement = '<div className="max-w-6xl mx-auto space-y-6 pt-4 pb-6">'
content = content.replace(target, replacement)

# Refactor Recent Intel list to pills
target_intel = '''                  <div className="flex flex-wrap gap-2">
                    {recentArticles.map(article => (
                      <button
                        key={article.id}
                        onClick={() => handleSelectArticle(articles.find(a => a.id === article.id))}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold text-white hover:bg-white/10 transition-all truncate max-w-[150px]"
                      >
                        {article.title}
                      </button>
                    ))}
                  </div>'''

replacement_intel = '''                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
                    {recentArticles.slice(0, 5).map(article => (
                      <button
                        key={article.id}
                        onClick={() => handleSelectArticle(articles.find(a => a.id === article.id))}
                        className="flex-none px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-white hover:bg-[var(--color-primary)]/20 hover:border-[var(--color-primary)]/30 transition-all whitespace-nowrap active:scale-95"
                      >
                        {article.title}
                      </button>
                    ))}
                  </div>'''

content = content.replace(target_intel, replacement_intel)

# Refactor Recent Actions list to pills
target_actions = '''                  <div className="flex flex-wrap gap-2">
                    {recentActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRunAction({ type: action.type, payload: action.payload }, action.label)}
                        className="px-3 py-1.5 rounded-lg bg-sky-500/5 border border-sky-500/10 text-[9px] font-bold text-sky-400 hover:bg-sky-500/10 transition-all"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>'''

replacement_actions = '''                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    {recentActions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRunAction({ type: action.type, payload: action.payload }, action.label)}
                        className="flex-none px-4 py-2 rounded-full bg-sky-500/5 border border-sky-500/10 text-[10px] font-bold text-sky-400 hover:bg-sky-500/10 transition-all whitespace-nowrap active:scale-95"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>'''

content = content.replace(target_actions, replacement_actions)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("UI Refactored Successfully.")
