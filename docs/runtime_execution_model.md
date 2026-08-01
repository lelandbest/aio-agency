# AIO CRM — Runtime Execution Model

> All claims in this document are verifiable against the source files listed.  
> Where behavior cannot be confirmed, the literal text **UNKNOWN** is used.  
> No speculation. No suggestions. No redesign.

---

## 1. System Execution Overview

### Server Startup (`backend/server.py` L1334–L1355)

1. `uvicorn` starts; Python module-level code executes first.
2. `load_dotenv()` is called at L148 — environment variables are loaded from `.env`.
3. Two module-level singletons are created at L153–L154:
   - `provider = create_provider()` — instantiates `SQLiteProvider` pointing to `aio_crm.db`.
   - `auth_store = AuthStore(default_auth_db_path())` — points to `aio_crm.db` (same path unless `AUTH_DB_PATH` is overridden).
4. `VISIBLE_AGENT_KEYS` is built at L158 by filtering `AGENT_DEFINITIONS` for non-hidden agents.
5. `FastAPI(lifespan=lifespan)` is constructed at L1350.
6. Inside the `@asynccontextmanager lifespan` (L1335–L1348):
   - Logs startup environment and provider health.
   - Calls `asyncio.create_task(run_resume_worker(provider))` — starts the background polling loop.
7. CORSMiddleware is applied as the outermost layer (L2698). It processes before all custom HTTP middleware.
8. Three custom HTTP middlewares are registered (inner-to-outer execution order):
   - `enforce_camelcase_response` (L2664) — converts snake_case response keys to camelCase for all `/api` responses.
   - `enforce_camelcase_request` (L2637) — blocks snake_case request body keys on 8 protected prefixes.
   - `inject_tenant_context` (L2578) — authenticates token, resolves tenant, sets capabilities.

---

## 2. Runtime Execution Flow

### 2a. UI Event → API Request Chain

**Step 1: UI Component Action**
- A React component (e.g., in `frontend/src/modules/Flows/FlowBuilder.jsx`) calls a domain service method.
- Direct calls to `backendApi.js` from UI components are prohibited by ESLint rules. All calls go through `frontend/src/services/*.service.js`.

**Step 2: Domain Service → HTTP Request**
- The domain service (`FlowsService`, `AiService`, etc.) calls `backendApi.js` which wraps `fetch()`.
- All request payloads must use camelCase keys. The service layer is responsible for this enforcement.

**Step 3: Middleware Stack (per-request)**
When an HTTP request arrives, middleware executes in this order:
1. **CORS** — handles OPTIONS preflights, adds CORS headers.
2. **`enforce_camelcase_request`** (L2637): If path starts with one of the 8 protected prefixes AND method is POST/PUT/PATCH:
   - Reads body bytes.
   - Calls `detect_snake_case_keys(data)` from `request_validators.py`.
   - Returns `HTTP 400` `{"error": "invalidPayload"}` if violations found.
   - Otherwise passes through.
3. **`inject_tenant_context`** (L2578):
   - Calls `extract_session_token(request)` — reads `X-Session-Token` header or `token` query param.
   - Calls `auth_store.get_session(token)` — queries `app_sessions` table in `aio_auth.db`.
   - Sets `request.state.session`, `request.state.tenant_id`, `request.state.capabilities`.
   - If no session on a protected route → returns `HTTP 401`.
   - If session has no active tenant on non-exempt routes → returns `HTTP 403`.
   - If user is non-operator with `client.access` capability on restricted endpoint → returns `HTTP 403`.
   - Calls `set_request_tenant_id(tenant_id)` — sets a thread-local (contextvars token) for the SQLite provider to scope queries.
4. Route handler executes.
5. **`enforce_camelcase_response`** (L2664): After handler returns, converts all snake_case keys in JSON response body to camelCase. Applied to all `/api` routes. Does NOT apply to `StreamingResponse` or `FileResponse`.

---

### 2b. AI Command Execution Chain (`POST /api/ai/command`)

The command endpoint is the primary AI entry point. Based on examining `server.py` L724–L744:

**Step 1: Routing Resolution**
`resolve_ai_run_routing()` is called with `module`, `surface`, `field`, `intent`, `command_text`, `context`:
1. Calls `extract_requested_agent()` — checks `context.requested_agent` first, then scans `command_text` for agent name keywords using regex `\b{AGENT_KEY}\b`.
2. Calls `choose_specialist_for_command()` (L660–L721) — keyword-match on concatenated haystack of module, field, surface, command_text, and context fields against hardcoded term lists per specialist:
   - `comms` module + `summary/brief` field → `CHARLIE`
   - `comms` module + `draft-reply` field → `STRIKER`
   - `email/newsletter/campaign` terms → `ECHO`
   - `proposal/deal/sales` terms → `STRIKER`
   - `strategy/swot/market` terms → `BRAVO`
   - `api/code/devops/engineering` terms → `GHOST`
   - Default fallback → `ALPHA`
