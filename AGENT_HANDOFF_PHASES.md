# Agent Handoff

Updated: 2026-03-20  
Workspace: `D:\AIOCRM`  
Remote: [lelandbest/aio-agency](https://github.com/lelandbest/aio-agency.git)  
Current pushed baseline: `main` @ `9e10d29`

## Original Phase Scope

1. Stabilize the existing app shell and remove breakage.
2. Establish the real local backend with FastAPI and SQLite.
3. Build the AI-centered `Comm` core.
4. Connect `Comm` to CRM and Calendar.
5. Add external system boundaries for mail, calendar, and providers.
6. Implement local-first reconciliation and import behavior.
7. Remove mock as a runtime dependency for migrated surfaces.
8. Ship the real provider integration layer and admin control plane.
9. Add tenant, workspace, session, and RBAC foundations.
10. Build the formal AI orchestration layer across modules.
11. Polish, package, and productize the desktop-grade local-first system.

## Phase Status

- Phases 1-9: complete enough for the current stage
- Phase 10: in progress
- Phase 11: not started in earnest

## Current Product State

### Platform

- FastAPI + SQLite is the real runtime for migrated modules.
- Real auth, sessions, workspaces, and role-aware protections exist.
- `Integrations` is the real control plane for provider setup.
- `Comms` is the active messaging module name.
- `SMS/VoIP` is now an honest placeholder, not a hidden `Comm` mount.

### AI / Providers

- Shared backend AI service powers module bullseyes.
- Supported LLM providers include:
  - Ollama
  - OpenAI
  - OpenRouter
  - Anthropic
  - Google AI
  - Perplexity
- Supported automation providers include:
  - `n8n`
  - `Activepieces`
  - `Make`

### AIO Brain

`AIO Brain` is now a first-class internal module, not a concept stub.

Implemented:

- company profile memory
- knowledge sources
- knowledge items
- graph links
- saved graph node positions
- draggable graph nodes
- right-click node modal
- text, URL, and file ingest
- Brain retrieval history and search
- MCP server registry
- MCP runtime probe and live query bridge
- Brain search that can merge persisted memory with live MCP results
- shared AI assist enrichment that can carry Brain + MCP retrieval into current assists
- richer AI run records with status, agent role, linked entities, provider/model, steps, and artifacts
- Brain-focused AI workbench actions
- runtime agent registry aligned to the visible AIO Agents roster plus hidden `OMEGA`
- owner-only Omega governance controls in `Settings`

Current Brain graph behavior is closer to Obsidian than to a list pretending to be a graph, but it is still an early pass.

## AI Hierarchy

The live runtime hierarchy is now aligned to the AIO Agents block, not the old temporary 3-agent shortcut.

Visible agents:

- `ALPHA`, `BRAVO`, `CHARLIE`, `DELTA`, `ECHO`, `FORGE`, `APEX`, `ARCHER`, `ATLAS`, `RANGER`, `SCOUT`, `STRIKER`, `VECTOR`

Hidden governance role:

- `OMEGA`

Key rules:

- `CHARLIE` is the intake/front-door assistant
- `ALPHA` is the dispatcher and authority layer
- `ATLAS` owns logistics and systems mapping
- `APEX` no longer owns logistics
- Brain and MCP are shared infrastructure, not `ECHO`-owned
- dangerous natural-language requests are blocked and redirected to the Omega admin controls

## Critical Protocols

1. Keep the platform local-first, backend-first, and SQLite-backed.
2. Do not reintroduce mock runtime paths for already-migrated modules.
3. Keep `Integrations` as the provider and configuration control plane.
4. Keep `Comm` thread-first, not an inbox clone.
5. Keep `Pipelines` separate from CRM, but tightly linked.
6. Keep `AIO Brain` first-class and internal, not iframe-backed.
7. Avoid hard-coded visual hacks when CSS or tokens can handle it.
8. Avoid horizontal scroll bars.
9. Use bullseyes sparingly and meaningfully. Do not spam routine fields.
10. Do not remove unfinished UI unless the user explicitly asks. Wire it, improve it, or clearly list it as incomplete.
11. Use `apply_patch` for manual file edits.

## User Preferences That Matter

- Use `Comms`.
- Use the radio/beacon icon for `Comms`.
- Keep `AIO Brain` at the top of the menu and alphabetized.
- Favor premium, intentional UI over generic CRM patterns.
- Brain should be the serious AI interaction surface:
  - company profile prompting
  - brand voice
  - ops playbooks
  - knowledge development
- The Brain graph should feel closer to Obsidian than to a tagged relationship list.
- `AIO Admin` is the admin workspace. Business work should live in separate workspaces.

## Best Immediate Next Scope

### Phase 10

1. Extend shared command execution beyond `Agents` and current bullseyes.
2. Add multi-step execution and structured action parsing on top of `/api/ai/command`.
3. Promote richer run artifacts and delegate chains into more module activity surfaces.
4. Harden side-effect gates for send/delete/automation actions.

Items already in place:

- Brain ingest and retrieval
- MCP runtime probe/query for HTTP(S) endpoints
- runtime agent registry aligned to the visible AIO Agents block
- shared AI run envelope with intake, dispatch, execution, delegate chain, and permission tier
- owner-only Omega arm/cancel/execute controls

## Known Cleanup

- The live graph is:
  - [frontend/src/modules/Brain/BrainGraphPanel.jsx](D:/AIOCRM/frontend/src/modules/Brain/BrainGraphPanel.jsx)
- The old inline graph block in [frontend/src/modules/Brain/index.jsx](D:/AIOCRM/frontend/src/modules/Brain/index.jsx) has been removed.
- MCP runtime is HTTP-first for now.
  - current support is probe/query against `http(s)` MCP endpoints
  - non-HTTP transports still need the fuller runtime/orchestration layer

## Verification Protocol

After meaningful changes:

- Backend:
  - `C:\Users\besta\AppData\Local\Programs\Python\Python313\python.exe -m py_compile ...`
- Frontend:
  - `cmd /c npm run build`

If backend files change, restart with:

```powershell
Ctrl+C
C:\Users\besta\AppData\Local\Programs\Python\Python313\python.exe D:\AIOCRM\backend\server.py
```

## Key Files

- [backend/server.py](D:/AIOCRM/backend/server.py)
- [backend/data_provider.py](D:/AIOCRM/backend/data_provider.py)
- [backend/ai_service.py](D:/AIOCRM/backend/ai_service.py)
- [backend/auth_store.py](D:/AIOCRM/backend/auth_store.py)
- [backend/automation_service.py](D:/AIOCRM/backend/automation_service.py)
- [frontend/src/modules/Brain/index.jsx](D:/AIOCRM/frontend/src/modules/Brain/index.jsx)
- [frontend/src/modules/Brain/BrainGraphPanel.jsx](D:/AIOCRM/frontend/src/modules/Brain/BrainGraphPanel.jsx)
- [frontend/src/modules/Comms/index.jsx](D:/AIOCRM/frontend/src/modules/Comms/index.jsx)
- [frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx](D:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx)
- [frontend/src/services/backendApi.js](D:/AIOCRM/frontend/src/services/backendApi.js)

## Short Version

The product is through the foundational platform phases. `AIO Brain` now ingests documents, URLs, and text, retrieves persisted memory, and can probe/query connected MCP servers at runtime. The AI layer is now re-aligned to the full AIO Agents hierarchy with `CHARLIE` intake, `ALPHA` dispatch, visible specialist routing, and owner-only Omega governance. The next frontier is multi-step command execution and deeper autonomous action flows across modules.
