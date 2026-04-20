Handoff Report - Flow Builder Work (Feb 3, 2026)

Summary
- Flow Builder UX overhaul: circular nodes, left-to-right layout preference, floating toolbar, ghost starter node, node context menus, AI-only library mode.
- Editing: double-click node modal with tabs; note nodes resizable/editable.
- Styling: toolbar button colors via CSS classes; token-first colors.
- Tenant/Brand fields removed from Flow Details and moved to White Label settings (created file if missing).

Key Changes
- Node visuals: circular nodes, larger centered icons, labels below with category tag, enlarged handles with dark outline.
- Node library: Triggers standalone, AI Agents pinned top, alphabetical sorting; Webhook/API open by default; AI-only mode from toolbar.
- Toolbar: Run Flow (green), Activate (green switch), Add Node (purple), Add Note (light grey), Delete node (red), AI Helper bullseye.
- Notes: Add Note creates note nodes behind nodes; resizable and editable.
- Right-click node menu: Settings, Run node once, Copy, Ignore errors toggle, Delete.
- Double-click node card: adds node near lower-left of visible canvas.

Files Updated
- frontend/src/modules/Flows/FlowBuilder.jsx
- frontend/src/modules/Flows/components/nodes/CustomNode.jsx
- frontend/src/modules/Flows/components/nodes/NoteNode.jsx
- frontend/src/modules/Flows/components/nodes/FrameNode.jsx
- frontend/src/modules/Flows/components/NodeLibraryPanel.jsx
- frontend/src/modules/Flows/components/FlowInfoPanel.jsx
- frontend/src/modules/Flows/data/nodeLibrary.js
- frontend/src/index.css
- frontend/src/modules/Settings/WhiteLabelSettings.jsx (created if missing)

Notes / Follow-ups
- Confirm correct settings screen to host Tenant/Brand fields; currently placed in White Label settings file.
- If note/frame layering needs adjustment (above grid but below nodes), tweak zIndex.
- If toolbar buttons need further pruning or order changes, specify.

Test Checklist
1) Ghost node appears on empty canvas; first click opens node library.
2) Double-click node card adds node near lower-left viewport.
3) Right-click node menu works; delete removes edges.
4) Toolbar colors: Run Flow green; Add Node purple; Add Note light grey; Activate switch green.
5) AI node opens sidebar with AI Agents expanded only.
6) Note node: resizable on select; double-click edits.
