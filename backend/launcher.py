"""
AIO Nexus — Core Launcher
Manages lifecycle, port binding, Ollama health, Win32 taskbar minimization,
and automatic window launch with crash protection.
"""

from __future__ import annotations

import ctypes
import os
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

# Ensure repository / app root is in sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PORT = int(os.getenv("PORT", 8001))
HOST = os.getenv("HOST", "0.0.0.0")

# Win32 Constants
SW_MINIMIZE = 6
SW_RESTORE = 9


def minimize_console_to_taskbar() -> None:
    """Minimizes the current console window directly to the taskbar without stealing focus."""
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, SW_MINIMIZE)
    except Exception:
        pass


def restore_console_window() -> None:
    """Restores the console window to full view."""
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, SW_RESTORE)
    except Exception:
        pass


def find_tauri_executable() -> Path | None:
    """Searches for the compiled Tauri native desktop application executable."""
    candidates = [
        REPO_ROOT / "AIO Nexus.exe",
        REPO_ROOT.parent / "AIO Nexus.exe",
        REPO_ROOT / "aio-nexus.exe",
        REPO_ROOT.parent / "aio-nexus.exe",
        REPO_ROOT / "frontend" / "src-tauri" / "target" / "release" / "app.exe",
        REPO_ROOT / "frontend" / "src-tauri" / "target" / "release" / "aio-nexus.exe",
        REPO_ROOT / "frontend" / "src-tauri" / "target" / "release" / "AIO Nexus.exe",
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return None


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


def wait_and_open_app(url: str, server: uvicorn.Server | None = None, max_seconds: int = 30) -> None:
    """
    Waits for backend health endpoint to respond (200 OK), then:
    1. Minimizes the command window to the taskbar.
    2. If supervised by Tauri, returns immediately (Tauri already presents the UI).
    3. If standalone, launches AIO Nexus executable or opens the browser.
    """
    health_url = f"http://localhost:{PORT}/api/health"
    start_time = time.time()
    ready = False
    while time.time() - start_time < max_seconds:
        try:
            req = urllib.request.Request(health_url)
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    ready = True
                    break
        except Exception:
            pass
        time.sleep(0.4)

    if not ready:
        restore_console_window()
        print("\n[WARN] Health check timed out. Console window remains open for diagnostic inspection.")
        return

    # 1. If supervised by Tauri, backend is a silent background service
    if os.getenv("TAURI_SUPERVISED") == "1":
        print("[OK] Backend initialized under Tauri supervision.")
        return

    time.sleep(0.3)

    # 2. Minimize command window to taskbar if running standalone
    minimize_console_to_taskbar()

    # 3. Check for Tauri executable if standalone
    tauri_exe = find_tauri_executable()
    if tauri_exe:
        print(f"[OK] Launching AIO Nexus: {tauri_exe}")
        try:
            tauri_proc = subprocess.Popen([str(tauri_exe)])
            tauri_proc.wait()
            print("\nAIO Nexus window closed. Shutting down...")
            if server:
                server.should_exit = True
            time.sleep(0.5)
            os._exit(0)
        except Exception as exc:
            print(f"[WARN] Failed to launch AIO Nexus ({exc}). Falling back to browser...")
            webbrowser.open(url)
    else:
        print(f"[OK] Launching browser to {url}...")
        webbrowser.open(url)


def print_banner() -> None:
    print("=" * 72)
    print("                      AIO NEXUS")
    print("             Autonomous Business Operating System")
    print("                 Zero Cloud Rent - Local-First")
    print("=" * 72)
    print()


def main() -> None:
    print_banner()

    # 1. Check if already running
    if is_port_active("127.0.0.1", PORT):
        print(f"[INFO] AIO Nexus is already running and listening on port {PORT}.")
        tauri_exe = find_tauri_executable()
        minimize_console_to_taskbar()
        if tauri_exe:
            print(f"Opening AIO Nexus: {tauri_exe}...")
            subprocess.Popen([str(tauri_exe)])
        else:
            print(f"Opening browser to http://localhost:{PORT}...")
            webbrowser.open(f"http://localhost:{PORT}")
        print()
        print("AIO Nexus active on taskbar.")
        time.sleep(1.0)
        return

    # 2. Check local Ollama
    if check_ollama():
        print("[OK] Ollama local neural intelligence detected (:11434)")
    else:
        print("[INFO] Ollama not detected on :11434 (Keyword fallback active)")

    print()
    print(f"[*] Starting AIO Nexus on http://localhost:{PORT}...")
    print("=" * 72)
    print(f"  * Cockpit Interface: http://localhost:{PORT}")
    print(f"  * Mobile / Pocket:   http://localhost:{PORT}/?view=pocket")
    print(f"  * REST API Health:   http://localhost:{PORT}/api/health")
    print()
    print("  * Note: Once booted, this window minimizes to the taskbar.")
    print("  * Closing the window shuts down the application cleanly.")
    print("=" * 72)
    print()

    # 3. Ensure database and primary workspace are initialized
    try:
        from backend.bootstrap_primary import bootstrap
        bootstrap()
    except Exception as e:
        print(f"[INFO] Workspace storage initialized.")

    # 4. Setup production Uvicorn server
    import uvicorn
    from backend.app import app

    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        access_log=True,
    )
    server = uvicorn.Server(config)

    # 4. Start background thread to manage taskbar minimize and UI launch
    app_thread = threading.Thread(
        target=wait_and_open_app,
        args=(f"http://localhost:{PORT}", server),
        daemon=True,
    )
    app_thread.start()

    # 5. Run server
    server.run()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nAIO Nexus shut down cleanly.")
        sys.exit(0)
    except Exception as err:
        restore_console_window()
        print(f"\n[FATAL ERROR] AIO Nexus encountered an error during boot: {err}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
        sys.exit(1)
