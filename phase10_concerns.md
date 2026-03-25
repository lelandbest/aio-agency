# Phase 10 Work Plan — Codebase Review & Concerns

## Summary

I've reviewed the full codebase against the Phase 10 plan. Below are concerns and observations organized by risk level.

---

## 🔴 Blocking Concerns

### 1. [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py) has broken method references

[AIAssistService](file:///d:/AIOCRM/backend/ai_service.py#224-1078) calls three methods that **do not exist** in the file:

- `self._provider_complete()` — called in [parse_command()](file:///d:/AIOCRM/backend/ai_service.py#L1032), [test_provider()](file:///d:/AIOCRM/backend/ai_service.py#L296), and [service_help_ticket()](file:///d:/AIOCRM/backend/ai_service.py#L984)
- `self._post_json()` — called in [_test_ollama_provider()](file:///d:/AIOCRM/backend/ai_service.py#L316)
- `self._assist_with_provider()` — called in [assist()](file:///d:/AIOCRM/backend/ai_service.py#L273)

**This means [parse_command()](file:///d:/AIOCRM/backend/ai_service.py#998-1062) — the foundation Phase 10 builds on — cannot actually execute provider-backed calls.** These stubs must be implemented or restored before any orchestration layer can function.

> [!CAUTION]
> Without these methods, [parse_command()](file:///d:/AIOCRM/backend/ai_service.py#998-1062) will always return `{"steps": []}` when an AI provider is configured, because `_provider_complete` will throw `AttributeError`. The plan does not mention resolving this prerequisite.

### 2. The plan adds code to [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py), but [server.py](file:///d:/AIOCRM/backend/server.py) doesn't import [parse_command](file:///d:/AIOCRM/backend/ai_service.py#998-1062)

[server.py](file:///d:/AIOCRM/backend/server.py) currently imports `ai_assist_service`, [get_ai_provider_catalog](file:///d:/AIOCRM/backend/ai_service.py#81-161), and [list_ollama_models](file:///d:/AIOCRM/backend/ai_service.py#163-185) from `ai_service` — but **never uses [parse_command](file:///d:/AIOCRM/backend/ai_service.py#998-1062)**. The `/api/ai/command` endpoint doesn't exist. This is expected for new work, but the plan should explicitly acknowledge the import chain needs wiring.

---

## 🟡 Architectural Concerns

### 3. [server.py](file:///d:/AIOCRM/backend/server.py) is already 3,627 lines — adding more orchestration here is risky

The plan puts the `/api/ai/command` endpoint in [server.py](file:///d:/AIOCRM/backend/server.py). The file is already enormous. Adding `StepExecutor`, `ExecutionEngine`, and run persistence logic here would push it past 4,000+ lines and make it harder to maintain.

> [!IMPORTANT]
> **Recommendation:** Keep `StepExecutor` and `ExecutionEngine` in [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py) (or a new `orchestration.py`), and add only the thin route handler to [server.py](file:///d:/AIOCRM/backend/server.py). This follows the existing pattern where [automation_service.py](file:///d:/AIOCRM/backend/automation_service.py), [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py), and [auth_store.py](file:///d:/AIOCRM/backend/auth_store.py) hold business logic while [server.py](file:///d:/AIOCRM/backend/server.py) holds routes.

### 4. The plan doesn't address the existing run envelope system

[server.py](file:///d:/AIOCRM/backend/server.py) already has substantial orchestration primitives:

| Existing Function | Purpose |
|---|---|
| [resolve_ai_run_routing()](file:///d:/AIOCRM/backend/server.py#679-700) | Agent dispatch with CHARLIE intake → ALPHA dispatch → specialist |
| [build_ai_run_steps()](file:///d:/AIOCRM/backend/server.py#702-756) | Produces step arrays for run envelopes |
| [build_ai_run_artifacts()](file:///d:/AIOCRM/backend/server.py#758-783) | Produces artifact arrays for run envelopes |
| [resolve_permission_tier()](file:///d:/AIOCRM/backend/server.py#606-613) | Returns [safe](file:///d:/AIOCRM/backend/automation_service.py#24-27) / `guarded` / `dangerous` |
| [choose_specialist_for_command()](file:///d:/AIOCRM/backend/server.py#615-677) | Routes commands to the correct agent |

The Phase 10 plan introduces `check_step_gate()` and a new artifact system without referencing these existing functions. **If we add parallel systems, we'll end up with two competing permission/artifact/step models.**

> [!WARNING]
> The plan's `check_step_gate()` overlaps with the existing [resolve_permission_tier()](file:///d:/AIOCRM/backend/server.py#606-613). The plan's artifact format overlaps with [build_ai_run_artifacts()](file:///d:/AIOCRM/backend/server.py#758-783). These must be unified, not duplicated.

### 5. Run persistence needs a storage decision

The plan says "add minimal storage layer" for run persistence. The codebase uses SQLite via [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py) (345KB). Options:

- **Option A:** Add a [runs](file:///d:/AIOCRM/backend/server.py#1907-1915) table to the existing SQLite schema in [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py) — consistent with the codebase
- **Option B:** In-memory dict storage — simpler but lost on restart
- **Option C:** JSON file storage — middle ground

The plan doesn't specify. Given the project's "local-first, SQLite-backed" protocol, **Option A is the correct choice**, but it requires schema migration work that should be scoped.

### 6. No test infrastructure exists

There are zero Python test files in the backend. The plan's verification section only says "return modified code blocks" — no test strategy. For a system that manages side effects and gating, this is a significant gap.

---

## 🟢 Observations (Not Blocking)

### 7. Step executor stubs are purely local-side

The four intents (`draft_email`, `schedule_calendar`, `add_contact`, `add_crm_note`) are all CRM-local operations. The executor methods (`_draft_email`, etc.) don't exist yet and will need to call into [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py) for actual data writes. This is achievable but should be explicit.

### 8. The [_assist_brain](file:///d:/AIOCRM/backend/ai_service.py#770-881) method has a missing return

[Line 881](file:///d:/AIOCRM/backend/ai_service.py#L881) — the [_assist_brain](file:///d:/AIOCRM/backend/ai_service.py#770-881) method doesn't have a final fallback `return`. If no field matches, it returns `None`, which would cause downstream errors. This is a pre-existing bug unrelated to Phase 10 but worth noting.

### 9. Agent routing integration

The plan doesn't mention how `StepExecutor` should interact with the agent hierarchy. Should `draft_email` be routed to ECHO? Should `add_contact` go through CHARLIE? The [AI_WIRING_PLAN.md](file:///d:/AIOCRM/AI_WIRING_PLAN.md) establishes clear agent→task mappings that the executor should respect.

---

## Recommended Approach

1. **Fix the broken methods first** (`_provider_complete`, `_post_json`, `_assist_with_provider`) — without these, [parse_command()](file:///d:/AIOCRM/backend/ai_service.py#998-1062) is dead code
2. **Unify, don't duplicate** — wrap [resolve_permission_tier()](file:///d:/AIOCRM/backend/server.py#606-613) inside `check_step_gate()`, extend [build_ai_run_artifacts()](file:///d:/AIOCRM/backend/server.py#758-783) for new types rather than replacing it
3. **Place orchestration classes in [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py)** (or new file), not in [server.py](file:///d:/AIOCRM/backend/server.py)
4. **Use SQLite for run persistence** via [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py)
5. **Add at least a `py_compile` verification step** and ideally basic unit tests for the gate and normalizer

---

## Questions for You

1. **Should I restore `_provider_complete` / `_post_json` / `_assist_with_provider` as part of this phase, or do those exist elsewhere (e.g., removed in an earlier cleanup)?**
2. **Do you want orchestration classes in [ai_service.py](file:///d:/AIOCRM/backend/ai_service.py) or a new `backend/orchestration.py`?**
3. **For run persistence — SQLite table in [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py), or a lighter approach for v1?**
