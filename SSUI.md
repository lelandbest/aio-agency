# Server Startup + UI Launch (Windows)

## Backend (FastAPI)
```powershell
if (-not (Test-Path ".\backend\server.py")) { throw "Run from repo root (D:\\AIOCRM)"; }
cd D:\AIOCRM
$env:PYTHONPATH = "."
python backend\server.py
```

## Frontend (Vite)
```powershell
if (-not (Test-Path ".\package.json")) { throw "Run from repo root or frontend folder"; }
cd D:\AIOCRM\frontend
npm run dev -- --port 5175
```

## Open UI
```powershell
Start-Process "http://localhost:5175"
```
