# Review Agent Handoff

## Purpose

This file is for a repo-ignorant review agent. It explains what this repository is, how it actually works today, what changed most recently, what is intentionally authoritative, what is still fragile, and where a reviewer should focus.

The goal is not to redesign the system. The goal is to help a fresh reviewer understand:

- the real runtime structure
- the current stabilization state
- the recent restoration and cleanup work
- the most important code paths to inspect
- the known open risks

## Current Repo State

- Repo: `d:\AIOCRM`
- Branch: `main`
- Current pushed commit: `a74191021b08f23269508ea1d9ad0442b110fd8a`
- Commit message: `stabilize runtime, unify ai persistence, and archive prepush docs`

Current untracked local-only files that were not committed:

- `CORTEX_REPORT_1774467904895.txt`
- `CORTEX_REPORT_1774546420762.txt`
- `backend_runtime_8011.err`
- `backend_runtime_8011.out`
- `backend_runtime_agent_restore.err`
- `backend_runtime_agent_restore.out`
- `backend_runtime_clean.err`
- `backend_runtime_clean.out`
- `backend_runtime_restart.err`
- `backend_runtime_restart.out`
- `backend_runtime_unified.err`
- `backend_runtime_unified.out`

These are generated artifacts/logs and are not part of source review.

## Project Identity

This is a React + FastAPI operations platform / CRM / AI workspace with:

- CRM
- Comms
- Calendar
- Orders
- Integrations
- Brain / AIO Cortex
- Agents
- Flows
- Forms
- Settings / white-labeling

The repo has gone through multiple stabilization passes. The system is not a greenfield build. It is a partially mature codebase that accumulated:

- duplicate paths
- local/mock fallbacks
- contract drift
- UI surfaces that looked more complete than they were

Recent work focused on restoration of runtime authority, contract cleanup, persistence unification, and archiving stale implementation/walkthrough documents.

## Real Architecture

### Frontend

Real frontend entry:

- `frontend/src/main.jsx`
- `frontend/src/App.jsx`

Important reality:

- The app is shell/state driven, not a clean route-tree app.
- Navigation is primarily `activeModule` state in `App.jsx`.
- There are custom app navigation events such as `aio:navigate`.
- Public forms are special-cased.

Frontend API authority:

- canonical client layer: `frontend/src/services/backendApi.js`

Removed/deactivated duplicate frontend API shell:

- `frontend/src/api/client.js` deleted
- `frontend/src/config/env.js` deleted
- `frontend/src/app/AppShell.jsx` deleted
- `frontend/src/app/router/AppRouter.jsx` deleted

### Backend

Real backend entry:

- `backend/server.py`

Important reality:

- `server.py` is still monolithic and owns many routes.
- data persistence and domain storage go through `backend/data_provider.py`
- auth/session/workspace/provider config storage go through `backend/auth_store.py`
- default data provider is SQLite

AI runtime authority now centers on:

- `backend/server.py`
- `backend/orchestration.py`
- `backend/agent_runtime.py`
- `backend/agent_definitions.py`

## Current Authoritative AI Runtime Model

### Canonical command route

The current intended single command interface is:

- `POST /api/ai/command`

Locked request contract:

```json
{
  "command": "string",
  "context": {}
}
```

Locked response contract:

```json
{
  "status": "success|error",
  "result": {},
  "message": "optional"
}
```

Important:

- `/api/ai/command` is supposed to terminate in `ExecutionEngine`
- it is not supposed to terminate in `ai_assist_service.assist()`
- it is not supposed to use generic fallback output

### Canonical runtime registry

Authoritative runtime registry:

- `backend/agent_definitions.py`

The frontend registry still exists for UI shaping:

- `frontend/src/modules/Agents/data/agentRegistry.js`

But backend runtime authority is intended to come from `backend/agent_definitions.py`.

### Canonical run persistence

Authoritative run store:

- `ai_engine_runs`

Implemented through:

- `backend/data_provider.py`

Important current rule:

- new writes should go to `ai_engine_runs`
- `ai_runs` is no longer meant to receive new writes
- UI/history compatibility should happen through projection, not dual-write

Projection adapter:

- `project_engine_run_for_ui(...)` in `backend/server.py`

## What Changed Recently

The latest pushed commit is not one isolated fix. It includes several grouped changes:

### 1. Agent runtime restoration work

Primary files:

