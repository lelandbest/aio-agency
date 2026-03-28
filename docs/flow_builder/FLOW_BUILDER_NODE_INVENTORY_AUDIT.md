# Flow Builder Node Inventory and Capability Audit

This document captures the existing node set, configuration quality, and runtime capability shape for the current Flow Builder.

## Core Node Inventory

### Triggers

- `manual-trigger`
- `scheduled-trigger`
- `form-submitted-trigger`
- `contact-created-trigger`
- `deal-updated-trigger`
- `booking-created-trigger`
- `booking-updated-trigger`
- `booking-cancelled-trigger`

### Logic

- `if-then`
- `time-delay`
- `filter`
- `switch`
- `wait-for-verification`
- `verification-branch`

### Webhook / API

- `http-request`
- `webhook`

### Messaging

- `send-email`
- `send-sms`

### Utility / Data

- `store-data`
- `set-variable`
- `user-input`
- `ai-form-builder`
- `create-booking`
- `update-booking`
- `cancel-booking`
- `get-booking`
- `verify-email`
- `verify-email-bulk`

### Sockets

- `n8n-socket`
- `aio-boost-socket`
- `latenode-socket`

### AI Tools

See `docs/flow_builder/AGENT_TOOL_LIST.md`.

## Implementation State Summary

### Fully implemented deterministic nodes

- `booking-created-trigger`
- `booking-updated-trigger`
- `booking-cancelled-trigger`
- `create-booking`
- `update-booking`
- `cancel-booking`
- `get-booking`
- `verify-email`
- `verify-email-bulk`
- `wait-for-verification`
- `verification-branch`

### Partially implemented or agent-mediated nodes

- `send-email`
- `send-sms`
- `store-data`
- `set-variable`
- `create-task`
- `http-request`
- `webhook`
- `if-then`
- `time-delay`
- `filter`
- `switch`
- socket nodes
- all AI tool nodes

### Shallow or UI-only nodes

- `scheduled-trigger`
- `contact-created-trigger`
- `deal-updated-trigger`
- `user-input`
- `ai-form-builder`

## Settings Audit

### Active settings path

The live settings modal is in `frontend/src/modules/Flows/FlowBuilder.jsx`.

Current live modal quality by group:

- Trigger nodes: weak
- Generic action nodes: weak
- Generic logic nodes: weak
- Booking nodes: runtime stronger than modal
- Verification nodes: strongest current structured config
- HTTP / socket nodes: medium UI, weak runtime contract
- AI tool nodes: generic and agent-prompt oriented

### Duplicate config-surface problem

`frontend/src/modules/Flows/components/NodeConfigDrawer.jsx` contains richer settings for some form and input nodes, but it is not the active configuration path. This creates two competing configuration systems:

- live modal in `FlowBuilder.jsx`
- dormant drawer in `NodeConfigDrawer.jsx`

That duplication should be resolved before adding more settings complexity.

## Input / Output Capability Summary

### Deterministic nodes

These should declare explicit required inputs and named outputs:

- booking actions
- email verification actions
- verification wait / branch

### Agent-mediated nodes

These currently depend on broad prompt/config context instead of a hard contract:

- send email
- send SMS
- store data
- set variable
- generic logic nodes
- sockets
- AI tools

## Form Variable Model Recommendation

Form-driven execution should normalize trigger payloads once and carry them through the run under stable namespaces.

Recommended namespaces:

- `trigger.*`
- `form.*`
- `contact.*`
- `booking.*`
- `globals.*`
- `run.vars.*`
- `nodes.<nodeId>.*`
- `previous.*`

Recommended reference syntax:

- `{{form.fields.email}}`
- `{{contact.id}}`
- `{{nodes.verify_email.status}}`
- `{{previous.taskId}}`
- `{{run.vars.segment}}`
- `{{globals.companyName.value}}`

## Hardening Priorities

1. Strengthen modals for `form-submitted-trigger`, booking actions, `send-email`, `send-sms`, `set-variable`, and `store-data`.
2. Define explicit input/output contracts for already-deterministic nodes first.
3. Resolve the duplicate modal vs drawer configuration surface.
4. Add one canonical variable and interpolation layer before expanding node count.

## Final Assessment

The current node set is broad enough to harden before any expansion. The biggest weakness is not node quantity. It is the mismatch between what the palette implies and what the runtime explicitly guarantees.
