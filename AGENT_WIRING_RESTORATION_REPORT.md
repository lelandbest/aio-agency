# Agent Wiring Restoration Report

## Files changed

- REQUIRED FOR RESTORATION: [backend/server.py](d:/AIOCRM/backend/server.py)
- REQUIRED FOR RESTORATION: [backend/orchestration.py](d:/AIOCRM/backend/orchestration.py)
- REQUIRED FOR RESTORATION: [backend/agent_runtime.py](d:/AIOCRM/backend/agent_runtime.py)
- REQUIRED FOR RESTORATION: [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py)
- REQUIRED FOR RESTORATION: [backend/data_provider.py](d:/AIOCRM/backend/data_provider.py)
- COMPATIBILITY BRIDGE: [frontend/src/services/backendApi.js](d:/AIOCRM/frontend/src/services/backendApi.js)

## Changes applied

- REQUIRED FOR RESTORATION: `/api/ai/command` in [backend/server.py](d:/AIOCRM/backend/server.py) now terminates in `ExecutionEngine` under the locked request/response contract `{ command, context } -> { status, result, message }`.
- REQUIRED FOR RESTORATION: selected agent locking was enforced in [backend/server.py](d:/AIOCRM/backend/server.py) and [backend/orchestration.py](d:/AIOCRM/backend/orchestration.py) so an explicit `requested_agent` is carried into runtime and not adaptively rerouted away.
- REQUIRED FOR RESTORATION: runtime agent authority for `/api/ai/agents` now comes from [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py), not the server-local duplicate registry.
- REQUIRED FOR RESTORATION: [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py) was expanded with the metadata the live Agents UI needs (`label`, `specialization`, `visibility`, `capability_tier`) so backend remains canonical without breaking the current UI.
- REQUIRED FOR RESTORATION: [backend/agent_runtime.py](d:/AIOCRM/backend/agent_runtime.py) now executes provider-backed agent responses inside the engine path, rejects command echo, and returns explicit provider/model errors instead of falling through to generic no-output behavior.
- REQUIRED FOR RESTORATION: [backend/orchestration.py](d:/AIOCRM/backend/orchestration.py) now stores the actual command and provider config in runtime, which the agent runtime consumes directly.
- REQUIRED FOR RESTORATION: the active Ollama provider config in the local repo DB was updated from invalid `llama3` to the actual remote model returned by `http://192.168.4.28:11434/api/tags`: `minimax-m2.5:cloud`.
- REQUIRED FOR RESTORATION: provider-side engine persistence in [backend/data_provider.py](d:/AIOCRM/backend/data_provider.py) was moved off the conflicting auth/UI `ai_runs` table and into `ai_engine_runs`.
- COMPATIBILITY BRIDGE: [frontend/src/services/backendApi.js](d:/AIOCRM/frontend/src/services/backendApi.js) now throws on `{ status: "error" }` so the current Agents UI handles restored structured command failures without reviving the legacy payload.

## OUT OF SCOPE issues not touched

- OUT OF SCOPE: broad cleanup of the duplicate `AGENT_RUNTIME_REGISTRY` constant still present in [backend/server.py](d:/AIOCRM/backend/server.py). Runtime authority was bypassed without deleting unrelated structures.
- OUT OF SCOPE: prompt/policy tuning per specialist. Current runtime uses the provider-backed engine path, but specialist quality/reliability tuning was not expanded.
- OUT OF SCOPE: packaging/import normalization across the whole backend. `PYTHONPATH` was used for process start instead of refactoring mixed `backend.*` and bare imports.
- OUT OF SCOPE: non-Agents assist surfaces still using `/api/ai/assist`.

## Proof that selected agent affects runtime behavior

- Authenticated probe with `requested_agent=BRAVO` returned:
  - `routing.executing_agent = BRAVO`
  - first engine step `assignedAgent = BRAVO`
  - first engine step `agentId = AGT-STR-002`
  - response agent `BRAVO`
  - successful run id `airun-586977e8c49a4e3a`
- Authenticated probe with `requested_agent=GHOST` returned:
  - `routing.executing_agent = GHOST`
  - first engine step `assignedAgent = GHOST`
  - first engine step `agentId = AGT-DEV-007`
  - response agent `GHOST`
  - failed run id `airun-f4b31a722ceeb625`
- Auth-store persistence confirms the selected agent changed runtime fields:
  - [ai_runs in `aio_crm.db`] command row `airun-586977e8c49a4e3a` has `executing_agent='BRAVO'`, `requested_agent='BRAVO'`
  - command row `airun-f4b31a722ceeb625` has `executing_agent='GHOST'`, `requested_agent='GHOST'`

## Proof that ExecutionEngine receives the actual command

- [backend/server.py](d:/AIOCRM/backend/server.py) now passes `command=command_text` into `engine.run(...)`.
- [backend/orchestration.py](d:/AIOCRM/backend/orchestration.py) now places that value into runtime as `runtime["command"]`.
- [backend/agent_runtime.py](d:/AIOCRM/backend/agent_runtime.py) reads `runtime["command"]` when building the provider prompt.
- Engine persistence confirms the exact command reached runtime:
  - provider-side table `ai_engine_runs` contains `run-280142be16` with `command = 'Give one concise specialist recommendation for improving lead handoff quality.'`, `status = 'completed'`
  - provider-side table `ai_engine_runs` contains `run-4f5301c56d` with the same `command`, `status = 'failed'`
- Auth-store run history also records the same `command_text` for the user-facing runs.

## Proof that `ai_assist_service` is not terminal in `/api/ai/command`

- `/api/ai/command` in [backend/server.py](d:/AIOCRM/backend/server.py) no longer calls `ai_assist_service.assist(...)`.
- The only remaining `ai_assist_service.assist(...)` call in [backend/server.py](d:/AIOCRM/backend/server.py) is the `/api/ai/assist` path around line `1934`, not the command route.
- `/api/ai/command` now instantiates `ExecutionEngine` in [backend/server.py](d:/AIOCRM/backend/server.py) and calls `engine.run(...)`.
- Live runtime logs confirm engine-agent execution:
  - `Agent BRAVO processing step ... with intent agent_task`
  - `Agent GHOST processing step ... with intent agent_task`
- The command route now returns engine-step output and engine-step errors, not shared assist output.

## Current blocked items

- Full restoration is still blocked for the 12-agent completion criterion.
- Current validated state:
  - BRAVO executes successfully through the restored engine path.
  - GHOST reaches the restored engine path but failed on provider behavior: `GHOST provider returned no output.` after a remote Ollama timeout.
- The model source is correct and remote-only now:
  - `http://192.168.4.28:11434/api/tags`
  - returned array includes `minimax-m2.5:cloud`
  - no `localhost` fallback was introduced.
