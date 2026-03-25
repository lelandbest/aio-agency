# Help Desk Evolution Implementation Plan

Upgrade the existing Help Desk from a passive documentation viewer into a modern, action-driven, AI-assisted guidance system.

## Proposed Changes

### [Core] [App.jsx](file:///d:/AIOCRM/frontend/src/App.jsx)
- [MODIFY] [App.jsx](file:///d:/AIOCRM/frontend/src/App.jsx) to pass `activeModule` to [HelpModule](file:///d:/AIOCRM/frontend/src/modules/Help/index.jsx#17-389).
- Wrap modules in `HelpProvider` (to be created) for global action triggering.

### [Help Module] [Help/index.jsx](file:///d:/AIOCRM/frontend/src/modules/Help/index.jsx)
- [MODIFY] [index.jsx](file:///d:/AIOCRM/frontend/src/modules/Help/index.jsx)
  - **Search Intent Engine**: Upgrade search to return Articles, Actions, and Templates.
  - **Action Layer**: Add support for rendering and triggering actions (e.g., `create_flow`, [navigate](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx#544-553)) inside articles.
  - **"Ask Charlie" AI**: Transform the button into a conversational input with structured responses.
  - **Category Cards**: Enhance cards with descriptions and Quick Actions.
  - **Module Awareness**: Prioritize results based on the `activeModule` context.
  - **Recent/Recommended**: Track and display recently viewed articles.

### [Components] [EmptyState.jsx](file:///d:/AIOCRM/frontend/src/components/EmptyState.jsx) [NEW]
- [NEW] [EmptyState.jsx](file:///d:/AIOCRM/frontend/src/components/EmptyState.jsx)
  - Create a shared component for empty states that integrates with the Help System actions.

### [UI Modules] [CRM/index.jsx](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx) & [Comms/index.jsx](file:///d:/AIOCRM/frontend/src/modules/Comms/index.jsx)
- [MODIFY] [CRM/index.jsx](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx) & [Comms/index.jsx](file:///d:/AIOCRM/frontend/src/modules/Comms/index.jsx)
  - Replace static "No data" messages with the new `EmptyState` component.
  - Connect empty state buttons to Help System actions.

## Verification Plan

### Automated Tests
- N/A (UI-driven manual verification)

### Manual Verification
- **Search Test**: Type "send sms" and verify results include article, action, and template.
- **Context Test**: Navigate to Flows, open Help, and verify Flow-related docs are prioritized.
- **Action Test**: Click "Create Flow" action inside a help article and verify navigation/trigger.
- **AI Test**: Ask Charlie a question and verify the structured response format.
- **Empty State Test**: Clear all flows/contacts and verify the "Smart Empty State" guides are visible and functional.
