"""
AIO Nexus v2 — Standalone Appliance Launcher
Robust, cross-platform entrypoint that manages lifecycle, port binding,
Ollama health, and automated browser opening with zero batch-script fragile parsing.
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

# Ensure repository root is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PORT = int(os.getenv("PORT", 8001))
HOST = os.getenv("HOST", "0.0.0.0")


def is_port_active(host: str, port: int) -> bool:
    """Checks whether the specified port is already open and accepting connections."""
    target = "127.0.0.1" if host in ("0.0.0.0", "") else host
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1.0)
        return s.connect_ex((target, port)) == 0


def check_ollama(port: int = 11434) -> bool:
    """Detects whether Ollama is running locally for vector intelligence."""
    try:
        req = urllib.request.Request(f"http://localhost:{port}/api/tags")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            return resp.status == 200
    except Exception:
        return False


def wait_and_open_browser(url: str, max_seconds: int = 30) -> None:
    """Waits for the backend health endpoint to respond and automatically launches the browser."""
    health_url = f"http://localhost:{PORT}/api/health"
    start_time = time.time()
    while time.time() - start_time < max_seconds:
        try:
            req = urllib.request.Request(health_url)
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    time.sleep(0.3)
                    webbrowser.open(url)
                    return
        except Exception:
            pass
        time.sleep(0.5)


def print_banner() -> None:
    print("=" * 72)
    print("       AIO NEXUS v2 -- AUTONOMOUS OPERATING SYSTEM")
    print("            Single Operator Appliance -- Standalone")
    print("                  Zero Cloud Rent - Local-First")
    print("=" * 72)
    print()


def main() -> None:
    print_banner()

    # 1. Check if the appliance is already running
    if is_port_active("127.0.0.1", PORT):
        print(f"[INFO] AIO Nexus is already running and listening on port {PORT}.")
        print(f"Opening browser to http://localhost:{PORT}...")
        webbrowser.open(f"http://localhost:{PORT}")
        print()
        print("To stop or restart the appliance, run stop-appliance.bat.")
        input("Press Enter to close this launcher...")
        return

    # 2. Check local Ollama
    if check_ollama():
        print("[OK] Ollama local neural intelligence detected (:11434)")
    else:
        print("[INFO] Ollama not detected on :11434 (Hybrid search will use keyword fallback)")

    print()
    print(f"[*] Starting AIO Nexus Appliance on http://localhost:{PORT}...")
    print("=" * 72)
    print(f"  * Cockpit Interface: http://localhost:{PORT}")
    print(f"  * Mobile / Pocket:   http://localhost:{PORT}/?view=pocket")
    print(f"  * REST API Health:   http://localhost:{PORT}/api/health")
    print()
    print("  * Default Login:     support@aiocrm.org")
    print("  * Default Password:  aioadmin123")
    print()
    print("  Press Ctrl+C in this window to safely shut down the appliance.")
    print("=" * 72)
    print()

    # 3. Start background thread to open default browser once ready
    browser_thread = threading.Thread(
        target=wait_and_open_browser,
        args=(f"http://localhost:{PORT}",),
        daemon=True,
    )
    browser_thread.start()

    # 4. Start production Uvicorn server
    import uvicorn
    from backend.app import app

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        access_log=True,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAIO Nexus Appliance shut down cleanly.")
        sys.exit(0)
    except Exception as err:
        print(f"\n[FATAL ERROR] Launcher failed: {err}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)
