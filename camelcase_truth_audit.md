SYSTEM TASK — CAMELCASE TRUTH AUDIT

Perform a strict read-only audit to determine whether the AIO CRM / AIO Flow system is truly camelCase end-to-end at every non-Python boundary.

Do not implement.
Do not patch.
Do not normalize.
Do not suggest speculative fixes until the audit is complete.

This is a truth audit only.

---

OBJECTIVE

Determine whether the system is actually camelCase everywhere it is supposed to be, with snake_case allowed only inside pure Python implementation details.

Confirm or deny this standard across:

- API request payloads
- API response payloads
- persisted JSON blobs
- runtime execution context
- flow-accessible variables
- template-accessible variables
- agent / AI context payloads
- Brain / Vault / memory injection payloads
- entity serializers / model projections sent to frontend
- integration config payloads crossing boundaries

---

HARD STANDARD

Allowed:
- snake_case inside Python locals, helpers, private internals, SQL handling, and implementation-only structures that never cross a system boundary

Not allowed:
- snake_case in anything exposed to:
  - frontend
  - API clients
  - flows
  - templates
  - agents
  - AI prompt context
  - persisted app/runtime JSON
  - variable injection surfaces

If a snake_case field appears in any exposed/runtime-accessible context, that is a violation.

---

AUDIT QUESTIONS

Answer these with evidence:

1. Is inbound API contract enforcement truly active and effective?
2. Is outbound API response camelCase truly universal?
3. Are persisted JSON structures camelCase?
4. Are flow variables camelCase only?
5. Are node outputs camelCase only?
6. Are trigger payloads camelCase only?
7. Are CRM entity projections camelCase only?
8. Is Brain / Vault / memory injection camelCase only?
9. Are template variables camelCase only?
10. Are any snake_case keys still leaking into user-facing/runtime-facing surfaces?
11. Is any response middleware masking deeper internal inconsistency instead of eliminating it?
12. Are there dual-format paths where both camelCase and snake_case are accepted or produced internally?

---

AUDIT SCOPE

Inspect all relevant boundary and projection layers including:

- request validation middleware
- response middleware / serializers
- API route handlers returning JSON
- entity projection helpers
- run projection helpers
- flow execution context builders
- node result builders
- trigger/event payload builders
- Brain / Vault retrieval and injection shaping
- template rendering context builders
- integration config read/write shaping
- persisted JSON blobs used by runtime/app logic

Prioritize files such as:

- backend/server.py
- backend/request_validators.py
- backend/orchestration.py
- backend/data_provider.py
- backend/auth_store.py
- backend/agent runtime / assist / AI execution files
- frontend-consuming projection helpers if present

Search for:
- snake_case keys in dict literals returned or persisted
- conversion utilities
- camelize / decamelize behavior
- direct JSONResponse payload construction
- run/context/template builders
- brain/memory payload shaping
- variable exposure paths

---

CLASSIFICATION RULES

For every finding, classify as one of:

1. CLEAN
- fully camelCase at exposed boundary

2. MASKED
- stored or built in snake_case internally, but converted before response
- still a problem if it crosses into runtime/flow/template/AI surfaces before conversion

3. LEAKING
- snake_case visibly reaches a non-Python boundary or runtime-accessible context

4. INTERNAL-ONLY
- snake_case exists only inside Python implementation and never crosses a boundary
- acceptable

---

REQUIRED CHECKS

### PART 1 — API ENFORCEMENT

Confirm:
- request validator exists
- protected routes actually use it
- snake_case inbound requests are rejected
- no silent alias support
- response middleware is active
- any route prefix gaps
- any JSON responses bypassing middleware

---

### PART 2 — RESPONSE SHAPING

Audit actual response payload construction for:
- AI routes
- flow routes
- node routes
- agent routes
- integration routes
- help/archive routes
- provider routes
- media/voice routes if present

Determine whether:
- responses are born camelCase
- or born snake_case and merely converted later

Identify which case applies.

---

### PART 3 — PERSISTED JSON

Audit JSON stored in DB or files for:
- run metadata
- flow configs
- node configs
- agent context payloads
- template data
- integration payloads
- voice/media payloads
- any JSON blobs re-entering runtime logic

Determine whether persisted runtime JSON is:
- camelCase clean
- mixed
- snake_case masked later

---

### PART 4 — FLOW / VARIABLE SURFACES

Audit all flow-accessible variables and runtime context surfaces:

- run.*
- nodes.*
- previous.*
- trigger.*
- globals.*
- contact.*
- company.*
- deal.*
- thread.*
- form.*
- context.*
- tenant.*
- system.*

Identify every case where:
- both camelCase and snake_case variants exist
- nested snake_case survives inside otherwise camelCase objects
- internal runtime structures leak into exposed variable space

---

### PART 5 — BRAIN / MEMORY / AGENT CONTEXT

Audit:
- brainMemory / vault injection
- retrieval results
- memory summaries
- agent context assembly
- AI prompt context builders

Determine whether:
- outer keys are camelCase
- inner payloads still contain snake_case
- mixed naming exists in injected objects
- any snake_case reaches prompts, flows, or agent surfaces

---

### PART 6 — ENTITY / PROJECTION LAYER

Audit contact/company/thread/deal/booking/calendar/mailbox/provider projections.

Determine whether each is:
- natively camelCase
- mixed
- snake_case converted at response time only

Call out any entity family with mixed naming.

---

### PART 7 — TRIGGER / EVENT SHAPING

Audit event payload construction and flow trigger injection.

Specifically check whether the system exposes both:
- trigger.payload.*
- trigger.*
- other mixed forms

Determine canonical actual runtime shape and whether non-canonical variants still leak.

---

### PART 8 — TEMPLATE CONTEXT

Audit all template-accessible contexts:
- email templates
- document/message templates
- AI drafting contexts

Determine whether template render surfaces are camelCase only.

---

OUTPUT FORMAT

### CAMELCASE TRUTH AUDIT

#### 1. CONFIRMED CLEAN
- surface
- evidence
- files/functions

#### 2. MASKED BY RESPONSE CONVERSION
- surface
- actual internal shape
- where camelization occurs
- risk level

#### 3. ACTIVE LEAKS
- exact leaked key/path
- where it leaks
- files/functions
- why it violates the standard

#### 4. INTERNAL-ONLY SNAKE_CASE
- acceptable internal locations
- evidence

#### 5. FALSE CONFIDENCE RISKS
- places that appear camelCase externally but are not truly normalized internally

#### 6. CANONICAL STATUS BY SURFACE
- API requests
- API responses
- persisted JSON
- flow variables
- node outputs
- triggers
- CRM entities
- Brain/memory injection
- templates
- integrations

For each surface mark:
- clean
- masked
- leaking
- mixed

#### 7. EXACT DRIFT LIST
List every confirmed non-Python snake_case or mixed-format violation still present.

#### 8. REAL NORMALIZATION BACKLOG
List only the work still genuinely required to achieve the standard:
camelCase everywhere except pure Python internals.

#### 9. FINAL VERDICT
Choose one only:
- fully compliant
- externally compliant but internally mixed
- partially compliant
- materially non-compliant

STOP AFTER OUTPUT
