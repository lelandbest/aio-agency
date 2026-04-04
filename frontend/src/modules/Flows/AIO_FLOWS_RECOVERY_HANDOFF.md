# AIO Flows Recovery Handoff

Date: 2026-04-04

## Purpose

This document summarizes the Flow Builder recovery work completed after prior failed agent passes. It is intended as a concise handoff before the next prompt/recovery attempt.

## Recovery Scope

The work stayed focused on the Flows module and the specific builder/template/runtime problems surfaced during review. The goal was correction and hardening, not redesign.

## Baseline Problems Identified

- `Run Flow` was not visually reading as the clear green primary action.
- Flow title edit placement had previously been wrong and needed verification against the current dirty worktree state.
- `AI Agents` was expanding by default when compact palette behavior was expected.
- `Browse Templates` did not surface a real library experience.
- Template library previews were incomplete and later proved to have centering problems on some cards.
- Execution visuals had been faked/simulated instead of being tied to live runtime state.
- Edge styling had regressed into solid/competing visuals instead of dashed-first execution lines.
- Some button styling remained inconsistent across the builder.
- The builder lacked a clean in-workspace path to save and start a new flow.
- Plain `Save` behavior was ambiguous for template-derived flows.
- `Save as Template` was only session-local and did not survive a fresh session.
- Add-note behavior was unreliable because notes could land outside the viewport.
- Auto-generated/system-created flows lacked documentation notes.
- System-created layouts were too wide relative to the operator’s intended dense graph style.

## Completed Corrections

### 1. Truthful execution visuals

- Removed the fake frontend-only execution animation path.
- Added real runtime state plumbing from frontend to backend using a client run id.
- Persisted live run state in the backend and polled that live run state from the builder during execution.
- Limited animated edges and processing overlays to actual runtime execution state only.
- Processing node visuals now use rotating solid linework only while a node is truly processing.

Relevant files:

- `backend/server.py`
- `backend/orchestration.py`
- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/components/nodes/CustomNode.jsx`

### 2. Edge treatment restored to dashed-first

- Normalized Flow Builder edges to remain dashed by default.
- Active execution edges animate as dashed using dash offset, not as solid overlays.
- Removed competing solid-edge styling left behind by prior work.
- New edges created through graph mutation now default to dashed and non-animated until runtime activates them.

Relevant files:

- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/utils/flowMutation.js`

### 3. Template library surfacing completed

- Rebuilt the template library into an actual surfaced modal instead of a dead-end browse action.
- Kept both existing template entry points intact.
- Wired the Flow Builder toolbar and Flows home page to the same surfaced template modal.
- Template cards now show name, description, complexity, counts, and truthful flow previews derived from node/edge geometry.

Relevant files:

- `frontend/src/modules/Flows/components/TemplateLibraryModal.jsx`
- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/FlowsHome.jsx`

### 4. Template library preview centering corrected

- First pass improved scaling and centering inside cards.
- Second pass corrected sparse/single-row and single-column templates that still sat off-center in the preview frame.
- Preview layout now uses center-based minimum bounds rather than pinning to the raw upper-left extent.

Relevant file:

- `frontend/src/modules/Flows/components/TemplateLibraryModal.jsx`

### 5. Node library defaults corrected

- `Webhook/API` is now open by default on builder init as requested.
- Compact category behavior remains intact.

Relevant file:

- `frontend/src/modules/Flows/components/NodeLibraryPanel.jsx`

### 6. Ghost starter placement corrected

- New blank flows now start with the ghost trigger placeholder on the left side of the canvas above the bottom control row instead of centered.

Relevant file:

- `frontend/src/modules/Flows/FlowBuilder.jsx`

### 7. Add note + documentation notes fixed

- Manual `Add Note` now places notes near the visible viewport instead of potentially off-screen.
- Note payload, sizing, and z-order were normalized.
- System/AI-generated flows now include lightweight documentation sticky notes below nodes.
- These notes describe step purpose and expected payload/context.
- Auto-layout now preserves/anchors documentation notes below their related nodes.

Relevant files:

- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/components/nodes/NoteNode.jsx`
- `frontend/src/modules/Flows/data/nodeLibrary.js`
- `frontend/src/modules/Flows/utils/documentationNotes.js`
- `frontend/src/modules/Flows/utils/flowGenerationService.js`

### 8. Save behavior and in-builder workflow corrected

