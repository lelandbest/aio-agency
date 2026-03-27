# Agent Wiring Restoration Plan

## 1. Target Spec

Use these as the authoritative baseline for recovery:

- `002e794` (`Implement Phase 15: Multi-Agent Collaboration + Planning Engine & Full Roster Support`)
- [AI_WIRING_PLAN.md](d:/AIOCRM/AI_WIRING_PLAN.md)
- [AGENT_HANDOFF_PHASES.md](d:/AIOCRM/AGENT_HANDOFF_PHASES.md)
- [walkthrough.md](d:/AIOCRM/walkthrough.md)
- [implementation_plan_phase12.md](d:/AIOCRM/implementation_plan_phase12.md)

The recovery target is the intended unified agent execution shell, not the simplified assist-backed command path.

## 2. Authority Decisions

Before touching code, lock these decisions:

- Canonical execution endpoint: `/api/ai/command`
- Canonical execution engine: [backend/orchestration.py](d:/AIOCRM/backend/orchestration.py) via [backend/agent_runtime.py](d:/AIOCRM/backend/agent_runtime.py)
- Canonical roster/definitions: [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py)
- Frontend agent shell: [frontend/src/modules/Agents/index.jsx](d:/AIOCRM/frontend/src/modules/Agents/index.jsx)
- Frontend API adapter: [frontend/src/services/backendApi.js](d:/AIOCRM/frontend/src/services/backendApi.js)

Anything duplicate must adapt to those, not compete with them.

## 3. Conflict Map

Reconcile these files first because they are the break line:

- [backend/server.py](d:/AIOCRM/backend/server.py)
- [backend/orchestration.py](d:/AIOCRM/backend/orchestration.py)
- [backend/agent_runtime.py](d:/AIOCRM/backend/agent_runtime.py)
- [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py)
- [frontend/src/modules/Agents/index.jsx](d:/AIOCRM/frontend/src/modules/Agents/index.jsx)
- [frontend/src/services/backendApi.js](d:/AIOCRM/frontend/src/services/backendApi.js)
- [frontend/src/modules/Agents/data/agentRegistry.js](d:/AIOCRM/frontend/src/modules/Agents/data/agentRegistry.js)

Then inspect secondary dependents:

- shared assist callers that may have been pointed at the simplified shell
- any UI expecting `{status,result,message}` instead of the engine response
- any run-history UI depending on current `ai_runs` shape

## 4. Backend Recovery Sequence

1. Restore the `ExecutionEngine`-backed `/api/ai/command` path as the single authoritative runtime.
   - There must be ONE `/api/ai/command`.
   - If both assist-backed and `ExecutionEngine` routes exist -> FAIL.
   - `/api/ai/command` MUST terminate in `ExecutionEngine`.
   - `ai_assist_service.assist()` is forbidden in command execution.
   - No mixed or branching execution paths allowed.
   - If both exist -> FAIL.
2. Remove the conflicting simplified assist-backed duplicate from the live route path.
3. Reconcile the request/response contract once, explicitly.
   - Enforce a single canonical contract for `/api/ai/command`.
   - Request:
     ```json
     {
       "command": "string",
       "context": {}
     }
     ```
   - Response:
     ```json
     {
       "status": "success|error",
       "result": {},
       "message": "optional"
     }
     ```
   - `ExecutionEngine` MUST adapt to this contract.
   - Legacy payload (`module`, `surface`, `command_text`, `requested_agent`) is NOT to be restored.
   - Dual contract support is forbidden.
4. Keep later valid hardening only if it does not bypass orchestration:
   - auth checks
   - provider resolution
   - logging
   - Ghost rename / identity cleanup
   - Validate behavior against commit `002e794`.
   - Preserve later fixes ONLY if they do NOT bypass:
     - `ExecutionEngine`
     - agent runtime
     - orchestration flow
   - If conflict exists -> `ExecutionEngine` wins.
5. Verify the route actually uses agent runtime and not `ai_assist_service.assist()` as the terminal path.
   - `/api/ai/command` MUST NOT call `_generic_result()`.
   - `/api/ai/command` MUST NOT echo user input.
   - `/api/ai/command` MUST NOT silently succeed on failure.
   - All failures MUST return explicit error responses.
   - If fallback exists -> FAIL.

