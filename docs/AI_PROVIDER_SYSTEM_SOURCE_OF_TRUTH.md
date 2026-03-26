# AI Provider System — Source of Truth

This document defines the final architectural boundaries for the AIO CRM AI Provider system to ensure stability and prevent regression.

## 1. Canonical Source of Truth
- **Schema**: `frontend/src/modules/Integrations/providerSchema.js`
  - All provider definitions, display names, and fields MUST be defined here.
  - No hardcoded provider catalogs should be reintroduced in other components.

## 2. Frontend Roles
- **activeIntegrations.jsx**: The primary UI for managing AI providers. It consumes `providerSchema.js` to render forms and persists configuration to the backend.
- **AddIntegrationPanel.jsx**: Inherits definitions from `providerSchema.js` for the `llms` category.

## 3. Backend Roles
- **auth_store.py**: Handled persistence in the `ai_provider_configs` table.
  - **Toggle Logic Enforcement**: 
    - If `is_default` = true, `enabled` must be true.
    - If `enabled` = false, `is_default` must be false.
- **ai_service.py**: Resolves the active provider at runtime for the current workspace.

## 4. Runtime Resolution
- The system resolves the **Default** provider marked for the current workspace.
- If no provider is marked as default, AI operations MUST fail with a clear "No AI provider configured" error.
- **Localhost Fallback**: No implicit fallbacks to `localhost:11434` are permitted. All URLs must be explicitly configured.

## 5. Guardrails
- `system_guardrails` and `task_guardrails` are provider-level persistent configurations.
- They are injected at runtime into the LLM prompts (Base System instructions and Task guidance respectively).

## 6. Prohibitions
- DO NOT reintroduce `DEFAULT_AI_PROVIDER_CATALOG`.
- DO NOT hardcode provider-specific logic outside of `providerSchema.js` or the backend `ai_service.py`.
