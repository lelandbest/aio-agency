# Implementation Plan — AI Provider System Lockdown

This plan focuses on hardening the unified AI Provider system, enforcing strict consistency rules, and eliminating legacy "shadow" configurations.

## User Review Required

> [!IMPORTANT]
> - **Toggle Logic Enforcement**: Changing `enabled` or `is_default` will now trigger automatic normalization of the other field to prevent invalid states (e.g., a disabled provider being the default).
> - **Localhost Removal**: Any implicit fallback to `localhost:11434` for Ollama will be removed. Users must explicitly save the URL.

## Proposed Changes

### [Frontend] Integrations UI

#### [MODIFY] [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx)
- Update [handleInputChange](file:///d:/AIOCRM/frontend/src/modules/Integrations/components/AddIntegrationPanel.jsx#27-42) or the checkbox `onChange` handlers to enforce:
  - If `is_default` set to `true` -> `enabled` becomes `true`.
  - If `enabled` set to `false` -> `is_default` becomes `false`.
- Ensure no hardcoded `localhost:11434` remains in any UI-side fallback.

### [Backend] AI Core

#### [MODIFY] [auth_store.py](file:///d:/AIOCRM/backend/auth_store.py)
- Update [upsert_ai_provider_config](file:///d:/AIOCRM/backend/auth_store.py#2109-2219) to enforce Rule 1-5 server-side.
- Ensure that if `is_default` is `True`, `enabled` is forced to `1`.
- Ensure that if `enabled` is `0`, `is_default` is forced to `0`.

#### [MODIFY] [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py)
- Audit [_provider_base_url](file:///d:/AIOCRM/backend/ai_service.py#85-88) and [test_provider](file:///d:/AIOCRM/backend/ai_service.py#421-439) for Ollama to remove `localhost` fallbacks.
- Ensure runtime resolution fails explicitly if no default provider is set or enabled.

### [Documentation] Boundary Lock

#### [NEW] [AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md](file:///d:/AIOCRM/docs/AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md)
- Document [providerSchema.js](file:///d:/AIOCRM/frontend/src/modules/Integrations/providerSchema.js) as the canonical source.
- Define the resolution rules for runtime.

### AI Service Hardening [NEW]
- **Modify [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py)**:
    - Centralize guardrail extraction from [provider_config](file:///d:/AIOCRM/backend/server.py#2204-2229).
    - Update [_provider_complete](file:///d:/AIOCRM/backend/ai_service.py#1218-1288) to automatically inject `system_guardrails` into the `system_prompt` and `task_guardrails` into the user `prompt`.
    - Update [_complete_openai_compat](file:///d:/AIOCRM/backend/ai_service.py#1309-1327), [_complete_anthropic](file:///d:/AIOCRM/backend/ai_service.py#1328-1347), and [_complete_google_ai](file:///d:/AIOCRM/backend/ai_service.py#1348-1366) to use the configured `temperature` instead of hardcoded `0.3`.

### Automated/Manual Browser Tests
- **Rule Verification**: Use browser subagent to toggle `enabled/default` and verify auto-correction.
- **Provider Switching**: Set Provider A as default, run report; set Provider B as default, run report.
- **Guardrail Test**: Set obvious guardrail (e.g., "Respond in 3 sections"), run report, verify output.
- **Localhost Audit**: Clear Ollama URL, try to Test/Generate, verify it fails (does NOT fallback to localhost).
- **Commit Persistence**: Verify "Commit Report" still saves to DOC bin.
