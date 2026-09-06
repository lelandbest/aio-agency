"""
AIO Nexus — Backward-Compatible Server Entrypoint
Delegates application lifecycle and routing to modular app.py.
Maintains full backward compatibility for `python backend/server.py` and `uvicorn backend.server:app`.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure root directory is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.app import app
from backend.deps import auth_store, provider
from backend.routes.ai import ai_command
from backend.routes.signals import execute_signal

__all__ = [
    "app",
    "auth_store",
    "provider",
    "ai_command",
    "execute_signal",
]

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8001))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("backend.app:app", host=host, port=port, log_level="info", reload=False)
