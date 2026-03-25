# Dynamic Flow Generation Layer (Charlie → Flow Builder)

Upgrade the existing Help/Action system to allow Charlie to generate flows dynamically from natural language.

## Proposed Changes

### [Help Module]
#### [MODIFY] [helpActions.js](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js)
- Add `create_flow_dynamic` action that dispatches `aio:navigate` with `action: 'create_dynamic_flow'` and the user's intent.

#### [MODIFY] [index.jsx](file:///d:/AIOCRM/frontend/src/modules/Help/index.jsx)
- Update [handleAskCharlie](file:///d:/AIOCRM/frontend/src/modules/Help/index.jsx#129-157) to detect flow-related intents and suggest `create_flow_dynamic` actions.
- Update UI to render dynamic generator actions with higher priority and distinct styling.

---

### [Flows Module]
#### [NEW] [flowGenerationService.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowGenerationService.js)
- Implement `generateFlowFromIntent(intent)` using rule-based mapping for triggers and actions.
- Map recognized keywords (e.g., "form", "sms", "email", "deal") to standard node types.
- Format the output as a `draftSpec` and store it using `flowDraftRepository`.

#### [MODIFY] [FlowBuilder.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx)
- Add `intent` prop to [FlowBuilder](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx#140-2173).
- In `useEffect` ([initFlow](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx#381-456)), if `intent` is present, call `generateFlowFromIntent`, save the draft, and then proceed with existing draft ingestion logic.

---

### [App Core]
#### [MODIFY] [App.jsx](file:///d:/AIOCRM/frontend/src/App.jsx)
- Update [handleNavigate](file:///d:/AIOCRM/frontend/src/App.jsx#181-199) to capture `intent` and `action` from the `aio:navigate` event and pass them to the state.
- Pass `intent` and `flowAction` to the [Flows](file:///d:/AIOCRM/frontend/src/modules/Flows/index.jsx#11-18) module component.
- Ensure `activeModule === 'flows'` is set when the dynamic action is triggered.

## Verification Plan

### Automated Tests
- N/A (Manual verification prioritized for UI/UX flow)

### Manual Verification
1. Open Help Desk and ask Charlie "send sms when a deal moves to closed won".
2. Verify Charlie returns a "Generate Custom Flow" action.
3. Click the action and verify the app navigates to the Flows module.
4. Verify the Flow Builder loads with a generated graph containing a Deal Trigger and an SMS Action.
5. Verify the generated nodes are layed out correctly and follow the ingestion pipeline (validation check).
6. Verify existing static templates still load correctly.
