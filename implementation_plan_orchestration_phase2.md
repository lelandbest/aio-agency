# Implementation Plan: Orchestration Layer Phase 2

## Overview
Enhance the existing orchestration layer with logging, risk metadata, validation, escalation hooks, and policy structure. Build on current implementation without redesign.

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `orchestration/executionPolicy.js` | Execution policy definitions and hooks |
| `orchestration/orchestrationLogger.js` | Event logging service |
| `orchestration/payloadValidation.js` | Payload validation and normalization |
| `walkthrough_orchestration_phase2.md` | Documentation (post-approval) |

### Modified Files
| File | Changes |
|------|---------|
| `orchestration/dispatcher.js` | Add policy hooks, validation integration, escalation logic |
| `orchestration/Orchestrator.jsx` | Add logging, validation, risk display |
| `orchestration/OrchestrationProvider.jsx` | Minimal (pass-through) |
| `orchestration/index.js` | Export new utilities |
| `modules/Signals/index.jsx` | Audit and harden payload behavior |

---

## Implementation Steps

### Step 1: Execution Policy Layer (`executionPolicy.js`)
- Define `ACTION_POLICIES` map with riskLevel, requiresConfirmation, requiresReview per action type
- Create `getExecutionPolicy(action, payload)` helper
- Create `shouldEscalateAction(action, payload)` hook
- Set defaults: direct=low risk/no confirmation, orchestrated=medium-high risk/confirmation required

### Step 2: Payload Validation (`payloadValidation.js`)
- Create `validateOrchestrationPayload(action, payload)` 
- Create `normalizeOrchestrationPayload(action, payload)`
- Define validation rules per action type:
  - `create_flow_dynamic`: require intent or templateId
  - `assign_agent`: require context or target
  - `trigger_automation`: require automationId or trigger context
- Return { valid: boolean, errors: string[], normalized: object }

### Step 3: Orchestration Logger (`orchestrationLogger.js`)
- Create `logOrchestrationEvent(eventData)` function
- Event schema: { actionId, actionType, source, timestamp, riskLevel, requiresConfirmation, status, outcome, payloadSummary }
- Status: requested → confirmed/canceled → executed/failed
- Store in local state array (max 100 entries for now)
- Export `getOrchestrationHistory()`, `clearOrchestrationHistory()`

### Step 4: Update Dispatcher (`dispatcher.js`)
- Import policy and validation helpers
- Update `dispatchAction()`:
  1. Validate action metadata
  2. Call `getExecutionPolicy(action, payload)` for policy data
  3. Check `shouldEscalateAction()` for override
  4. Route: direct=immediate, orchestrated/escalated=Orchestrator
- Add `ORCHESTRATION_STATES` and `ORCHESTRATION_OUTCOMES` constants

### Step 5: Update Orchestrator (`Orchestrator.jsx`)
- Import logger
- On mount: log "requested" status
- On confirm: validate payload first, log "confirmed", then execute
- On cancel: log "canceled"
- On execution: log "executed" or "failed"
- Display risk level badge in modal (low=green, medium=amber, high=red)
- Show validation errors in modal if payload invalid

### Step 6: Audit Signals (`modules/Signals/index.jsx`)
- Review all `dispatchAction` calls in Signals
- Ensure payloads are structured references, not execution logic
- Verify no inline flow assembly or automation building in UI layer
- Clean up any remaining references to old patterns

### Step 7: Update OrchestrationProvider (`OrchestrationProvider.jsx`)
- Pass logger history to context if needed for future debug UI

---

## Data Flow

```
dispatchAction(action, payload)
  → validateActionMetadata()
  → getExecutionPolicy() + shouldEscalate()
  → IF direct + not escalated:
      executeDirectAction()
  → IF orchestrated OR escalated:
      logEvent(requested)
      → Orchestrator Modal
        → User Confirm:
            validatePayload()
            → IF valid: execute + log(executed)
            → IF invalid: log(validation_failed) + show error
        → User Cancel:
            logEvent(canceled)
```

---

## Risk Level Mapping

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

## Validation Rules

| Action | Required Fields |
|--------|-----------------|
| create_flow_dynamic | intent OR templateId |
| assign_agent | context OR target |
| trigger_automation | automationId OR triggerContext |
| create_execution_plan | planType OR steps |

---

## Notes/Contingencies

1. **Logging storage**: Initially in-memory array. Fail gracefully if storage unavailable.

2. **Signals audit**: May need to adjust payload structure if current calls embed logic. Will verify during implementation.

3. **UI changes**: Minimal - risk badge in modal only. No redesign.

4. **Future hook**: `shouldEscalateAction` is a pass-through for now. Can be expanded later with payload-based rules.

5. **Help actions**: Already refactored in Phase 1. No changes needed unless new action types added.

---

## Acceptance Criteria
- Every orchestrated action attempt is logged
- Logs capture requested, confirmed/canceled, executed/failed states
- Actions support risk metadata and confirmation metadata
- Orchestrated payloads are validated before execution
- Invalid payloads do not execute
- dispatchAction supports context-aware escalation hooks
- Signals dispatches structured payloads and does not assemble execution logic inline
- direct actions remain instant
- orchestrated actions remain controlled
- no UI redesign or architecture flattening occurs

---

## Estimated Scope
- 3 new helper files (~150-200 lines total)
- Updates to dispatcher (~50 lines)
- Updates to Orchestrator (~60 lines)
- Signals audit (~30 minutes to review/adjust)
