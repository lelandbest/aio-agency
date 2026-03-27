# Feature Test List — March 25, 2026 Session

Run all unconfirmed tests in one session. Mark PASS/FAIL as completed.

---

## Pre-Flight Check
- [ ] Backend running: `cd D:\AIOCRM && PYTHONPATH=. python backend/server.py`
- [ ] Frontend running: `cd D:\AIOCRM/frontend && npm run dev`
- [ ] Browser open: http://localhost:5175
- [ ] Logged in with valid session
- [ ] Ollama configured with `http://192.168.4.28:11434`

---

## SECTION 1: AI Provider Resolution

### 1.1 Ollama Provider URL Resolution
**Test**: Settings → Integrations → Ollama
**Verify**: Base URL shows `http://192.168.4.28:11434` (not localhost)
- [ ] PASS
- [ ] FAIL

### 1.2 Default Provider Detection
**Test**: Settings → Integrations → Verify "Default" badge on Ollama
**Verify**: Ollama marked as active default
- [ ] PASS
- [ ] FAIL

### 1.3 Multi-Provider Support
**Test**: Settings → Integrations → Verify both Ollama and OpenAI exist
**Verify**: Two providers configured
- [ ] PASS
- [ ] FAIL

---

## SECTION 2: Ollama Connectivity

### 2.1 Ollama Model Discovery
**Test**: Settings → Ollama → Click "Refresh Models" or model dropdown
**Verify**: Models load from `http://192.168.4.28:11434`
**Backend logs**: `[OllamaConfig] Using configured base_url: http://192.168.4.28:11434`
- [ ] PASS
- [ ] FAIL

### 2.2 No Localhost Fallback
**Test**: Check browser Network tab during model fetch
**Verify**: No requests to `localhost:11434`
- [ ] PASS
- [ ] FAIL

---

## SECTION 3: Cortex AI Report Generation

### 3.1 Report Runs Without Error
**Test**: Cortex → Click any report type
**Verify**: Report generates without error
- [ ] PASS
- [ ] FAIL

### 3.2 Analytics Summary Returns Data
**Test**: Browser console during report
**Verify**: `[CortexReport] ANALYTICS` shows `total_contacts: 14`
- [ ] PASS
- [ ] FAIL

### 3.3 AI Generation (Not Fallback)
**Test**: Browser console during report
**Verify**: `[CortexReport] RESPONSE {success: true}` (not FALLBACK_USED)
- [ ] PASS
- [ ] FAIL

### 3.4 Backend Logs Show Provider
**Test**: Backend terminal during report
**Verify**:
```
[CortexReportAPI] PROVIDER True
[CortexReportAPI] CALL_AI
[AIProviderResolve] TYPE: ollama
```
- [ ] PASS
- [ ] FAIL

### 3.5 Report Renders in UI
**Test**: View Cortex output panel
**Verify**: Non-template report content displayed
- [ ] PASS
- [ ] FAIL

---

## SECTION 4: LLM Guardrails

### 4.1 Guardrails Fields Visible
**Test**: Settings → Ollama → Scroll to "LLM Guardrails" section
**Verify**: Two textarea fields visible: "System Guardrails" and "Task Guardrails"
- [ ] PASS
- [ ] FAIL

### 4.2 Save Guardrails
**Test**: Settings → Ollama → Enter test guardrails
```
System Guardrails: Always respond in exactly 3 short sections.
Task Guardrails: End with one single actionable recommendation.
```
**Click Save**
**Verify**: No error, save succeeds
- [ ] PASS
- [ ] FAIL

### 4.3 Guardrail Persistence
**Test**: Reload page → Return to Ollama settings
**Verify**: Both guardrails fields still contain entered values
- [ ] PASS
- [ ] FAIL

### 4.4 Guardrails Applied to Report
**Test**: Settings → Save guardrails → Run Cortex report
**Verify**: Output follows 3-section structure and ends with recommendation
**Backend logs**: `[AIProviderResolve] Guardrails - system: set, task: set`
- [ ] PASS
- [ ] FAIL

