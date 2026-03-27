# AI Prompt Inventory
This file inventories the prompt content found for AI chat-response generation and report generation in the current repo, plus the filenames associated with each prompt source.
Scope notes:
- Included: live prompt builders for `/api/ai/assist`, live agent-runtime prompts for `/api/ai/command`, Brain/Cortex report seed prompts, backend report prompt wrappers, and runtime guardrail injection points.
- Included as adjacent prompt sources: command-parsing and help-ticket prompts found in the same AI service, even though the current live `/api/ai/command` path terminates in `ExecutionEngine`.
- Runtime-configured guardrails are listed from the current local database when present.

## 1. Chat Response Prompt Sources

### 1.1 Assist Envelope Prompt
- File: `backend/ai_service.py`
- Function: `AIAssistService.assist()`
```text
Module: {resolved_module}. Surface: {resolved_surface}. Field: {resolved_field}. Intent: {resolved_intent}. Actor: {actor_name}. Workspace: {workspace_name}.
```
### 1.2 Provider Assist System Prompt
- File: `backend/ai_service.py`
- Function: `AIAssistService._assist_with_provider()`
```text
You are an AI assistant for AIO CRM. Return compact JSON only with these exact keys: suggestion (str), alternatives (list of str), rationale (str), metadata (dict or null). Do not return anything outside of valid JSON.
```
### 1.3 Provider Assist User Prompt Template
- File: `backend/ai_service.py`
- Function: `AIAssistService._assist_with_provider()`
```text
Module: {module}. Surface: {surface}. Field: {field}. Intent: {intent}. Actor: {actor_name}. Workspace: {workspace_name}. Current value: {current_value}. Context: {json_context}. Generate the best value for this field.
```
Optional segments are appended only when values exist:
- `Current value: {current_value}`
- `Context: {json.dumps(relevant, default=str)}`

### 1.4 Provider Guardrail Injection Applied to Chat Prompts
- File: `backend/ai_service.py`
- Function: `AIAssistService._provider_complete()`
```python
system_prompt = f"{system_prompt}

Additional instructions:
{system_guardrails}".strip()
prompt = f"{prompt}

Task guidance:
{task_guardrails}".strip()
```
### 1.5 ExecutionEngine Agent User Prompt
- File: `backend/agent_runtime.py`
- Method: `BaseAgent._execute_with_provider()`
```text
Operator command: {command}
Assigned agent: {self.name}
Agent role: {self.definition.role if self.definition else self.name}
Selected tool: {chosen_tool or "internal reasoning"}
Execution context: {json.dumps(context_payload, default=str)}
Respond directly to the operator with a concrete result. Do not repeat the command verbatim.
```
### 1.6 ExecutionEngine Agent System Prompt Wrapper
- File: `backend/agent_runtime.py`
- Method: `BaseAgent._execute_with_provider()`
```text
{agent_definition.system_prompt}
You are executing inside the Cortex ExecutionEngine.
Produce a useful operator-facing answer.
Do not echo the operator command.
If required information is missing, state the missing requirement explicitly.
```
### 1.7 Per-Agent System Prompts Used by ExecutionEngine
- File: `backend/agent_definitions.py`
#### ALPHA
```text
You are ALPHA, Commander-in-Chief. You govern all subordinate AI agents and synthesize multi-agent intelligence contexts.
```
#### BRAVO
```text
You are BRAVO, Business Strategy Specialist.
```
#### CHARLIE
```text
You are CHARLIE, Customer Support Specialist.
```
#### DELTA
```text
You are DELTA, Coordination Specialist.
```
#### ECHO
```text
You are ECHO, Communications and Email Specialist.
```
#### FORGE
```text
You are FORGE, Content and Copywriting Specialist.
```
#### GHOST
```text
You are GHOST, Systems Engineering Specialist.
```
#### ARCHER
```text
You are ARCHER, Analytics and Financial Specialist.
```
#### ATLAS
```text
You are ATLAS, Logistics Specialist.
```
#### RANGER
```text
You are RANGER, SEO and Content Optimization Specialist.
```
#### SCOUT
```text
You are SCOUT, Recruitment and Hiring Specialist.
```
#### STRIKER
```text
You are STRIKER, Sales and Negotiation Specialist.
```
#### VECTOR
```text
You are VECTOR, Graphic Design Specialist.
```
#### OMEGA
```text
You are OMEGA. Restricted access.
```
### 1.8 Current Runtime Guardrail Values Found in Local DB
- Source DB: `backend/data/aio_crm.db` table `ai_provider_configs`
#### ollama (Final Phase 2 Ollama, model=minimax-m2.5:cloud, default=True)
```text
system_guardrails: SYSTEM_HARDENED_V2
task_guardrails: TASK_SPECIFIC_V2
```
#### openai (OpenAI, model=gpt-4.1-mini, default=False)
```text
system_guardrails: None
task_guardrails: None
```
## 2. Report Generation Prompt Sources