- `backend/server.py`
- `backend/orchestration.py`
- `backend/agent_runtime.py`
- `backend/agent_definitions.py`
- `backend/data_provider.py`
- `frontend/src/services/backendApi.js`
- `frontend/src/modules/Agents/index.jsx`

Key intent:

- restore `/api/ai/command` to an `ExecutionEngine`-based runtime
- align the frontend agent shell to the canonical command contract
- make selected agent identity affect runtime behavior
- stop command execution from terminating in generic assist fallback logic

Important review note:

The restoration report exists, but it does not claim full 12-agent completion. It claims the runtime path was restored and proven on specific agents, with remaining runtime/provider gaps still possible.

See:

- `AGENT_WIRING_RESTORATION_PLAN.md`
- `AGENT_WIRING_RESTORATION_REPORT.md`

### 2. AI persistence unification

Primary files:

- `backend/data_provider.py`
- `backend/server.py`
- `backend/auth_store.py`

Key intent:

- unify `/api/ai/command` and `/api/ai/assist` writes onto the canonical run store
- stop new writes into legacy `ai_runs`
- preserve UI/history response compatibility through projection

Important review note:

- `auth_store.record_ai_run(...)` was intentionally disabled as a live write path
- `/api/ai/runs` now reads projected canonical runs

### 3. Frontend stabilization / truth-enforcement work

Primary files:

- `frontend/src/App.jsx`
- `frontend/src/modules/CRM/index.jsx`
- `frontend/src/modules/Agents/index.jsx`
- `frontend/src/modules/Flows/*`
- `frontend/src/modules/Forms/*`
- `frontend/src/modules/Brain/index.jsx`
- `frontend/src/modules/Settings/index.jsx`
- `frontend/src/modules/Orders/index.jsx`
- `frontend/src/modules/Signals/index.jsx`
- `frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx`

Key intent:

- fix broken CRM note path
- normalize agent response rendering
- restructure Flows into list/template/builder pattern
- align Forms to the same pattern
- remove misleading or dead controls where functionality was not real

### 4. Documentation cleanup / archival

Old implementation and walkthrough docs were moved to:

- `_archive/prepush_docs_2026-03-26/`

Active protocol / handoff / prompt docs were intentionally left in place.

Archive manifest:

- `_archive/prepush_docs_2026-03-26/ARCHIVE_MANIFEST.md`

## Files a Reviewer Should Read First

### Core runtime / backend authority

1. `backend/server.py`
2. `backend/orchestration.py`
3. `backend/agent_runtime.py`
4. `backend/agent_definitions.py`
5. `backend/data_provider.py`
6. `backend/auth_store.py`
7. `backend/ai_service.py`

### Core frontend authority

1. `frontend/src/App.jsx`
2. `frontend/src/services/backendApi.js`
3. `frontend/src/modules/Agents/index.jsx`
4. `frontend/src/modules/Brain/index.jsx`
5. `frontend/src/modules/Flows/index.jsx`
6. `frontend/src/modules/Flows/FlowsHome.jsx`
7. `frontend/src/modules/Flows/FlowBuilder.jsx`
8. `frontend/src/modules/Forms/index.jsx`

### Context docs worth reading

1. `REPO_AUDIT_SUMMARY.md`
2. `AGENT_WIRING_RESTORATION_PLAN.md`
3. `AGENT_WIRING_RESTORATION_REPORT.md`
4. `AI_PROMPT_INVENTORY.md`
5. `AI_WIRING_PLAN.md`
6. `AGENT_HANDOFF_PHASES.md`
7. `aio_crm_agents_ui_session_handoff.md`

## Reviewer Mental Model

### What is solid enough to treat as real

- auth/session flow
- SQLite-backed backend data model
- CRM basic persistence
- Comms / Calendar / Integrations core route surfaces
- backend provider config storage
- Flows landing/list/template structure
- Forms landing/list/template structure
- canonical backend API layer in `backendApi.js`

### What still needs skepticism

- any AI surface outside the restored `/api/ai/command` path
- non-Agents assist surfaces that still go through `/api/ai/assist`
- any UI that looks “live” but may still be driven by local heuristics, local state, or soft fallback
- specialist quality across all 12 agents
- older README / public docs that may describe superseded architecture

## Current Known Truths

### Agents

- current frontend shell is `frontend/src/modules/Agents/index.jsx`
- current command contract is `{ command, context }`
- structured responses are normalized in the frontend to avoid `[object Object]`
- selected agent is intended to flow into backend execution as `requested_agent`
- backend runtime authority is intended to resolve from `backend/agent_definitions.py`

