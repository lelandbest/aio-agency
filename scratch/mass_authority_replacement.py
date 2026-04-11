import os
import re

file_path = r"d:\AIOCRM\backend\server.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Domain specific mapping
content = re.sub(r'require_workspace_role\(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage forms\."', 'require_capability(request, "crm.edit", "Only workspace staff or higher can manage forms."', content)
content = re.sub(r'require_workspace_role\(request, WORKSPACE_VIEWER_ROLES, "Only workspace members can view CMS tables\."', 'require_capability(request, "crm.view", "Only workspace members can view CMS tables."', content)
content = re.sub(r'require_workspace_role\(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can manage booking types\."', 'require_capability(request, "comms.operate", "Only workspace staff or higher can manage booking types."', content)

# Orders
content = re.sub(r'require_workspace_role\(request, WORKSPACE_VIEWER_ROLES, "Need viewer role to view orders\."', 'require_capability(request, "crm.view", "Need viewer role to view orders."', content)
content = re.sub(r'require_workspace_role\(request, WORKSPACE_EDITOR_ROLES, "Need editor role to (create|update|delete) orders\."', r'require_capability(request, "crm.edit", "Need editor role to \1 orders."', content)

# Signals
content = re.sub(r'require_workspace_role\(request, WORKSPACE_EDITOR_ROLES, "Only workspace staff or higher can (view|execute) signals\."', r'require_capability(request, "system.manage", "Only workspace staff or higher can \1 signals."', content)

# Generic viewers
content = re.sub(r'require_(workspace_role|client_safe_surface)\(request, WORKSPACE_VIEWER_ROLES', 'require_capability(request, "system.view"', content)
# Generic editors
content = re.sub(r'require_(workspace_role|client_safe_surface)\(request, WORKSPACE_EDITOR_ROLES', 'require_capability(request, "system.manage"', content)
# Generic admins
content = re.sub(r'require_(workspace_role|client_safe_surface)\(request, WORKSPACE_ADMIN_ROLES', 'require_capability(request, "system.admin"', content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