### 2.1 Frontend Report Seed Prefix Shown and Persisted with Reports
- File: `frontend/src/modules/Brain/index.jsx`
- Used in output rendering and saved report content
```text
[NEURAL ACTIVATION] Executing: {report.label}...
[SEED PROMPT] {report.prompt}
```
### 2.2 Brain/Cortex Report Seed Prompts
- File: `frontend/src/modules/Brain/reports.js`
#### Brand Avatar Intelligence (`brand-avatar`)
- Description: Define exactly who buys and why using CRM and engagement data.
```text
Analyze CRM deals, Signals activity, Comms threads, and content performance to identify the Top 3–5 highest-value ICP segments.
For each ICP:
- define core pain, aspiration, and buying trigger
- identify acquisition channel/source
- map converting content/interactions
- highlight friction/drop-offs
Then:
- rank ICPs by revenue impact and scalability
- identify under-optimized ICP
Finally:
- recommend 3 actions to increase conversion for the top ICP
- recommend 1 new campaign or flow
Output:
- ICP Table
- Key Insights
- Recommended Actions
```
#### Awareness & Attention (`awareness-attention`)
- Description: Measure top-of-funnel effectiveness and hook strength.
```text
Analyze impressions, CTR, watch time, retention, and Signals tied to content.
Identify:
- top-performing hooks and why they work
- exact drop-off points and causes
- mismatch between reach and engagement
Then:
- rank top 5 content pieces by attention quality
- identify 3 failing patterns
Finally:
- provide 3 hook rewrites
- recommend 2 content experiments
Output:
- Performance Breakdown
- Drop-off Analysis
- Action Plan
```
#### Content Performance (`content-performance`)
- Description: Identify content themes that drive direct revenue.
```text
Map content themes, formats, and distribution to revenue and deal creation.
Identify:
- top revenue-generating content categories
- revenue per content piece
- lag between content and conversion
Then:
- rank top 5 content types by ROI
- identify underperforming content clusters
Finally:
- recommend 3 content shifts
- recommend 1 new content series tied to revenue
Output:
- ROI Table
- Insights
- Content Actions
```
#### Offer & Conversion (`offer-conversion`)
- Description: Diagnose funnel leaks and pricing sensitivity.
```text
Analyze funnel stages, deal progression, and Comms interactions.
Identify:
- conversion rates per offer
- pricing sensitivity patterns
- drop-off stages and causes
Then:
- rank offers by conversion efficiency
- identify friction in funnel
Finally:
- recommend 3 conversion improvements
- recommend 1 pricing or positioning change
Output:
- Funnel Metrics
- Friction Points
- Optimization Actions
```
#### Customer Journey Mapping (`customer-journey`)
- Description: Track the full path to purchase from first touch.
```text
Analyze CRM timelines, Comms, and automation flows.
Map:
- key touchpoints leading to conversion
- time between stages
- critical interaction triggers
Then:
- identify bottlenecks and delays
- identify unnecessary steps
Finally:
- recommend 3 journey optimizations
- recommend 1 automation improvement
Output:
- Journey Map
- Bottlenecks
- Actions
```
#### Market Intelligence (`market-intelligence`)
- Description: Track emerging niches and shifting demand.
```text
Analyze trends, inbound signals, deal sources, and content performance.
Identify:
- emerging niches and demand shifts
- seasonal patterns
- rising service interest
Then:
- rank top opportunities by demand and fit
Finally:
- recommend 3 market plays
- recommend 1 new offer or positioning angle
Output:
- Market Trends
- Opportunities
- Actions
```
#### Competitive Intelligence (`competitive-intelligence`)
- Description: Spot competitor positioning gaps and messaging flaws.
```text
Analyze competitor positioning, offers, and content vs your performance.
Identify:
- pricing differences
- messaging gaps
- underserved segments
Then:
- identify competitive weaknesses
Finally:
- recommend 3 positioning advantages
- recommend 1 blue ocean strategy
Output:
- Comparison Table
- Gaps
- Strategy Actions
```
#### Product / Service Performance (`service-performance`)
- Description: Evaluate delivery bottlenecks and client results.
```text
Analyze delivery data, support tickets, and fulfillment timelines.
Identify:
- most profitable services
- bottlenecks in delivery
- scaling constraints
Then:
- rank services by margin and effort
Finally:
- recommend 3 optimization actions
- recommend 1 service to expand or cut
Output:
- Service Metrics
- Bottlenecks
- Actions
```
#### Operational Efficiency (`operational-efficiency`)
- Description: Optimize internal systems and automation ROI.
```text
Analyze automation logs, task times, and orchestration events.
Identify:
- time saved by automation
- failure points in flows
- manual workload hotspots
Then:
- rank top inefficiencies
Finally:
- recommend 3 automation fixes
- recommend 1 new flow
Output:
- Efficiency Metrics
- Failures
- Actions
```
#### Revenue Intelligence (`revenue-intelligence`)
- Description: Understand LTV and revenue concentration risk.
```text
Analyze deals, subscriptions, and revenue streams.
Identify:
- revenue by channel
- LTV patterns
- concentration risk
Then:
- rank revenue drivers
Finally:
- recommend 3 growth actions
- recommend 1 diversification strategy
Output:
- Revenue Breakdown
- Risks
- Actions
```
#### Client Retention & Satisfaction (`client-retention`)
- Description: Prevent churn and identify expansion opportunities.
```text
Analyze churn, NPS, usage patterns, and Comms.
Identify:
- churn causes
- retention drivers
- expansion signals
Then:
- rank client segments by retention
Finally:
- recommend 3 retention actions
- recommend 1 upsell strategy
Output:
- Retention Metrics
- Risks
- Actions
```
#### Innovation & Opportunity (`innovation-opportunity`)
- Description: Identify new products and blue ocean strategies.
```text
Analyze feature requests, lost deals, and Signals.
Identify:
- unmet demand
- repeated objections
- emerging needs
Then:
- rank opportunities by impact
Finally:
- recommend 3 new offers
- recommend 1 product direction
Output:
- Opportunity Map
- Insights
- Actions
```
### 2.3 Backend Report Context Wrapper
- File: `backend/server.py`
- Endpoint: `/api/cortex/generate-report`
```text
SYSTEM DATA:
- CRM: {crm.total_contacts} contacts, {crm.total_deals} deals
- Stages: {json.dumps(crm.stages)}
- Sources: {json.dumps(crm.sources)}
- Lead Score Distribution: {json.dumps(crm.score_distribution)}
- Comms: {comms.total_threads} threads, {comms.active_threads} active
- AI: {ai.total_runs} runs
```
```text
{payload.prompt}

{context_text}

Generate a comprehensive, actionable report following the output structure specified above. Use the provided data to inform your analysis.
```
### 2.4 Report Generation System Prompt
- File: `backend/ai_service.py`
- Function: `AIAssistService.generate_report()`
```text
You are an expert AI analyst for AIO CRM.

Generate detailed, actionable reports in clean markdown format.

Do not wrap output in JSON or code blocks.
```
### 2.5 Report Prompt Augmentation
- File: `backend/ai_service.py`
- Function: `AIAssistService.generate_report()`
```text
{prompt}

Generated by {actor_name} in workspace: {workspace_name}
```
If provider task guardrails are set, the report prompt is further extended as follows:
```text
{prompt}

Generated by {actor_name} in workspace: {workspace_name}

Task guidance:
{task_guardrails}
```
If provider system guardrails are set, the report system prompt is further extended as follows:
```text
You are an expert AI analyst for AIO CRM.

Generate detailed, actionable reports in clean markdown format.

Do not wrap output in JSON or code blocks.

Additional instructions:
{system_guardrails}
```
## 3. Adjacent Prompt Sources Found in the Same AI Service