## 5. Registry Recovery Sequence

1. Identify one source of truth for the 12-agent roster plus hidden/internal agents.
   - Canonical runtime registry: [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py).
2. Reconcile ID/name/key mismatches between:
   - `AGENT_RUNTIME_REGISTRY` in [backend/server.py](d:/AIOCRM/backend/server.py)
   - [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py)
   - [frontend/src/modules/Agents/data/agentRegistry.js](d:/AIOCRM/frontend/src/modules/Agents/data/agentRegistry.js)
   - persisted `agents` records
3. Make frontend selection and backend execution resolve against the same canonical keys.
   - Backend MUST resolve all agents from [backend/agent_definitions.py](d:/AIOCRM/backend/agent_definitions.py).
   - Frontend registry is UI-only and non-authoritative.
   - DB agent records must map to canonical keys only.
4. Eliminate local-only registry behavior if it conflicts with backend authority.
   - Multiple runtime registries -> FAIL.

## 6. Frontend Recovery Sequence

1. Repoint the Agents UI to the canonical `/api/ai/command` contract.
2. Restore the intended agent profile -> command shell -> execution flow.
3. Ensure the selected agent actually influences backend execution, not just metadata.
4. Keep the newer response-rendering fix so structured results do not render as `[object Object]`.
5. Preserve valid UI fixes made after the divergence, but only if they do not depend on the simplified contract.

## 7. Cross-System Validation Gates

The refactor is not complete until all of these pass:

- Agent card click loads the intended agent shell.
- Sending a command hits `/api/ai/command`.
- Backend executes through `ExecutionEngine`.
- Routing/delegation reflects the selected agent model, not only decorative metadata.
- Result is readable in UI.
- Run is persisted.
- At least one path for each of the 12 visible agents can be exercised without falling back to echo behavior.
- Auth failure is visible and does not silently degrade to local echo/fallback.
- ALL 12 agents must execute through `ExecutionEngine`.
- NO agent may return fallback or echo output.
- Selected agent MUST affect runtime behavior, not metadata only.
- ANY fallback or assist routing means restoration is incomplete.
- Validate behavior against commit `002e794`.
- Preserve later fixes ONLY if they do NOT bypass:
  - `ExecutionEngine`
  - agent runtime
  - orchestration flow
- If conflict exists -> `ExecutionEngine` wins.
- Require proof that `ExecutionEngine` is instantiated and used.
- Require proof that command execution does NOT terminate in assist service.
- Require at least one successful execution per agent tested.
- Require at least one failure showing explicit error, with no fallback.
- Require a persisted run confirming execution occurred.
- No proof means the restoration is not complete.

## 8. Guardrails

- No broad cleanup during restoration.
- No duplicate removal unless the authoritative path is proven first.
- No contract changes without updating all live callers in the same pass.
- No temporary fallback that can mask broken execution.
- No mixing of local frontend registry state with backend execution authority.
- DO NOT broadly revert files.
- DO NOT merge duplicate systems.
- DO NOT perform cleanup during restoration.
- Restore `ExecutionEngine` authority FIRST.
- THEN adapt newer valid changes onto it.
- Violation -> FAIL.

## 9. Stop Condition

If ANY of the following are unresolved:

- contract mismatch
- registry conflict
- route ambiguity
- execution uncertainty

-> STOP and report BLOCKED  
-> DO NOT proceed

## 10. Rollback Points

Create explicit checkpoints during the work:

1. Pre-restore snapshot of current worktree.
2. Backend runtime restored and tested before frontend rewiring.
3. Frontend Agents shell aligned to backend contract before touching secondary assist surfaces.
4. Final checkpoint only after end-to-end validation for the full roster.

## 11. Deliverables

The recovery pass should produce:

- one live `/api/ai/command`
- one canonical agent roster
- one real agent shell in UI
- one verified execution path from card selection to persisted run
- a validation report proving the 12-agent wiring is live again

The shortest safe path is: restore backend authority first, then align frontend to it, then validate agent-by-agent.
