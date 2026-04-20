# GLOBAL VARIABLE INVENTORY

A comprehensive, categorized inventory of all variables usable across the AIO CRM / AIO Flow system.

---

## 1. RUN CONTEXT

| Variable | Source | Availability | Type | Example |
|----------|--------|--------------|------|---------|
| `run.id` | orchestrator.py:828 | Always | string | `"run-abc123"` |
| `run.vars` | orchestration.py:856,3484 | Always | object | `{}` |
| `run.status` | server.py:1317 | Always | string | `"completed"` |
| `run.intent` | server.py:1316 | Always | string | `"command"` |
| `run.mode` | operator_assist.py:256 | AI runs | string | `"assist"` |
| `run.command` | server.py:1329 | AI commands | string | `"send email"` |
| `run.flowId` | operator_assist.py:277 | Flow runs | string | `"flow-xyz"` |
| `run.flowName` | operator_assist.py:278 | Flow runs | string | `"Welcome Flow"` |
| `run.triggerEventType` | operator_assist.py:279 | Triggered runs | string | `"booking_created"` |
| `run.createdAt` | operator_assist.py:257 | Always | ISO date | `"2024-01-01T00:00:00Z"` |
| `run.updatedAt` | server.py:1352 | Always | ISO date | `"2024-01-01T00:00:00Z"` |
| `run.context` | server.py:1259 | Always | object | `{}` |
| `run.steps` | server.py:1260 | Always | array | `[...]` |
| `run.artifacts` | server.py:1261 | Always | array | `[...]` |
| `run.error` | operator_assist.py:280 | Failed runs | string | `"..."` |
| `run.pendingApprovals` | server.py:1262 | Flow runs | array | `[...]` |

---

## 2. NODE OUTPUTS

| Variable | Source | Availability | Type | Example |
|----------|--------|--------------|------|---------|
| `previous` | orchestration.py:807,3485 | After first node | object | `{"stepId": "...", "intent": "...", "data": {...}}` |
| `previous.stepId` | orchestration.py:1575 | After first node | string | `"node-123"` |
| `previous.intent` | orchestration.py:1576 | After first node | string | `"send_email"` |
| `previous.status` | orchestration.py:1577 | After first node | string | `"success"` |
| `previous.data` | orchestration.py:1578 | After first node | object | `{"messageId": "..."}` |
| `previous.error` | orchestration.py:1579 | On failure | string | `"..."` |
| `node_results` | orchestration.py:806,3486 | During execution | object | `{"nodeId": {...}}` |
| `nodes.{nodeId}.output` | orchestration.py:2174 | After node runs | object | `{}` |
| `nodes.{nodeId}.status` | orchestration.py:2174 | After node runs | string | `"success"` |

---

## 3. TRIGGERS

| Variable | Source | Availability | Type | Example |
|----------|--------|--------------|------|---------|
| `trigger.type` | orchestration.py:813 | Triggered runs | string | `"booking_created"` |
| `trigger.payload` | orchestration.py:813 | Triggered runs | object | `{}` |
| `trigger.payload.email` | ai_service.py:768 | Email triggers | string | `"user@email.com"` |
| `trigger.payload.name` | ai_service.py:769 | Email triggers | string | `"John Doe"` |
| `trigger.payload.bookingId` | orchestration.py:2189 | Booking triggers | string | `"booking-123"` |
| `trigger.payload.contactId` | orchestration.py:2189 | Contact triggers | string | `"contact-123"` |
| `_system_event_type` | server.py:92 | Event-triggered | string | `"booking_created"` |
| `trigger.bookingId` | server.py:4714 | Booking triggers | string | `"booking-123"` |
| `trigger.contactId` | server.py:4714 | Contact triggers | string | `"contact-123"` |

---

## 4. CRM ENTITIES

