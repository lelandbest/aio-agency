# Implementation Plan - Flow Builder Marketplace & AI Generation

## [BLOCKING] Stabilize Layout (Remove Sliding Drawer)

Eliminate all top-sliding elements that cause layout shifting. Establish a stable 3-column foundation.

### Proposed Changes

#### [MODIFY] [FlowBuilder.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx)
- **Layout Refactor**:
  - `LEFT`: [NodeLibraryPanel](file:///d:/AIOCRM/frontend/src/modules/Flows/components/NodeLibraryPanel.jsx#12-152) (stable, 256px wide).
  - `CENTER`: `ReactFlow` inside a relative wrapper.
  - `RIGHT`: [FlowInfoPanel](file:///d:/AIOCRM/frontend/src/modules/Flows/components/FlowInfoPanel.jsx#12-237) (inspector) (stable, 320px wide).
- **Control Overlay**:
  - Add `TopOverlay` component inside the Canvas wrapper.
  - Move "Pills" (AI Status, Agent Info) into this absolute positioned container.
- **Header Cleanup**:
  - Remove all logic that toggles drawers or shifts the canvas vertically.

---

## Template Marketplace Foundation (Next Step)

### [Component] New Marketplace Components

#### [MODIFY] [NodeLibraryPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/NodeLibraryPanel.jsx)
- Add "Nodes" and "Templates" tabs.

#### [NEW] [TemplateLibraryPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/TemplateLibraryPanel.jsx)
- List templates by category.
- Render `TemplateCard` for each template.

#### [NEW] [VariableMappingModal.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/VariableMappingModal.jsx)
- Resolve `{placeholders}` during template application.

---

## AI Generation Pipeline

#### [NEW] [AiGeneratorModal.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/AiGeneratorModal.jsx)
- Structured prompt-to-flow pipeline.

## Verification Plan

### Manual Verification
1. **Layout Stability**: Toggle Sidebars and Verify React Flow canvas NEVER shifts vertically.
2. **Pill Positioning**: Verify the top floating overlay centers correctly above the canvas.
3. **Interactions**: Ensure drag-and-drop from LEFT panel still works with the new layout.
