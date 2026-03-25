# Implementation Plan - Canonical Schema Enforcement

Unify all flow creation and loading paths behind a single canonical ingestion pipeline to ensure system-wide consistency and stability.

## User Review Required

> [!IMPORTANT]
> - All flow sources (Drafts, Templates, AI, Saved Flows) will now go through a mandatory normalization and validation gate before touching the canvas state.
> - Invalid or malformed flow data will be rejected or sanitized early, preventing UI crashes and ghost state.

## Proposed Changes

### Flow Builder Core

#### [NEW] [flowIngress.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowIngress.js)

- **Implement `ingestFlowSource(source, options)`**:
  - Accept any flow-like object (Draft, Template, AI Output).
  - **Normalization**: Ensure IDs are unique, type labels are set, and positions/styles have sensible defaults.
  - **Validation**: Integrate with [flowSpec.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowSpec.js) to perform early validation.
  - **Remapping**: Apply the hardening logic (ID remapping, position offsets) where appropriate.

#### [MODIFY] [FlowBuilder.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx)

- **Refactor `useEffect` (Initialization)**: Use `flowIngress.js` to load the initial flow/draft.
- **Refactor `applyTemplate` & `injectTemplateToCanvas`**: Delegate to `flowIngress.js`.
- **Refactor AI generation result handling**: Delegate to `flowIngress.js`.
- **Refactor `applyDraftToCanvas`**: Ensure it passes through the canonical pipeline.

## Verification Plan

### Automated Tests
- Ingest malformed JSON: Verify safe rejection and error logging.
- Ingest AI result without edges: Verify warning detection.
- Ingest template with duplicate IDs: Verify normalization/remapping.

### Manual Verification
- Verify that loading a saved flow still works exactly as before but with validation logs.
- Verify that AI generation doesn't break when producing complex graphs.
