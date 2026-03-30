import re

path = r'd:\AIOCRM\frontend\src\modules\Flows\FlowBuilder.jsx'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

terms = ['execution history', 'FlowRunHistory', 'flow runs', 'FLOW RUNS', 'showHistory', 
         'historyPanel', 'runHistory', 'ExecutionHistory', 'RunHistory', 'showRuns', 
         'setShowHistory', 'setShowRuns', 'history panel']

for term in terms:
    for i, line in enumerate(lines):
        if term.lower() in line.lower():
            print(f'LINE {i+1} [{term}]: {line.rstrip()}')
