# AIO Cortext + AIO Agents Review

## 1. What Exists
**AIO Cortext (Brain Module)**
*   **Frontend UI:** [frontend/src/modules/Brain/index.jsx](file:///d:/AIOCRM/frontend/src/modules/Brain/index.jsx) (Vault/Neural Engine views), [BrainGraphPanel.jsx](file:///d:/AIOCRM/frontend/src/modules/Brain/BrainGraphPanel.jsx), [TabbedBrainFormModal.jsx](file:///d:/AIOCRM/frontend/src/modules/Brain/TabbedBrainFormModal.jsx)
*   **Frontend API Layer:** [frontend/src/services/backendApi.js](file:///d:/AIOCRM/frontend/src/services/backendApi.js) (Routes like [getBrainOverviewApi](file:///d:/AIOCRM/frontend/src/services/backendApi.js#359-363), [createBrainIngestApi](file:///d:/AIOCRM/frontend/src/services/backendApi.js#459-466))
*   **Backend Endpoints:** [backend/server.py](file:///d:/AIOCRM/backend/server.py) provides REST wrappers (`/api/brain/overview`, `/api/brain/ingests`, `/api/brain/search`, etc.)
*   **Storage Model:** [backend/data_provider.py](file:///d:/AIOCRM/backend/data_provider.py) implements pure SQLite schema storage (`brain_profiles`, [brain_sources](file:///d:/AIOCRM/backend/server.py#1461-1465), [brain_items](file:///d:/AIOCRM/backend/server.py#1512-1516), [brain_links](file:///d:/AIOCRM/backend/data_provider.py#294-297), [brain_ingests](file:///d:/AIOCRM/backend/server.py#1568-1572)).

**AIO Agents**
*   **Frontend UI:** [frontend/src/modules/Agents/index.jsx](file:///d:/AIOCRM/frontend/src/modules/Agents/index.jsx) (Command Center UX)
*   **Frontend Agent Knowledge:** [frontend/src/modules/Agents/data/agentRegistry.js](file:///d:/AIOCRM/frontend/src/modules/Agents/data/agentRegistry.js) defines `SPECIALIST_REGISTRY` containing static UI capabilities, tools, rank, and subordinate arrays.
*   **Agent Runtime Scaffolding:** [backend/agent_runtime.py](file:///d:/AIOCRM/backend/agent_runtime.py) isolates a [BaseAgent](file:///d:/AIOCRM/backend/agent_runtime.py#1-4) abstraction and an [AgentRegistry](file:///d:/AIOCRM/backend/agent_runtime.py#11-24) mapping class (e.g., `"AGT-CMD-001": "ALPHA"`). Currently holds mocked `NotImplementedError` abstractions for Alpha, Charlie, Echo.
*   **Orchestration Connection:** [backend/orchestration.py](file:///d:/AIOCRM/backend/orchestration.py) ([ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#233-403), [StepExecutor](file:///d:/AIOCRM/backend/orchestration.py#144-232)) processes text logic strings ([parse_command()](file:///d:/AIOCRM/backend/ai_service.py#1000-1064)).

## 2. What Cortext Currently Does Well
*   **Comprehensive Media Types:** Its ingest architecture recognizes specific category buckets natively (DOC, DIG, DAT, TTV, HLP) offering strong UX alignment for varied media assets.
*   **Relational Storage Backbone:** Pushing [brain_sources](file:///d:/AIOCRM/backend/server.py#1461-1465) and [brain_items](file:///d:/AIOCRM/backend/server.py#1512-1516) directly into the [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py) standardizes tenant-isolated persistent memory sharing with zero external dependencies out of the box.

## 3. What Agents Currently Does Well
*   **Visual Hierarchy:** The Agent UI enforces beautiful UX structures mapping commanders (ALPHA) to subordinates (CHARLIE, STRIKER, etc.), providing clear structural framing for the user.
*   **Execution Isolation:** Thanks to the Phase 12 Execution Engine updates, the execution traces and approval blockers operate extremely reliably on the backend decoupled from the specific logic loops.

## 4. Structural Concerns
*   **Missing Vector/Semantic Retrieval:** Cortext is currently effectively a CRUD SQLite document bin. There is no vector database, no embedding indexing pipeline, and no semantic search. `provider.search_brain_memory` resolves purely to SQL text `LIKE` queries.
*   **No Real RAG Pipeline:** Despite housing an interface called "Neural Engine", there are no abstractions for chunking documents, retrieving top-k embeddings, or injecting Vault context natively into LLM prompts. 
*   **Frontend-Heavy Agent Truth:** `SPECIALIST_REGISTRY` inside the frontend defines what tools STRIKER has, but the backend [agent_runtime.py](file:///d:/AIOCRM/backend/agent_runtime.py) is entirely unaware of these definitions. The frontend registry is improperly acting as the source of truth for execution capabilities.
*   **Empty Runtime Scaffolding:** [agent_runtime.py](file:///d:/AIOCRM/backend/agent_runtime.py) abstractions ([AlphaAgent](file:///d:/AIOCRM/backend/agent_runtime.py#26-29), [CharlieAgent](file:///d:/AIOCRM/backend/agent_runtime.py#30-33), [EchoAgent](file:///d:/AIOCRM/backend/agent_runtime.py#34-37)) currently just raise `NotImplementedError`. Real execution is largely statically governed by legacy intent routing ([draft_email](file:///d:/AIOCRM/backend/orchestration.py#200-208), etc) inside [StepExecutor](file:///d:/AIOCRM/backend/orchestration.py#144-232).

## 5. Integration Assessment
*   The Cortext boundary and Agents boundary are currently disjointed.
*   Cortext successfully stores data for the user UI, but the Agent [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#233-403) logic does not actively interface with or query Cortext memory mid-execution autonomously. 
*   Agents execute isolated orchestration steps. Aside from explicit `<read_context>` intents parsing immediate thread context, there is no generalized abstraction allowing agents to synthesize historical "Vault" intel directly.

## 6. Risk Levels
*   **Blocking:** Zero autonomous integration connecting Agents to the Cortext RAG memory pool.
*   **High:** Agent definitions live entirely on the UI (Frontend registry). Disconnected from backend limits actual scaling of dynamically built agents.
*   **Medium:** Cortext relies purely on standard SQLite string matching. Scaling real NLP pipelines against standard `LIKE` operators will quickly degrade performance and relevancy.
*   **Low:** `ai_audit_logs` and `trace_json` map accurately, meaning execution safety is tightly captured despite the abstractions missing.

## 7. Recommended Next Moves

**Preserve:**
*   The SQLite `brain_*` schema in [data_provider.py](file:///d:/AIOCRM/backend/data_provider.py) as a metadata wrapper for references.
*   The Agent UI / Cortext UI layouts and existing frontend/backend API contracts.
*   The [ExecutionEngine](file:///d:/AIOCRM/backend/orchestration.py#233-403) strict approval gating and telemetry output patterns.

**Refactor:**
*   Migrate the complete `SPECIALIST_REGISTRY` out of the frontend and build an authoritative dynamic Backend Agent Schema API determining tools, prompts, and capability tiers.

**Harden:**
*   Replace `.get("agent_role")` weak fallbacks in the orchestration payload parser with structured intent assignments explicitly requested against the authoritative Backend agent registry.

**Extend:**
*   Implement formal Vector Embeddings (via local LanceDB or SQLite VSS) within Cortext.
*   Write an exact generalized `<query_vault>` or embedded RAG capability mapping inside [AgentRegistry](file:///d:/AIOCRM/backend/agent_runtime.py#11-24) allowing [StepExecutor](file:///d:/AIOCRM/backend/orchestration.py#144-232) to pull relevant embeddings into `agent.execute` kwargs.

## 8. Final Verdict
**Is AIO Cortext already a real intelligence layer?**
No. It is currently a well-structured document manifest and file vault with standard database lookup. True semantic indexing, autonomous embedding chunking, and reasoning layers do not exist yet.

**Is AIO Agents already a real agent framework/runtime?**
No. It is an extremely well-orchestrated static execution router. The frontend UI simulates independent capabilities, but the backend [AgentRegistry](file:///d:/AIOCRM/backend/agent_runtime.py#11-24) is just syntactic scaffolding resolving commands via legacy hardcoded orchestration steps.

**What maturity level are they at?**
They are at the "Advanced Scaffolding" stage. The UI is fully polished, the database structs exist, and the execution engine successfully manages state gating natively—but the core intelligence abstractions (Embedding pipelines + Dynamic Backend Agent Prompts & Tools) are fundamentally missing.

**What should be done next?**
Phase 13 must focus strictly on:
1. Migrating the Frontend Agent capability definitions into a concrete Backend system.
2. Replacing raw SQL text matching inside Cortext with a functional Vector storage primitive or semantic mapping pipeline.
3. Enabling specific agents (like BRAVO / ALPHA) to autonomously trigger Vault RAG retrievals against Cortext directly during execution generation.