- Added `New Flow` in the builder header so a user can start a fresh flow from inside the builder.
- Added `Save As New` in the builder header.
- Added visible notice feedback for save success/failure so save results are no longer terminal-only.
- Plain `Save` is now blocked for template-derived flows.
- Runtime save/activation paths also respect the template-derived flow lock.
- This keeps template-based flows from being mutated in place via the normal save path.

Relevant files:

- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/components/FlowBuilderHeader.jsx`

### 9. Save as Template made durable

- `Save as Template` previously only created a session-local template in builder state.
- Added a shared custom template store backed by browser storage.
- Custom templates now survive refresh/new sessions.
- Flows home and builder template browsing both load those stored custom templates.

Relevant files:

- `frontend/src/modules/Flows/utils/templateLibraryStore.js`
- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/FlowsHome.jsx`

### 10. Brand and right rail polish

- Added a right-rail brand hit between the detail card and minimap.
- The mark now uses the repo-standard trademark handling via the shared `TM` constant.
- The lower toolbar `Save` button now includes the matching icon.
- Lower toolbar wrapping was tightened so it stays in one line longer and scrolls before breaking prematurely.

Relevant files:

- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/utils/text.js` (existing shared TM helper reused)

### 11. Button style consistency

- Header `Save` was restyled to match the `Save As New` button language.
- `AI Generate Flow` was restyled to match that same visual language.
- The lower toolbar `Save` retained its established placement and now includes the icon while preserving the existing design language.

Relevant files:

- `frontend/src/modules/Flows/components/FlowBuilderHeader.jsx`
- `frontend/src/modules/Flows/FlowBuilder.jsx`

### 12. Layout spacing tightened

- Builder auto-layout spacing was reduced to approximately half-scale from the original wider defaults.
- Alpha/system-generated flows were reseeded with tighter spacing.
- In-builder AI-generated flows now pass through the same compact layout path.
- Documentation notes remain anchored correctly under nodes after the tighter layout is applied.
- This was done to match the operator’s stated preference for denser graphs and the observed `PostBot` layout style.

Relevant files:

- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/utils/flowGenerationService.js`
- `frontend/src/modules/Flows/utils/documentationNotes.js`

## Validation Completed

The following validations were run during recovery:

- `python -m py_compile backend/server.py backend/orchestration.py`
- `npm.cmd run build` in `frontend`

Frontend production builds were rerun after the major Flow Builder/template/layout changes and passed.

## Important Behavioral Outcomes

- `Run Flow` is visibly green and remains the clear primary action.
- Builder execution visuals are runtime-truthful.
- Dashed edge language is restored and preserved during active execution.
- Template browsing is surfaced and usable.
- Custom templates are durable across sessions.
- Template-derived flows are protected from plain in-place save.
- The builder now supports `Save As New` and `New Flow` from within the workspace.
- System-built and AI-built flows are denser by default.
- Auto-generated sticky notes now document invisible/system-built flow logic in plain language.

## Current Known State

- This repo has a dirty worktree outside the Flow Builder recovery surface.
- The summary above is limited to the Flows recovery work and adjacent runtime/template plumbing needed to make those fixes truthful.
- Some files in the repository were already modified before or alongside this recovery and were not reverted.

## Primary Files Involved In This Recovery

- `backend/server.py`
- `backend/orchestration.py`
- `frontend/src/modules/Flows/FlowBuilder.jsx`
- `frontend/src/modules/Flows/FlowsHome.jsx`
- `frontend/src/modules/Flows/components/FlowBuilderHeader.jsx`
- `frontend/src/modules/Flows/components/NodeLibraryPanel.jsx`
- `frontend/src/modules/Flows/components/TemplateLibraryModal.jsx`
- `frontend/src/modules/Flows/components/nodes/CustomNode.jsx`
- `frontend/src/modules/Flows/components/nodes/NoteNode.jsx`
- `frontend/src/modules/Flows/data/nodeLibrary.js`
- `frontend/src/modules/Flows/utils/flowMutation.js`
- `frontend/src/modules/Flows/utils/flowGenerationService.js`
- `frontend/src/modules/Flows/utils/documentationNotes.js`
- `frontend/src/modules/Flows/utils/templateLibraryStore.js`

## Recommended Use For Next Prompt

Use this document as the current state reference before attempting any additional Flow Builder recovery work. The most important guardrails now in place are:

- no fake runtime visuals
- no plain-save mutation of template-derived flows
- durable custom template storage
- compact/default-tight graph spacing
- dashed-first edge language
