# Implementation Plan: Cortex Report Generator Audit + Fix

## Overview
Audit the Cortex report generator end-to-end, verify functionality, identify failures, and implement surgical fixes. Focus only on the Cortex report generator flow.

---

## Discovery Phase

### Step 1: Locate Full Report Path
Find all files involved in Cortex report generation:
- `modules/Brain/index.jsx` - main Cortex module
- Any report-specific components or services
- Data aggregation layer
- Model/service call paths
- Report display components

**Action:** Read Brain module and all related files to map the execution path.

### Step 2: Identify Components
Map:
- Report trigger buttons/forms
- Report builder/generator logic
- Data source mapping
- Model/service invocation
- Response normalization
- Report display component

---

## Audit Phase

### Step 3: Verify Trigger Flow
Check:
- Buttons/forms that trigger report generation
- Action handlers and callbacks
- Missing imports
- Dead callbacks
- Stale references
- Props/context wiring

### Step 4: Verify Data Input Path
Check:
- State management for report data
- Object shapes and selectors
- Async timing issues
- Empty arrays vs undefined state
- Missing context/provider values

### Step 5: Verify Generation Logic
Check:
- Prompt assembly
- Request payload shape
- Model/service invocation
- Expected response format
- Parsing assumptions
- Fallback behavior
- Silent failures
- Swallowed exceptions

### Step 6: Verify Render Path
Check:
- State updates after generation
- Report display component wiring
- Loading state exit conditions
- Error state visibility
- Empty output edge cases

### Step 7: Verify Persistence (if present)
Check:
- Report save functionality
- Report reload functionality
- Stale reports masking failures

---

## Implementation Phase

### A. Add Traceable Instrumentation
Add console logging across the report flow:
```
[ReportGen] Request started
[ReportGen] Input payload: {...}
[ReportGen] Calling generation service
[ReportGen] Response received
[ReportGen] Parsing output: success/failure
[ReportGen] Rendering report: success/failure
[ReportGen] Final status: {status}
```

### B. Fix Trigger Flow
- Restore dead callbacks
- Add missing imports
- Wire props correctly
- Remove stale references

### C. Fix Data Input Validation
- Validate required inputs before generation
- Block execution with clear message if data missing
- Normalize data shapes

### D. Fix Generation Logic
- Fix prompt assembly
- Fix request payload
- Fix service call
- Add error handling
- Fail visibly not silently

### E. Fix Render Path
- Fix state updates after generation
- Fix loading/error/empty states
- Ensure error visibility

---

## Files to Modify

| File | Changes |
|------|---------|
| `modules/Brain/index.jsx` | Audit + fix trigger, handlers, render |
| `services/backendApi.js` | Check/add report API functions if needed |
| Report components (if separate) | Fix display/logic |

---

## Testing Path (Post-Fix)

1. Navigate to Cortex module
2. Click report generation trigger
3. Observe instrumentation in console
4. Verify loading state appears
5. Verify report renders OR error state shows
6. Verify no silent failures

---

## Deliverables

1. **Audit Summary** (`audit_cortex_reports.md`)
   - What worked before
   - What was broken
   - What was fixed
   - Remaining items

2. **Code Fixes**
   - Only files needed for working report generation

3. **Verification Path**
   - Clear test instructions

---

## Acceptance Criteria

- [ ] All 13 prompts replaced with upgraded versions
- [ ] generateReport replaced with AI-backed generation
- [ ] AI call executes successfully
- [ ] Output renders in Cortex
- [ ] Fallback works if AI fails
- [ ] No fake delays remain
- [ ] Logs clearly show execution path
- [ ] Reports are structured and actionable
- [ ] System uses real data + real AI

---

## Part 1: Replace Prompts (frontend/src/modules/Brain/reports.js)

Replace ALL existing prompts with production-grade prompts (13 total).

---

## Part 2: AI Generation Wiring

### Step 1: Update backendApi.js
Create `generateReportApi(payload)` function to call AI model.

