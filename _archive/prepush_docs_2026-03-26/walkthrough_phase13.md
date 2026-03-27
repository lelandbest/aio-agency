# Walkthrough: Phase 13 - Intelligence Integration Layer

Phase 13 has transformed the AIOCRM intelligence architecture by shifting the source of truth for agent capabilities to the backend and establishing formal knowledge bridges between the vault (Cortext) and the execution runtime (Agents).

## 1. Backend Agent Authority
We migrated the logic previously isolated in the frontend `SPECIALIST_REGISTRY` into a centralized backend authority: [agent_definitions.py](file:///d:/AIOCRM/backend/agent_definitions.py).

*   **Centralized Registry:** Defines roles, capabilities, tools, and system prompts for all 13 specialists (ALPHA, STRIKER, etc.).
*   **API Exposure:** Added `/api/ai/agents/definitions` to [server.py](file:///d:/AIOCRM/backend/server.py) to allow any module to synchronize with current agent profiles.

## 2. Cortext Knowledge Bridge
The new [cortext_service.py](file:///d:/AIOCRM/backend/cortext_service.py) provides a high-level abstraction for interacting with the Vault.

*   **Hybrid Retrieval:** Implements a [query_vault](file:///d:/AIOCRM/backend/cortext_service.py#11-26) method that currently defaults to the SQLite keyword-search fallback but is architected for future vector/semantic expansion.
*   **RAG Context Synthesis:** Includes utility methods to format retrieved vault results into summarized blocks suitable for LLM injection.

## 3. Knowledge-Aware Orchestration
The [orchestration.py](file:///d:/AIOCRM/backend/orchestration.py) execution engine was upgraded to be "intelligence-aware":

*   **Explicit Retrieval Step:** Introduced the [query_vault](file:///d:/AIOCRM/backend/cortext_service.py#11-26) intent. The runtime now recognizes this step and executes it using the [QueryVaultTool](file:///d:/AIOCRM/backend/tools.py#13-30).
*   **Context Propagation:** Successfully implemented the `retrievedContext` bucket. Results from a retrieval step are persisted in the run state and propagated to all subsequent agent execution calls.
*   **Intelligence Tracking:** Agents now flag `_intelligence_used` in their execution response whenever they detect valid knowledge in their runtime context.

## 4. Tool Registry
Established [tools.py](file:///d:/AIOCRM/backend/tools.py) as a unified handler layer. Both the [StepExecutor](file:///d:/AIOCRM/backend/orchestration.py#144-243) and individual agents can now invoke structured tools like [QueryVaultTool](file:///d:/AIOCRM/backend/tools.py#13-30) or [DraftEmailTool](file:///d:/AIOCRM/backend/tools.py#31-42), reducing code duplication across specialist classes.

## 5. Verification Results
The integration was validated using a dedicated harness: [test_phase13.py](file:///C:/tmp/test_phase13.py).

```text
--- 1. Testing Agent Authority ---
[OK] ALPHA definition verified.
[OK] STRIKER ID-to-Name mapping verified.

--- 2. Testing Cortext Abstraction ---
[OK] Cortext hybrid retrieval fallback verified.

--- 3. Testing Tool System ---
[OK] Tool Registry and QueryVaultTool verified.

--- 4. Testing Execution Engine Context Propagation ---
[OK] Step 1 (Query Vault) produced context.
[OK] Step 2 (STRIKER Agent) consumed retrievedContext.

--- ALL PHASE 13 INTEGRATION TESTS PASSED ---
```

## Architectural Impact
*   **Decoupling:** Agents are no longer simple hardcoded strings; they are structured entities with defined boundaries.
*   **Extensibility:** The [CortextService](file:///d:/AIOCRM/backend/cortext_service.py#7-39) hybrid strategy allows us to swap in local vector databases (like LanceDB) with zero changes to the [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#244-419).
*   **Consistency:** Every run now carries its own ephemeral "knowledge pouch," ensuring that data retrieved from the Brain is available to the entire multi-step agent chain.
