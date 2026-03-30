SYSTEM TASK — SIGNALS → EXECUTION AUTHORITY

Convert Signals from display-only UI into a real execution control layer.

No redesign.
No UI overhaul.
No new system.
Wire into what already exists.

---

OBJECTIVE

Allow Signals to:

- trigger agents
- trigger flows
- execute commands
- dispatch actions

using existing backend execution paths.

Signals must become a thin execution router, not a new system.

---

CORE RULE

Signals DO NOT implement logic.

Signals ONLY route into:

- /api/ai/command
- flow trigger execution
- existing orchestration

---

BACKEND IMPLEMENTATION

1. CREATE SIGNAL EXECUTION ENDPOINT

POST /api/signals/execute

Payload:

{
  "signalType": "string",
  "action": "agent" | "flow" | "command",
  "target": "ALPHA" | "flowId" | null,
  "input": "string or object",
  "context": {}
}

Behavior:

- Validate payload
- Route based on action

---

2. ROUTING LOGIC

IF action == "agent":
→ call /api/ai/command
→ pass:
  - agent
  - input
  - context
  - source = "signal"

IF action == "flow":
→ trigger flow manually
→ reuse existing manual trigger endpoint or orchestration entry
→ ensure:
  intent = "signal_trigger"

IF action == "command":
→ call /api/ai/command
→ no agent override unless provided

No new execution engine.

---

3. RUN TRACKING

All executions MUST:

- create entries in aiEngineRuns
- include:
  - source: "signal"
  - signalType
  - triggerMode: "signal"

---

4. SIGNAL METADATA PASS-THROUGH

Append to context:

{
  "signal": {
    "type": signalType,
    "triggeredAt": timestamp
  }
}

---

FRONTEND IMPLEMENTATION

1. ADD EXECUTION CAPABILITY TO SIGNALS

In Signals/index.jsx:

Each signal gains:

- Execute button OR
- Click-to-execute behavior

---

2. DISPATCH CALL

POST /api/signals/execute

Map signal → action:

Examples:

- "New Lead Signal" → flow trigger
- "Follow-up Needed" → agent
- "System Alert" → command

---

3. FEEDBACK

On execute:

- show loading state
- return runId
- optionally link to run detail

---

4. NO NEW UI SYSTEM

Do NOT:

- build new panels
- build new orchestration UI
- duplicate command UI

Reuse existing patterns.

---

SIGNAL → ACTION MAPPING

Implement minimal mapping layer:

signalType → { action, target }

Hardcode initially if needed.

Do NOT over-engineer.

---

SECURITY

- enforce auth/tenant
- enforce role safety
- do not allow arbitrary agent override without permission

---

TESTS

- trigger agent from signal → run created
- trigger flow from signal → flow executes
- trigger command from signal → AI executes
- verify aiEngineRuns entry includes:
  - source = "signal"
  - signalType present

---

OUTPUT

### PATCH STATUS
### FILES MODIFIED
### ROUTING CONFIRMED
### TEST RESULTS
### REMAINING RISKS

STOP AFTER OUTPUT
