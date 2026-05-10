# AIO CRM — AI Agent Foundation Framework

> **Generated:** 2026-05-04
> **Purpose:** Repo-aware prompting foundation for external AI coding agents

---

## 1. File System Sitemap

```
AIOCRM/
├── Protocols/               # 🛡️ LIVE SYSTEM GOVERNANCE (canonical)
│   ├── charlie-alpha-protocol.md   # Core execution chain law
│   ├── lockdown.md                 # Hard protection/no-touch rules
│   └── tagging.md                  # Tag system rules
├── docs/                     # Reference documentation (non-binding unless in Protocols)
│   ├── SYSTEM INVARIANTS CONTRACT.md    # Session/identity invariants
│   ├── AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md  # AI provider architecture
│   ├── service-contract-map.md             # Service layer enforcement
│   ├── flow_builder/                        # Flow builder standards
│   └── [various audits/handoffs]
├── frontend/                 # React 19 + Vite 7 + Tailwind 4 app
│   ├── src/
│   │   ├── modules/         # 20+ feature modules (CRM, Brain, Media, Flows, etc.)
│   │   ├── services/        # Domain services (13 files) — ONLY allowed import layer
│   │   ├── orchestration/  # Orchestrator, dispatcher, execution policy
│   │   ├── contexts/        # React contexts (Auth, VTT, Signal, etc.)
│   │   ├── components/ui/   # Shared UI primitives
│   │   └── utils/           # Utilities (sessionValidator, consult.utils, etc.)
│   ├── package.json         # React 19, @xyflow/react, @remotion, Tailwind 4
│   ├── vite.config.js
│   └── eslint.config.js     # Service-layer enforcement
├── backend/                 # FastAPI + SQLite + Python 3.13
│   ├── server.py            # Main entry
│   ├── orchestration.py     # Command orchestration
│   ├── tools.py             # Agent tools registry
│   ├── ai_service.py        # AI provider resolution
│   ├── auth_store.py        # Auth + workspace management
│   ├── comms_service.py     # Communications
│   ├── media_*.py           # Media engine
│   ├── data/                # SQLite DB, media storage
│   └── requirements.txt     # fastapi, uvicorn, vosk, python-multipart
├── runtime/                 # Local runtime storage
│   ├── exports/            # Data exports
│   ├── logs/               # App logs
│   └── cache/              # Temp cache
└── scripts/                # Utility scripts
```

---

## 2. Dependencies

### Frontend
- **Runtime:** React 19.2.0, React DOM 19.2.0, React Router DOM 7.13.0
- **Build:** Vite 7.2.4, Tailwind CSS 4.1.18, PostCSS 8.5.6
- **UI/Graphics:** @xyflow/react 12.0.0 (React Flow), @excalidraw/excalidraw 0.18.0, lucide-react 0.562.0, react-quill 2.0.0, @tinymce/tinymce-react 6.3.0
- **Media:** @remotion/cli 4.0.441, remotion 4.0.441
- **Linting:** ESLint 9.39.1, eslint-plugin-react-hooks, husky 9.1.7
- **Utils:** date-fns 4.1.0, jszip 3.10.1

### Backend
- fastapi 0.110.1
- uvicorn 0.25.0
- python-dotenv >= 1.0.1
- vosk 0.3.45 (speech recognition)
- python-multipart

---

## 3. Core Contracts & Protocols (MUST READ)

### 3.1 Charlie-Alpha Protocol (`Protocols/charlie-alpha-protocol.md`)
**Hard law — never bypass:**
- **Execution chain:** Operator ⇄ Charlie → Alpha → Agent(s) → Alpha → Charlie ⇄ Operator
- Charlie = operator interface only; NEVER executes logic or routes directly to agents
- Alpha = routing, QA validation, result normalization
- **All commands** must use command envelope (issuer, mode, intent, target, action, payload, operatorControl, responseMode)
- No raw text execution; agents output structured data only

### 3.2 Session Invariants (`docs/SYSTEM INVARIANTS CONTRACT.md`)
- **10 invariants** governing CONVO / COMMAND / CONSULT session isolation
- CONVO, COMMAND, CONSULT are fully independent execution domains
- NO cross-session data access allowed
- Identity: Charlie = CONVO/COMMAND; agentKey-specific = CONSULT
- **Snapshot versioning** — messages must match active session version
- **Async response safety** — discard responses with version/session mismatch

### 3.3 Tagging Protocol (`Protocols/tagging.md`)
- **NEVER create tags without explicit operator approval**
- Read-only assignment of existing tags only
- 15 valid prefixes: AI, AUT, CRM, CS, MKG, MKT, MTG, CP, CD, EVT, OPS, PM, META, ROLE
- Format: `PREFIX:NAME` (uppercase, colon, no spaces)
- If needed tag doesn't exist → stop and request approval