### Contacts

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `contact.id` | data_provider.py:2188 | Always | string |
| `contact.email` | data_provider.py:2189 | When linked | string |
| `contact.firstName` | data_provider.py:2993 | When linked | string |
| `contact.lastName` | data_provider.py:2993 | When linked | string |
| `contact.name` | data_provider.py:156 | Computed | string |
| `contact.company` | data_provider.py:158 | When linked | string |
| `contact.companyId` | data_provider.py:158 | When linked | string |
| `contact.phone` | data_provider.py | When linked | string |
| `contact.pipelineStage` | data_provider.py:160 | When linked | string |
| `contact.owner` | data_provider.py:160 | Always | string |
| `contact.assignee` | data_provider.py:160 | Always | string |
| `contact.tags` | data_provider.py:4418 | When set | array |
| `contact.address` | data_provider.py:4419 | When set | object |
| `contact.customFields` | data_provider.py:4420 | When set | object |
| `contact.optInEmail` | data_provider.py:4421 | Always | boolean |
| `contact.leadScore` | data_provider.py | Always | number |
| `contact.quality` | data_provider.py | Always | string |

### Companies

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `company.id` | data_provider.py | Always | string |
| `company.name` | data_provider.py:158 | When linked | string |
| `company.industry` | data_provider.py | When set | string |
| `company.website` | data_provider.py | When set | string |

### Threads

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `thread.id` | data_provider.py:155 | Always | string |
| `thread.subject` | data_provider.py:155 | Always | string |
| `thread.status` | data_provider.py:155 | Always | string |
| `thread.channelType` | operator_assist.py:195 | Always | string |
| `thread.owner` | data_provider.py:160 | Always | string |
| `thread.assignee` | data_provider.py:160 | Always | string |
| `thread.contact` | data_provider.py:148 | When linked | object |
| `thread.company` | data_provider.py:149 | When linked | object |
| `thread.brief` | data_provider.py:150 | When AI briefed | object |
| `thread.aiFlags` | data_provider.py:151 | Always | object |
| `thread.aiPriority` | data_provider.py:155 | Always | string |
| `thread.priorityScore` | data_provider.py:155 | Always | number |
| `thread.lastActivityAt` | data_provider.py:196 | Always | ISO date |
| `thread.latestMessage` | operator_assist.py:189 | Always | object |
| `thread.messages` | data_provider.py | In threads | array |
| `thread.actions` | data_provider.py:1938 | Always | array |
| `thread.calendarEvents` | data_provider.py:1960 | When linked | array |

### Deals

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `deal.id` | data_provider.py:3059 | When created | string |
| `deal.title` | data_provider.py:3059 | When created | string |
| `deal.status` | data_provider.py | Always | string |
| `deal.value` | data_provider.py | When set | number |
| `deal.stage` | data_provider.py | Always | string |

---

## 5. AGENT / AI CONTEXT

| Variable | Source | Availability | Type | Example |
|----------|--------|--------------|------|---------|
| `brain_memory` | server.py:638,agent_runtime.py:186 | Always | array | `[{...}]` |
| `brain_memory_summary` | server.py:639 | When Brain used | string | `"..."` |
| `brain_memory_query` | server.py:645 | When Brain queried | string | `"search term"` |
| `context.intent` | server.py:2923 | AI requests | string | `"draft"` |
| `context.module` | server.py:2920 | AI requests | string | `"generic"` |
| `context.surface` | server.py:2921 | AI requests | string | `"email"` |
| `context.field` | server.py:2922 | AI requests | string | `"content"` |
| `context.command` | server.py:3275 | Commands | string | `"send email"` |
| `context.requestedAgent` | server.py:3276 | Agent routing | string | `"STRIKER"` |
| `context.activeAgent` | server.py:3277 | Agent execution | string | `"STRIKER"` |
| `context.flowId` | server.py:3284 | Flow-triggered | string | `"flow-123"` |
| `context.flowName` | server.py:3285 | Flow-triggered | string | `"Welcome"` |
| `context.stepCount` | server.py:3290 | Flow runs | number | `5` |
| `context.agentChain` | server.py:3291 | Multi-agent | array | `["ALPHA","STRIKER"]` |
| `context.routeHints` | server.py:2925 | AI requests | object | `{}` |
| `tenant` | orchestration.py:3483 | Always | object | `{}` |
| `tenant.id` | server.py:2864 | Always | string | `"tenant-123"` |
| `tenant.name` | server.py:2864 | Always | string | `"Acme Inc"` |

