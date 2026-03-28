# Flow Builder Runtime Audit

This audit captures the current runtime reality of the Flow Builder based on the live codebase.

## Findings

1. Booking and system-event trigger support is better than a generic "partially active" label suggests.
   - Booking triggers are declared in `frontend/src/modules/Flows/data/nodeLibrary.js`.
   - Trigger matching and event dispatch are active in `backend/orchestration.py`.
   - Booking lifecycle events are emitted from `backend/server.py`.

2. The largest execution parity gap is not generic branching alone.
   - The builder exposes many logic/action nodes.
   - The backend only promotes a narrow set of node types into explicit direct intents.
   - Most other nodes fall back to `agent_task`, which makes runtime behavior looser than the UI suggests.

3. Verification branching is a real graph-driven execution path.
   - `verification_branch` evaluates normalized verification results.
   - It chooses matching saved outgoing edges.
   - It continues through the existing runtime graph instead of using a parallel routing system.

4. A contract layer exists, but validation is shallow.
   - `frontend/src/modules/Flows/utils/flowSpec.js` builds and validates a flow spec.
   - Validation currently checks basic structure, not strong runtime compatibility.

## Runtime Reality

### Confirmed direct-execution support

- `create_booking`
- `update_booking`
- `cancel_booking`
- `get_booking`
- `verify_email`
- `verify_email_bulk`
- `wait_for_verification`
- `verification_branch`

### Confirmed live trigger support

- `booking_created`
- `booking_updated`
- `booking_cancelled`

### UI-present but not equivalently wired

- `contact-created-trigger`
- `deal-updated-trigger`
- likely `scheduled-trigger`
- likely `form-submitted-trigger` as a fully emitted runtime event

## Assessment

- Core runner status: active
- Booking event triggers: wired
- Verification nodes: properly integrated
- Major weakness: broad palette, narrow explicit runtime contract

## Verdict

The Flow Builder is more active than a "partially active" label implies, but it is still under-structured. The key problem is not missing node count. The key problem is that many palette-visible nodes still rely on implicit or agent-mediated execution instead of explicit deterministic contracts.