### 3.4 Lockdown (`Protocols/lockdown.md`)
**Hard protection zones — require explicit operator approval:**
- `/Archive/**` — read-only, no edits/deletions
- Security/auth logic, authorization rules, tokens
- Network/ports, streaming endpoints, firewall logic
- `.env`, config loaders, environment switching
- Build scripts, deployment logic, CI/CD
- Database schema, migrations
- File deletion logic, backup/restore systems
- Layout files, structural UI, styling systems

### 3.5 Service Layer Enforcement (`docs/service-contract-map.md`)
**Critical architectural rule:**
- UI modules (`src/components/`, `src/modules/`, `src/pages/`) → MUST import from domain services only
- **Never import directly from `backendApi`**
- Only `src/services/*.service.js` files may import from `backendApi`
- **Enforced by:** ESLint `no-restricted-imports` + CI scanner (`scripts/enforce-service-layer.js`)
- Build script: `npm run enforce && vite build`

### 3.6 AI Provider Source of Truth (`docs/AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md`)
- Schema source: `frontend/src/modules/Integrations/providerSchema.js`
- Backend auth_store.py handles persistence in `ai_provider_configs` table
- Toggle logic: if `is_default=true` → `enabled` must be true; if `enabled=false` → `is_default` must be false
- **No implicit localhost fallback** — all URLs must be explicitly configured

---

## 4. Architecture Boundaries

### Session Types
| Type | Identity | Purpose |
|------|----------|---------|
| CONVO | Charlie | Conversational interface |
| COMMAND | Charlie | System control/actions |
| CONSULT | Agent-specific (Delta, etc.) | Sandboxed agent execution |

### Service Layer (13 Domain Services)
- `AiService`, `AnalyticsService`, `AuthService`, `BrainService`, `CalendarService`
- `CommsService`, `ContactsService`, `CrmService`, `FlowsService`, `FormsService`
- `HelpService`, `IntegrationsService`, `MediaService`, `OrdersService`, `SettingsService`, `SignalsService`

### Orchestration System
- `Orchestrator.jsx`, `OrchestrationProvider.jsx`
- `dispatcher.js`, `executionPolicy.js`, `payloadValidation.js`

---

## 5. Hard DO NOTs for AI Agents

### 🔴 NEVER DO
1. **Bypass Charlie-Alpha chain** — never route directly to agents
2. **Access backendApi from UI** — use domain services only
3. **Create tags without approval** — tagging is read-only
4. **Modify protected areas** — see lockdown.md zones
5. **Introduce new dependencies** — requires explicit approval
6. **Raw text command execution** — must use command envelope
7. **Cross-session data access** — CONVO/COMMAND/CONSULT are isolated
8. **Render unvalidated messages** — must pass Session Contract Validator
9. **Hardcode AI provider logic** — use providerSchema.js only
10. **Skip snapshot version checks** — message version must match session

### 🟡 REQUIRE APPROVAL BEFORE
- Any change to auth, security, or session handling
- Network/port modifications or firewall logic
- Database schema or migration changes
- Build/deployment script changes
- UI layout/structural component changes
- Deleting files or resetting repo state

---

## 6. Hard DOs for AI Agents

### ✅ ALWAYS DO
1. **Use domain services** — import from `src/services/*.service.js`
2. **Validate tag existence** before assignment — check `/api/tags`
3. **Follow command envelope format** for all commands
4. **Check snapshot version** on async responses — discard mismatches
5. **Use providerSchema.js** for all AI provider definitions
6. **Enforce service layer** — never bypass ESLint scanner
7. **Report protected zone conflicts** — escalate before proceeding
8. **Follow snapshot versioning** — messages only valid for current version

---

## 7. Startup Commands

```bash
# Backend
python backend/server.py
# or
uvicorn backend.server:app --host 0.0.0.0 --port 8001

# Frontend dev
cd frontend && npm run dev

# Frontend production
cd frontend && npm run build
```

### Runtime Environment Overrides
- `AUTH_DB_PATH` — custom database path
- `SQLITE_DB_PATH` — custom database path (alt)
- `PORT` — backend port (default: 8001)
- `HOST` — backend host (default: 0.0.0.0)

---

## 8. Key Files for Reference

| File | Purpose |
|------|---------|
| `Protocols/charlie-alpha-protocol.md` | Execution chain law |
| `Protocols/lockdown.md` | Protected zones |
| `Protocols/tagging.md` | Tag system |
| `docs/SYSTEM INVARIANTS CONTRACT.md` | Session isolation |
| `docs/service-contract-map.md` | Service layer + enforcement |
| `docs/AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md` | AI provider schema |
| `frontend/src/services/backendApi.js` | Direct API layer (services only) |
| `scripts/enforce-service-layer.js` | CI scanner |

---

This framework is the canonical source of truth for AI agent repo-awareness. All agents must read and respect these protocols before performing any work.