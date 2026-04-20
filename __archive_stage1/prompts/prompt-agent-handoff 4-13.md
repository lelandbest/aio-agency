# AIO HANDOFF — NEXT PROMPT AGENT

## CURRENT OPEN ISSUES

1. VTT conversation routing still broken
   - Non-command speech is not reaching Charlie properly
   - VTT conversational input is not consistently following the same routing contract as typed chat
   - Commands must remain exact-match only
   - Any non-command utterance must route as conversation, never partial-command drift

2. Agent identity sync is broken across UI
   - Barracks → chat → side panels / support panels are not staying in sync
   - One canonical active agent must exist at all times
   - No panel may display stale or fallback identity that conflicts with the active runtime identity

3. Command authority boundaries need enforcement
   - Charlie only for command intake
   - No command leakage into specialists
   - No specialist should appear to accept or execute commands
   - Alpha remains orchestration/QC only
   - Cortex write authority remains Alpha only

4. Role Authority panel failing to fetch
   - Likely endpoint, state, or contract issue
   - Needs audit from fetch path through state hydration to render path
   - Fix must be surgical, not a redesign

5. Mic input not respecting selected agent
   - Mic/VTT is falling back to Charlie when selected agent should receive non-command conversational input
   - Selected agent must be honored for conversation mode
   - Charlie fallback should occur only when contract explicitly says so

6. Charlie tone/mode still too loose
   - Needs tightening
   - No overly helpful assist drift
   - Charlie must remain calm, cool, restrained, apex, controlled
   - She is the voice of Cortex, not a generic assistant

7. Agent response signatures not yet applied
   - Agents still feel identical
   - Identity, tone, response framing, and signature behavior need to be distinct
   - Must not break canonical routing or authority model

8. Collab mode needs validation
   - Multi-agent behavior must be tested for identity bleed
   - No agent attribution confusion
   - No tone leakage
   - No authority leakage

9. Final system integrity pass still pending
   - Runs
   - contracts
   - UI consistency
   - canonical routing
   - no fake execution
   - no ghost runs
   - no dual logging

---

## CANONICAL SYSTEM TRUTH

- System is **AIO**
- AIO is an **AI command/control platform**
- It is **NOT** a chatbot UI

### Canonical execution chain
- **Charlie → Alpha → Specialists → Alpha → Charlie**

### Authority model
- **Charlie**
  - voice of Cortex
  - only command intake surface
  - calm, restrained, apex presence
  - may read from Cortex
  - may NOT write to Cortex

- **Alpha**
  - orchestration
  - QC
  - only Cortex write authority
  - receives work from Charlie
  - may hand to specialists
  - validates outputs before persistence or return

- **Specialists**
  - conversation
  - analysis
  - domain work
  - no command authority
  - no persistence authority
  - no Cortex write access

### Routing truth
- **VTT and typed chat must follow identical routing contracts**
- **Commands are exact-match only**
- **No fuzzy command logic**
- **Non-command input routes as conversation**
  - to Charlie, or
  - to selected active agent
  - according to the canonical routing contract

### Identity truth
- UI must show **one canonical active agent**
- Barracks, chat surface, panel headers, activity surfaces, and any support panel must all resolve from the same source of truth
- No stale fallback identities
- No display-only spoofing
- No mismatched runtime vs UI agent state

### Execution truth
- No fake runs
- No ghost execution
- No dual logging
- No parallel truth stores
- All execution and display must honor canonical system contracts

---

## IMMEDIATE PRIORITY ORDER

1. Fix VTT routing first
2. Lock agent identity propagation second
3. Verify command authority boundaries third

Do not expand beyond those three until they are verified.

---

## REQUIRED APPROACH FOR NEXT AGENT

- Be surgical
- No redesign
- No speculative refactor
- No scope expansion
- Trace runtime truth before changing UI
- Verify contracts before patching symptoms
- Fix root path, not cosmetic fallout
- Preserve canonical architecture exactly

---

## SUCCESS CRITERIA

### VTT routing is correct when:
- exact-match command speech routes only to Charlie command intake
- non-command speech routes as conversation
- selected agent receives conversation when selected
- Charlie fallback only occurs when contract explicitly requires it
- typed chat and VTT behave identically

### Identity sync is correct when:
- Barracks selection matches active chat identity
- panel identity matches runtime active agent
- no fallback mismatch appears during live switching
- collab mode does not bleed agent identity

### Authority enforcement is correct when:
- Charlie is the only command intake surface
- specialists never accept command authority
- Alpha remains orchestration/QC only
- only Alpha writes to Cortex
- Charlie may read Cortex but never write it

---

## DO NOT ALLOW

- fuzzy command matching
- agent identity bleed
- Charlie over-helpful assistant drift
- specialist command handling
- duplicate execution paths
- fake or decorative state pretending to be runtime truth
- UI fallback logic that overrides canonical active agent
- dual routing rules between typed chat and VTT

---

## FIRST TASK NEXT SESSION

Audit and repair VTT routing so non-command speech follows the same conversation routing contract as typed chat, while exact-match commands remain Charlie-only intake.

STOP AFTER OUTPUT