### 3.1 Help Ticket Service Prompt
- File: `backend/ai_service.py`
- Function: `service_help_ticket()`
```text
You are Charlie, the AIO CRM Help Desk Assistant. Analyze the following support ticket and provide: 1. A concise internal analysis for the team. 2. A professional, helpful draft response for the customer.
```
```text
Ticket Subject: {subject}
Ticket Content: {content}
```
### 3.2 Command Parsing Prompt
- File: `backend/ai_service.py`
- Function: `parse_command()`
```text
You are Cortex, the orchestrator. Parse the user's natural language command into a structured JSON array of execution steps.
Return valid JSON ONLY matching this exact schema:
{
  "steps": [
    { "intent": "supported_intent", "parameters": { ... } }
  ]
}
Strictly use ONLY the following supported intents:
- draft_email
- schedule_calendar
- add_contact
- add_crm_note

CRITICAL RULES:
1. Output NOTHING except valid JSON.
2. DO NOT guess missing information. Return partial steps with available parameters only.
```
```text
User Command: {normalized_command}
Available Context: {json.dumps(context)}
Actor: {actor_name}
Return the parsed steps.
```
## 4. Files Associated with These Prompt Sources

- `backend/ai_service.py`
- `backend/agent_runtime.py`
- `backend/agent_definitions.py`
- `backend/server.py`
- `frontend/src/modules/Brain/reports.js`
- `frontend/src/modules/Brain/index.jsx`
- `backend/data/aio_crm.db`
