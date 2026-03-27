# Walkthrough: Phase 14 - Autonomous Agents & Semantic Retrieval

Phase 14 marks the transition from static knowledge-aware execution to an autonomous, reasoning-capable agent runtime. The system now supports semantic-ready memory retrieval and allows agents to intentionally select tools and request additional context as needed.

## 1. Semantic-Ready Retrieval Layer
We extended the [CortextService](file:///d:/AIOCRM/backend/cortext_service.py) and the [DataProvider](file:///d:/AIOCRM/backend/data_provider.py) to support granular memory segmenting.

*   **Granular Storage:** Added [brain_chunks](file:///d:/AIOCRM/backend/data_provider.py#4459-4483) and `brain_embeddings` tables to SQLite.
*   **Segmented Indexing:** Implemented `chunk_and_index` (using the existing [chunk_text_content](file:///d:/AIOCRM/backend/data_provider.py#109-143) utility) to split documents into contextually relevant segments.
*   **Hybrid Retrieval Abstraction:** the [retrieve_context](file:///d:/AIOCRM/backend/cortext_service.py#17-43) method now supports a `hybrid` strategy that combines keyword search with a chunk-ranking pass, providing a cleaner semantic-ready interface while preserving the SQLite fallback.

## 2. Autonomous Reasoning Loop
The [BaseAgent](file:///d:/AIOCRM/backend/agent_runtime.py) now implements a `Think -> Act -> Observe` cycle:

*   **Observation & Intent:** Agents evaluate if the current runtime context is sufficient.
*   **Autonomous Retrieval:** If specialized knowledge is missing (e.g., about "pricing" or "SOPs"), the agent can autonomously request an additional vault query.
*   **Anti-Loop Protection:** Implemented a `max_retrievals=2` limit per step to prevent recursion.
*   **Intentional Tool Selection:** Agents now select tools from their authorized capability set (as defined in `AGENT_DEFINITIONS`), matching the execution intent to the best available backend tool.

## 3. Persistent Trace & Observability
The [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py) was upgraded to capture these autonomous actions:

*   **Autonomous Traces:** Retrieval actions triggered by agents are injected into the run `trace` and persisted in the [ai_runs](file:///d:/AIOCRM/backend/server.py#1923-1931) table.
*   **Enhanced Metadata:** Execution results now include `chosenTool` and `intelligenceSummary` fields, which are visible in the backend trace log.

## 4. Verification Results
The full autonomous flow was validated via [test_phase14.py](file:///C:/tmp/test_phase14.py):

```text
--- 1. Testing Semantic-Ready Retrieval Abstraction ---
[OK] Semantic-ready chunk ranking verified.

--- 2. Testing Autonomous Reasoning Loop ---
[OK] Autonomous retrieval trigger and trace entry verified.

--- 3. Testing Anti-Loop / Retrieval Limits ---
[OK] Anti-loop retrieval limit verified.

--- 4. Testing Intentional Tool Selection ---
[OK] Authorized tool selection verified.

--- 5. Testing Execution Engine Trace Persistence ---
[OK] ExecutionEngine tool/intelligence metadata verified.

--- ALL PHASE 14 INTEGRATION TESTS PASSED ---
```

## Architectural Impact
*   **Reasoning Capability:** Agents are no longer passive executors; they "think" about their context before acting.
*   **Semantic-Ready:** The system is primed for local vector search (e.g., LanceDB) as the [CortextService](file:///d:/AIOCRM/backend/cortext_service.py#7-88) abstraction already handles chunk-level retrieval and ranking.
*   **Safety Preserved:** Autonomous retrieval does not bypass the `StepGate`. Mutation tools still require manual approval if flagged by the safety engine.
