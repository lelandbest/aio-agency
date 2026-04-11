# AIO Nexus Docker Installation Guide

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum
- 20GB disk space

## Quick Start

```bash
# Clone or navigate to project directory
cd AIO-Nexus

# Build and start all services
docker compose up --build

# Access the application
# Frontend: http://localhost:5175
# Backend API: http://localhost:8001
# Health: http://localhost:8001/api/health
```

## Services Overview

| Service | Port | Purpose |
|---------|------|---------|
| frontend | 5175 | React UI (Nginx) |
| backend | 8001 | FastAPI server |

## Data Persistence

The backend data directory is mounted as a volume:

```yaml
volumes:
  - ./backend/data:/app/backend/data
```

All media assets, database, and configurations persist across restarts.

## Environment Variables

### Backend
| Variable | Default | Description |
|----------|---------|-------------|
| ENVIRONMENT | production | Runtime mode |
| FFMPEG_PATH | /usr/bin/ffmpeg | Media processing |

### Frontend
| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | Build mode |
| VITE_ALLOW_MULTI | true | Vite port lock bypass |

## Stopping Services

```bash
# Stop containers
docker compose stop

# Remove containers
docker compose down

# Remove volumes too (WIPES DATA)
docker compose down -v
```

## Building Without Docker Compose

```bash
# Backend only
docker build -f Dockerfile.backend -t aio-backend .
docker run -p 8001:8001 -v ./backend/data:/app/backend/data aio-backend

# Frontend only
docker build -f Dockerfile.frontend -t aio-frontend .
docker run -p 5175:80 aio-frontend
```

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
netstat -ano | findstr "8001"
# or
lsof -i :8001
```

### Permission Denied
```bash
# On Linux, you may need sudo
sudo docker compose up --build
```

### Build Fails
```bash
# Clean Docker cache
docker builder prune -a

# Rebuild from scratch
docker compose build --no-cache
```

## Network Configuration

The frontend nginx proxies API requests to backend:

```
localhost:5175 (nginx) → backend:8001 (FastAPI)
```

No CORS issues since nginx acts as reverse proxy.

## Security Notes

- Public routes: `/api/media/*` (required for rendering)
- All other routes require authentication
- No secrets embedded in images
- Data volume should be backed up regularly