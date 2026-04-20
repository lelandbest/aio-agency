TASK: REPO CLEANUP + HISTORICAL SEGREGATION + TIMELINE SOURCE PREP

MODE: ZERO-DRIFT / NO REDESIGN / NO FEATURE WORK

OBJECTIVE:

1. Preserve current system integrity (LOCK STATE)
2. Segregate ALL non-runtime / historic / duplicate artifacts
3. Build a structured dataset for future 30K PROJECT TIMELINE
4. DO NOT break imports, runtime, routing, or build

---

GLOBAL RULES

DO NOT:
- DO NOT modify active runtime logic
- DO NOT rename active modules
- DO NOT delete files without classification
- DO NOT break imports or references
- DO NOT refactor architecture
- DO NOT summarize history yet
- DO NOT compress or rewrite historical content

ONLY:
- inventory
- classify
- move (safe)
- document

---

STAGE 1 — FULL INVENTORY

Scan ENTIRE repo.

Identify ALL files matching:
- archive / backup / old / legacy / temp / draft / copy / test / prompt / handoff
- duplicate components
- unused assets
- abandoned experiments

OUTPUT:

CLEANUP_MANIFEST.md

Each entry:
- full path
- type (frontend/backend/doc/asset)
- last modified
- classification (active / historic / duplicate / unknown)

STOP. WAIT FOR "CONTINUE STAGE 2"

---

STAGE 2 — HISTORIC SEGREGATION PLAN

Create target structure (DO NOT MOVE YET):

/repo_history_review/
  /prompts/
  /handoffs/
  /audits/
  /legacy_ui/
  /legacy_backend/
  /experiments/
  /notes/

Map ALL historic candidates → new locations

OUTPUT:

HISTORIC_FILE_INDEX.md
- original path → target path
- classification
- confidence level

STOP. WAIT FOR "CONTINUE STAGE 3"

---

STAGE 3 — SAFE SEGREGATION (MOVE ONLY SAFE FILES)

MOVE ONLY files that meet ALL:

- no imports
- no runtime reference
- no route usage
- no build dependency

Preserve:
- filenames
- structure where possible

DO NOT MOVE:
- uncertain files
- anything referenced

OUTPUT:

FILES MOVED (list)
FILES HELD (uncertain)

STOP. WAIT FOR "CONTINUE STAGE 4"

---

STAGE 4 — DEAD FILE DETECTION

Identify:

- unused mocks
- duplicate files
- abandoned backups
- orphaned assets

VERIFY:
- zero references (imports, routes, services)

OUTPUT:

SAFE_TO_DELETE.md
- file
- reason
- verification method

STOP. WAIT FOR "CONTINUE STAGE 5"

---

STAGE 5 — TIMELINE SOURCESET BUILD

From segregated files, extract ONLY:

- prompts
- handoffs
- audits
- major fix notes
- architectural decisions

DO NOT SUMMARIZE

OUTPUT:

TIMELINE_SOURCESET.md
- categorized file list
- chronological grouping (by date if possible)

STOP. WAIT FOR "CONTINUE STAGE 6"

---

STAGE 6 — FINAL VALIDATION

VERIFY:

- app builds
- no broken imports
- routing intact
- modules load
- no missing dependencies

OUTPUT:

VALIDATION REPORT:
- imports: PASS/FAIL
- routing: PASS/FAIL
- modules: PASS/FAIL
- build: PASS/FAIL

---

FINAL OUTPUT FORMAT

FILES CHANGED:
- exact list

FILES MOVED:
- exact list

FILES FLAGGED FOR DELETION:
- exact list

FILES PRESERVED:
- exact list

TIMELINE SOURCESET:
- summary count + categories

VALIDATION:
- PASS / FAIL

FINAL STATUS:
- CLEANUP READY
or
- BLOCKED (with reason)