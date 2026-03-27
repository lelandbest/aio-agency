# Walkthrough: Phase 16 - Adaptive Routing & Self-Healing

Phase 16 transforms the AIOCRM orchestration engine from a deterministic executor into an adaptive, learning runtime capable of autonomous recovery and continuous improvement.

## 1. High-Level Architecture
- **Learning Layer**: All run and step outcomes are persisted in a new structured SQLite store (`ai_step_outcomes`).
- **Adaptive Routing**: The engine scores candidate agents based on historical success rates for specific intents, rerouting tasks to the most reliable specialist.
- **Fail-Safe Self-Healing**: Transient failures (like network timeouts) trigger a supervised recovery loop that attempts safe retries before involving the user.

## 2. Key Components

### [Adaptive Routing](file:///d:/AIOCRM/backend/adaptive_routing.py)
Uses historical data to rank agents.
- **Scoring**: $SuccessRate = Successes / TotalRuns$
- **Reroute Trace**: Decisions are logged in the run trace for full observability.

### [Failure Analysis](file:///d:/AIOCRM/backend/failure_analysis.py)
Categorizes exceptions into:
- `transient`: Recoverable via retry (e.g., timeouts).
- `missing_context`: Recoverable via refetching.
- `validation`: Potentially repairable but higher risk.
- [permission](file:///d:/AIOCRM/backend/server.py#611-618): Non-recoverable; requires escalation.

### [Recovery Engine](file:///d:/AIOCRM/backend/recovery_engine.py)
Executes the healing policy:
- **Max Retries**: Capped at 1 to prevent loops.
- **Audit Integration**: All healing actions are logged to the audit trail.

## 3. Verification Results
We validated the system using [test_phase16.py](file:///C:/tmp/test_phase16.py) with the following results:
- [x] **Outcome Persistence**: Successfully saved and retrieved agent performance records.
- [x] **Adaptive Routing**: ALPHA correctly delegated a communication task to ECHO based on its 100% success history.
- [x] **Self-Healing**: A simulated "503 Network Timeout" triggered a `transient_retry` which successfully completed the task.
- [x] **Learning Reflection**: At run completion, a `_learningSummary` was generated capturing recovery insights.

## 4. Safety Constraints
- **Bounded Autonomy**: Self-healing is restricted to a single retry per step by default.
- **Precedence**: Gating and approvals still apply to recovered steps.
- **Visibility**: Every "intellectual" decision (routing choice, healing attempt) is visible in the UI trace.
