from __future__ import annotations

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]

CHECK_FILES = [
    "backend/agent_definitions.py",
    "backend/server.py",
    "backend/data_provider.py",
    "frontend/src/modules/Agents/data/agentRegistry.js",
    "frontend/src/data/initialDb.js",
    "frontend/src/modules/Comms/index.jsx",
    "frontend/src/modules/CRM/index.jsx",
]

APEX_PATTERN = re.compile(r"\bAPEX\b")
GHOST_TITLE_PATTERN = re.compile(r"\bGhost\b")


def main() -> int:
    failures: list[str] = []
    for rel in CHECK_FILES:
        path = ROOT / rel
        if not path.exists():
            failures.append(f"Missing file: {rel}")
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if APEX_PATTERN.search(text):
            failures.append(f"APEX identity detected in {rel}")
        if GHOST_TITLE_PATTERN.search(text):
            failures.append(f"Non-canonical casing 'Ghost' detected in {rel}")

    if failures:
        for line in failures:
            print(f"[agent-identity] {line}")
        return 1
    print("[agent-identity] OK: GHOST canonical, no APEX detected in identity sources.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