---

## 6. FORM INPUT

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `form.id` | server.py:1712 | Form submissions | string |
| `form.name` | data_provider.py | Form contexts | string |
| `form.submission` | data_provider.py | Form submissions | object |
| `form.submissionJson` | data_provider.py:6580 | Form submissions | object |
| `form.schema` | data_provider.py | Form definitions | array |
| `form.fields` | data_provider.py | Form definitions | array |
| `input.text` | orchestration.py:2780 | Voice input | string |
| `input.script` | orchestration.py:2780 | Script input | string |

---

## 7. INTEGRATIONS

### Calendar/Booking Events

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `calendarEvent.id` | data_provider.py:2177 | Calendar ops | string |
| `calendarEvent.title` | data_provider.py:2182 | Calendar ops | string |
| `calendarEvent.startTime` | data_provider.py:2182 | Calendar ops | ISO date |
| `calendarEvent.endTime` | data_provider.py:2182 | Calendar ops | ISO date |
| `calendarEvent.status` | data_provider.py:2182 | Calendar ops | string |
| `calendarEvent.location` | data_provider.py:2182 | Calendar ops | string |
| `calendarEvent.meetingUrl` | data_provider.py:2182 | Calendar ops | string |
| `calendarEvent.contactId` | data_provider.py:2182 | Calendar ops | string |
| `calendarEvent.threadId` | data_provider.py:2182 | Calendar ops | string |

### Mailbox

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `mailbox.id` | data_provider.py | Always | string |
| `mailbox.name` | data_provider.py | Always | string |
| `mailbox.address` | data_provider.py:814 | Always | string |
| `mailbox.provider` | data_provider.py:797 | Always | string |
| `mailbox.status` | data_provider.py:798 | Always | string |
| `mailbox.inboundEnabled` | data_provider.py:752 | Always | boolean |
| `mailbox.outboundEnabled` | data_provider.py:752 | Always | boolean |

### Providers

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `provider.apiKey` | server.py:2192 | Configured | string |
| `provider.status` | server.py:2192 | Configured | string |
| `provider.label` | server.py:2192 | Configured | string |

---

## 8. SYSTEM / METADATA

| Variable | Source | Availability | Type | Example |
|----------|--------|--------------|------|---------|
| `system.timestamp` | server.py:2366 | Always | ISO date | `"2024-01-01T00:00:00Z"` |
| `system.now` | server.py:2366 | Always | ISO date | `"2024-01-01T00:00:00Z"` |
| `system.version` | server.py:2377 | Always | string | `"1.1.0"` |
| `system.environment` | server.py:2378 | Always | string | `"development"` |
| `system.status` | server.py:2374 | Always | string | `"healthy"` |
| `system.timezone` | canonical_settings.py | Tenant settings | string | `"America/New_York"` |
| `user.id` | server.py:2865 | Authenticated | string | `"user-123"` |
| `user.email` | server.py:2865 | Authenticated | string | `"user@email.com"` |
| `user.name` | server.py:2865 | Authenticated | string | `"John Doe"` |
| `user.role` | server.py:2865 | Authenticated | string | `"owner"` |
| `workspace.id` | server.py:2864 | Authenticated | string | `"tenant-123"` |
| `workspace.name` | server.py:2864 | Authenticated | string | `"Acme Inc"` |
| `workspace.slug` | auth_store.py | Always | string | `"acme-inc"` |

---

## 9. TEMPLATE VARIABLES

