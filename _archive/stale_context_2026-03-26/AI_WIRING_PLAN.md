# AI Wiring Plan

Updated: 2026-03-20  
Workspace: `D:\AIOCRM`

## Goal

Align the live AI runtime to the established `AIO Agents` hierarchy so conversational commands, module bullseyes, Brain retrieval, MCP runtime access, and agent activity all flow through one shared execution model.

## Canonical Hierarchy

Visible runtime roster:

- `ALPHA` = commander, dispatcher, authority layer
- `BRAVO` = strategy
- `CHARLIE` = front-door support and intake
- `DELTA` = coordination
- `ECHO` = comms, email, socials, channel craft
- `FORGE` = content and copy
- `GHOST` = engineering, IT, site-dev, systems build
- `ARCHER` = analytics and financial
- `ATLAS` = logistics, deployment coordination, systems mapping
- `RANGER` = SEO
- `SCOUT` = hiring and recruitment
- `STRIKER` = sales and negotiation
- `VECTOR` = design

Hidden governance role:

- `OMEGA` = emergency local purge control only

## Default Runtime Flow

Generic requests resolve through:

1. `CHARLIE` intake
2. `ALPHA` dispatch
3. specialist execution

Direct specialist commands are allowed, but the run envelope still records:

- `intake_agent`
- `dispatcher_agent`
- `requested_agent`
- `executing_agent`
- `delegate_chain`
- `permission_tier`

## Shared Contract

Every assist or command run should normalize into one envelope:

- `module`
- `surface`
- `field`
- `intent`
- `thread_id`
- `contact_id`
- `company_id`
- `command_text`
- `provider`
- `model`
- `brain_results`
- `mcp_results`
- `steps`
- `artifacts`
- `status`
- `intake_agent`
- `dispatcher_agent`
- `requested_agent`
- `executing_agent`
- `delegate_chain`
- `permission_tier`

## Routing Defaults

Module defaults now align to the full hierarchy:

- support / service / FAQ / ticketing -> `CHARLIE`
- email packaging / socials / channel output -> `ECHO`
- sales / negotiation / pipeline follow-up -> `STRIKER`
- strategy / market framing -> `BRAVO`
- coordination / milestones / project routing -> `DELTA`
- logistics / deployment / handoff maps -> `ATLAS`
- engineering / IT / integrations / systems build -> `GHOST`
- analytics / finance / KPI / ROI -> `ARCHER`
- copy / article / landing page / narrative -> `FORGE`
- SEO / keyword / ranking -> `RANGER`
- hiring / recruiting / interviews -> `SCOUT`
- design / visual / brand systems -> `VECTOR`

## Brain and MCP

Brain and MCP remain shared infrastructure, not a private domain of any one agent.

Runtime order:

1. gather module context
2. gather linked entity context
3. pull Brain retrieval
4. merge MCP runtime results when enabled
5. choose provider/model
6. execute specialist run
7. persist artifacts and activity

## Omega Protocol

`OMEGA` stays outside normal routing and outside normal agent pickers.

Current implemented scope:

- explicit owner-only admin surface in `Settings > Omega`
- local app-data purge only
- 5-minute arm countdown
- separate arm code and cancel code
- execute requires the original confirmation code after countdown
- natural-language dangerous requests are blocked and redirected to Omega controls

Not in scope yet:

- true dual-key authorization
- remote provider deletion

## Next Implementation Focus

1. promote `POST /api/ai/command` into the shared execution path for more modules
2. add step-level action execution instead of prompt-only command handling
3. make Comms and Agents render the richer chain and artifacts more deeply
4. introduce conversational command parsing for multi-step workflows
5. add stricter side-effect gates for send, delete, and automation execution
