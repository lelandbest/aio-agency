# Service Coverage Report

**Generated:** 2026-04-30
**Architecture:** UI → Services → API → Backend

---

## Violation Scan Results

### Executable Code Violations

| File | Line | Type | Detail |
|------|------|------|--------|
| `src/modules/VoiceCommand/index.jsx.tmp` | 5 | FORBIDDEN_IMPORT | `import { request } from '../../services/backendApi'` |
| `src/modules/VoiceCommand/index.jsx.tmp` | 467 | REQUEST_CALL | `const res = await request('/api/vtt/command', {...})` |

**Note:** `.tmp` file — backup remnant, not active code. The active `index.jsx` already uses `AiService.sendVttCommand()`. This file is not matched by the existing enforcement scanner (which targets `.js`/`.jsx`/`.ts`/`.tsx` only).

### Documentation-Only Violations (non-blocking)

| File | Line | Type |
|------|------|------|
| `src/modules/Flows/_reference/flowbuilder1/docs/INTEGRATION.md` | 170 | `../api/` import |
| `src/modules/Flows/_reference/flowbuilder1/docs/INTEGRATION.md` | 234, 249, 266, 283 | `fetch(` calls |

### Clean Categories

| Pattern | Status |
|---------|--------|
| `@/api/` imports | PASS — zero found |
| `axios(` calls | PASS — zero found |
| `withSessionToken` usage | PASS — zero found |
| `backendApi` imports outside services | PASS — zero found (except .tmp) |

---

## Service Domain Coverage Map

| # | Domain | Service File | Status | Exports | Lines |
|---|--------|-------------|--------|---------|-------|
| 1 | ai | `src/services/ai.service.js` | PRESENT | 30 | 64 |
| 2 | analytics | `src/services/analytics.service.js` | PRESENT | 12 | 29 |
| 3 | auth | `src/services/auth.service.js` | PRESENT | 19 | 43 |
| 4 | brain | `src/services/brain.service.js` | PRESENT | 20 | 45 |
| 5 | calendar | `src/services/calendar.service.js` | PRESENT | 22 | 49 |
| 6 | comms | `src/services/comms.service.js` | PRESENT | 60 | 125 |
| 7 | contacts | `src/services/contacts.service.js` | PRESENT | 10 | 25 |
| 8 | crm | `src/services/crm.service.js` | PRESENT | 21 | 50 |
| 9 | flows | `src/services/flows.service.js` | PRESENT | 16 | 35 |
| 10 | forms | `src/services/forms.service.js` | PRESENT | 13 | 18 |
| 11 | help | `src/services/help.service.js` | PRESENT | 11 | 27 |
| 12 | integrations | `src/services/integrations.service.js` | PRESENT | 11 | 27 |
| 13 | media | `src/services/media.service.js` | PRESENT | 36 | 93 |
| 14 | orders | `src/services/orders.service.js` | PRESENT | 4 | 13 |
| 15 | settings | `src/services/settings.service.js` | PRESENT | 38 | 79 |
| 16 | signals | `src/services/signals.service.js` | PRESENT | 3 | 14 |

**All 16 domains: PRESENT — no missing services.**

**Total exported functions: 326** (including re-exports)
**Total service layer lines: 737**

---

## Enforcement Mechanisms

| Mechanism | File | What It Blocks |
|-----------|------|---------------|
| ESLint `no-restricted-imports` | `frontend/eslint.config.js` | All `*/backendApi` imports in UI |
| CI scanner (Node.js) | `frontend/scripts/enforce-service-layer.js` | `fetch(`, `axios(`, `request(`, backendApi imports in UI modules |
| CI scanner (Shell) | `frontend/scripts/enforce-service-layer.sh` | `@/api/`, `../api/`, `fetch(`, `axios(`, `request(`, `withSessionToken` outside services |
| npm `prebuild` hook | `frontend/package.json` | Runs shell scanner before `npm run build` |
| npm `build` script | `frontend/package.json` | Runs Node scanner before `vite build` |
| GitHub Actions | `.github/workflows/enforce.yml` | Runs on push/PR to main/develop |
| Pre-commit hook | `.husky/pre-commit` | Runs `npm run enforce` |

---

## Gap: `.tmp` File

`src/modules/VoiceCommand/index.jsx.tmp` contains forbidden `backendApi` imports but is not caught by the Node.js enforcement scanner (which only matches `.js`/`.jsx`/`.ts`/`.tsx` extensions). The shell scanner uses `--include` patterns that would also skip it. This is a **low-priority gap** — the file is a backup remnant and not imported by any active code.