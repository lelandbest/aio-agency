@echo off
setlocal enabledelayedexpansion
title AIO Nexus v2 -- Standalone Appliance Installer

echo ========================================================================
echo        AIO NEXUS v2 -- STANDALONE APPLIANCE INSTALLER
echo             Autonomous Operations for Solo Operators
echo                   Zero Cloud Rent - Local-First
echo ========================================================================
echo.

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

:: 1. Verify Python
echo [1/6] Verifying Python runtime...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python was not found on your system PATH.
    echo Please install Python 3.11 or newer from https://www.python.org/
    echo Make sure to check "Add Python to PATH" during installation.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('python --version') do set "PY_VER=%%i"
echo [OK] Detected %PY_VER%

:: 2. Verify / Install Python Dependencies
echo.
echo [2/6] Verifying Python dependencies...
python -m pip install -q -r "%ROOT_DIR%\backend\requirements.txt"
if %errorlevel% neq 0 (
    echo [WARN] Pip install reported warnings or errors. Attempting to continue...
) else (
    echo [OK] Python dependencies verified.
)

:: 3. Verify / Build Production Frontend Bundle
echo.
echo [3/6] Checking production frontend distribution...
if not exist "%ROOT_DIR%\frontend\dist\index.html" (
    echo [INFO] Production bundle not found. Building with Node.js/npm...
    where node >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Node.js is required to build the frontend, but was not found.
        echo Please install Node.js 18+ from https://nodejs.org/
        pause
        exit /b 1
    )
    pushd "%ROOT_DIR%\frontend"
    call npm install
    call npm run build
    popd
    if not exist "%ROOT_DIR%\frontend\dist\index.html" (
        echo [ERROR] Frontend build failed. Please inspect build errors above.
        pause
        exit /b 1
    )
    echo [OK] Frontend production bundle built successfully.
) else (
    echo [OK] Production frontend bundle is already compiled and present in frontend\dist\
)

:: 4. Verify / Initialize Environment Configuration (.env)
echo.
echo [4/6] Configuring local appliance environment...
if not exist "%ROOT_DIR%\.env" (
    echo [INFO] Creating local-first .env configuration...
    (
        echo PORT=8001
        echo HOST=0.0.0.0
        echo APP_ENV=appliance
        echo DEBUG=false
        echo SESSION_SECRET=aio_nexus_standalone_secret_%RANDOM%_%RANDOM%
        echo DATA_PROVIDER=sqlite
    ) > "%ROOT_DIR%\.env"
    echo [OK] Created .env on port 8001.
) else (
    echo [OK] Configuration file .env is present.
)

:: 5. Initialize / Verify Local SQLite Database
echo.
echo [5/6] Verifying SQLite database and default operator account...
python -c "import sys; sys.path.insert(0, r'%ROOT_DIR%'); from backend.deps import auth_store, provider; print(f'Database verified: {provider.health()}')"
if %errorlevel% neq 0 (
    echo [WARN] Initial database verification check had an issue, continuing...
) else (
    echo [OK] Local SQLite database verified.
)

:: 6. Create Desktop Shortcut
echo.
echo [6/6] Creating Desktop Shortcut...
if exist "%USERPROFILE%\Desktop\AIO Nexus Appliance.lnk" del /f /q "%USERPROFILE%\Desktop\AIO Nexus Appliance.lnk"
if exist "%USERPROFILE%\Desktop\AIO Agency.lnk" del /f /q "%USERPROFILE%\Desktop\AIO Agency.lnk"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\AIO Nexus.lnk"
if exist "%SHORTCUT_PATH%" del /f /q "%SHORTCUT_PATH%"
set "TARGET_BAT=%ROOT_DIR%\run-appliance.bat"
set "ICON_FILE=%ROOT_DIR%\frontend\public\favicon.ico"

powershell -ExecutionPolicy Bypass -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%ROOT_DIR%'; $s.Arguments = ''; $s.Description = 'AIO Nexus - Autonomous Single Operator Business Appliance'; if (Test-Path '%ICON_FILE%') { $s.IconLocation = '%ICON_FILE%' }; $s.Save();"

if exist "%SHORTCUT_PATH%" (
    echo [OK] Desktop Shortcut created: "AIO Nexus"
) else (
    echo [WARN] Could not create Desktop shortcut automatically. You can run run-appliance.bat directly.
)

echo.
echo ========================================================================
echo                 INSTALLATION COMPLETE!
echo ========================================================================
echo.
echo   You are ready to run AIO Nexus as a standalone appliance!
echo.
echo   * Double-click the "AIO Nexus" shortcut on your Desktop, OR
echo   * Run run-appliance.bat in this folder.
echo.
echo   * Appliance Cockpit:  http://localhost:8001
echo   * Mobile / Pocket:    http://localhost:8001/?view=pocket
echo   * Default Login:      support@aiocrm.org
echo   * Default Password:   aioadmin123
echo.
echo   To expose forms to external websites (goaio.us, etc.):
echo   - Tailscale Funnel:   tailscale funnel 8001
echo   - ngrok:              ngrok http 8001
echo.
echo ========================================================================
echo.
set /p START_NOW="Would you like to start the AIO Nexus Appliance now? (Y/N): "
if /i "!START_NOW!"=="Y" (
    call "%ROOT_DIR%\run-appliance.bat"
) else (
    echo.
    echo Installation finished. Press any key to exit.
    pause >nul
)
