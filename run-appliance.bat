@echo off
title AIO Nexus v2 Appliance
cd /d "%~dp0"

python backend\launcher.py
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] AIO Nexus exited with an error.
    pause
)
