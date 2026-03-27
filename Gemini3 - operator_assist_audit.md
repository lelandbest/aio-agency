# Operator Assist Integrity Audit

This report evaluates the internal integrity and production readiness of the `/api/assist` (Operator Assist) implementation relative to the legacy `/api/ai/assist` path.

ASSIST INTEGRITY:
- STRONG

GROUNDING:
- STRONG

CLIENT SAFETY:
- STRONG

NON-MUTATION:
- VERIFIED

DUAL-PATH RISK:
- MODERATE

## Audit Findings

### 1. Context Grounding [VERIFIED]
The `/api/assist` path uses [operator_assist.py](file:///d:/AIOCRM/backend/operator_assist.py), which explicitly fetches:
- Canonical tenant settings via [auth_store](file:///d:/AIOCRM/backend/ai_service.py#16-22).
- Real-time flow states and trigger configurations.
- Execution history (recent runs and structured errors) from the `DataProvider`.
- Comms/Calendar snapshots.
Data is summarized into concise, domain-selected slices, preventing payload bloat while maintaining high accuracy.

### 2. Client-Safe Mode [VERIFIED]
- **Redaction:** [operator_assist.py](file:///d:/AIOCRM/backend/operator_assist.py) contains a hard-coded check (`role == "client"`) that restricts assist domains. 
- **Endpoint Protection:** [server.py](file:///d:/AIOCRM/backend/server.py) whitelists `/api/assist` for clients but **blocks** `/api/ai/assist`.
- **Logic:** Clients are physically prevented from querying internal automation, flow logic, or global variables. The system returns a specific "safe surface" response.

### 3. Non-Mutation Guarantee [VERIFIED]
Audit of [operator_assist.py](file:///d:/AIOCRM/backend/operator_assist.py) confirms that the assist flow is strictly read-only. Responses are serialized into an advisory `answer` format. No calls to [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#691-973) or `provider.save_*` exist in this path.

### 4. Dual-Path Risk [MODERATE]
- **Confusion:** There is a minor risk of "diagnostic fragmentation" where an operator uses `/api/ai/assist` (generic) for system debugging. 
- **Conflict:** None. The two systems use different backend logic and different prompt structures.

## Failure Modes Identified
1. **Diagnostic Gaps:** If a flow is draft/inactive, assist correctly identifies it but cannot predict future side effects (correct behavior).
2. **Stale Data:** Assist depends on the `DataProvider`'s current state; if sync lags, diagnostics may be stale.
3. **Generic Fallback:** Using legacy assist for diagnostics leads to potential hallucination of system configuration.

## CRITICAL ISSUES
- None detected.

## HIGH RISK AREAS
- **Role Resolution:** The grounding depends on `session.get("user").get("role")`. Any regression in session role assignment would compromise client-safety boundaries.

## TOP 5 FIXES
1. **Explicit Role Logging:** Log the resolved role in [generate_assist_response](file:///d:/AIOCRM/backend/operator_assist.py#697-760) to facilitate security auditing.
2. **Path Deprecation:** Flag `/api/ai/assist` as "Legacy" in the backend router to discourage use for diagnostics.
3. **Draft Context:** Enhance [_find_matching_flow](file:///d:/AIOCRM/backend/operator_assist.py#137-163) to explicitly look for "Draft" status and warn users more prominently.
4. **Error Traceability:** Include `run_id` in failure-based `suggestedActions` to close the diagnostic loop faster.
5. **Session Guard:** Add a secondary [is_operator](file:///d:/AIOCRM/backend/server.py#1767-1769) check inside [build_assist_context](file:///d:/AIOCRM/backend/operator_assist.py#300-373) as a defense-in-depth measure.

FINAL VERDICT:
- READY TO EMBED (with the recommended hardening pass for role logging)
