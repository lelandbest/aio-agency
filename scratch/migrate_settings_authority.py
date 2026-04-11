import os
import re

file_path = r"d:\AIOCRM\frontend\src\modules\Settings\index.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace legacy role checks with capability checks
content = re.sub(
    r"const currentRole = String\(tenant\?\.role \|\| user\?\.role \|\| 'viewer'\)\.toLowerCase\(\);",
    "const { hasCapability } = useAuth();",
    content
)

content = re.sub(
    r"const canManage = \['owner', 'admin'\]\.includes\(currentRole\);",
    "const canManage = hasCapability('system.admin');",
    content
)

content = re.sub(
    r"const canManageWorkspace = \['owner', 'admin'\]\.includes\(currentRole\);",
    "const canManageWorkspace = hasCapability('system.admin');",
    content
)

content = re.sub(
    r"const canCreateWorkspace = \['owner', 'admin'\]\.includes\(currentRole\);",
    "const canCreateWorkspace = hasCapability('system.admin');",
    content
)

# isOwner for Omega/Archive
content = re.sub(
    r"const isOwner = currentRole === 'owner';",
    "const isOwner = hasCapability('system.omega');",
    content
)

content = re.sub(
    r"const canArchiveWorkspace = currentRole === 'owner';",
    "const canArchiveWorkspace = hasCapability('system.omega');",
    content
)

content = re.sub(
    r"const isOwner = \(\(tenant\?\.role \|\| user\?\.role \|\| 'viewer'\)\.toLowerCase\(\) === 'owner'\);",
    "const isOwner = hasCapability('system.omega');",
    content
)

# Cleanup other legacy role strings in settings
content = re.sub(r"role === 'owner' \?", "hasCapability('system.omega') ?", content)
content = re.sub(r"currentRole === 'owner'", "hasCapability('system.omega')", content)

# Categories logic
content = re.sub(
    r"const isAdmin = \['owner', 'admin'\]\.includes\(role\);",
    "const { hasCapability } = useAuth();\n  const isAdmin = hasCapability('system.admin');",
    content
)

content = re.sub(
    r"const isOwner = role === 'owner';",
    "const isOwner = hasCapability('system.omega');",
    content
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
