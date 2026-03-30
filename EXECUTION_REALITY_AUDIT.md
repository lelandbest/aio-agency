# EXECUTION REALITY AUDIT

## 1. CONFIRMED COMPLETE

| Item | Evidence |
|------|----------|
| Brain → Agents linking | `inject_brain_context()` called in `ai_command` (line 2868), `ai_draft` (line 2977), `operator_assist` (line 3294); `query_vault` tool registered in `AGENT_DEFINITIONS` (lines 207-421); `agent_runtime.py:186` injects `brain_memory` into agent context |
| Brain → Flows linking | `orchestration.py:736` registers `query_vault`; `orchestration.py:1398-1400` executes query_vault in flow context; `server.py:4452` injects brain context into flow execution |
| Booking → Flow trigger wiring | `emit_booking_lifecycle_event()` at `server.py:1099`; `orchestration.py:2189,2208,2320,2341,2363` handle booking events; `match_flow_trigger_event()` at `orchestration.py:287` resolves triggers |
| Help/Archive backend | `/api/help/tickets` (lines 2635-2711); `/api/help/broadcasts` (lines 2715-2721); `help_tickets` table in DB; `archive_workspace()` in `auth_store.py:2027` |
| Website exists | `D:\AIOCRM\website\index.html` - 1024 lines marketing site |
| Voice (TTS/STT) | ElevenLabs integration present: `generate_voice`, `text_to_speech`, `transcribe_media` action types in flows (lines 991,1001); Media module with audio render jobs (`/api/media/audio-render-jobs`); Node library includes voice nodes |

---

## 2. CONFIRMED PARTIAL

| Item | What Exists | What's Missing |
|------|-------------|----------------|
| Signals → execution authority | Frontend UI at `Signals/index.jsx` with `SignalContext`; displays pipeline/comms/system signals; maps data to signals | **No execution authority** - signals are display-only; no backend routing to launch agents/flows/actions |
| Brain → Signals linking | N/A - signals are display-only | Brain context never reaches signals (signals don't execute) |

---

## 3. CONFIRMED ABSENT

| Item | Evidence |
|------|----------|
| Brain → Signals | Signals are pure frontend display, no execution context |

---

## 4. FALSE ASSUMPTIONS CORRECTED

| Assumption | Reality |
|------------|---------|
| "Brain/Cortex linking is incomplete" | **COMPLETE** - brain context is injected into agents, flows, and operator assist |
| "Booking → Flow wiring is missing" | **COMPLETE** - booking lifecycle events emit and reach orchestration via `emit_booking_lifecycle_event()` |
| "Voice layer is absent" | **PRESENT** - ElevenLabs TTS/STTS integration exists in flow nodes and media module |

---

## 5. API SURFACE TRUTH

| Route | Purpose | Callers | Persistence | Status |
|-------|---------|---------|-------------|--------|
| `/api/assist` | Grounded operator assist with Brain context | Frontend "Operator" button | Thread messages | **CANONICAL** for operator assist |
| `/api/ai/draft` | Generic AI drafting, content generation | Frontend form completion, content generation | N/A | **CANONICAL** for AI drafting |
| `/api/ai/assist` | Legacy route | Legacy callers (marked) | N/A | **LEGACY** - routes to same logic as `/api/ai/draft` |
| `/api/ai/command` | Direct command execution with agent routing | Frontend command input | Runs/artifacts | **ACTIVE** - separate from assist |

**Real Risk**: Low - routes have distinct purposes; `/api/ai/assist` explicitly marked legacy.

---

## 6. BOOKING → FLOW CHAIN

**Complete chain:**

```
booking event (create/update/cancel)
  ↓
server.py:4714,4735,4756,5408 - emit_booking_lifecycle_event()
  ↓
orchestration.py:2189,2208,2320,2341,2363 - emit_system_event()
  ↓
orchestration.py:312 - emit_system_event() resolves flow triggers
  ↓
orchestration.py:287 - match_flow_trigger_event() checks trigger keys
  ↓
run created with intent="flow_trigger"
```

**Break point**: NONE - chain is complete.

---

## 7. SIGNALS AUTHORITY STATUS

- **Current level**: Display-only (no execution authority)
- **Evidence**: 
  - `SignalContext.jsx` - pure React state management
  - `Signals/index.jsx` - maps data to display signals only
  - No backend endpoints for signal-based execution
  - No routing from signals to agents/flows

---

## 8. HELP / ARCHIVE STATUS

| Feature | Status | Evidence |
|---------|--------|----------|
| Help Tickets | **Active** | `/api/help/tickets` POST/GET/PATCH; backend DB table `help_tickets`; `provider.create_help_ticket()` |
| Help Broadcasts | **Active** | `/api/help/broadcasts`; `provider.create_broadcast_message()` |
| Workspace Archive | **Active** | `archive_workspace()` in auth_store; sets `archivedAt` on tenant |
| Help Articles | **Active** | `/api/help/articles` at line 5046 |

---

## 9. WEBSITE STATUS

- **Status**: Outdated/Mixed
- **Evidence**: 
  - `website/index.html` exists with marketing copy
  - Mentions "Cortex", "Neural Operations", "AI-Powered Intelligence"
  - Claims "100+ AI Models", "20+ Integrations" 
  - **BUT**: No mention of 13-agent system specifically; mentions generic AI capabilities
  - Site appears static (not dynamically generated from platform capabilities)

---

## 10. VOICE STATUS

| Component | Status | Evidence |
|-----------|--------|----------|
| TTS (Generate Voice) | **PRESENT** | Flow node `generate_voice`; `elevenlabs_tts` provider; Media module audio render jobs |
| STT (Transcribe) | **PRESENT** | Flow node `transcribe_media`; `elevenlabs_scribe` provider; `/api/media/transcribe` |
| Voice Response in Agents | **PARTIAL** | Voice field in agent definitions but not fully wired |
| Live Voice Input | **ABSENT** | No real-time voice capture endpoint; no WebRTC voice handler |

---

## 11. CAMELCASE ENFORCEMENT STATUS

- **Confirmed details**:
  - Request validator exists: `backend/request_validators.py`
  - Middleware active: `server.py:2326-2350` - rejects snake_case on protected routes
  - Response middleware active: `server.py:2353-2371` - converts all responses to camelCase
  - Coverage: `/api/ai/command`, `/api/ai/draft`, `/api/assist`, `/api/flow`, `/api/node`, `/api/agent`, `/api/integration`, `/api/provider`
- **Caveat**: Response middleware converts **all** API responses - may impact non-protected routes (but this is actually correct behavior for camelCase-only contract)
- **No alias support added**: Confirmed - rejects with 400 error, no fallback

---

## 12. REAL BACKLOG ONLY

Only items **still genuinely not done**:

1. **Signals → Execution authority**: Signals display-only, no ability to trigger agents/flows/actions based on signal conditions
2. **Live Voice Input (VTT)**: No real-time voice transcription from mic; only file-based transcription exists
3. **Website Dynamic Content**: Website is static HTML, not reflecting actual platform state/capabilities in real-time
