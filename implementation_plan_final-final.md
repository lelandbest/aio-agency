# Implementation Plan - FINAL SYSTEM LOCK (INGESTION ENFORCEMENT)

Enforce a 100% canonical ingestion pipeline for the Flow Builder. No graph update (nodes or edges) is allowed to reach state without passing through [ingestFlowSource()](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowIngress.js#34-172).

## User Review Required

> [!IMPORTANT]
> - All flow sources (Drafts, Templates, AI, Saved Flows) will now go through a mandatory normalization and validation gate.
> - Direct `setNodes` and `setEdges` with raw data are strictly prohibited.
> - The ingestion utility is renamed from [flowIngress.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowIngress.js) to `flowIngestion.js` to align with the new standard.

## Proposed Changes

### Core Architecture

#### [MODIFY] [flowIngestion.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowIngestion.js) (formerly [flowIngress.js](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowIngress.js))
- Rename file.
- Ensure [ingestFlowSource](file:///d:/AIOCRM/frontend/src/modules/Flows/utils/flowIngress.js#34-172) exports correctly.
- Ensure the logic for `mode` (saved, draft, template, ai) is bulletproof.

### Flow Builder Integration

#### [MODIFY] [FlowBuilder.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx)
- **Step 1: Import Refactor**: Update import to `./utils/flowIngestion`.
- **Step 2: Initial Flow Load**: Refactor [initFlow](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx#364-431)'s first `setNodes`/`setEdges` to use the new pattern with the result validation check.
- **Step 3: Draft Load**: Refactor draft restoration in [initFlow](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx#364-431) to use the `result.validation.blockers` pattern.
- **Step 4: applyDraftToCanvas()**: Refactor the entire function to use `draft.draftSpec`.
- **Step 5: Template System**: Ensure `injectTemplateToCanvas` follows the pattern.
- **Step 6: AI Flow Generation**: Ensure the AI generation handler in [AiGeneratorModal](file:///d:/AIOCRM/frontend/src/modules/Flows/components/AiGeneratorModal.jsx#4-131) (or where it lives) follows the pattern.
- **Step 7: Global Search & Destroy**: Scan for any remaining `setNodes` / `setEdges` using raw or locally-mapped data (e.g., `onConnect`, `Delete`).

## Verification Plan

### Manual Verification
- Verify initial load of a saved flow.
- Verify draft restoration on page reload.
- Verify AI generation results in a valid, ingested graph.
- Verify template injection (with and without placeholders).
- Verify node deletion and copying still work through the ingestion gate.
