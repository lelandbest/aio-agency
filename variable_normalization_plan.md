# Global Variable System Audit & Normalization Plan

This plan standardizes the AIO CRM context/variable system to ensure consistent data availability across all AI and Flow execution routes, while transitioning to a modern `camelCase` naming convention.

## User Review Required

> [!IMPORTANT]
> - All existing system variables (e.g., `run_id`, `tenant_id`) will be duplicated with `camelCase` equivalents (e.g., `runId`, `tenantId`) to ensure 100% backward compatibility for existing flows.
> - A new `VariablePicker` component will be added to the Flow Builder to make these variables discoverable.

## Proposed Changes

### Backend: Normalization & Enrichment

#### [NEW] `backend/context_service.py`
- Create a centralized context service to handle:
  - **Normalization**: Map all snake_case keys to camelCase.
  - **Gap Fill**: Ensure the presence of `runId`, `timestamp`, `userId`, `workspaceId`, `agentContext`, `flowContext`.
  - **Signal Injection**: Fetch recent system signals for context.

#### [MODIFY] [server.py](file:///d:/AIOCRM/backend/server.py)
- Refactor `/api/ai/assist` and `/api/ai/command` to use the new `context_service`.
- Standardize `inject_brain_context` to output camelCase keys.

#### [MODIFY] [orchestration.py](file:///d:/AIOCRM/backend/orchestration.py)
- Ensure the `ExecutionEngine` enriches context at every step transition.

### Frontend: Discovery & Usage

#### [NEW] `frontend/src/components/VariablePicker.jsx`
- A floating tooltip or dropdown component for the Flow Builder.
- Lists all available global variables (System, User, Brain, etc.) for easy insertion.

#### [MODIFY] `frontend/src/modules/Flows/components/NodeConfigDrawer.jsx`
- Integrate `VariablePicker` into the "Configuration" and "Description" textareas.

## Verification Plan

### Automated Tests
- Run a series of AI assist requests and verify the saved `context_json` in the database contains both `run_id` and `runId`.
- Validate that `userId` and `workspaceId` are accurately injected from the session.

### Manual Verification
- Open the Flow Builder and test the new `VariablePicker` in a node configuration.
- Submit a help ticket and verify the resulting signal appears in the `recentSignals` context of subsequent AI tasks.
