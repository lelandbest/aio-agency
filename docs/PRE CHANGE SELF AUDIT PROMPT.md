\# PRE-CHANGE SELF-AUDIT PROMPT (SYSTEM INVARIANTS ENFORCEMENT GATE)



YOU ARE A CODING AGENT.



\## CRITICAL RULE

You are NOT allowed to modify any code until you complete this full self-audit.



Any attempt to skip this checklist is considered a system contract violation.



\---



\# PHASE 1 — INVARIANT SELF-AUDIT (MANDATORY)



Before writing or changing a single line of code, verify compliance with the SYSTEM INVARIANTS CONTRACT.



You MUST explicitly confirm each item below.



\---



\## 1. SESSION ISOLATION CHECK



\- CONFIRM: Does this change affect CONVO, COMMAND, or CONSULT?

\- CONFIRM: Are session boundaries strictly preserved?

\- CONFIRM: Is there ANY shared state introduced or modified between session types?



FAIL IF:

\- any shared message store exists across sessions

\- any cross-session data flow is introduced



\---



\## 2. IDENTITY CHECK



\- CONFIRM: Does this change affect Charlie (CONVO/COMMAND)?

\- CONFIRM: Does this change involve CONSULT agents (e.g., Delta)?

\- CONFIRM: Are any non-Charlie identities visible outside CONSULT?



FAIL IF:

\- CONSULT identity appears in CONVO or COMMAND

\- Charlie identity appears inside CONSULT



\---



\## 3. SESSION CONTRACT VALIDATION CHECK



\- CONFIRM: Does all data pass through Session Contract Validator before storage/rendering/routing?

\- CONFIRM: Are there any bypass paths?



FAIL IF:

\- unvalidated messages can reach state or UI

\- validator is optional or bypassable



\---



\## 4. SNAPSHOT VERSIONING CHECK



\- CONFIRM: Are all messages bound to snapshotVersion?

\- CONFIRM: Is snapshotVersion enforced at session switch?

\- CONFIRM: Are async responses validated against snapshotVersion?



FAIL IF:

\- snapshotVersion mismatch is ignored

\- async responses can mutate current session state without validation



\---



\## 5. ASYNC SAFETY CHECK



\- CONFIRM: Are async responses validated before render/storage?

\- CONFIRM: Are stale responses discarded safely?



FAIL IF:

\- delayed responses can override current session state

\- race conditions are not guarded



\---



\## 6. CONSULT ISOLATION CHECK



\- CONFIRM: Is CONSULT fully sandboxed?

\- CONFIRM: Can CONSULT output ever reach UI or COMMAND layers?

\- CONFIRM: Is CONSULT state strictly separated?



FAIL IF:

\- CONSULT data is rendered outside CONSULT context

\- CONSULT leaks into CONVO or COMMAND



\---



\## 7. COMMAND LAYER CHECK



\- CONFIRM: Does COMMAND only execute system actions?

\- CONFIRM: Does COMMAND avoid producing chat output?

\- CONFIRM: Does COMMAND avoid accessing CONSULT state?



FAIL IF:

\- COMMAND produces UI text

\- COMMAND accesses CONSULT directly



\---



\## 8. HYDRATION CHECK



\- CONFIRM: Is persisted state validated before use?

\- CONFIRM: Is localStorage treated as untrusted input?

\- CONFIRM: Are legacy or malformed entries discarded?



FAIL IF:

\- cached state is used without validation

\- hydration bypasses session contract validator



\---



\## 9. RENDER BOUNDARY CHECK



\- CONFIRM: Does UI only render validated session state?

\- CONFIRM: Is raw API data excluded from rendering path?



FAIL IF:

\- unvalidated data reaches UI layer

\- raw responses are directly rendered



\---



\# PHASE 2 — DECISION GATE



If ANY check above fails:



YOU MUST:

\- STOP execution immediately

\- DO NOT modify code

\- REPORT exactly which invariant is violated

\- REQUEST clarification or architectural correction



\---



\# PHASE 3 — APPROVAL TO PROCEED



Only proceed with code changes if ALL checks pass.



Before coding begins, output:



\- "SYSTEM INVARIANTS COMPLIANT — SAFE TO MODIFY"



\---



\# FINAL RULE



The SYSTEM INVARIANTS CONTRACT is above all implementation logic.



No feature, fix, or optimization overrides these rules.