### Step 2: Update Brain/index.jsx
Replace `generateReport()` with `generateAiReport()`:
- Build AI request payload (prompt + analytics + context)
- Call `generateReportApi()`
- Handle success → setOutput()
- Handle failure → fallback to template
- Remove fake 1500ms delay
- Add `[CortexReport]` logging

### Step 3: Add Validation
- Ensure analytics exists
- Ensure prompt exists
- Block execution with error if invalid

---

## Files to Modify

| File | Changes |
|------|---------|
| `modules/Brain/reports.js` | Replace all 13 prompts |
| `services/backendApi.js` | Add generateReportApi() |
| `modules/Brain/index.jsx` | Wire AI generation, add logging, remove fake delay |

---

## Testing Path (Post-Fix)

1. Navigate to Cortex module
2. Click any report trigger
3. Observe `[CortexReport]` logs in console
4. Verify loading state appears
5. Verify report renders OR error state shows
6. Verify no silent failures
7. Run same report again - should work

---

## Non-Goals

- No Cortex visual redesign
- No module renaming
- No orchestration changes
- No speculative features
- No fake data to mask real issues

---

## Audit Execution Order

### 1. Trace the actual live path
Before editing code, identify the exact runtime path from:
UI trigger → handler → data assembly → generation call → response parse → state update → render

### 2. Run one real trigger immediately
Before broad refactoring, execute one real Cortex report generation attempt with known minimal valid input and observe the full failure point.

First live run must answer:
- does the trigger fire
- does the handler run
- does the generator receive input
- does the service call happen
- does a response come back
- does rendering fail after success

### 3. Fix the first confirmed break
Do not shotgun-refactor. Fix the first real break in the path, rerun, continue until path works.

### 4. Only then harden edge cases
After main path works, fix:
- empty input
- malformed response
- service failure
- empty report body
- repeat generation behavior
- stale cached result behavior

---

## Required Truth Checks

### Trigger Truth
- Is the report trigger actually wired to a live handler?
- Is the handler reachable from the current Cortex UI?

### Data Truth
- Is the generator using real data, mock data, placeholder state, or stale cached data?
- Are required inputs actually available at execution time?

### Service Truth
- Is there a real generation call path?
- Is the request payload shape correct?
- Is the response shape what the UI expects?

### Render Truth
- Does success actually produce visible report content?
- Does failure actually produce visible error state?
- Can loading get stuck indefinitely?

### Persistence Truth
- Are previous reports masking current failures?
- Is the user seeing cached output instead of a fresh generation result?

---

## Required Instrumentation Detail

Use consistent prefix: `[CortexReport]`

Log every step:
- trigger fired
- handler entered
- input validation result
- payload summary
- generation service invoked
- response received
- response normalized
- state updated
- render completed
- final success/failure state

---

## Minimal Valid Test

Define one minimal valid report test case:
- uses real available system data
- small enough to isolate failures quickly
- not dependent on optional features
- rerunnable

Do not attempt broad multi-report support before one minimal valid report works end to end.

---

## Success Definition

A report generation run counts as successful only if:
- triggered from the intended UI path
- built from real data
- completed through the real generation path
- returned non-empty normalized output
- rendered visibly in Cortex
- left UI in correct final state
- could be repeated without breaking

Anything less is partial progress, not success.

---

## Failure Handling Rule

No silent failures allowed.

If generation fails:
- exit loading state
- surface visible error state
- log the failure point
- preserve context to debug

Do not leave user with:
- infinite spinner
- blank result with no explanation
- stale success state
- placeholder report masquerading as real output

---

## Required Deliverable Additions

### Before Fix
- what happened when first real report run was attempted
- exact first failure point
- whether flow was real, partial, or mostly placeholder

### Fixes Applied
- exact files changed
- exact broken paths repaired
- any assumptions removed
- any normalization/error handling added

### After Fix
- exact verified trigger path
- exact verified report path
- proof report can be run again successfully
- anything still unverified
