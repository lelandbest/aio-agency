# AIO CRM / AIO FLOW — FULL SITE WIRING AUDIT REPORT

**Date:** March 31, 2026  
**Status:** PARTIAL

---

## EXECUTIVE SUMMARY

Full-site frontend wiring audit completed across 19 modules. CRM wiring bugs fixed. Media, Flows, Orders, and SmsVoip identified as needing backend support or further work.

---

## FILES MODIFIED IN THIS PASS

- `frontend/src/modules/CRM/index.jsx` - Wiring fixes applied

---

## MODULE FINDINGS

### CRM

- **STATUS:** FIXED
- **WIRES VERIFIED GOOD**
  - getContactsApi, createContactApi, updateContactApi (all endpoints wired)
  - getContactActivitiesApi, createContactActivityApi
  - getContactFormSubmissionsApi, getUserAccessApi
  - openThreadForContactApi, verifyEmailApi
  - handleBulkAction (delete, export, sendApi, addTag, removeTag, sendEmail, sendSms)
  - handleSort, handleFilter, handleImportContacts
- **WIRES FIXED IN THIS PASS**
  - handleDeleteContact: Fixed undefined `currentContact` → uses `selectedContact`
  - handleAddTag: Added missing handler for adding tags in detail view
  - handleRemoveTag: Added missing handler for removing tags
  - getActivityTone: Fixed undefined `activityType` → uses `activity.activityType`
  - renderActivityMetadata: Fixed undefined variable references
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - Row delete, bulk delete, detail view delete all wired via updateContactApi({deletedAt})
- **KEY FILES REVIEWED**
  - frontend/src/modules/CRM/index.jsx
  - frontend/src/services/backendApi.js

---

### Media

- **STATUS:** FRAGILE
- **WIRES VERIFIED GOOD**
  - All media job APIs wired (script, render, transcript, audio, publish)
  - ingestMeetingMediaApi
  - Quick actions (8 buttons)
  - AI consult terminal
  - Agent selector
  - Publish modal
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - MISSING delete functionality (no delete API endpoints, no delete buttons)
  - COPY DATA button (line 461) has no onClick handler
  - Master Sys buttons (lines 390-395) have no handlers
- **MISLEADING UI TRUTH**
  - Static status readout shows hardcoded "STATUS: PUBLISHED"
  - "NO SIGNAL // STANDBY" placeholder always shown regardless of actual state
- **DELETE FUNCTIONALITY**
  - MISSING - No delete API, no delete buttons in UI
- **KEY FILES REVIEWED**
  - frontend/src/modules/Media/index.jsx
  - backend/server.py (lines 4636-4821)

---

### Signals

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - getAiRunsApi, getCalendarEventsApi, getCommsSnapshotApi, getContactsApi
  - executeSignalApi properly wired to /api/signals/execute
  - RUN button properly executes agent/flow/command actions
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - NOT NEEDED - Signals computed from live data, no persistence layer
- **KEY FILES REVIEWED**
  - frontend/src/modules/Signals/index.jsx
  - backend/server.py (lines 3131-3163)

---

### Forms

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - getFormsApi, createFormApi, updateFormApi, deleteFormApi
  - getFormBySlugApi, submitFormApi, getFormSubmissionsApi
  - Template gallery, folder operations
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - deleteFormApi, bulkDeleteFormsApi, deleteFormFolderApi all wired
- **KEY FILES REVIEWED**
  - frontend/src/modules/Forms/index.jsx
  - backend/server.py (lines 5280-5367)

---

### Integrations

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - All provider configs (AI, automation, media, payment)
  - OAuth flow via /api/oauth/callback
  - Mailbox, calendar source, email verifier handlers
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - All provider delete handlers wired
- **KEY FILES REVIEWED**
  - frontend/src/modules/Integrations/index.jsx
  - frontend/src/modules/Integrations/pages/ActiveIntegrations.jsx

---