### Email Templates

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `template.id` | auth_store.py:2745 | Email templates | string |
| `template.templateKey` | auth_store.py:2745 | Email templates | string |
| `template.emailType` | auth_store.py:2785 | Email templates | string |
| `template.subject` | auth_store.py:2785 | Email templates | string |
| `template.sendTo` | auth_store.py:2785 | Email templates | string |
| `template.bodyHtml` | auth_store.py:2785 | Email templates | string |
| `template.bodyText` | auth_store.py:2785 | Email templates | string |
| `template.enabled` | auth_store.py:2785 | Email templates | boolean |

### Global Variables

| Variable | Source | Availability | Type |
|----------|--------|--------------|------|
| `global.{key}` | auth_store.py:645 | Tenant-defined | any |
| `globals.{key}` | auth_store.py:645 | Tenant-defined | any |
| `tenantSettings.globalVariables` | auth_store.py:696 | Always | object |
| `tenantSettings.branding` | auth_store.py:1217 | Always | object |
| `tenantSettings.comms` | auth_store.py:1232 | Always | object |
| `tenantSettings.calendar` | auth_store.py:1236 | Always | object |
| `tenantSettings.navigation` | auth_store.py:1220 | Always | object |

---

## UNDOCUMENTED VARIABLES

| Variable | Evidence |
|----------|----------|
| `run_vars` | `orchestration.py:856,3484` - defined but no clear doc |
| `_runtime_previous` | `orchestration.py:3485` - internal runtime |
| `_runtime_node_results` | `orchestration.py:3486` - internal runtime |
| `_runtime_branch_decisions` | `orchestration.py:3487` - internal runtime |
| `_runtime_graph_adjacency` | `orchestration.py:3489` - internal runtime |
| `_provider_config` | `server.py:3278` - internal context |
| `_requested_agent_locked` | `server.py:3279` - internal flag |
| `_learningSummary` | `orchestration.py:3775` - AI learning context |

---

## INCONSISTENCIES

| Issue | Evidence |
|-------|----------|
| `trigger.payload` vs `trigger.*` flat | Both exist - `orchestration.py:813` uses nested; some places use flat |
| `brain_memory` camelCase in some, snake_case keys inside | `server.py:638` camelCase key, but keys inside are snake_case |
| `thread.brief` camelCase but `brief.summary` snake_case | `data_provider.py:164` - inconsistent |
| `contact.firstName` camelCase but `contact.first_name` also used | Mixed usage throughout codebase |
| `channel_type` vs `channelType` | `operator_assist.py:195` vs `data_provider.py` - inconsistent |
| `aiPriority` camelCase but `priority_score` snake_case | `data_provider.py:155` - inconsistent |

---

## UNUSED / ORPHANED VARIABLES

| Variable | Evidence |
|----------|----------|
| `run.pendingApprovals` | Defined at `server.py:1262` but never read in flow execution |
| `run.trace` | Defined at `server.py:1262` but unused in visible code |
| `route_hints` camelCase in some places, snake_case in context | `server.py:2925-2926` - inconsistent access |

---

## HIGH-RISK GAPS

| Gap | Risk Level | Notes |
|-----|------------|-------|
| No `booking.attendees` variable | HIGH | Booking events have no attendee list exposed |
| No `message.headers` variable | MEDIUM | Email messages lack header access |
| No `company.contacts` variable | MEDIUM | Company lacks contact list |
| No `thread.history` comprehensive | MEDIUM | Only actions/events exposed, not full history |
| No `user.preferences` variable | LOW | User preferences not in context |
| No `flow.variables` explicit | MEDIUM | Flow-level variables not explicitly exposed |

---

## SUMMARY

- **Total unique variable paths**: ~120+
- **Major categories**: 9
- **Most complete**: CRM Entities (contacts, companies, threads)
- **Most fragmented**: Brain/Memory variables (mixed naming)
- **Highest risk gap**: Booking attendee data not exposed
