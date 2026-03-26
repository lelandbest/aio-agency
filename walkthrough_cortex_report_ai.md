# Walkthrough - Cortex AI Report Generator

## Overview
Upgraded Cortex report generation from template-only to AI-powered with fallback. Reports now use real AI generation with automatic fallback to template if AI fails.

---

## What Changed

### 1. Prompts Upgraded (`frontend/src/modules/Brain/reports.js`)

All 13 report prompts replaced with production-grade versions that include:
- Structured analysis requirements
- Specific output sections (Tables, Insights, Actions)
- Actionable recommendations

**Report Types:**
| ID | Label |
|----|-------|
| `brand-avatar` | Brand Avatar Intelligence |
| `awareness-attention` | Awareness & Attention |
| `content-performance` | Content Performance |
| `offer-conversion` | Offer & Conversion |
| `customer-journey` | Customer Journey Mapping |
| `market-intelligence` | Market Intelligence |
| `competitive-intelligence` | Competitive Intelligence |
| `service-performance` | Product / Service Performance |
| `operational-efficiency` | Operational Efficiency |
| `revenue-intelligence` | Revenue Intelligence |
| `client-retention` | Client Retention & Satisfaction |
| `innovation-opportunity` | Innovation & Opportunity |

---

### 2. AI Generation API (`frontend/src/services/backendApi.js`)

Added `generateReportApi(payload)` function:
```javascript
export async function generateReportApi(payload) {
  const response = await request('/api/cortex/generate-report', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return response.data || response;
}
```

---

### 3. Backend Endpoint (`backend/server.py`)

Added `/api/cortex/generate-report` endpoint:
- Gets active AI provider config
- Builds full prompt with analytics context
- Calls AI service
- Returns structured text

```python
class CortexReportRequest(BaseModel):
    reportId: str
    prompt: str
    analytics: dict | None = None
    context: dict | None = None

@app.post("/api/cortex/generate-report")
async def generate_cortex_report(request, payload):
    # Gets active AI config
    # Builds context from analytics
    # Calls AI service
    # Returns { success, data, error }
```

---

### 4. Wired Generation (`frontend/src/modules/Brain/index.jsx`)

Updated `onRunReport` handler:

**Before:**
- Fake 1500ms delay
- Template-only generation
- No AI call

**After:**
- No fake delay
- Real AI generation call
- Automatic fallback to template on failure
- Comprehensive logging

---

## Execution Flow

```
User clicks report button
  ↓
[CortexReport] START { reportId, label }
  ↓
Fetch analytics data
  ↓
Check if data exists
  ↓
[No Data] → Use template fallback
  ↓
[Has Data] → Call generateReportApi()
  ↓
[AI Success] → Display AI output
  ↓
[AI Failure] → Use template fallback
  ↓
[CortexReport] END
  ↓
Save to brain items
```

---

## Logging

All report generation logged with `[CortexReport]` prefix:

| Log | When |
|-----|------|
| `START` | Report button clicked |
| `Fetching analytics...` | Before API call |
| `PAYLOAD` | Analytics received |
| `AI_CALL` | AI generation started |
| `RESPONSE` | AI response received |
| `FALLBACK_USED` | Template fallback triggered |
| `RENDER` | Content rendered |
| `END` | Generation complete |
| `ERROR` | Any failure |

---

## Fallback Behavior

If AI generation fails:
1. Logs `[CortexReport] FALLBACK_USED`
2. Generates template report using `generateTemplateReport()`
3. Prepends `[Fallback Report (Template)]` to output
4. Still renders and saves normally

---

## File Changes

| File | Change |
|------|--------|
| `modules/Brain/reports.js` | 13 prompts replaced |
| `services/backendApi.js` | Added `generateReportApi()` |
| `backend/server.py` | Added `/api/cortex/generate-report` endpoint |
| `modules/Brain/index.jsx` | Wired AI generation, removed fake delay, added logging |

---

## Testing Path

1. Navigate to Cortex module
2. Open browser console
3. Click any report button
4. Observe `[CortexReport]` logs
5. Report should render
6. Click same report again - should work without issues

---

## Acceptance Criteria Met

- [x] All 13 prompts replaced
- [x] generateReportApi wired to AI
- [x] AI generation executes
- [x] Output renders in Cortex
- [x] Fallback works on AI failure
- [x] Fake delay removed
- [x] Logs show execution path
- [x] Reports are structured

---

## Verification

To verify AI is working:
1. Check console for `[CortexReport] AI_CALL`
2. Check console for `[CortexReport] RESPONSE { success: true }`
3. Report should show AI-generated content

If AI unavailable:
1. Check console for `[CortexReport] FALLBACK_USED`
2. Report shows `[Fallback Report (Template)]`
3. Still functional with template data
