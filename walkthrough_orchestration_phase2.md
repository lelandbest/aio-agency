# Walkthrough - Orchestration Layer Phase 2

## Overview
Phase 2 enhances the orchestration layer with event logging, risk metadata, payload validation, context-aware escalation hooks, and a formal execution policy structure. This builds on Phase 1's confirmation gate to create a lightweight execution control system.

---

## What Was Added

### 1. Execution Policy Layer (`executionPolicy.js`)

Defines per-action policy metadata:

```javascript
ACTION_POLICIES = {
  open_module: {
    type: 'direct',
    riskLevel: RISK_LEVELS.LOW,
    requiresConfirmation: false,
    requiresReview: false
  },
  create_flow_dynamic: {
    type: 'orchestrated',
    riskLevel: RISK_LEVELS.HIGH,
    requiresConfirmation: true,
    requiresReview: false
  },
  // ...
}
```

**Key Exports:**
- `getExecutionPolicy(action, payload)` - Returns policy for an action
- `shouldEscalateAction(action, payload)` - Hook for context-aware escalation
- `RISK_LEVELS` - LOW, MEDIUM, HIGH constants

---

### 2. Orchestration Logger (`orchestrationLogger.js`)

Captures every orchestrated action attempt with full lifecycle tracking.

**Event Schema:**
```javascript
{
  actionId: string,
  actionType: string,
  source: string,
  timestamp: number,
  riskLevel: string,
  requiresConfirmation: boolean,
  status: 'requested' | 'confirmed' | 'canceled' | 'executed' | 'failed',
  outcome: 'success' | 'user_canceled' | 'validation_failed' | 'execution_failed',
  payloadSummary: object,
  error: string | null
}
```

**Status Flow:**
```
requested → confirmed → executed
         → canceled
         → failed (validation_failed | execution_failed)
```

**Key Exports:**
- `logRequested()`, `logConfirmed()`, `logCanceled()`, `logExecuted()`, `logFailed()`
- `getOrchestrationHistory()` - Get last 100 events
- `getOrchestrationStats()` - Get summary stats
- `clearOrchestrationHistory()` - Clear logs

---

### 3. Payload Validation (`payloadValidation.js`)

Validates and normalizes payloads before execution.

**Validation Rules:**
| Action | Required |
|--------|----------|
| create_flow_dynamic | intent OR templateId |
| assign_agent | context OR target |
| trigger_automation | automationId OR triggerContext |
| create_execution_plan | planType OR steps |

**Safety:**
- Checks for dangerous object prototype patterns
- Sanitizes payload before execution
- Blocks unsafe payloads at dispatcher level

**Key Exports:**
- `validateOrchestrationPayload(action, payload)` - Returns { valid, errors }
- `normalizeOrchestrationPayload(action, payload)` - Returns cleaned payload
- `isPayloadSafe(payload)`, `sanitizePayload(payload)`

---

### 4. Updated Dispatcher (`dispatcher.js`)

Phase 2 dispatcher now:

1. **Validates payload safety** before processing
2. **Retrieves execution policy** for the action
3. **Checks for escalation override** via `shouldEscalateAction()`
4. **Logs 'requested' state** before routing to orchestrator
5. **Routes actions** appropriately

**Flow:**
```
dispatchAction(action, payload)
  → validate payload safety
  → getExecutionPolicy()
  → shouldEscalateAction()?
  → IF direct + no escalation → executeDirect()
  → ELSE → logRequested() → routeToOrchestrator()
```

---

### 5. Updated Orchestrator (`Orchestrator.jsx`)

Enhanced modal now:

1. **Displays risk level badge** (LOW/MEDIUM/HIGH with color coding)
2. **Validates payload** on confirm click
3. **Logs lifecycle events** (confirmed/canceled/executed/failed)
4. **Shows validation errors** inline
5. **Provides visual feedback** (loading, confirmed states)

**Risk Badge Colors:**
- LOW: Emerald (bg-emerald-500/20)
- MEDIUM: Amber (bg-amber-500/20)
- HIGH: Red (bg-red-500/20)

---

### 6. Updated OrchestrationProvider (`OrchestrationProvider.jsx`)

