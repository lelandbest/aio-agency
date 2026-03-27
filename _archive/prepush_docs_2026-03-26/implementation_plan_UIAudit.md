# AIOCRM UI Refinement & Design System Normalization

## Goal
Standardize the AIOCRM frontend into a cohesive, polished design system with a modern AI + subtle steampunk/industrial aesthetic. This pass will normalize styles across all modules without breaking existing layouts or UX flows.

## User Review Required
> [!IMPORTANT]
> - **Tactile/Skeuomorphic Buttons**: These will be applied selectively to "Primary Action" controls (e.g., "Send", "Run Agent", "Deploy Pipeline") to provide a premium feel.
> - **Unified Shell Rounding**: I will standardize the outer module containers to a consistent 2xl (1.5rem / 24px) radius for a more "island-like" feel.

## Proposed Changes

### Core Style System ([index.css](file:///d:/AIOCRM/frontend/src/index.css))
- [NEW] **Design Tokens**: Standardize radius, shadow, and accent colors (Brass/Copper for steampunk accents).
- [NEW] **Utility Classes**:
  - `.island-panel`: Unified glass-panel style for module sections.
  - `.btn-premium-skeuo`: A tactile, beveled button style for primary actions.
  - `.btn-ghost-steampunk`: Subtle metallic-border buttons.
- [MODIFY] **Typography**: Normalize font-sizes and weights for headers/labels.

### Component Standardization
#### Module Header ([src/components/ModuleHeader.jsx](file:///d:/AIOCRM/frontend/src/components/ModuleHeader.jsx))
- Standardize padding (px-6 py-4) and alignment.
- Implement unified `statusBadge` and `actions` styling using the nuovi tokens.

#### Island Panel Architecture
- Apply the `.island-panel` class to main containers in [CRM](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx#26-2727), [Comms](file:///d:/AIOCRM/frontend/src/modules/Comms/index.jsx#484-1838), and [Agents](file:///d:/AIOCRM/frontend/src/services/backendApi.js#153-158).
- Ensure consistent shadow depth and border opacity.

### Module Application (Controlled)
- **CRM Module**: Normalize the multi-column layout buttons and panel rounding.
- **Comms Module**: Standardize the 3-column workspace with unified toolbar patterns.
- **Agents Module**: Enhance the "Command Monitor" look with refined metallic accents.
- **Settings Module**: Normalize tab styles and form input consistency.

## Verification Plan

### Automated Tests
- N/A (UI visual verification required).

### Manual Verification
- **Visual Audit**: Verify the "Command Center" looks cohesive across `Signals`, [CRM](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx#26-2727), and [Comms](file:///d:/AIOCRM/frontend/src/modules/Comms/index.jsx#484-1838).
- **Theme Test**: Ensure all new tokens support both Dark and Light modes correctly.
- **Component Integrity**: Check that resizable panels in [Comms](file:///d:/AIOCRM/frontend/src/modules/Comms/index.jsx#484-1838) and [CRM](file:///d:/AIOCRM/frontend/src/modules/CRM/index.jsx#26-2727) still function perfectly.
- **Responsiveness**: Verify that the standardized padding doesn't cause overflow on 1920x1080 resolution.
