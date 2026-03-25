# Signal Engine Activation (Upgrade Existing Signals)

Transform the passive Signals dashboard into an active, action-driven Signal Engine where every metric is interpreted and actionable.

## Proposed Changes

### [Signals Module]
#### [MODIFY] [index.jsx](file:///d:/AIOCRM/frontend/src/modules/Signals/index.jsx)
- **Standardize Signal Object**: Implement a `mapDataToSignals` utility to convert raw counts (contacts, pipeline, threads) into structured signal objects.
- **Add Severity Logic**: Categorize signals as `critical`, `attention`, or [normal](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx#271-272) based on business rules (e.g., stalled deals > 48h = critical).
- **New Components**:
  - `PrioritySignalStrip`: Top-level component for "Critical" and high "Attention" signals.
  - `SignalCard`: Replaces static chart blocks with interpreted cards showing Title, Description, Impact, and Action buttons.
  - `SignalHistory`: Upgraded "Recent Activity" to show execution logs and outcomes.
- **Action Integration**: All buttons will call [executeHelpAction](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#66-79) from [helpActions.js](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js).
- **Remove Passive Data**: Convert "Funnel Movement" and "AI Activity" from pure charts into interpreted signals.

### [Shared Components]
#### [MODIFY] [helpActions.js](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js)
- Ensure all actions required by signals (e.g., [open_module](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#31-40), [create_flow_dynamic](file:///d:/AIOCRM/frontend/src/modules/Help/actions/helpActions.js#48-64)) are properly supported.

## Signal Structure Standard
```json
{
  "id": "string",
  "type": "pipeline | comms | ai | system",
  "severity": "critical | attention | normal",
  "title": "string",
  "description": "string",
  "impact": "string",
  "recommendedActions": [
    {
      "label": "string",
      "action": { "type": "string", "payload": {} }
    }
  ],
  "source": "string",
  "timestamp": 123456789
}
```

## Verification Plan

### Automated Tests
- N/A

### Manual Verification
1.  **Check Priority Strip**: Verify that critical signals (e.g., "3 Stalled Deals") appear at the top with a primary action button.
2.  **Verify Severity Rendering**: Ensure red/yellow/green indicators match the signal severity.
3.  **Action Execution**: Click "Follow Up" on a signal and verify it triggers the correct system behavior (e.g., opens Comms or starts a Flow).
4.  **Signal Interpretation**: Confirm that "Funnel Movement" now explains *why* it matters (e.g., "Leads are dropping off at the Demo stage").
5.  **History Check**: Verify that executing an action from a signal adds a log to the "Activity Timeline".
