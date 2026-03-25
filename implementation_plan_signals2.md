# Signal Engine Routing Fix (Pipelines Integration)

Fix Signal actions so they correctly dispatch to the centralized help action system and target the `pipelines` module without placeholders.

## Proposed Changes

### [Signals Module]
#### [MODIFY] [index.jsx](file:///d:/AIOCRM/frontend/src/modules/Signals/index.jsx)
- **Standardize Module Keys**: Change all `module: 'pipeline'` to `module: 'pipelines'`.
- **Enforce Action Dispatch**: Update all pipeline actions to use [executeHelpAction](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#66-79).
- **Assign Agent**: Standardize `Assign Agent` to use `type: 'assign_agent'`.
- **Generate Follow-ups**: Standardize `Generate Follow-ups` to use `type: 'create_flow_dynamic'`.
- **Remove Direct Routing**: Replace [navigate](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#7-16) with [open_module](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#31-40) where appropriate.
- **Clean Placeholders**: Remove any `console.log` or stubbed handlers from signal objects.

### [Help System]
#### [MODIFY] [helpActions.js](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js)
- **Add Action**: Implement `assign_agent` in the `helpActions` registry.
- **Add Debugging**: Add `console.log("[Signals Action]", action.type, action.payload);` inside the [executeHelpAction](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#66-79) wrapper as requested.

## Verification Plan

### Automated Tests
- N/A

### Manual Verification
1.  **Open Pipeline Check**: Click "Open Pipeline" on a stalled deals signal and verify it navigates to the Pipelines module.
2.  **Generate Follow-ups Check**: Click "Generate Follow-ups" and verify it dispatches a [create_flow_dynamic](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#48-64) action with the correct intent.
3.  **Assign Agent Check**: Click "Assign Agent" and verify it dispatches an `assign_agent` action.
4.  **Debug Verification**: Check console for `[Signals Action]` logs on every action click.
5.  **Direct Navigation Check**: Ensure no `window.location` or direct [navigate()](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#7-16) calls remain in [Signals/index.jsx](file:///d:/AIOCRM/frontend/src/modules/Signals/index.jsx).