3. Delegate chain is built: always `[CHARLIE, ALPHA]` + any explicitly requested agent + executing agent.

**Step 2: Brain Memory Query**
- `inject_brain_context()` (L579–L595) is called.
- Calls `collect_brain_memory_results()` which calls:
  - `provider.search_brain_memory(query, limit=5)` — queries `brain_items` table.
  - `search_brain_mcp_memory()` — queries up to 4 configured MCP sources at 3 results each.
- Results merged, deduped, sorted by score, capped at 5. Written into `context["brain_memory"]`.

**Step 3: Provider Config Resolution**
- `auth_store.get_default_ai_provider_config_for_tenant(tenant_id)` is called.
- Returns the row from `ai_provider_configs` where `is_default = true` AND `enabled = true`.
- If none found → the command fails with `"No AI provider configured"`.

**Step 4: AI Run Steps Built (for flow execution) or Single-Step (for direct command)**
For flow execution: `build_flow_execution_steps()` (L1070–L1159) generates steps from the flow graph.  
For direct command: a single step with intent `agent_task` and `assignedAgent` = resolved executing agent.

**Step 5: Engine Execution**
`ExecutionEngine(provider).run(raw_steps, mode, command, context, actor, tenant)` is called.

---

### 2c. Workflow Execution Chain

**Step 1: Flow Retrieval**
- Flow is loaded from the `flows` table by `provider.get_flow(flow_id)`.
- The flow record contains `nodes_json`, `edges_json`, `spec_json`.

**Step 2: Graph Extraction**
`extract_flow_graph(flow)` (L840–L846):
- Prefers `spec.nodes` / `spec.edges` over top-level `flow.nodes` / `flow.edges`.

