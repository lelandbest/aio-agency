# Stabilization & Endpoint Convergence Finalization

Technical plan to stabilize [backend/server.py](file:///d:/AIOCRM/backend/server.py) and finalize the AI endpoint convergence to canonical paths.

## User Review Required

> [!IMPORTANT]
> A full, atomic overwrite of [backend/server.py](file:///d:/AIOCRM/backend/server.py) will be performed to resolve significant syntax and indentation corruption introduced during previous automated edits.

## Proposed Changes

### Backend Core

#### [MODIFY] [server.py](file:///d:/AIOCRM/backend/server.py)
- Performs a full overwrite with syntactically correct code.
- Establishes [ai_assist_logic](file:///d:/AIOCRM/backend/server.py#2412-2535) as a robust, shared async function.
- Implements `POST /api/ai/draft` as the canonical generic drafting endpoint.
- Deprecates `POST /api/ai/assist` to a legacy backend alias, routing through shared logic.
- Ensures `POST /api/assist` remains untouched as the grounded system assist.

---

## Verification Plan

### Automated Tests
- Run a full syntax check on [backend/server.py](file:///d:/AIOCRM/backend/server.py).
- Verify the server starts without errors.
- Test `POST /api/ai/draft` and `POST /api/ai/assist` using a mock client to ensure they return equivalent valid responses.
- Verify `POST /api/assist` continues to function and return grounded data.

### Manual Verification
- Confirm with the user that the system is stable and no further syntax errors are reported by the IDE.
