@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ============================================================
REM make_frontend_primary.bat (NO PowerShell)
REM - Archives root Vite app artifacts so only /frontend remains
REM - Creates a root package.json that proxies to /frontend
REM - Safe: moves things into a timestamped _archive folder
REM ============================================================

REM --- Must be run from repo root
if not exist "frontend\package.json" (
  echo [ERROR] frontend\package.json not found.
  echo Run this from D:\projects\aio-agency (repo root).
  echo Current dir: %CD%
  pause
  exit /b 1
)

REM --- Build timestamp using WMIC (available on most Windows installs)
set "TS="
for /f "tokens=2 delims==" %%I in ('wmic os get LocalDateTime /value 2^>nul ^| find "="') do set "TS=%%I"
if not defined TS (
  REM Fallback if wmic is missing
  set "TS=%DATE:~-4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%"
  set "TS=%TS: =0%"
)

set "ARCHDIR=_archive_rootapp_%TS%"
if not exist "%ARCHDIR%" mkdir "%ARCHDIR%"

echo.
echo ============================================================
echo  Archiving root Vite app artifacts into: %ARCHDIR%
echo ============================================================
echo.

call :MOVEIFEXISTS "src"
call :MOVEIFEXISTS "public"
call :MOVEIFEXISTS "index.html"
call :MOVEIFEXISTS "vite.config.js"
call :MOVEIFEXISTS "vite.config.ts"
call :MOVEIFEXISTS "vite.config.mjs"
call :MOVEIFEXISTS "jsconfig.json"
call :MOVEIFEXISTS "tsconfig.json"
call :MOVEIFEXISTS "tsconfig.app.json"
call :MOVEIFEXISTS "tsconfig.node.json"

REM root node_modules + lockfiles (optional, but reduces confusion)
call :MOVEIFEXISTS "node_modules"
call :MOVEIFEXISTS "package-lock.json"
call :MOVEIFEXISTS "pnpm-lock.yaml"
call :MOVEIFEXISTS "yarn.lock"

REM root package.json gets replaced with orchestrator
if exist "package.json" (
  echo [MOVE] package.json  ^>  %ARCHDIR%\package.json
  move /Y "package.json" "%ARCHDIR%\" >nul
) else (
  echo [INFO] No root package.json found. We will create one.
)

echo.
echo ============================================================
echo  Writing NEW root package.json (proxies to /frontend)
echo ============================================================
echo.

REM --- Write package.json (overwrite) using cmd redirection
> "package.json" (
  echo {
  echo   "name": "aio-agency-monorepo",
  echo   "private": true,
  echo   "version": "0.0.0",
  echo   "scripts": {
  echo     "frontend:install": "npm --prefix frontend install",
  echo     "frontend:dev": "npm --prefix frontend run dev",
  echo     "frontend:build": "npm --prefix frontend run build",
  echo     "frontend:preview": "npm --prefix frontend run preview",
  echo     "dev": "npm --prefix frontend run dev",
  echo     "build": "npm --prefix frontend run build",
  echo     "preview": "npm --prefix frontend run preview"
  echo   }
  echo }
)

REM --- Write a note file
> "FRONTEND_ROOT.txt" (
  echo This repo is set up to use /frontend as the primary Vite app.
  echo The preliminary root Vite app artifacts were archived to: %ARCHDIR%
  echo.
  echo From repo root you can run:
  echo   npm run dev
  echo   npm run build
  echo   npm run preview
  echo.
  echo Or directly:
  echo   cd frontend
  echo   npm install
  echo   npm run dev
)

echo.
echo ============================================================
echo  DONE.
echo ============================================================
echo  Archived root artifacts to: %ARCHDIR%
echo  Root scripts now proxy to /frontend
echo.
echo Next command (from repo root):
echo   npm run dev
echo.
pause
exit /b 0

:MOVEIFEXISTS
set "P=%~1"
if exist "%P%" (
  echo [MOVE] %P%  ^>  %ARCHDIR%\%~nx1
  move /Y "%P%" "%ARCHDIR%\" >nul
) else (
  echo [SKIP] %P% not found
)
exit /b 0
