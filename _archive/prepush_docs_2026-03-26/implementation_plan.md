# Phase 11 Implementation Plan

## Goal Description
Enhance the Phase 10 execution engine to fully align with the agent hierarchy, enforce context-aware side-effect gating, emit structured artifacts that bind natively to existing UI objects, and support deterministic step resuming for operator approval flows. All without breaking current UI frontend payload expectations.

## Proposed Changes

### 1. [backend/orchestration.py](file:///d:/AIOCRM/backend/orchestration.py)
Modify [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#123-214) and [StepExecutor](file:///d:/AIOCRM/backend/orchestration.py#57-122) to be agent-native.
- **Step Normalizer**: Extend to seed [routing](file:///d:/AIOCRM/backend/server.py#680-701) structures for `CHARLIE` and default dispatch properties.
- **check_step_gate()**: Enhance the generic gate to analyze action verbs ([draft_email](file:///d:/AIOCRM/backend/orchestration.py#90-98), [add_contact](file:///d:/AIOCRM/backend/orchestration.py#108-114)), assigning `riskLevel` of low/medium/high alongside the `permissionTier`.
- **Resume Flow**: Extend the `mode == "resume"` block to preserve prior [data](file:///d:/AIOCRM/backend/server.py#262-266), [error](file:///d:/AIOCRM/backend/server.py#1272-1284), and [status](file:///d:/AIOCRM/backend/server.py#1402-1410), skipping steps marked [success](file:///d:/AIOCRM/backend/server.py#1213-1234) or `skipped`, and picking up cleanly at `awaiting_approval`.
- **Response Shape**: Make sure the final return payload consistently uses the keys `runId`, [status](file:///d:/AIOCRM/backend/server.py#1402-1410), `pendingApprovals` (with `riskLevel`, [summary](file:///d:/AIOCRM/backend/data_provider.py#4926-4929), `reason`), and the [routing](file:///d:/AIOCRM/backend/server.py#680-701) sub-dict the Agents UI expects (`executing_agent`, `delegate_chain`).

### 2. [backend/server.py](file:///d:/AIOCRM/backend/server.py) 
Align generic artifact building with rich CRM objects.
- **build_ai_run_artifacts()**: Extend to generate the required shape [id](file:///d:/AIOCRM/backend/data_provider.py#2839-2841), [type](file:///d:/AIOCRM/backend/data_provider.py#1920-1922), [title](file:///d:/AIOCRM/backend/ai_service.py#16-18), [summary](file:///d:/AIOCRM/backend/data_provider.py#4926-4929), [data](file:///d:/AIOCRM/backend/server.py#262-266), `uiBinding` for specific returned artifacts.
- Map generated artifacts natively back into `email_draft`, [calendar_event](file:///d:/AIOCRM/backend/data_provider.py#5727-5767), [contact](file:///d:/AIOCRM/backend/orchestration.py#108-114), and [crm_note](file:///d:/AIOCRM/backend/orchestration.py#115-122) types.
- Forward [choose_specialist_for_command()](file:///d:/AIOCRM/backend/server.py#616-678) into the run execution so [routing](file:///d:/AIOCRM/backend/server.py#680-701) is accurately determined before steps execute.

### 3. Verification & Testing
Create a test script `test_phase11.py` covering:
- Parse + Plan routing outputs
- Blocked step triggering
- Resume parsing successfully without re-running skipped steps
- Validating the artifact dictionary structures

## User Review Required
None natively required. Existing architecture and payload patterns will primarily be extended natively.
