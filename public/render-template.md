READ-ONLY AUDIT — VIDEO TEMPLATE CONTRACT NORMALIZATION

## GOAL

Audit the exact contract mismatch between frontend-assumed video template IDs and backend-supported render template IDs.

This is READ-ONLY.
Do not modify files.
Do not propose code yet.
Do not expand scope.

## REQUIRED OUTPUT

Return only:

### 1. BACKEND SOURCE OF TRUTH
- exact file(s) where supported render template IDs are defined
- exact currently supported IDs
- exact data shape returned by `GET /api/media/render-templates`

### 2. FRONTEND / FLOW ASSUMED TEMPLATE IDS
- exact file(s) where video template IDs are hardcoded, defaulted, seeded, or surfaced in UI
- list all template IDs referenced outside backend registry truth
- identify which are valid vs invalid against backend truth

### 3. EXECUTION PAYLOAD CONTRACT
- exact path from flow/generate_video node config to backend execution payload
- exact payload field names used for template selection
- exact point where unsupported templateId would fail

### 4. CONTRACT MISMATCH SUMMARY
- concise bullet list of every mismatch found
- no solutions yet

### 5. NORMALIZATION TARGET
- state the minimum surfaces that would need alignment later
- file paths only
- no patch plan

## HARD RULES

- READ-ONLY ONLY
- no edits
- no refactors
- no speculative roadmap
- no broad repo tour
- stay strictly in video template selection / execution contract