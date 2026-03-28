# Universal Node Config Standard

This document defines a compact universal configuration standard for the existing Flow Builder so nodes can feel like stronger workflow operators without bloating the system.

# UNIVERSAL CONFIG STANDARD

## Shared Sections

- Section: Identity
- Purpose: define what the node is doing in human and runtime terms
- Fields: `label`, `description`, `nodeType`, `category`, `enabled`
- Required vs Optional: `label`, `nodeType` required; `description`, `enabled` optional
- Applies To: all nodes

- Section: Inputs
- Purpose: define the values the node reads and how they are mapped
- Fields: `inputMode`, `fields`, `requiredFields`, `sourceHints`
- Required vs Optional: `fields` required for action and logic nodes; `requiredFields` required for deterministic nodes; `sourceHints` optional
- Applies To: most executable nodes

- Section: Outputs
- Purpose: define what downstream nodes can rely on
- Fields: `outputMode`, `namedOutputs`, `primaryResult`, `writeTo`
- Required vs Optional: `outputMode` required; `namedOutputs` required for deterministic nodes; `writeTo` optional
- Applies To: all executable nodes

- Section: Execution
- Purpose: control runtime behavior
- Fields: `runMode`, `timeout`, `retryPolicy`, `idempotencyHint`
- Required vs Optional: `runMode` required for deterministic nodes; the rest optional
- Applies To: deterministic, async, HTTP, and bridge nodes

- Section: Error Handling
- Purpose: define failure behavior without changing engine architecture
- Fields: `onError`, `fallbackStatus`, `userMessage`
- Required vs Optional: `onError` required for deterministic nodes; the rest optional
- Applies To: all executable nodes

- Section: Variable Read/Write
- Purpose: make variable usage explicit
- Fields: `readsFrom`, `writesTo`, `exposeAs`, `allowTemplateTokens`
- Required vs Optional: mostly optional, but strongly recommended for any node that participates in downstream mapping
- Applies To: all non-trivial nodes

- Section: Advanced
- Purpose: hold power-user controls without bloating the main modal
- Fields: `rawConfig`, `notes`, `debugLabel`, `metadata`
- Required vs Optional: all optional
- Applies To: all nodes, collapsed by default

## Node-Type Overrides

### Trigger Nodes

- Shared Fields: identity, trigger binding, emitted payload preview
- Required Fields: source event or trigger selector
- Optional Fields: filters, debounce, test payload
- Remove/Replace: replace generic freeform `event` fields for fixed triggers with structured selectors

### Booking Nodes

- Shared Fields: mapped inputs, named outputs, timeout, on-error
- Required Fields: booking identifiers or create payload essentials
- Optional Fields: title, notes, location, output alias
- Remove/Replace: replace generic `configuration` blobs with explicit booking fields

### Messaging Nodes

- Shared Fields: recipient mapping, content fields, on-error, output alias
- Required Fields: email needs `to`, `subject`, `body`; SMS needs `to`, `message`
- Optional Fields: sender, mailbox, cc, bcc, reply-to
- Remove/Replace: remove weak generic action fields that do not map to real runtime inputs

### Variable/Data Nodes

- Shared Fields: source mapping, target mapping, overwrite policy
- Required Fields: target variable or storage target
- Optional Fields: merge policy, null-handling, return stored record
- Remove/Replace: replace raw config-only forms with explicit key/value or field-map editors

### Logic Nodes

- Shared Fields: source selection, condition definition, branch result
- Required Fields: deterministic condition or wait target
- Optional Fields: default branch, timeout, compare mode
- Remove/Replace: remove generic condition text areas for deterministic logic nodes

### HTTP/Webhook Nodes

- Shared Fields: method, URL or path, headers, payload mapping, timeout, retry
- Required Fields: outbound HTTP requires method and URL; inbound webhook requires endpoint identity contract
- Optional Fields: auth mode, response mapping, query params
- Remove/Replace: separate inbound webhook config from outbound HTTP config

