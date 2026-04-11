import os
import re

file_path = r"d:\AIOCRM\backend\server.py"

with open(file_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

comms_start = 7000
comms_end = 7600

replacements = []

for i, line in enumerate(lines):
    line_num = i + 1
    if line_num < comms_start or line_num > comms_end:
        continue
    
    if "require_client_safe_surface" in line or "require_workspace_role" in line:
        new_line = line
        if "comms" in line.lower() or "sms" in line.lower() or "call" in line.lower() or "phone" in line.lower() or "thread" in line.lower() or "ring group" in line.lower() or "extension" in line.lower():
            if "VIEWER" in line:
                new_line = re.sub(r"require_(workspace_role|client_safe_surface)\(request, WORKSPACE_VIEWER_ROLES", 'require_capability(request, "comms.view"', line)
            elif "EDITOR" in line:
                new_line = re.sub(r"require_(workspace_role|client_safe_surface)\(request, WORKSPACE_EDITOR_ROLES", 'require_capability(request, "comms.operate"', line)
            elif "ADMIN" in line:
                new_line = re.sub(r"require_(workspace_role|client_safe_surface)\(request, WORKSPACE_ADMIN_ROLES", 'require_capability(request, "comms.admin"', line)
        
        if new_line != line:
            replacements.append({
                "StartLine": line_num,
                "EndLine": line_num,
                "TargetContent": line.strip(),
                "ReplacementContent": new_line.strip(),
                "AllowMultiple": False
            })

import json
print(json.dumps(replacements, indent=2))
