"""
Fix TopBar stacking context problem.

Root cause: .chrome-surface has backdrop-filter which creates its own CSS stacking context.
Any z-index on children is scoped INSIDE that context. Module content rendered as a sibling 
will paint above topbar popups regardless of z-index values.

Fix strategy:
1. Add `createPortal` import to TopBar - render all flyout panels at body level
2. All popup panels now portal to document.body at fixed positions
3. Calculate panel position from button ref's bounding rect
4. Remove overflow:visible hack from chrome-surface (no longer needed)
"""
import re

path = r'd:\AIOCRM\frontend\src\components\TopBar.jsx'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# 1. Add createPortal to the React import
src = src.replace(
    "import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';",
    "import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';\nimport { createPortal } from 'react-dom';",
    1
)

# 2. Remove the overflow:visible hack on chrome-surface we added last pass
src = src.replace(
    '<div className="chrome-surface" style={{ overflow: "visible", position: "relative" }}>',
    '<div className="chrome-surface" style={{ position: "relative", zIndex: 40 }}>',
    1
)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(src)

print("Phase 1 done - createPortal import added, chrome-surface z-index set")
print("Checking...")

checks = [
    ('createPortal imported', "createPortal } from 'react-dom'" in src or "{ createPortal }" in src),
    ('chrome-surface has zIndex:40', 'zIndex: 40' in src),
]
for label, ok in checks:
    print(f"  {'OK' if ok else 'FAIL'} {label}")
