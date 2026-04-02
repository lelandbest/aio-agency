# Charlie / Alpha Protocol Lock-In

## Core Law

Charlie is the only audio/interface boundary.

All execution beyond Charlie is structured digital command flow.

---

## Execution Chain (Fixed)

Operator ⇄ Charlie  
Charlie → Alpha  
Alpha → Agent(s)  
Agent(s) → Alpha  
Alpha → Charlie  
Charlie ⇄ Operator

This chain must never be bypassed.

---

## Role Definitions

### Charlie

- operator interface
- audio boundary (future)
- command intake
- command envelope builder
- minimal response output

Charlie does not:

- execute logic
- route directly to agents
- expose agent chatter

### Alpha

- command governor
- routing
- QA validation
- result normalization
- failure handling

Alpha must:

- validate input
- select correct agent
- reject invalid payloads
- normalize outputs
- block malformed results

### Agents

- execution workers
- structured output only
- no direct operator access
- no audio
- no freeform response leakage

### Operator

- full authority at all times
- can override
- can cancel
- can reclaim control
- no hidden autonomy allowed

---

## Command Envelope (Required Shape)

All commands must be structured.

Minimum fields:

- issuer
- mode (operator only for now)
- intent
- target
- action
- payload
- operatorControl
- responseMode

No raw text execution allowed.

---

## Output Rules

Agents → Alpha:

- structured data only

Alpha → Charlie:

- normalized result object

Charlie → Operator:

- minimal confirmation only

No chain narration.  
No payload dumping.

---

## Authority Rules

- system is operator-controlled
- no autonomous escalation
- no silent execution
- all actions traceable

---

## Command Center

- single source of truth for:
  - runId
  - status
  - steps
  - outputs
  - errors

Charlie does not replace Command Center.

---

## Client Mode

Not implemented.

- Charlie is operator-only
- no client-facing behavior allowed
- no dual-mode logic

Future:

- separate agent (for example, Echo) will handle client interactions

---

## Hard Fail Conditions

- Charlie bypasses Alpha
- agents speak to operator
- raw agent output reaches UI
- command envelope is skipped
- authority boundaries are violated

---

## Locked

This protocol is locked and must be treated as a governing system SOP.
