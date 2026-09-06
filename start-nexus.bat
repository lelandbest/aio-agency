@echo off
setlocal enabledelayedexpansion
title AIO Nexus v2 Appliance Launcher

echo ========================================================================
echo        AIO NEXUS v2 -- NEURAL APPLIANCE FOR SOLO OPERATORS
echo                   Zero Cloud Rent - Local-First
echo ========================================================================
echo.

:: 1. Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.11+ and add it to your PATH.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set PYTHON_VER=%%i
echo [OK] Using %PYTHON_VER%

:: 2. Check Node & npm
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+ and add it to your PATH.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [OK] Using Node.js %NODE_VER%

:: 3. Check Ollama local intelligence
powershell -Command "$response = try { (Invoke-WebRequest -Uri 'http://localhost:11434/api/tags' -TimeoutSec 2 -UseBasicParsing).StatusCode } catch { 0 }; if ($response -eq 200) { exit 0 } else { exit 1 }" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Local Ollama detected at :11434 (Local embeddings enabled)
) else (
    echo [INFO] Local Ollama not detected at :11434.
    echo        Cortex search will run in keyword fallback mode.
    echo        (To enable vector embeddings: start Ollama and pull nomic-embed-text)
)

echo.
echo [1/3] Starting FastAPI Modular Backend on port 8001...
start "AIO Nexus Backend (:8001)" cmd /k "cd /d "%~dp0" && python backend/server.py"

echo [2/3] Waiting for Backend to become ready...
set READY=0
for /l %%i in (1,1,15) do (
    powershell -Command "$status = try { (Invoke-WebRequest -Uri 'http://localhost:8001/api/health' -TimeoutSec 1 -UseBasicParsing).StatusCode } catch { 0 }; if ($status -eq 200) { exit 0 } else { exit 1 }" >nul 2>nul
    if !errorlevel! equ 0 (
        set READY=1
        goto :backend_ready
    )
    timeout /t 1 /nobreak >nul
)

:backend_ready
if %READY% equ 1 (
    echo [OK] Backend is healthy and listening on http://localhost:8001
) else (
    echo [WARN] Backend took longer than 15s to respond, proceeding with frontend launch...
)

echo.
echo [3/3] Starting Vite React Frontend on port 3000...
start "AIO Nexus Frontend (:3000)" cmd /k "cd /d "%~dp0frontend" && npm run dev -- --host 0.0.0.0 --port 3000"

timeout /t 2 /nobreak >nul

echo.
echo ========================================================================
echo                 AIO NEXUS APPLIANCE IS ONLINE
echo ========================================================================
echo.
echo   * Desktop Cockpit:    http://localhost:3000
echo   * Mobile / Pocket:    http://localhost:3000?view=pocket
echo   * Backend REST API:   http://localhost:8001/api/health
echo.
echo Press any key to open the browser or close this window.
pause >nul
start http://localhost:3000