Known open caution:

- restoration work demonstrated real engine-backed execution, but full 12-agent verification is not documented as complete

### Assist vs command split

- `/api/ai/command` is intended as the authoritative agent execution shell
- `/api/ai/assist` still exists for distributed assist surfaces
- reviewer should verify that the command route does not regress back into assist fallback semantics

### AI provider runtime

Important runtime assumption in current local environment:

- Ollama host is `http://192.168.4.28:11434`
- localhost fallback was explicitly prohibited during restoration work
- current model used during restoration was `minimax-m2.5:cloud`

Review note:

- verify code does not silently reintroduce localhost fallback or invalid default model assumptions

### Run persistence

Current intended behavior:

- `/api/ai/command` and `/api/ai/assist` write canonical runs to `ai_engine_runs`
- UI-visible run/history objects are projected from canonical runs
- new writes to `ai_runs` are supposed to be disabled

Reviewer should verify:

- no new code path writes to `ai_runs`
- `/api/ai/runs` is compatibility projection only
- run IDs and execution fields do not diverge between persistence and UI payloads

## Important Docs That Are Now Historical

Implementation and walkthrough documents were archived because they were cluttering the root and could mislead future work. They are still available under:

- `_archive/prepush_docs_2026-03-26/`

These are historical context, not current authority.

Do not treat archived implementation plans or walkthroughs as source of truth unless explicitly cross-checking history.

## Current Risks / Open Questions

These are the main risks a review agent should keep in mind:

1. `backend/server.py` remains large and still carries historical duplication risk.
2. There may still be non-authoritative duplicate registries or metadata structures adjacent to the canonical runtime registry.
3. `/api/ai/assist` still exists and may preserve weaker fallback semantics than `/api/ai/command`.
4. Full specialist validation across all 12 agents is not proven in the latest report.
5. README and some remaining docs do not reflect the true current architecture.
6. There are still generated local log/report files in the working directory, though they are not committed.

## What a Reviewer Should Focus On

If reviewing the recent work, inspect these themes:

### A. Runtime authority

- Is `/api/ai/command` truly single-path and `ExecutionEngine`-backed?
- Does selected agent materially affect execution?
- Is backend registry authority really `backend/agent_definitions.py`?

### B. Persistence integrity

- Do both AI routes land in `ai_engine_runs` only?
- Is `ai_runs` now projection-only / legacy-read-only?
- Is there any dual-write or hidden second store of truth?

### C. Frontend/backend contract alignment

- Does Agents UI send the canonical request shape?
- Does it correctly handle `{ status, result, message }`?
- Does response rendering avoid dumping objects into message bubbles?

### D. Flows and Forms structure

- Does Flows land on list/home, then builder, then template instantiation?
- Does Forms mirror the same pattern?
- Are save/open/template behaviors real and distinct?

### E. Scope discipline

- Were dead duplicate paths removed where intended?
- Were changes surgical, or did they accidentally disturb unrelated behavior?

## How to Run / Validate Locally

Backend:

```powershell
$env:PYTHONPATH='d:\AIOCRM;d:\AIOCRM\backend'
python backend/server.py
```

Frontend:

```powershell
cd frontend
npm run dev
```

Useful checks:

- `GET /api/health`
- `POST /api/ai/command`
- `POST /api/ai/assist`
- `GET /api/ai/runs`

## Notes on Documentation Authority

For current source-of-truth review, prefer:

- code over README
- current root handoff/restoration docs over archived walkthroughs
- current runtime behavior over older implementation plan language

Treat these as current-review anchors:

- `review-agent-handoff.md`
- `REPO_AUDIT_SUMMARY.md`
- `AGENT_WIRING_RESTORATION_PLAN.md`
- `AGENT_WIRING_RESTORATION_REPORT.md`
- `AI_PROMPT_INVENTORY.md`

## Bottom Line

This repo is not a blank slate and not a finished product. It is a stabilization-stage system where the main recent work tried to:

- restore real agent runtime authority
- unify AI run persistence
- remove or bypass misleading duplicate paths
- clean up module structure around Flows and Forms
- archive stale implementation/walkthrough noise

A review agent should approach it as:

- a real product with meaningful backend depth
- a codebase with historical drift and duplicate patterns
- a repo where current authority has been reasserted in specific files, but where verification still matters more than assumptions