**Step 3: Topological Ordering**
`order_flow_nodes(nodes, edges)` (L849–L880):
- Builds indegree and adjacency maps.
- BFS (Kahn's algorithm) from zero-indegree nodes.
- Nodes not reached by BFS are appended at end.

**Step 4: Step Generation**
`build_flow_execution_steps()` (L1070–L1159):
- Filters out `trigger`, `frame`, `note` type nodes.
- If `start_node_ids` provided, uses `reachable_flow_node_ids()` to limit to reachable set.
- For each remaining node:
  - Calls `infer_flow_step_intent(node)` — reads `config.actionType`, `config.logicType`, `data.templateId`, node `type` in priority order; returns matching intent string or `"agent_task"`.
  - Calls `infer_flow_step_agent(node)` — reads `data.assignedAgent`, `data.agent`, `data.agentKey`, `data.selectedAgent`, then regex-matches node id/type/label against agent names; defaults to `ALPHA`.
  - Builds step dict with `id`, `intent`, `parameters`, `assignedAgent`, `agentId`.

**Step 5: Preflight Validation**
`flow_preflight_validation()` (L1196–L1202):
- Calls `validate_flow_graph()` — checks: nodes exist, at least one trigger, all edges have valid source/target, all non-trigger nodes reachable from triggers.
- Calls `validate_prepared_flow_steps()` (from `orchestration.py`) — checks each step has `intent` and `id`.
- Returns blockers and warnings. Blockers halt execution.

---

### 2d. Agent Invocation Chain

For each step with intent `agent_task` (or any intent not in `DIRECT_EXECUTION_INTENTS`):

**Step 1: Step Entry in `ExecutionEngine.run()` loop (L5167–L5297)**
- Skips steps already `success` or `skipped`.
- Checks suppressed_nodes set — skips if suppressed (branch not taken).
- Checks `requiresApproval` flag — if true and status != `"approved"`, sets status to `awaiting_approval`, sets `run_state_status = "blocked"`, persists, and `break`s the loop.
- Sets `step["status"] = "executing"`, records `startedAt`.

**Step 2: `StepExecutor.execute(step, context, runtime)` (from `orchestration.py`)**
- Checks `step["intent"]` against the `self.executors` dict (L907–L945).
- For `agent_task` intent: routes to `AgentRegistry.execute()` via `BaseAgent.execute()`.
- For direct intents (e.g., `send_email`, `set_variable`, `http_request`): routes to the corresponding `_send_email()`, `_set_variable()`, `_http_request()` methods directly.

**Step 3: `BaseAgent.execute()` (L16–L90 in `agent_runtime.py`)**
1. Checks `sharedContext` in runtime, initializes if missing.
2. Evaluates `needs_more_context` — if command contains pricing/process/SOP/policy/history keywords AND `retrievedContext` is empty AND `_autonomous_retrievals < 2` → calls `cortex_service.retrieve_context(query)`, stores result in `runtime["retrievedContext"]`, appends trace entry.
3. Checks if agent is `ALPHA` with `delegation_depth < 3` → calls `_find_specialist_for_intent(intent)` → if specialist found and not self → calls `delegate_to_agent(specialist_name, step, runtime, context)`.
4. Calls `_select_tool()` — matches intent substring or command tokens against `definition.tools` list; defaults to `tools[0]`.
5. Calls `_execute_with_provider()`.

**Step 4: `BaseAgent._execute_with_provider()` (L252–L400)**
1. Gets `provider_config = runtime["providerConfig"]`.
2. Builds `completed_step_outputs` — list of `{step_index, agent, output}` for all prior successful steps.
3. Calls `_enforce_action_policy()` — calls `validate_agent_action(definition, *descriptors)` which checks against `definition.allowed_actions` and `definition.disallowed_actions` lists.
4. Calls `_build_prompt_contract()`.
5. Calls `ai_assist_service._provider_complete(provider_config, prompt, system_prompt=system_prompt)`.
6. If in `collab` mode and not ALPHA: strips imperative language prefixes from response, wraps in `[AGENT_NAME]\nRecommendation:\n- ...` format.

---

## 3. Data Flow Model

### Input Sources
- **User Input**: HTTP request body (camelCase JSON).
- **Session Token**: `X-Session-Token` header or `token` query param.
- **ReactFlow Canvas State**: JSON serialized in frontend, posted to `PUT /api/flows/{flow_id}`.
- **Voice Input (VTT)**: PCM audio → Vosk offline STT → transcript string → `POST /api/vtt/command`.
- **Form Submissions**: `POST /api/forms/{form_id}/submit` with camelCase field values.
- **Brain Ingest**: Text, URL fetch, or base64-encoded file posted to `POST /api/brain/ingests`.

### Transformation Steps
1. **Request Body**: Raw JSON → `detect_snake_case_keys()` check → route handler → Pydantic model parse.
2. **Flow Graph**: `nodes_json`/`edges_json` (DB strings) → `json.loads()` → `extract_flow_graph()` → `order_flow_nodes()` → `build_flow_execution_steps()` → list of step dicts.
3. **AI Prompt**: step dict + context dict + runtime dict → `_build_prompt_contract()` → two strings (`system_prompt`, `task_prompt`) → injected with guardrails from `provider_config` → sent to LLM.
4. **LLM Response**: Raw text → JSON strip (```json extraction) → `json.loads()` → `{suggestion, alternatives, rationale}` or `{suggestion: raw_text}` fallback.
5. **Response Body**: Handler dict → `enforce_camelcase_response` middleware → camelCase JSON → client.

### Persistence Layers
- **aio_auth.db**: Sessions, users, tenants, memberships, AI provider configs, routing configs, role definitions. Managed by `AuthStore`.
- **aio_crm.db**: Contacts, companies, flows, flow_drafts, form_submissions, contact_activities, `aiEngineRuns`, brain_items, brain_sources, brain_ingests, threads, messages, sms_threads, calendar_events. Managed by `SQLiteProvider` (`data_provider.py`).

### Retrieval Paths
- **Contact List**: `GET /api/contacts` → `provider.list_contacts(tenant_id, filters)` → SELECT from `contacts` WHERE `tenantId = ?` AND `deletedAt IS NULL`.
- **Flow**: `GET /api/flows/{flow_id}` → `provider.get_flow(flow_id)` → SELECT from `flows`.
- **AI Run**: `GET /api/ai/run/{run_id}` → `provider.get_ai_run(run_id)` → SELECT from `aiEngineRuns` → `project_engine_run_for_ui()` transforms before returning.
- **Brain Memory**: `provider.search_brain_memory(query, limit)` → full-text LIKE search on `brain_items.content` and `brain_items.title`.
- **Default AI Provider**: `auth_store.get_default_ai_provider_config_for_tenant(tenant_id)` → SELECT from `ai_provider_configs` WHERE `tenant_id = ?` AND `is_default = 1` AND `enabled = 1`.

### Flow State Propagation
- Run state is written to `aiEngineRuns` table after **every** step via `persist_runtime_state()`.
- The `run_vars` dict is carried in `runtime["run_vars"]` in-memory. Written to `context_json` column at each persist.
- Branch decisions written to `runtime["branch_decisions"]`. Suppressed node IDs written to `runtime["suppressed_nodes"]` (a Python set).
- Step outputs available to downstream steps via `runtime["steps"]` list (prior completed steps with their `data` field).

---

## 4. AI / Agent System

### Prompt Construction (`agent_runtime.py` L142–L250)

Every agent task execution calls `_build_prompt_contract()` which assembles two strings:

**System Prompt** (concatenated in order):
1. `definition.system_prompt` — the agent's base character description.
2. If `context["interaction_mode"] == "collab"` AND agent is not ALPHA: COLLAB CONSULT MODE instruction block (read-only advisory only).
3. If `context["surface"] == "vtt"`: BOARDROOM OPERATIONS MODE instruction block (5-mode classification: COMMAND/ASSIST/CONFIRMATION/RESULT/CLARIFICATION; max 1–3 sentences).
4. `"SYSTEM:"` + `json.dumps(system_section)` — contains `role`, `objective`, `constraints`, `allowed_actions`, `disallowed_actions`, `response_contract`, `personality`.
5. `"EXECUTION POLICY:"` + `json.dumps(execution_policy_section)`.

**Task Prompt** (concatenated in order):
1. `"CONTEXT:"` + `json.dumps(context_section)` — contains `brain` (brain memory results), `flow_context` (flow metadata + completed_step_outputs + shared_plan), `comms_context` (if comms module active).
2. `"TASK:"` + `json.dumps(task_section)` — contains `user_intent`, `required_output`, `operator_command`, `selected_tool`.
3. Three output requirement rules.

**Guardrail Injection** (`ai_service.py` L1253–L1261): `_provider_complete()` prepends `system_guardrails` from `provider_config` to the system_prompt and appends `task_guardrails` to the task prompt before dispatch.

### Context Assembly
- `brain_memory`: retrieved via `collect_brain_memory_results(query, limit=5)` — merged from SQLite FTS search + live MCP queries.
- `flow_context.completed_step_outputs`: built in `_execute_with_provider()` L272–L296 — iterates `runtime["steps"]`, extracts text from `data.message/suggestion/content/result` of prior `success` steps only.
- `comms_context`: assembled if `context["thread_id"]` or `context["module"] == "comms"` — includes `thread_id`, `subject`, `assignee`, `contact_name`, `company_name`, `latest_message`.
- `sharedContext.plan`: list of intents from all steps in the run.

### Model Selection (`ai_service.py` L1237–L1347)
`_provider_complete()` reads `provider_config["providerKey"]` and dispatches:
- `"ollama"` → `_complete_ollama()` → `POST {base_url}/api/generate` with `{model, prompt, system, stream: false, options.temperature}`.
- `"openai"`, `"openrouter"`, `"perplexity"` → `_complete_openai_compat()` → `POST {base_url}/v1/chat/completions` with messages array `[{role: system}, {role: user}]`.
  - OpenRouter additionally sets `HTTP-Referer` and `X-Title` headers.
- `"anthropic"` → `_complete_anthropic()` → `POST {base_url}/v1/messages` with `anthropic-version: 2023-06-01` header; max_tokens: 2048.
- `"google-ai"` → `_complete_google_ai()` → `POST {base_url}/v1beta/models/{model}:generateContent?key={api_key}` with `systemInstruction` payload.
- Any other key → raises `ValueError("Unsupported AI provider type: ...")`.

The provider config is sourced from `ai_provider_configs` table (`is_default=1, enabled=1`) for the current tenant. The `ai_routing_configs` table supports intent-level routing overrides (UNKNOWN: exact resolution path for routing override config not traced to a called function in this analysis).

### Tool Output Handling
- The LLM response text is stripped of markdown code fences (```json).
- Parsed as JSON. If it has a `suggestion` key → returned as-is.
- If JSON parse fails → returned as `{suggestion: raw_text}`.
- The `suggestion` field is the primary output used downstream.

### Memory Systems
- **Brain (Cortex)**: `brain_items` table in `aio_crm.db`. FTS LIKE search on title + content. Chunks stored at ingest time via `POST /api/brain/ingests`. Retrieval at prompt time via `provider.search_brain_memory()`.
- **MCP**: External HTTP endpoints configured in `brain_sources` table (sourceType = "mcp"). Queried at runtime via `search_brain_mcp_memory()` → `request_brain_mcp()`.
- **Run Variables**: In-memory `runtime["run_vars"]` dict. Persisted in `context_json` column of `aiEngineRuns`. Populated by `set_variable` intent execution.
- **Step Outputs**: Available to downstream steps within the same run via `runtime["steps"]` list.

---

## 5. Workflow Execution Engine

### How Workflows Are Defined
- Stored in `flows` table: `nodes_json`, `edges_json`, `spec_json`.
- `spec_json` (preferred): a JSON object with `nodes` and `edges` arrays conforming to `flowSpec.schema.json`.
- `nodes_json` / `edges_json`: flat arrays used as fallback if `spec_json` is missing.
- Node structure: `{id, type, data: {label, description, assignedAgent, templateId, config: {actionType, logicType, inputs, outputs, configuration}}}`.
- Edge structure: `{id, source, target, sourceHandle, targetHandle, data: {filters}}`.

### Node Execution

The `self.executors` dict in `StepExecutor.__init__()` maps each intent string to a method:

| Intent | Method | Classification |
|:---|:---|:---|
| `agent_task` | `AgentRegistry → BaseAgent.execute()` | LLM call |
| `set_variable` | `_set_variable()` | Deterministic |
| `send_email` | `_send_email()` | Deterministic |
| `send_sms` | `_send_sms()` | Deterministic |
| `http_request` | `_http_request()` | Bridge/adapter |
| `if_then` | `_if_then()` | Deterministic |
| `filter` | `_filter()` | Deterministic |
| `switch` | `_switch()` | Deterministic |
| `time_delay` | `_time_delay()` | Deterministic (schedules pause) |
| `create_booking` | `_create_booking()` | Deterministic |
| `verify_email` | `_verify_email()` | Deterministic |
| `generate_script` | `_generate_script()` | Bridge/adapter |
| `generate_video` | `_generate_video()` | Bridge/adapter |
| `INPUT_REQUIRED` | `_input_required()` | Pauses run |

### Edge Control
- Edges are pre-processed into `outgoing_by_node` and `incoming_by_node` dicts at step-build time.
- The `graph_adjacency` dict is populated from `outgoing_edges` in step parameters at runtime start.
- `suppressed_nodes` set is populated by branch logic (e.g., `if_then`, `switch`) — nodes on non-taken branches are suppressed and skipped.

### State Between Nodes
- `runtime["run_vars"]` — key-value dict. Written by `set_variable`, read by downstream steps via `dotted_get()`.
- `runtime["retrievedContext"]` — populated by `query_vault` steps; available to all downstream agent steps.
- `runtime["node_results"]` — UNKNOWN: not traced to explicit read logic in this analysis.
- Template tokens (`{{variable.path}}`) in node configurations are resolved by `dotted_get(runtime["run_vars"], path)`.

### Retry / Failure Behavior (`orchestration.py` L5230–L5295)
1. `StepExecutor.execute()` returns `{status: "error"}` or `{status: "failed"}`.
2. `classify_failure(step, error, runtime)` is called — categorizes into failure type.
3. `recovery_engine.attempt_recovery(step, failure, runtime, context)` is called — if `recoveryAttempted`, modifies `step` and retries once: `self.executor.execute(healing["updatedStep"], context, runtime)`.
4. After retry, step status is updated. `_recovery_success` flag set.
5. If still failed after recovery: `run_state_status = "failed"`. Loop breaks. Run persisted as `failed`.

### Execution Resumption
- A step with intent `time_delay` sets `step["status"] = "paused"` with `resume_at` timestamp.
- `run_state_status = "paused"`. Run persisted. Loop breaks.
- `INPUT_REQUIRED` intent sets step to paused similarly, waiting for form submission.
- **Background Worker** (`run_resume_worker`, L5490–L5498): runs every 5 seconds in an asyncio task started at server lifespan.
- `resume_due_ai_runs()` (L5421–L5487): calls `provider.claim_due_ai_runs(pause_reason="delay", limit=10, lock_seconds=60)` — atomically claims up to 10 runs where `resume_at <= NOW()` and `locked_until IS NULL or <= NOW()`, setting `locked_until = NOW() + 60s`.
- For each claimed run: creates new `ExecutionEngine`, calls `.run(raw_steps=[], mode="resume", run_id=run_state["id"])`.
- In resume mode: the engine loads the persisted steps from DB, advances to `next_node_id`, continues the loop.
- For approval-blocked runs: resumption is triggered by `PATCH` endpoint (UNKNOWN: exact endpoint for approval unblocking not traced in this session).

---

## 6. ReactFlow / AIOFlows System

### Node Types (`FlowBuilder.jsx`)
- `trigger` → `CustomNode.jsx`
- `action` → `CustomNode.jsx`
- `logic` → `CustomNode.jsx`
- `webhook` → `CustomNode.jsx`
- `socket` → `CustomNode.jsx`
- `frame` → `FrameNode.jsx` (uses NodeResizer; purely visual container)
- `note` → `NoteNode.jsx` (uses NodeResizer; purely visual annotation)

### Execution Binding
- `trigger`, `frame`, `note` nodes are excluded from execution steps (L1100–L1103 in `server.py`).
- Only `action`, `logic`, `webhook`, `socket` type nodes become executable steps.
- A node's intent is inferred from `config.actionType` → `config.logicType` → `data.templateId` → node `type` → default `"agent_task"`.
- A node's agent is inferred from `data.assignedAgent` → `data.agent` → `data.agentKey` → regex match on node id/type/label → default `ALPHA`.

### Serialization / Deserialization
- **Save**: `PUT /api/flows/{flow_id}` body must include `{nodes: [...], edges: [...], spec: {...}}` in camelCase. Backend stores as `nodes_json`, `edges_json`, `spec_json` (JSON strings).
- **Load**: `GET /api/flows/{flow_id}` returns flow row. Frontend parses `spec.nodes` / `spec.edges` for the canvas.
- `spec_json` takes priority over `nodes_json`/`edges_json` in all backend graph operations.

### UI → Backend Execution Mapping
- User presses "Run" in `FlowBuilderHeader.jsx` → `FlowsService.triggerFlow(flow_id, command_text)` → `POST /api/flows/{flow_id}/trigger/manual`.
- Backend handler: calls `build_flow_execution_steps(flow, command_text)` → `flow_preflight_validation()` → `ExecutionEngine.run(steps, mode="execute")`.
- AI Generator (`AiGeneratorModal.jsx`) → `POST /api/flow-drafts` → stores draft → frontend receives draft_id and loads the spec into the canvas.

---

## 7. Database Architecture

### Databases
- `backend/data/aio_crm.db` — CRM and workflow data (default; overridden by `SQLITE_DB_PATH`).
- `backend/data/aio_crm.db` — Also default for auth unless `AUTH_DB_PATH` is set separately.

### Key Tables (aio_crm.db, managed by `data_provider.py`)

| Table | Key Columns |
|:---|:---|
| `contacts` | id, tenantId, firstName, lastName, email, phone, company, companyId, pipelineStage, tagsJson, deletedAt |
| `companies` | id, tenantId, name, industry, size, website, owner |
| `tags` | id, tenantId, name, prefix, type, isLocked |
| `flows` | id, tenantId, name, status, nodesJson, edgesJson, specJson, lastTriggeredAt |
| `flow_drafts` | id, tenantId, name, specJson |
| `aiEngineRuns` | id, tenantId, command, mode, status, stepsJson, artifactsJson, routingJson, traceJson, contextJson, pauseReason, resumeAt, lockedUntil, nextNodeId, currentNodeId, lastError |
| `form_submissions` | id, tenantId, formId, contactId, submissionJson, createdContact |
| `contact_activities` | id, tenantId, contactId, activityType, title, metadataJson |
| `brain_items` | id, tenantId, title, category, content, sourceId, status, tags |
| `brain_sources` | id, tenantId, label, sourceType, status, location |
| `brain_ingests` | id, tenantId, sourceId, ingestType, status, contentExcerpt, chunkCount |

### Key Tables (aio_auth.db, managed by `auth_store.py`)

| Table | Key Columns |
|:---|:---|
| `tenants` | id, name, slug, domain, tenantSettings (JSON) |
| `app_users` | id, email, username, displayName, role |
| `app_sessions` | id, userId, token, currentTenantId, expiresAt, lastSeenAt |
| `memberships` | id, userId, tenantId, role |
| `role_definitions` | id, tenantId, name, capabilitiesJson |
| `role_assignments` | id, tenantId, roleId, principalType, principalId |
| `ai_provider_configs` | id, tenantId, providerKey, baseUrl, apiKey, model, temperature, systemGuardrails, taskGuardrails, isDefault, enabled |
| `ai_routing_configs` | id, tenantId, intent, providerConfigId, fallbackProviderConfigId, rulesJson |

### Read/Write Flow
- **Tenant Scoping**: `set_request_tenant_id(tenant_id)` writes to a `contextvars.ContextVar`. `SQLiteProvider` reads this var on every query to inject `WHERE tenantId = ?`.
- **Connections**: SQLite connections are opened per-operation (not pooled). `sqlite3.connect(db_path, check_same_thread=False)`.
- **Migrations**: `_ensure_column()` and `_rename_column()` helpers called at provider init; they run `ALTER TABLE ADD COLUMN` if column doesn't exist.
- **Runs**: `save_ai_run()` → INSERT into `aiEngineRuns`. `update_ai_run()` → UPDATE by id. `claim_due_ai_runs()` → atomic UPDATE + SELECT using SQLite serialized writes.

---

## 8. Extension Points

### New Agents
- **File**: `backend/agent_definitions.py`
- **Action**: Add a new entry to the `AGENT_DEFINITIONS` dict (a `AgentDefinition` dataclass with `name`, `agent_id`, `role`, `specialization`, `allowed_actions`, `disallowed_actions`, `tools`, `system_prompt`, `personality`, `response_contract`, `execution_policy`, `visibility`, `rank`, `capability_tier`, `subordinates`).
- **Side Effect Required**: Update `choose_specialist_for_command()` in `server.py` L660–L721 to include keyword routing rules for the new agent.

### New Workflow Nodes (Intents)
- **File 1**: `backend/orchestration.py` — `StepExecutor.__init__()` `self.executors` dict (L907–L945). Add `"new_intent": self._new_handler` and implement `_new_handler(self, step, context, runtime)`.
- **File 2**: `backend/server.py` — `infer_flow_step_intent()` (L926–L955). Add the new intent string to the checked `action_type` or `template_id` sets.
- **File 3**: `frontend/src/modules/Flows/data/nodeLibrary.js` — Add node definition to the library for UI drag-and-drop panel.
- **File 4** (optional): `backend/orchestration.py` — `DIRECT_EXECUTION_INTENTS` set (L60–L96). Add the intent if it should bypass the `agent_task` LLM path.

### New API Endpoints
- **File**: `backend/server.py`
- **Action**: Add `@app.get/post/put/patch/delete("/api/new-route")` decorator with handler function after L2700.
- **Constraint**: The new route must use `require_session(request)` for auth and `set_request_tenant_id` must already be active (it is, via middleware).

### New AI Providers
- **File 1**: `backend/ai_service.py` — `get_ai_provider_catalog()` (L135–L226). Add provider dict.
- **File 2**: `backend/ai_service.py` — `_provider_complete()` (L1294–L1330). Add `elif provider_key == "new_key"` branch calling a new `_complete_new_provider()` method.
- **File 3**: `frontend/src/modules/Integrations/utils/integrationConfigs.js` — Add provider to the `LLMS` category in `integrationConfigs` object.

---

## 9. Hard Constraints

### Must NOT Be Modified Without Full Impact Analysis

1. **`backend/server.py` L2578–L2621 (`inject_tenant_context`)**: All authentication, session validation, and `set_request_tenant_id()` is here. Breaking this breaks all tenant isolation for every route.

2. **`backend/server.py` L2637–L2661 (`enforce_camelcase_request`)**: The 8 protected prefixes are hardcoded here. Adding/removing paths changes which endpoints are snake_case-guarded. Removing the middleware breaks the API contract enforced at the ESLint level.

3. **`backend/data_provider.py` `set_request_tenant_id()` / `get_request_tenant_id()`**: These use Python `contextvars.ContextVar`. Any async context switch that doesn't preserve this token will silently return data for the wrong tenant.

4. **`backend/orchestration.py` L5141–L5163 (`persist_runtime_state`)**: Called after every step. Removing or modifying this breaks run recovery, audit logs, and resume logic.

5. **`backend/orchestration.py` L5421–L5487 (`resume_due_ai_runs`)**: The atomic claim query using `locked_until` prevents double-execution of paused runs. Modifying the lock logic can cause two workers to execute the same run simultaneously.

6. **`backend/agent_runtime.py` `_build_prompt_contract()`**: The exact JSON structure of `system_section`, `context_section`, and `task_section` is what all agents receive. Structural changes here affect every agent's behavior unpredictably.

7. **`backend/ai_service.py` L1253–L1261 (guardrail injection)**: The `system_guardrails` and `task_guardrails` from `provider_config` are injected here for ALL providers. Removing this block removes user-configured guardrails silently.

8. **`backend/auth_store.py` session token handling**: Session tokens are `secrets.token_urlsafe(32)`. Changing the token generation or lookup breaks all active sessions.

9. **`AGENT_DEFINITIONS` dict key names in `agent_definitions.py`**: Agent keys (`ALPHA`, `BRAVO`, etc.) are referenced by string throughout `server.py`, `orchestration.py`, and `agent_runtime.py`. Renaming a key requires coordinated update in all three files.

10. **`backend/server.py` `extract_flow_graph()` / `order_flow_nodes()` / `infer_flow_step_intent()`**: These are the exact functions that convert a saved ReactFlow JSON into an executable step list. Modifying them changes what executes for every flow.

---

## 10. Integration Points (External Coding Engine)

These are the exact locations where a future AI coding system can plug in, identified from the codebase structure.

### Prompt Generation
- **Location**: `backend/agent_runtime.py` `_build_prompt_contract()` (L142–L250).
- The external system can replace or extend `_build_prompt_contract()` to inject code-specific context (repo files, diffs, test outputs) into the `context_section`.

### Context Assembly
- **Location**: `backend/server.py` `inject_brain_context()` (L579–L595).
- MCP Brain sources (sourceType `"mcp"`) query arbitrary HTTP endpoints at prompt time. An external coding engine can expose an MCP-compatible HTTP endpoint and register it as a Brain source — its results will automatically be included in every AI agent's prompt context.

### Execution Sandbox
- **Location**: `backend/orchestration.py` `StepExecutor.executors` dict (L907–L945).
- A new intent (e.g., `run_code`) can be registered here. The corresponding handler can call an external sandboxed code execution service.

### Validation / Testing Hooks
- **Location**: `backend/server.py` `flow_preflight_validation()` (L1196–L1202) and `validate_prepared_flow_steps()` in `orchestration.py`.
- These are called before every flow execution. Extending them can add static analysis or test-run validation before a live execution begins.

### Git / Worktree Execution
- **Location**: `backend/orchestration.py` `StepExecutor._http_request()`.
- The `http_request` intent already supports arbitrary HTTP POST/GET to external services. A git/worktree execution service can be called via an `http_request` node in a flow.

### Rollback Mechanisms
- **Location**: `backend/orchestration.py` `resume_due_ai_runs()` (L5421–L5487).
- The run's `contextJson` column (in `aiEngineRuns`) stores the full serialized `context` dict at each step. A rollback mechanism can read this, restore `run_vars` to a prior checkpoint, and re-run from a specific node.

---

## 11. Minimal System Model

### 5 Core Components

| # | Component | File(s) | Role |
|:---|:---|:---|:---|
| 1 | **FastAPI Gateway** | `backend/server.py` | HTTP routing, auth middleware, camelCase enforcement, flow graph compilation |
| 2 | **ExecutionEngine** | `backend/orchestration.py` | Workflow step ordering, approval gates, step dispatch, state persistence, background resume |
| 3 | **AgentRuntime** | `backend/agent_runtime.py` + `backend/agent_definitions.py` | Prompt construction, tool selection, delegation, policy enforcement |
| 4 | **AIAssistService** | `backend/ai_service.py` | LLM provider routing (Ollama/OpenAI/Anthropic/Google/Perplexity), guardrail injection, response normalization |
| 5 | **SQLiteProvider + AuthStore** | `backend/data_provider.py` + `backend/auth_store.py` | Tenant-scoped CRM data, session state, AI provider configs, run state persistence |

---

### Execution Flow Diagram

```
User Action in React UI
        │
        ▼
Domain Service (services/*.service.js)
        │ camelCase HTTP Request
        ▼
FastAPI Server (server.py)
 ├─ CORS Middleware
 ├─ enforce_camelcase_request   ──→ 400 if snake_case keys found
 └─ inject_tenant_context       ──→ 401/403 if auth fails
                                     │ set_request_tenant_id()
                                     ▼
                              Route Handler
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
               AI Command                       Flow Trigger
                    │                                 │
                    ▼                                 ▼
         resolve_ai_run_routing()        build_flow_execution_steps()
         inject_brain_context()          order_flow_nodes() [Kahn's]
                    │                                 │
                    └────────────┬────────────────────┘
                                 │
                                 ▼
                      ExecutionEngine.run()
                                 │
                        For each step:
                  ┌──────────────┴──────────────┐
                  │                              │
            DIRECT_INTENT             agent_task intent
                  │                              │
         StepExecutor._xxx()          BaseAgent.execute()
                  │                              │
         (deterministic action)    _build_prompt_contract()
                  │                              │
                  │              ai_assist_service._provider_complete()
                  │                              │
                  │              ┌───────────────┼───────────────┐
                  │         _complete_      _complete_openai_   _complete_
                  │           ollama()        compat()          anthropic() /
                  │                                            google_ai()
                  └──────────────┬──────────────┘
                                 │
                    persist_runtime_state() → aiEngineRuns table
                                 │
                    Response → enforce_camelcase_response → Client
```

---

### Data Flow Diagram

```
Brain Sources (MCP / SQLite FTS)
        │ search_brain_memory()
        │ search_brain_mcp_memory()
        ▼
  brain_memory[] ──────────────────────────────────────┐
                                                        │
ReactFlow JSON (canvas)                                 │
        │ PUT /api/flows/{id}                           │
        ▼                                               │
  flows table (nodes_json, edges_json, spec_json)       │
        │ extract_flow_graph()                          │
        │ order_flow_nodes()                            │
        │ build_flow_execution_steps()                  │
        ▼                                               │
  steps[] ──────────────────────────────────────────────┤
                                                        │
ai_provider_configs table                               │
        │ get_default_ai_provider_config()              │
        ▼                                               │
  provider_config ─────────────────────────────────────►│
                                                        │
                                              _build_prompt_contract()
                                                        │
                                              ┌─────────┴─────────┐
                                         system_prompt        task_prompt
                                              └─────────┬─────────┘
                                                        │
                                               LLM API Call
                                                        │
                                               raw_text response
                                                        │
                                               JSON parse / fallback
                                                        │
                                            {suggestion, alternatives}
                                                        │
                                            step["data"] = result
                                                        │
                                         persist_runtime_state()
                                                        │
                                            aiEngineRuns table
                                                        │
                                          GET /api/ai/run/{id}
                                                        │
                                        project_engine_run_for_ui()
                                                        │
                                          camelCase JSON → Client
```
