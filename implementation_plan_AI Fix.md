# Fix AI Generation and Guardrails UI

This plan addresses the blockers identified during the smoke test:
1.  **SQL Error**: Fixed the placeholder mismatch in `auth_store.record_ai_run`.
2.  **CORS/Connectivity**: Ensure the frontend origin is correctly allowed.
3.  **Missing Guardrails**: Implement System and Task guardrail fields in the AI Provider settings.

## Proposed Changes

### Backend

#### [MODIFY] [auth_store.py](file:///d:/AIOCRM/backend/auth_store.py)
- Remove the extra `?` placeholder in the `INSERT INTO ai_runs` statement (line 1519). It currently has 29 placeholders for 28 columns/values.

#### [MODIFY] [server.py](file:///d:/AIOCRM/backend/server.py)
- Ensure CORS specifically allows the frontend origin. (The current config looks okay but I will verify the `ALLOWED_ORIGINS` logic to be robust).

### Frontend

#### [MODIFY] [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx)
- Update `DEFAULT_AI_PROVIDER_CATALOG` to include `system_guardrails` and `task_guardrails` definitions.
- Update [createAiProviderDraft](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#143-152) to initialize these fields.
- Update the `useEffect` that synchronizes `aiProviderForm` with `selectedAiProviderConfig` to include these fields.
- Update [renderAiAdmin](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1495-1611) to render two `textarea` components for System and Task guardrails.
- Update [handleSaveAiProvider](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1065-1084) and [handleTestAiProvider](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1085-1107) to include these fields in the payload sent to the backend.

## Verification Plan

### Automated Tests
- Trigger an AI command (Test 2/3) and verify it no longer throws `sqlite3.OperationalError` and successfully records the run.
- Check browser console for CORS errors.

### Manual Verification
- Navigate to **Integrations > AI Providers**.
- Select an LLM provider (e.g., Ollama).
- Verify "System Guardrails" and "Task Guardrails" textareas appear in the right panel.
- Enter text, save, and verify persistence by refreshing the page.
- Run a Cortex report and verify (via backend logs or [ai_runs](file:///d:/AIOCRM/backend/server.py#1926-1934) table) that the guardrails are being appended to the prompt.
