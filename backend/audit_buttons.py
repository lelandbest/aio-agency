import re

# Audit toolbar buttons in FlowBuilder
path = r'd:\AIOCRM\frontend\src\modules\Flows\FlowBuilder.jsx'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

# Find the bottom toolbar (dock) buttons
terms = ['Run\nFlow', 'Deploy', 'Activation', 'Add\nNode', 'AI\nNode', 'Align', 'Add Note', 'Delete',
         'RunFlow', 'DeployDisabled', 'flow-control-dock', 'dock', 'toolbar', 'bottom',
         'handleRun', 'handleDeploy', 'handleAlign', 'handleDelete',
         'onRunFlow', 'onDeploy', 'disabled={true}', 'cursor-not-allowed',
         'isRunningFlow', 'isDirty', 'handleSave']

seen = set()
for term in terms:
    for i, line in enumerate(lines):
        if term.lower() in line.lower() and i not in seen:
            seen.add(i)
            print(f'LINE {i+1}: {line.rstrip()}')
