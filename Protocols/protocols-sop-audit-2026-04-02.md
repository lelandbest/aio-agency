# Protocols / SOP Audit

Date: 2026-04-02

Scope: repo-authored markdown only, read-only audit of documents that appear to function as structured SOPs, standards, or governing procedures.

Excluded from canonical consideration:

- `node_modules`
- generated duplicates in build output
- historical archive content unless explicitly ratified

---

## Audit Summary

Total repo-authored markdown files reviewed: `177`

Current strong SOP / standards candidates:

- `Protocols/charlie-alpha-protocol.md`
- `Protocols/tagging.md`
- `Protocols/lockdown.md`
- `docs/AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md`

SOP-best-guess / procedure docs worth preserving but not clearly canonical:

- `.opencode/commands/prebuild.md`
- `.opencode/commands/verify.md`
- `.opencode/commands/safe-commit.md`
- `.opencode/commands/safe-push.md`
- `docs/flow_builder/UNIVERSAL_NODE_CONFIG_STANDARD.md`
- `_archive/stale_context_2026-03-26/AIO_AGENTS_RUN_DRIVEN_STANDARD.md`
- `backend/API.md`
- `frontend/src/modules/Flows/_reference/flowbuilder1/docs/CHECKLIST.md`

All other repo-authored markdown reviewed in this pass fit better as:

- audits
- handoffs
- inventories
- implementation plans
- walkthroughs
- public/generated docs
- archived stale context

---

## Current Solid SOPs

### `Protocols/charlie-alpha-protocol.md`

Title: `Charlie / Alpha Protocol Lock-In`

Assessment:

- clear governing execution chain
- authority boundaries are explicit
- reads as a live operating SOP
- correctly located in `Protocols`

### `Protocols/tagging.md`

Title: `Tagging Protocol`

Assessment:

- clear rules
- explicit prohibitions
- escalation behavior defined
- compliance checks included
- correctly located in `Protocols`

### `Protocols/lockdown.md`

Title: `Repository Protection and No-Touch Rules`

Assessment:

- hard protection policy
- broad enforcement coverage
- structurally a true SOP
- formatting is dirty/escaped but content is still clearly authoritative

### `docs/AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md`

Title: `AI Provider System — Source of Truth`

Assessment:

- governing architecture boundary document
- reads like a live standard, not a handoff
- best current candidate to move into `Protocols` if later approved

---

## SOP-Best-Guess / Procedure Docs

### `.opencode/commands/prebuild.md`

SoP-Best Guess:

- tool-specific prebuild inspection procedure
- operational recipe for the build agent
- not app governance

### `.opencode/commands/verify.md`

SoP-Best Guess:

- small verification procedure for the toolchain
- useful, but scoped to agent tooling

### `.opencode/commands/safe-commit.md`

SoP-Best Guess:

- commit safety procedure
- operational, not product/system governance

### `.opencode/commands/safe-push.md`

SoP-Best Guess:

- push authorization procedure
- operational, not application governance

### `docs/flow_builder/UNIVERSAL_NODE_CONFIG_STANDARD.md`

SoP-Best Guess:

- structured node-config standard/spec
- looks standards-like
- should be treated as future/partial until explicitly reconciled with current runtime

### `_archive/stale_context_2026-03-26/AIO_AGENTS_RUN_DRIVEN_STANDARD.md`

SoP-Best Guess:

- very SOP-like UI/run rendering standard
- archived and explicitly stale by location
- not current authority

### `backend/API.md`

SoP-Best Guess:

- API reference/procedure document
- documentation, not governance

### `frontend/src/modules/Flows/_reference/flowbuilder1/docs/CHECKLIST.md`

SoP-Best Guess:

- deployment checklist/reference for a reference implementation
- not canonical current repo governance

---

## Not SOP: Contradictory / Outdated

### `DO NOT STANDARD.md`

Assessment:

- task-scope freeze memo, not repo-wide governance
- conflicts with work that has already happened since
- should not be treated as a live SOP

### `frontend/public/CONTRIBUTING.md`

Assessment:

- outdated
- says most modules are frozen except Calendar
- references purple button styling that conflicts with current UI standards
- not current SOP

### `frontend/public/ROADMAP.md`

Assessment:

- historical roadmap
- not operating protocol

### `frontend/public/THEME_SYSTEM.md`

Assessment:

- reference/design documentation
- not operating SOP
- likely stale against current chrome standards

---

## Not SOP: Future Spec / Feature Consideration

These are structured, but they read as prompts/specs/plans rather than live protocol:

- `ui_ux_clean_sweep_post_hardening.md`
- `signals_execution_patch.md`
- `signals_finalization_audit.md`
- `implementation_plan.md`
- `implementation_plan-semantic patch.md`
- `variable_normalization_plan.md`

---

## Not SOP: Audit / Handoff / Status / Inventory

These are useful reference artifacts, but not SOPs:

- `Gemini 3 - audit_report.md`
- `Gemini3 - operator_assist_audit.md`
- `EXECUTION_REALITY_AUDIT.md`
- `HANDOFF.md`
- `NEXT_AGENT_HANDOFF.md`
- `media_module_status_2026-04-01.md`
- `GLOBAL_VARIABLE_INVENTORY.md`
- `WIRING_AUDIT_REPORT.md`

---

## Generated / Duplicated / Archive Buckets

These should not be treated as canonical SOP storage:

### `frontend/public/*.md`

- public docs
- guides
- indexes
- historical package docs

### `frontend/dist/*.md`

- build/distribution duplicates of public docs
- not canonical storage

### `_archive/**/*.md`

- high-value historical reference
- not live authority

### `_archive/prepush_docs_2026-03-26/**/*.md`

- archive of plans, walkthroughs, implementation prompts, and reviews

### `_archive/stale_context_2026-03-26/**/*.md`

- explicitly stale context by folder naming

---

## Current Best-Judgment Canonical SOP Set

If a strict present-day SOP set is needed, the strongest current candidates are:

- `Protocols/charlie-alpha-protocol.md`
- `Protocols/tagging.md`
- `Protocols/lockdown.md`
- `docs/AI_PROVIDER_SYSTEM_SOURCE_OF_TRUTH.md`

Everything else reviewed in this pass fits better as:

- procedure/tooling
- plans/specs
- audits
- handoffs/status
- archive/stale
- public/generated docs

---

## Recommended Next Action

No source documents were edited during the audit.

If approved in a later write pass:

1. ratify the true SOP list
2. move only approved live SOPs into `Protocols`
3. leave archive/spec/audit material where it belongs
4. mark contradictory docs for deprecation instead of silent deletion