Context now exposes:
- `openOrchestrator`, `closeOrchestrator`
- `getOrchestrationHistory()`
- `getOrchestrationStats()`

---

## File Structure

```
frontend/src/orchestration/
├── dispatcher.js              # Core dispatcher with policy/validation
├── executionPolicy.js         # Policy definitions and hooks
├── orchestrationLogger.js    # Event logging service
├── Orchestrator.jsx          # Confirmation modal with risk display
├── OrchestrationProvider.jsx # Context provider
├── payloadValidation.js      # Payload validation and normalization
└── index.js                  # Module exports
```

---

## Action Policies

| Action | Type | Risk | Confirmation |
|--------|------|------|-------------|
| open_module | direct | low | no |
| navigate | direct | low | no |
| open_support | direct | low | no |
| show_detail | direct | low | no |
| open_ticket | direct | low | no |
| create_flow | orchestrated | medium | yes |
| create_flow_dynamic | orchestrated | high | yes |
| assign_agent | orchestrated | medium | yes |
| trigger_automation | orchestrated | high | yes |
| create_execution_plan | orchestrated | medium | yes |

---

## Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     dispatchAction()                          │
│  1. Validate payload safety                                 │
│  2. Get execution policy                                    │
│  3. Check escalation hook                                   │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────────────┐
    │ Direct Action   │             │ Orchestrated Action      │
    │ (low risk)     │             │ (medium/high risk)       │
    └─────────────────┘             └─────────────────────────┘
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────────────┐
    │ executeDirect() │             │ logRequested()          │
    │ (immediate)    │             │ → Open Orchestrator Modal│
    └─────────────────┘             └─────────────────────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              ▼                 ▼                 ▼
                    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
                    │   Cancel     │   │   Confirm    │   │  Validation  │
                    │              │   │              │   │    Failed    │
                    └──────────────┘   └──────────────┘   └──────────────┘
                              │                 │                 │
                              ▼                 ▼                 ▼
                    logCanceled()      validatePayload()    logFailed()
                                    → IF valid:         (validation_failed)
                                      logConfirmed()
                                      → executeDirect()
                                      → logExecuted()
                                    → IF invalid:
                                      logFailed()
                                      (validation_failed)
```

---

## Console Logging

Events are logged to console with structured data:

```
[OrchestrationLog] REQUESTED: { actionId: "...", actionType: "create_flow_dynamic", source: "signals" }
[OrchestrationLog] CONFIRMED: { actionId: "...", actionType: "create_flow_dynamic", source: "signals" }
[OrchestrationLog] EXECUTED: { actionId: "...", actionType: "create_flow_dynamic", source: "signals" }
```

---

## Usage Examples

### Dispatch an action:
```javascript
import { dispatchAction } from '../orchestration';

dispatchAction(
  { type: 'create_flow_dynamic', payload: { intent: 'follow up stalled deals' } },
  { source: 'signals' }
);
```

### Get orchestration history:
```javascript
import { useOrchestration } from '../orchestration';

const { getOrchestrationHistory, getOrchestrationStats } = useOrchestration();
const history = getOrchestrationHistory();
const stats = getOrchestrationStats();
```

### Validate a payload:
```javascript
import { validateOrchestrationPayload } from '../orchestration';

const result = validateOrchestrationPayload(
  { type: 'create_flow_dynamic' },
  { intent: 'follow up stalled deals' }
);
// result: { valid: true, errors: [] }
```

---

## Key Design Decisions

1. **'requested' log in dispatcher**: All orchestrated actions are logged at the dispatcher level before routing, ensuring no attempt is missed regardless of downstream behavior.

2. **In-memory logging**: Events stored in a local array (max 100) for now. Can be extended to API calls or IndexedDB later.

3. **Fail-safe validation**: Invalid payloads are rejected with clear errors. No silent continuation.

4. **Risk badges**: Visual indicators help users understand action impact before confirming.

5. **Payload sanitization**: Prevents prototype pollution and other injection vectors.

---

## Non-Goals (Phase 2)

- No UI redesign (minimal modal enhancements only)
- No audit dashboard
- No analytics system
- No full rules engine
- Signals not modified (already compliant)
