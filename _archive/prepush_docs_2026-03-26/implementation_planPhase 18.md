# Implementation Plan - Template System Hardening

Stabilize and complete the template injection system to ensure safety, reliability, and deep variable resolution.

## User Review Required

> [!IMPORTANT]
> - New IDs will be generated using a combined timestamp and random suffix to guarantee uniqueness.
> - Node positions will be offset by (+40, +40) from their template defaults to avoid visual overlap when multi-injecting.

## Proposed Changes

### Flow Builder Core

#### [MODIFY] [FlowBuilder.jsx](file:///d:/AIOCRM/frontend/src/modules/Flows/FlowBuilder.jsx)

- **Harden `injectTemplateToCanvas`**:
  - Implement `oldToNewIdMap` for strict ID isolation.
  - Implement recursive `deepResolve(obj, mappings)` helper.
  - Apply (+40, +40) position offset.
  - Add structural validation for `nodes` and `edges`.
  - Ensure edges are remapped using the new ID map.
  - Ensure deep resolution applies to ALL node data fields.

## Verification Plan

### Automated Tests
- Inject a template twice: verify no ID collisions and correct offsets.
- Inject a template with nested variables in `config.payload.nested`: verify resolution.
- Inject an invalid template: verify console error/rejection without crashing.

### Manual Verification
- Verify that existing nodes are not affected when a template is added.
- Verify that connections between injected nodes are preserved correctly.