### Flows

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - getFlowsApi, getFlowApi, saveFlowApi, triggerFlowManualApi
  - deleteFlowApi, bulkDeleteFlowsApi
  - Draft system (saveFlowDraftApi, getFlowDraftApi, deleteFlowDraftApi)
  - Save, run, template actions all wired
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - handleCreateFolder: stubbed - only prompts for name, no backend call
  - No folder rename/delete operations in UI
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - Single flow delete, bulk delete both functional
- **KEY FILES REVIEWED**
  - frontend/src/modules/Flows/index.jsx
  - frontend/src/modules/Flows/FlowsHome.jsx
  - frontend/src/modules/Flows/FlowBuilder.jsx

---

### Pipeline

- **STATUS:** MIXED
- **WIRES VERIFIED GOOD**
  - getContactsApi filtered by pipelineStage
  - draftAiApi, updateContactApi, openThreadForContactApi
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - No standalone /api/pipeline/* endpoints - derived from contacts
- **MISLEADING UI TRUTH**
  - Appears to have full CRUD but is filtered view of CRM contacts
- **DELETE FUNCTIONALITY**
  - PRESENT BUT FRAGILE - Delete through contact update (pipelineStage removal)
- **KEY FILES REVIEWED**
  - frontend/src/modules/Pipeline/index.jsx

---

### Orders

- **STATUS:** FRAGILE
- **WIRES VERIFIED GOOD**
  - getOrdersApi (read only)
  - draftAiApi
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - Only READ endpoint exists - no POST/PUT/DELETE for orders
  - Create/Update/Delete buttons non-functional
- **MISLEADING UI TRUTH**
  - UI shows full order management but only list functionality wired
- **DELETE FUNCTIONALITY**
  - MISSING - No /api/orders/{order_id} DELETE endpoint exists
- **KEY FILES REVIEWED**
  - frontend/src/modules/Orders/index.jsx

---

### Brain

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - All brain APIs wired (overview, profile, sources, items, links, ingests)
  - MCP server management
  - Provider configs
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - deleteBrainSourceApi, deleteBrainItemApi, deleteBrainLinkApi all wired
- **KEY FILES REVIEWED**
  - frontend/src/modules/Brain/index.jsx

---

### Comms

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - All thread APIs (create, send, update, delete, assign)
  - Mailbox management, OAuth flow
  - Calendar event push/reconcile
  - AI assist (draft, reply, extract, rewrite)
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - deleteThreadApi wired
- **KEY FILES REVIEWED**
  - frontend/src/modules/Comms/index.jsx

---

### Calendar

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - All calendar/event/booking type APIs
  - OAuth flow for calendar connection
  - Video call service (Zoom/Google Meet)
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - deleteCalendarEventApi, deleteBookingTypeApi wired
- **KEY FILES REVIEWED**
  - frontend/src/modules/Calendar/index.jsx

---

### CannedResponses

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - Client-side only (localStorage)
  - No backend API needed
  - Clipboard API for copy
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None - by design
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - LocalStorage delete via DeleteConfirmModal
- **KEY FILES REVIEWED**
  - frontend/src/modules/CannedResponses/index.jsx

---

### Settings

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - Global variables, canonical settings, system emails
  - Blueprint export/import
  - Workspace/membership management
  - Omega operations
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - deleteGlobalVariableApi, deleteWorkspaceApi wired
- **KEY FILES REVIEWED**
  - frontend/src/modules/Settings/index.jsx

---

### SystemHealth

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - getSystemHealthApi, getOmegaStatusApi
  - Omega arm/cancel/execute APIs
  - Auto-refresh (60s interval)
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - NOT NEEDED - Read-only monitoring module
- **KEY FILES REVIEWED**
  - frontend/src/modules/SystemHealth/index.jsx

---

### Help

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - getHelpTicketsApi, createHelpTicketApi
  - getBroadcastsApi, createBroadcastApi
  - Orchestration dispatch
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - NOT NEEDED - KB/ticket system, content managed via backend
- **KEY FILES REVIEWED**
  - frontend/src/modules/Help/index.jsx

---

### Auth

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - Wrapper module - actual auth in contexts
  - All auth session APIs (login, logout, session management)
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - PRESENT AND WORKING - Session revocation via revokeAuthSessionApi
- **KEY FILES REVIEWED**
  - frontend/src/contexts/AuthContext.js

---

### Design

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - External iframe to https://excalidraw.com
  - No backend API needed
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None - by design (external iframe)
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - NOT NEEDED - External service
- **KEY FILES REVIEWED**
  - frontend/src/modules/Design/index.jsx

---

### SmsVoip

- **STATUS:** FRAGILE
- **WIRES VERIFIED GOOD**
  - No backend API - placeholder module
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - No /api/sms or /api/voip endpoints exist
  - Module intentionally static - "Provider Layer Pending"
- **MISLEADING UI TRUTH**
  - Module shows placeholder but remains visible in navigation
- **DELETE FUNCTIONALITY**
  - NOT NEEDED - Placeholder
- **KEY FILES REVIEWED**
  - frontend/src/modules/SmsVoip/index.jsx

---

### Systems

- **STATUS:** WORKING
- **WIRES VERIFIED GOOD**
  - Local systems launcher (no backend API)
  - Filters and launches external systems
- **WIRES FIXED IN THIS PASS**
  - None
- **WIRES STILL BROKEN**
  - None - by design (launcher)
- **MISLEADING UI TRUTH**
  - None
- **DELETE FUNCTIONALITY**
  - NOT NEEDED - Launcher infrastructure
- **KEY FILES REVIEWED**
  - frontend/src/modules/Systems/index.jsx

---

## SUMMARY TABLE

| Module | Status | Delete Status |
|--------|--------|---------------|
| CRM | FIXED | PRESENT AND WORKING |
| Media | FRAGILE | MISSING |
| Signals | WORKING | NOT NEEDED |
| Forms | WORKING | PRESENT AND WORKING |
| Integrations | WORKING | PRESENT AND WORKING |
| Flows | WORKING | PRESENT AND WORKING |
| Pipeline | MIXED | PRESENT BUT FRAGILE |
| Orders | FRAGILE | MISSING |
| Brain | WORKING | PRESENT AND WORKING |
| Comms | WORKING | PRESENT AND WORKING |
| Calendar | WORKING | PRESENT AND WORKING |
| CannedResponses | WORKING | PRESENT AND WORKING |
| Settings | WORKING | PRESENT AND WORKING |
| SystemHealth | WORKING | NOT NEEDED |
| Help | WORKING | NOT NEEDED |
| Auth | WORKING | PRESENT AND WORKING |
| Design | WORKING | NOT NEEDED |
| SmsVoip | FRAGILE | NOT NEEDED |
| Systems | WORKING | NOT NEEDED |

---

## CROSS-MODULE RISKS

### Frontend-fixable (no backend changes needed)

- Media: Add delete buttons and wire to existing job management
- Media: Wire COPY DATA button to clipboard API
- Media: Wire or remove Master Sys buttons
- Orders: Add delete handler (needs backend endpoint)

### Backend-blocked (needs backend work)

- Media delete: Requires backend DELETE endpoints for media resources
- Flows folder: No folder CRUD API exists
- Orders delete: No backend DELETE endpoint exists

---

## PRIORITIZED REMAINING FIX LIST

### Frontend-only Fixable

1. **Media COPY DATA button** - wire to clipboard API (5 min fix)
2. **Media Master Sys buttons** - wire or remove (5 min fix)
3. **Media delete** - add delete buttons but requires backend API

### Backend-blocked (needs backend work)

1. **Media delete functionality** - add DELETE endpoints to media_engine.py
2. **Flows folder CRUD** - add folder API endpoints to server.py
3. **Orders delete** - add DELETE endpoint to server.py

### Not Needed (Working as Designed)

- Brain, Comms, Calendar, CannedResponses, Settings, Signals, SystemHealth, Help, Auth, Design, Systems

---

## VERIFIED

- No backend changes in this pass
- No redesign drift
- No invented routes/features
- CRM wiring bugs fixed using existing API paths
