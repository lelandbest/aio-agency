@echo off
setlocal enabledelayedexpansion
title Stop AIO Nexus Appliance

echo Stopping AIO Nexus Appliance (Port 8001)...
set "FOUND=0"

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8001" ^| findstr "LISTENING"') do (
    set "TARGET_PID=%%a"
    if defined TARGET_PID (
        set "FOUND=1"
        echo Terminating process with PID: !TARGET_PID!...
        taskkill /PID !TARGET_PID! /F >nul 2>nul
    )
)

if "!FOUND!"=="1" (
    echo [OK] AIO Nexus Appliance on port 8001 has been stopped cleanly.
) else (
    echo [INFO] No active process was found listening on port 8001.
)

ping 127.0.0.1 -n 3 >nul
