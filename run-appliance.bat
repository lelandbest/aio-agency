@echo off
setlocal enabledelayedexpansion
title AIO Nexus v2 Appliance (Port 8001)

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

echo ========================================================================
echo        AIO NEXUS v2 -- AUTONOMOUS OPERATING SYSTEM
echo             Single Operator Appliance -- Standalone
echo ========================================================================
echo.

:: 1. Check if port 8001 is already bound
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001" ^| findstr "LISTENING"') do (
    set "EXISTING_PID=%%a"
)
if defined EXISTING_PID (
    echo [INFO] AIO Nexus or another service is already listening on port 8001 (PID: !EXISTING_PID!).
    echo Opening browser to http://localhost:8001...
    start http://localhost:8001
    echo.
    echo If you want to restart the appliance, run stop-appliance.bat first.
    echo Press any key to exit this launcher window...
    pause >nul
    exit /b 0
)

:: 2. Check local Ollama (optional local vector intelligence)
powershell -Command "$resp = try { (Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -UseBasicParsing).StatusCode } catch { 0 }; if ($resp -eq 200) { exit 0 } else { exit 1 }" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Ollama local neural intelligence detected (:11434)
) else (
    echo [INFO] Ollama not detected at :11434 (Hybrid search will use keyword fallback)
)

echo.
echo [*] Starting AIO Nexus Appliance on http://localhost:8001...

:: Start the background browser opener
start /b powershell -NoProfile -Command ^
    "for ($i=1; $i -le 30; $i++) { " ^
    "    Start-Sleep -Seconds 1; " ^
    "    $res = try { (Invoke-WebRequest -Uri 'http://localhost:8001/api/health' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { 0 }; " ^
    "    if ($res -eq 200) { " ^
    "        Start-Process 'http://localhost:8001'; " ^
    "        break; " ^
    "    } " ^
    "}"

echo.
echo ========================================================================
echo   * Cockpit Interface: http://localhost:8001
echo   * Mobile / Pocket:   http://localhost:8001/?view=pocket
echo   * REST API Health:   http://localhost:8001/api/health
echo.
echo   * Default Login:     support@aiocrm.org
echo   * Default Password:  aioadmin123
echo.
echo   Press Ctrl+C in this window to safely shut down the appliance.
echo ========================================================================
echo.

python backend/app.py