---

## SECTION 5: Provider Switching

### 5.1 Switch to OpenAI
**Test**: Settings → OpenAI → Set as Default
**Verify**: OpenAI now shows "Default" badge
- [ ] PASS
- [ ] FAIL

### 5.2 OpenAI Uses Different Config
**Test**: Run Cortex report with OpenAI default
**Verify**: Report generates successfully
- [ ] PASS
- [ ] FAIL

### 5.3 Switch Back to Ollama
**Test**: Settings → Ollama → Set as Default
**Verify**: Ollama now shows "Default" badge
- [ ] PASS
- [ ] FAIL

### 5.4 Switching Provider Works Without Reload
**Test**: Toggle between Ollama and OpenAI
**Verify**: Each generates reports without page refresh
- [ ] PASS
- [ ] FAIL

---

## SECTION 6: Brain / Report Persistence

### 6.1 "Commit Signal" Renamed
**Test**: Cortex → View button text
**Verify**: Button now says "Commit Report" (not "Commit Signal")
- [ ] PASS
- [ ] FAIL

### 6.2 Report Saves to Brain
**Test**: Run report → Click "Commit Report"
**Verify**: No error, success feedback
- [ ] PASS
- [ ] FAIL

### 6.3 Title Uses "title" Not "label"
**Test**: Click "Commit Report" → Check KnowledgeBase / Brain items
**Verify**: New item appears with correct title (not empty/missing)
- [ ] PASS
- [ ] FAIL

### 6.4 Item Visible in Brain Profile
**Test**: Brain module → Knowledge Base or Vault
**Verify**: Committed report appears in list
- [ ] PASS
- [ ] FAIL

### 6.5 Stat Cards Update
**Test**: Brain module → Check stat cards
**Verify**: Knowledge count increments after commit
- [ ] PASS
- [ ] FAIL

---

## SECTION 7: Branding Integration

### 7.1 Brand Config in Reports
**Test**: Commit a report → Check saved item metadata
**Verify**: `reportMeta` or similar contains brand information
- [ ] PASS
- [ ] FAIL

### 7.2 Brand Snapshot on Report
**Test**: Run and commit a report
**Verify**: Report includes brand name/colors if configured
- [ ] PASS
- [ ] FAIL

---

## SECTION 8: Orchestration

### 8.1 Signals Module Uses Dispatcher
**Test**: Signals module → Click any action
**Verify**: Orchestrator confirmation modal appears for high-risk actions
- [ ] PASS
- [ ] FAIL

### 8.2 Help Module Uses Dispatcher
**Test**: Help module → Submit a help request
**Verify**: Dispatcher flow works correctly
- [ ] PASS
- [ ] FAIL

### 8.3 Execution Logging
**Test**: Perform action → Check orchestration logs
**Verify**: Events logged with states (requested/confirmed/executed)
- [ ] PASS
- [ ] FAIL

---

## Summary

| Section | Tests | Passed | Failed |
|---------|-------|--------|--------|
| 1. Provider Resolution | 3 | __ | __ |
| 2. Ollama Connectivity | 2 | __ | __ |
| 3. Cortex AI Generation | 5 | __ | __ |
| 4. Guardrails | 4 | __ | __ |
| 5. Provider Switching | 4 | __ | __ |
| 6. Brain Persistence | 5 | __ | __ |
| 7. Branding | 2 | __ | __ |
| 8. Orchestration | 3 | __ | __ |
| **TOTAL** | **28** | **__** | **__** |

---

## Notes

_Copy failed test details here during testing:_

```
FAILED: [Test #]
Error: ...
Console Log: ...
Root Cause: ...
```

---

## Test Session Complete

**Date**: March 25, 2026  
**Tester**: _____________________  
**Total Time**: _______ minutes
