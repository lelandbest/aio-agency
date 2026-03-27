# Phase 12 Implementation Plan

## Goal Description
Enhance the execution engine into a scalable, observable runtime by formalizing agents via [AgentRegistry](file:///d:/AIOCRM/frontend/src/modules/Agents/index.jsx#81-91), moving to explicit declarative security policies instead of regex/string intent heuristics, hardening the approval workflow state separation, and persisting granular execution telemetry to SQLite audit trails.

## Proposed Changes

### 1. Agent Runtime (`backend/agent_runtime.py`)
- Define abstract `BaseAgent` exposing [execute(step, context)](file:///d:/AIOCRM/backend/orchestration.py#141-176).
- Create [AgentRegistry](file:///d:/AIOCRM/frontend/src/modules/Agents/index.jsx#81-91) singleton to safely hold instantiated capabilities. 
- Implement wrapper agents for current local intents (`EchoAgent`, `CharlieAgent`, `AlphaAgent`) bridging existing functionality to the formal abstraction interface.

### 2. Declarative Step Preparation ([backend/orchestration.py](file:///d:/AIOCRM/backend/orchestration.py))
- Modify [normalize_parsed_steps()](file:///d:/AIOCRM/backend/orchestration.py#13-36) to pre-calculate and stamp step objects with the new robust schema (`isWrite`, `mutationType`, `isExternal`, `sideEffect`, `targetType`).
- Retrofit [check_step_gate()](file:///d:/AIOCRM/backend/orchestration.py#37-79) to simply switch on these pre-calculated properties (e.g. `WRITE + EXTERNAL -> high`) instead of re-stringifying step parameters.

### 3. Execution Engine Overhaul ([backend/orchestration.py](file:///d:/AIOCRM/backend/orchestration.py))
- Update `ExecutionEngine.run()` to lookup agents in [AgentRegistry](file:///d:/AIOCRM/frontend/src/modules/Agents/index.jsx#81-91) before falling back to local [StepExecutor](file:///d:/AIOCRM/backend/orchestration.py#131-209) methods.
- Refactor the run loop to strictly respect discrete states: `awaiting_approval`, `approved`, `executing`, [success](file:///d:/AIOCRM/backend/server.py#1213-1234), [error](file:///d:/AIOCRM/backend/server.py#1272-1284).
- Ensure execution definitively halts upon detecting `awaiting_approval`.
- Add observability metrics natively to [step](file:///d:/AIOCRM/backend/orchestration.py#37-79) and [run](file:///d:/AIOCRM/backend/orchestration.py#215-311) execution: `startedAt`, `completedAt`, `durationMs`, and populate an explicit `trace` array mapped to the `runId`.

### 4. Audit persistence ([backend/data_provider.py](file:///d:/AIOCRM/backend/data_provider.py))
- Define new SQLite table schema `ai_audit_logs` with properties (`runId`, `stepId`, [agent](file:///d:/AIOCRM/backend/server.py#2877-2890), [action](file:///d:/AIOCRM/backend/ai_service.py#425-460), [result](file:///d:/AIOCRM/backend/ai_service.py#1275-1289), `timestamp`).
- Implement `save_ai_audit_log(payload)` and hook it deeply into the [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#210-333) execution loops for full trace debugging visibility.

### 5. Verification
Write `test_phase12.py` verifying:
- Successful dynamic AgentRegistry dispatching.
- Explicit pause behavior without automatically graduating `awaiting_approval` during arbitrary resumes.
- Generation of the execution trace telemetry.

## User Review Required
None beyond confirming correct Phase 11 baseline. We preserve the original frontend API surface fully.
