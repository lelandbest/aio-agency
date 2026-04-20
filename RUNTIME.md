# Runtime Storage

This document defines the runtime storage contract for packaged/local execution.

## Directory Structure

```
runtime/
├── exports/    # Data export output
├── logs/       # Application logs
└── cache/     # Temporary cache files
```

## Backend Data

Runtime data stored in `backend/data/`:

- `aio_crm.db` — SQLite database
- `video/` — Video storage
- `audio/` — Audio storage
- `voice/` — Voice/audio assets
- `image/` — Image assets
- `models/` — ML models

## Environment Variables

Override default paths:

- `AUTH_DB_PATH` — Custom database path
- `SQLITE_DB_PATH` — Custom database path (alternative)
- `PORT` — Backend port (default: 8001)
- `HOST` — Backend host (default: 0.0.0.0)

## Startup

- Backend: `python backend/server.py` or `uvicorn backend.server:app --host 0.0.0.0 --port 8001`
- Frontend dev: `cd frontend && npm run dev`
- Frontend production: `cd frontend && npm run build`