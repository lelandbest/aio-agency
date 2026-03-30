# Flow Builder Hardening & UI Audit Handoff

## Overview
This handoff details the layout refactoring, hardening, and coordinate modifications applied uniquely to the `Flows` module (specifically `FlowBuilder.jsx` and its immediate children components). The objective of this session was to strictly mirror the rest of the application's "Industrial Island" design standards, cleanly embed floating modals, correct canvas scaling, and enforce strict z-indexing discipline across the builder layer.

---

## Accomplishments
1. **Right Panel Integration (Details & History tabbed layout)**
   - Replaced the standalone off-screen DOM `History` modal toggle with an integrated 340px tabbed inspector panel docked to the right viewport edge.
   - Refactored `FlowBuilder.jsx` to render both `FlowInfoPanel` (Details) and `FlowRunHistoryPanel` (History) side-by-side using an absolute `rightPanelTab` state (`details` vs `history`), fully replicating the exact design paradigm seen in the left `Nodes`/`Templates` panel.

2. **MiniMap Restructuring & Repositional Hardening**
   - Successfully decoupled the ReactFlow `<MiniMap />` from the Canvas Control Dock (bottom-right canvas frame).
   - Visually "ported" the component exclusively to the base of the `Details` inspector tab, using CSS cascading `!important` overrides via inline class definitions to break it out of the native ReactFlow constraint box without crashing the context hooks.
   - Allowed the MiniMap to effectively load completely intact within the fixed Side Panel UI.

3. **FlowBuilderHeader Contrast Enhancement**
   - Stripped out the abstract button hooks for `onOpenHistory` from `<FlowBuilderHeader>`. 
   - Dynamically remapped the text of the Details collapse button (`DETAILS` / `HIDE`).
   - Hardcoded a massively high-visibility active glow-state (`bg-sky-500/20 text-sky-400 border-sky-500/30 shadow-[0_0_12px_rgba(14,165,233,0.3)]`) exclusively for the Right Dock toggle to separate it from the less severe `Save` buttons.

4. **Ghost Node Restructuring (Scaling & Coordinates)**
   - Disabled `ReactFlow`'s force-centering `fitView` boolean lock when rendering standard unmodified blank canvases (i.e. if the only node on screen is an `isGhost` node).
   - Reverted the Ghost Node scale block directly within `CustomNode.jsx`, officially returning the `<div />` transform matrix from `0.75` scale back up to `scale(1.2)` at `center center` to grant it presence on the load-screen.
   - Manually decoupled its rendering array spawn offsets from absolute pixel defaults. Hand-wrote the responsive mapping: `x: ((window.innerWidth - 256) / 2) - 36`. This ensures that across ultra-wide monitors or 14" laptops, the Ghost Node always visibly binds to the strict horizontal center-line of the active Canvas frame, hovering exactly over the top curve of the `Run Flow` dock array without causing asymmetrical drift.

---

## Failures / Deprecated Approaches
- **Left-Quadrilateral Drifts:** We explicitly experimented with shoving the Ghost Node directly into the exact $1/3$ width quadrant and the $1/4$ off-center horizontal axes to force a cascading layout feel. We evaluated this approach and ultimately scrapped it: mathematically enforcing the node off the center `X` margin completely shattered the strict vertical balance provided by the `Top Action Alpha Dispatch` bar and the `Bottom Run Flow` UI array, both of which are absolutely locked to the center using `-translate-x-1/2`.

---

## Next Steps for Immediate Incoming Agent
1. **Module-wide Alignment (Other Pages)**
   - The Calendar, COMMS, and general CRM root views still require absolute auditing to forcefully match the "Island Layout" refactoring standards applied throughout this flow module. 
2. **Reviewing Layout Edge Cases**
   - The `onToggleDetails` animation is currently cleanly interpolating `w-[340px]` when open, to `w-0 border-none` when collapsed. This handles gracefully.
   - ReactFlow minimaps natively block certain event propagation if pushed entirely off-screen inside a `hidden` CSS toggle block. Confirm that moving from the `History` tab back into the `Details` tab does not strip the MiniFlow mapping DOM connection.
3. **Module Toolbar Validation**
   - Continue sweeping legacy code `button` tags with inline styling for the new `.btn-primary-skeuo` or `.btn-secondary` standardized utility tags used locally.
