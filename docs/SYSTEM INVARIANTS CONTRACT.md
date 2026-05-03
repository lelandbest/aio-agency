\# SYSTEM INVARIANTS CONTRACT (CONVO / COMMAND / CONSULT ARCHITECTURE)



\## PURPOSE

This document defines the non-negotiable runtime invariants for the AIO multi-session system. These rules are architectural law. Any violation results in system corruption (session bleed, identity leakage, or state replay failure).



\---



\# 1. SESSION ISOLATION INVARIANT



\- CONVO, COMMAND, and CONSULT are fully independent execution domains.

\- NO session may read, write, or render state belonging to another session type.

\- CROSS-SESSION DATA ACCESS IS STRICTLY FORBIDDEN.



Allowed:

\- CONVO ↔ CONVO

\- COMMAND ↔ COMMAND

\- CONSULT ↔ CONSULT



Forbidden:

\- CONVO ↔ CONSULT

\- COMMAND ↔ CONSULT

\- Any shared runtime message store across session types



\---



\# 2. IDENTITY OWNERSHIP INVARIANT



\- CONVO and COMMAND identity is ALWAYS Charlie.

\- CONSULT identity is ALWAYS agentKey-specific (e.g., Delta, etc.).

\- CONSULT identities MUST NEVER appear in CONVO or COMMAND output.

\- Charlie identity MUST NEVER appear inside CONSULT payloads.



STRICT RULE:

\- Identity is assigned ONLY at session boundary entry, never downstream.



\---



\# 3. SINGLE SOURCE OF TRUTH RENDER INVARIANT



\- UI render output MUST ONLY come from validated session state.

\- Unvalidated messages MUST NEVER be rendered.

\- Render layer MUST NOT access raw API responses or localStorage directly.



STRICT RULE:

UI → ONLY validated state store → ONLY session-filtered output



\---



\# 4. SESSION CONTRACT VALIDATION INVARIANT



\- ALL messages MUST pass Session Contract Validator before:

&#x20; - state storage

&#x20; - rendering

&#x20; - routing



Validation MUST enforce:

\- sessionType ∈ {CONVO, COMMAND, CONSULT}

\- sessionId must exist

\- snapshotVersion must exist and match active session

\- identity must match session type rules



INVALID DATA IS DROPPED SILENTLY.



\---



\# 5. SNAPSHOT VERSIONING INVARIANT



\- Every session switch increments snapshotVersion atomically.

\- Messages are ONLY valid if they match current snapshotVersion.

\- Old snapshot messages MUST NEVER render or hydrate.



STRICT RULE:

No snapshotVersion match = message does not exist.



\---



\# 6. ASYNC RESPONSE SAFETY INVARIANT



\- Every async request MUST capture requestSnapshotVersion at dispatch time.

\- On response:

&#x20; - IF snapshotVersion mismatch → DISCARD RESPONSE

&#x20; - IF sessionId mismatch → DISCARD RESPONSE

&#x20; - IF sessionType mismatch → DISCARD RESPONSE



STRICT RULE:

Late responses are NEVER allowed to mutate current session state.



\---



\# 7. CONSULT PIPELINE ISOLATION INVARIANT



\- CONSULT is a sandboxed execution environment.

\- CONSULT MUST NEVER output directly to UI or COMMAND.

\- CONSULT outputs MUST ONLY be consumed by validated CONSULT session state.



STRICT RULE:

CONSULT → State ONLY (never UI, never Charlie pipeline)



\---



\# 8. COMMAND EXECUTION INVARIANT



\- COMMAND is an action-only layer.

\- COMMAND MUST NOT render conversational output.

\- COMMAND MUST NOT access CONSULT state.

\- COMMAND MAY trigger system actions ONLY via Charlie-controlled pipeline.



STRICT RULE:

COMMAND ≠ chat system. COMMAND = system control only.



\---



\# 9. HYDRATION SAFETY INVARIANT



\- localStorage and cached state are NON-AUTHORITATIVE.

\- All hydrated data MUST pass Session Contract Validator.

\- Any missing or legacy session metadata MUST be discarded.



STRICT RULE:

Unvalidated persisted state = ignored.



\---



\# 10. HARD RENDER BOUNDARY INVARIANT



\- Only validated, session-matching messages may reach UI.

\- No exceptions.

\- No fallback rendering of raw or partial payloads.



STRICT RULE:

Render layer is blind to everything except validated state.



\---



\# FINAL SYSTEM GUARANTEE



If all invariants are respected:



\- Charlie remains the only CONVO/COMMAND voice

\- CONSULT remains fully isolated in Barracks

\- No session bleed is possible

\- No identity leakage is possible

\- No replay corruption is possible

\- No async race corruption is possible



VIOLATION OF ANY INVARIANT = SYSTEM ARCHITECTURE BREAKDOWN

