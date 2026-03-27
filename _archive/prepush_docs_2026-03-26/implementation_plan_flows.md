# Implementation Plan - Flow Builder Marketplace & AI Generation

Extend the AIOCRM Flow Builder with a robust Template Marketplace and AI-driven flow generation system.

## Proposed Changes

### [Component] Flows Module - UI & Integration

#### [MODIFY] [FlowBuilder.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx)
- Add state for template modals and AI generator.
- Integrate `VariableMappingModal` and `AiGeneratorModal`.
- Implement `applyTemplate` logic which handles variable detection and mapping.
- Add `handleSaveAsTemplate` logic.

#### [MODIFY] [NodeLibraryPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/NodeLibraryPanel.jsx)
- Add tabs: "Nodes" and "Templates".
- Switch between existing node library and the new `TemplateLibraryPanel`.

#### [MODIFY] [FlowBuilderHeader.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/FlowBuilderHeader.jsx)
- Add "Save as Template" button (Floppy/Plus icon).
- Add "AI Generate" button (Bot/Sparkles icon).

---

### [Component] New Marketplace Components

#### [NEW] [TemplateLibraryPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/TemplateLibraryPanel.jsx)
- List templates by category.
- Search and filter capabilities.
- Render `TemplateCard` for each template.

#### [NEW] [TemplateCard.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/TemplateCard.jsx)
- Visual card showing Title, Description, Category.
- "Use Template" action button.

#### [NEW] [VariableMappingModal.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/VariableMappingModal.jsx)
- Triggered when a template or AI-generated flow has placeholders.
- Allow users to map placeholders to:
    - Static values.
    - CRM fields (Contact, Deal).
    - Previous node outputs (scaffolded).

#### [NEW] [SaveTemplateModal.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/SaveTemplateModal.jsx)
- Form to name and categorize the template.
- Optional: Auto-detect dynamic values in node configs and offer to convert them to variables.

#### [NEW] [AiGeneratorModal.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/components/AiGeneratorModal.jsx)
- Prompt input field.
- "Generate" action which calls the AI service.
- Preview area for the generated flow structure.

---

### [Component] Logic & Data

#### [NEW] [variableUtils.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/variableUtils.js)
- `extractVariables(nodes)`: Regex search for `{{placeholder}}` in node data.
- `injectVariables(nodes, mappings)`: Replace placeholders with resolved values.

#### [NEW] [templateRepository.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/templateRepository.js)
- Manage template persistence (starting with localStorage, scaffolded for `/api/templates`).

#### [NEW] [initialTemplates.js](file:///d:/AIOCRM/frontend/src/modules/Flows/data/initialTemplates.js)
- Seed data for the marketplace (e.g., "Welcome Email", "Drip Campaign", "Alerting").

## Verification Plan

### Automated Tests
- No existing automated tests for Flows module found in the backend/test suite. 
- Build verification: `npm run build` in `frontend/` to ensure no syntax or React errors.

### Manual Verification
1. **Marketplace Navigation**: Verify "Templates" tab in the left panel displays the seed templates.
2. **Template Application**:
    - Select a template without variables: nodes/edges should appear on canvas.
    - Select a template WITH variables: mapping modal should appear, and after mapping, node configs should reflect the values.
3. **Save as Template**:
    - Build a small flow.
    - Click "Save as Template".
    - Verify it appears in the Marketplace.
4. **AI Generation**:
    - Enter a prompt like "Send email on new contact".
    - Verify AI returns a valid structure (nodes/edges).
    - Confirm injection to canvas.
5. **UI Consistency**: Ensure all new modals and cards use existing CSS tokens (`--color-bg-primary`, etc.).