### Verification Nodes

- Shared Fields: mapped email or contact inputs, mode, writeback, output alias
- Required Fields: email or contact reference for single verify; contact ids or emails for bulk; task id for wait; source for branch
- Optional Fields: timeout, poll interval, missing-email policy
- Remove/Replace: remove leftover generic config fields around already-structured verification nodes

### Socket Nodes

- Shared Fields: workflow reference, auth reference, payload map, timeout, retry
- Required Fields: target workflow or socket reference
- Optional Fields: response mapping, success criteria
- Remove/Replace: replace ambiguous freeform bridge settings with one stable bridge contract

### AI Tool Nodes

- Shared Fields: prompt or objective, context inputs, output alias, on-error
- Required Fields: usable task objective
- Optional Fields: style, tone, artifact type, writeback target
- Remove/Replace: do not pretend these have deterministic outputs if they do not

## MODAL LAYOUT STANDARD

- Section Order: Identity -> Inputs -> Outputs -> Execution -> Error Handling -> Variable Read/Write -> Advanced
- Compact Layout Rules: show only meaningful fields for the current node type; collapse advanced controls; prefer grouped fields over long raw forms
- When to Hide Sections: hide unused sections such as Outputs for passive triggers or Execution for non-executable placeholders
- When to Expand Sections: expand Inputs and Outputs for deterministic nodes; expand Execution for async, polling, HTTP, and socket nodes

## INPUT / OUTPUT CONTRACT STANDARD

- Required Contract Fields: `nodeType`, `executionType`, `reads`, `requiredInputs`, `optionalInputs`, `outputs`, `writesVariables`
- Optional Contract Fields: `runMode`, `timeout`, `retryPolicy`, `supportsTemplates`, `supportsNamedOutputs`, `errorMode`
- Deterministic vs Agent-Resolved Rules: deterministic nodes must declare required inputs and named outputs; agent-resolved nodes may declare broad output classes but should not imply guaranteed fields unless explicitly written
- Validation Rules: deterministic nodes fail validation if required inputs are unresolved; agent nodes validate for usable intent, not exact output structure

## VARIABLE INTEGRATION STANDARD

- Supported Namespaces: `form.*`, `trigger.*`, `nodes.<nodeId>.*`, `previous.*`, `run.vars.*`, `globals.*`, plus resolved object namespaces like `contact.*` and `booking.*`
- Picker Behavior: namespace-first picker with search and prior-node output browsing
- Token Syntax: `{{namespace.path}}`
- Validation Behavior: unresolved required mappings should fail deterministic node validation; unresolved optional tokens should warn; agent prompt tokens should soft-warn
- Write-Back Behavior: deterministic node outputs should land in `nodes.<nodeId>.*`; optional aliases may also write selected results to `run.vars.*`

## PRIORITY APPLICATION LIST

- Priority 1: `form-submitted-trigger`, `create-booking`, `update-booking`, `cancel-booking`, `get-booking`
- Priority 2: `send-email`, `send-sms`, `set-variable`, `store-data`
- Priority 3: `http-request`, `webhook`, `wait-for-verification`, `verification-branch`
- Priority 4: generic logic nodes, socket nodes, AI tool nodes

## FINAL RECOMMENDATION

- What should become universal across nearly all nodes?
  Identity, mapped inputs, declared outputs, basic error handling, explicit variable read/write metadata, and a compact advanced section.

- What should remain node-specific?
  Trigger source selectors, booking payload fields, messaging content fields, verification task controls, HTTP transport settings, and AI tool parameters.

- What is the single biggest config weakness in the current system?
  Most nodes still present generic configuration shells without a real runtime contract.

- What is the simplest path to making existing nodes feel dramatically more powerful?
  Keep the current builder, standardize a compact shared config surface, and add small node-type overrides to the nodes that already have real runtime support.
