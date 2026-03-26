# Audit Report — AI Provider UI Path

## Live UI Path
- **Route**: `/integrations` (rendered via `IntegrationsManager` in [App.jsx](file:///d:/AIOCRM/frontend/src/App.jsx))
- **Top-level component**: [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx)
- **Form-rendering component**:
    - **Existing Providers**: [renderAiAdmin](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1495-1611) (function inside [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx))
    - **Add New Provider**: [AddIntegrationPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/components/AddIntegrationPanel.jsx)
- **State owner**:
    - **Existing**: `aiProviderForm` (local state in [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx))
    - **Add New**: `formData` (local state in [AddIntegrationPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/components/AddIntegrationPanel.jsx))
- **Save handler**: 
    - **Existing**: [handleSaveAiProvider](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1065-1084) (in [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx))
    - **Add New**: [handleAddIntegration](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#761-847) (in [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx))
    - **Backend API**: [upsertAiProviderConfigApi](file:///d:/AIOCRM/frontend/src/services/backendApi.js#258-265) (calls `/api/ai/providers/{key}`)
- **Test handler**: [handleTestAiProvider](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1085-1107) (in [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx))
    - **Backend API**: [testAiProviderConfigApi](file:///d:/AIOCRM/frontend/src/services/backendApi.js#272-277) (calls `/api/ai/providers/{id}/test`)

## File Truth Table
| File | Status | Role |
| :--- | :--- | :--- |
| [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx) | **LIVE** | Main container; owns state and handles save/test for AI providers. |
| [AddIntegrationPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/components/AddIntegrationPanel.jsx) | **LIVE** | Rendered as a modal for "Add Provider"; contains "dead" guardrail logic (unreachable due to catalog mask). |
| [integrationConfigs.js](file:///d:/AIOCRM/frontend/src/modules/Integrations/utils/integrationConfigs.js) | **DEAD** | Shadows/is shadowed by [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx) hardcoded `DEFAULT_AI_PROVIDER_CATALOG` for the LLM category. |
| [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py) (Backend) | **LIVE** | Provides the dynamic [get_ai_provider_catalog](file:///d:/AIOCRM/backend/ai_service.py#117-197) which [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx) attempts to load. |

## Recommendation
To ensure guardrails are visible and functional:
1.  **Modify [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx)**: Update the hardcoded `DEFAULT_AI_PROVIDER_CATALOG` to include `guardrails` and update the [renderAiAdmin](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1495-1611) JSX to render the textareas.
2.  **Modify Backend [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py)**: Add `guardrails` definitions to the returned catalog to prevent the UI from "reverting" if the backend catalog loads.
3.  **Payload Mapping**: Ensure [handleSaveAiProvider](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx#1065-1084) in [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx) sends `system_guardrails` and `task_guardrails` at the root of the payload to match the backend [AIProviderUpsertRequest](file:///d:/AIOCRM/backend/server.py#1025-1036).

---

## Duplicate/Dead UI Details
- **[AddIntegrationPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/components/AddIntegrationPanel.jsx)** contains a `Guardrails Section` (lines 275-312) that is perfectly functional but hidden because the `aiProviderCatalog` passed to it (from [ActiveIntegrations.jsx](file:///d:/AIOCRM/frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx)) does not define the `guardrails` property for any providers.
- **[integrationConfigs.js](file:///d:/AIOCRM/frontend/src/modules/Integrations/utils/integrationConfigs.js)** is the only file that currently contains the prompt injection text for guardrails, but it is not the source of truth used by the "LLM Control Plane" in the live app.
