SYSTEM TASK — GLOBAL VARIABLE INVENTORY AUDIT

Perform a full read-only audit of all variables available for injection across the AIO CRM / AIO Flow system.

Do not implement.
Do not refactor.
Do not suggest redesigns.

Goal: produce a COMPLETE, categorized inventory of all variables usable in:
- flows
- nodes
- templates
- AI prompts
- agents
- documents
- integrations

This is a system-wide variable surface audit.

---

OBJECTIVE

Identify, normalize, and categorize every variable that can be referenced or injected at runtime.

Include both:
- explicit variables (clearly defined)
- implicit variables (inferred from runtime structures)

---

SCOPE

Audit all sources of variables including:

1. FLOW CONTEXT
   - run-level variables
   - node outputs
   - previous node references
   - trigger payloads
   - global flow variables

2. AI / AGENT CONTEXT
   - agent input/output structures
   - context injection payloads
   - system prompts
   - memory / brain / vault injections

3. CRM DATA MODELS
   - contacts
   - companies
   - deals/opportunities
   - activities
   - bookings
   - custom fields

4. FORM / USER INPUT
   - submitted form data
   - field mappings
   - dynamic inputs

5. INTEGRATIONS
   - provider payloads
   - OAuth-connected data
   - external API responses

6. SYSTEM VARIABLES
   - timestamps
   - environment/system metadata
   - run metadata
   - execution state

7. TEMPLATE SYSTEMS
   - email templates
   - document templates
   - messaging templates
   - AI-generated content templates

---

DISCOVERY METHOD

Search and extract variables from:

- flow execution engine
- node implementations
- variable resolution logic
- template rendering logic
- agent execution paths
- CRM data access layers
- integration handlers
- form submission handlers

Look for patterns such as:

- run.*
- nodes.*
- previous.*
- trigger.*
- globals.*
- contact.*
- company.*
- deal.*
- booking.*
- form.*
- input.*
- context.*
- response.*
- agent.*
- system.*

Do not assume naming—extract actual usage.

---

NORMALIZATION

All variables must be reported in:

- camelCase
- dot notation (flattened where appropriate)

Example:

run.vars.userName
nodes.sendEmail.response.messageId
contact.firstName
booking.startTime

---

CATEGORIZATION

Group variables into clear categories:

1. RUN CONTEXT
2. NODE OUTPUTS
3. TRIGGERS
4. CRM ENTITIES
5. AGENT / AI CONTEXT
6. FORM INPUT
7. INTEGRATIONS
8. SYSTEM / METADATA
9. TEMPLATE VARIABLES

---

FOR EACH VARIABLE INCLUDE

- variable path (dot notation)
- source (where it originates)
- availability (when it exists)
- type (string, number, object, array, boolean, unknown)
- example value (if determinable)
- where it can be used (flows, templates, AI, etc.)

---

DE-DUPLICATION

- merge identical variables from different sources
- do not list duplicates
- preserve aliases ONLY if they actually exist in code

---

EDGE CASES

Explicitly identify:

- variables that exist but are NOT documented anywhere
- variables that are inconsistently named
- variables that are partially available (only in certain flows/nodes)
- variables that are written but never read
- variables that are read but never clearly defined

---

OUTPUT FORMAT

### VARIABLE INVENTORY

#### 1. RUN CONTEXT
- variable
- source
- availability
- type
- example

#### 2. NODE OUTPUTS
...

#### 3. TRIGGERS
...

#### 4. CRM ENTITIES
...

#### 5. AGENT / AI CONTEXT
...

#### 6. FORM INPUT
...

#### 7. INTEGRATIONS
...

#### 8. SYSTEM / METADATA
...

#### 9. TEMPLATE VARIABLES
...

---

### UNDOCUMENTED VARIABLES
- list

---

### INCONSISTENCIES
- naming conflicts
- partial availability
- unclear sources

---

### UNUSED / ORPHANED VARIABLES
- list with evidence

---

### HIGH-RISK GAPS
- variables expected but missing
- variables that should be globally available but are not

---

### SUMMARY

- total variable count
- major categories
- major risks

STOP AFTER OUTPUT
