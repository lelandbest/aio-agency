# Service Layer Purification + Enforcement Report

**Date:** 2026-04-30

---

## 1. Utility Leakage Found (Before)

| Export | Service File | Kind | Used Externally |
|--------|-------------|------|-----------------|
| `toSnakeCase` | crm.service.js | Utility re-export | 2 files (Pipelines, CRM) |
| `normalizeSourceUrl` | forms.service.js | Utility re-export | 3 files (FormEntryModal, PublicForm, Forms) |
| `getApiBaseUrl` | media.service.js | URL config re-export | 0 (internal only) |
| `withSessionToken` | media.service.js | Session token re-export | 0 (internal only) |
| `CANONICAL_TAG_PREFIXES` | crm.service.js | Constant re-export | 0 |
| `validateTagFormat` | crm.service.js | Validation utility re-export | 0 |

---

## 2. Files Modified

| File | Change |
|------|--------|
| `src/services/crm.service.js` | Removed `toSnakeCase`, `validateTagFormat`, `CANONICAL_TAG_PREFIXES` imports/exports |
| `src/services/forms.service.js` | Removed `normalizeSourceUrl` import and re-export |
| `src/services/media.service.js` | Removed `export { getApiBaseUrl, withSessionToken }` line |
| `src/modules/Pipelines/index.jsx` | Changed `toSnakeCase` import from `crm.service` → `utils/string.utils` |
| `src/modules/CRM/index.jsx` | Changed `toSnakeCase` import from `crm.service` → `utils/string.utils` |
| `src/components/Modals/FormEntryModal.jsx` | Changed `normalizeSourceUrl` import from `forms.service` → `utils/url.utils` |
| `src/pages/PublicForm.jsx` | Changed `normalizeSourceUrl` import from `forms.service` → `utils/url.utils` |
| `src/modules/Forms/index.jsx` | Changed `normalizeSourceUrl` import from `forms.service` → `utils/url.utils` |
| `frontend/eslint.config.js` | Updated `no-restricted-imports` message to mention `/utils/` |
| `frontend/scripts/enforce-service-layer.js` | Added utility-from-service detection, backup file scanning |
| `frontend/scripts/enforce-service-layer.sh` | Added utility import checks, backup file detection |
| `frontend/package.json` | Removed `prebuild` script (kept Node.js `enforce` as build gate) |

---

## 3. Utilities Moved to /utils/

| Utility | New Location | Description |
|---------|-------------|-------------|
| `toSnakeCase` | `src/utils/string.utils.js` | Converts object keys from camelCase to snake_case |
| `camelToSnake` | `src/utils/string.utils.js` | Internal helper (not exported) |
| `CANONICAL_TAG_PREFIXES` | `src/utils/format.utils.js` | Tag prefix constant array |
| `validateTagFormat` | `src/utils/format.utils.js` | Validates tag PREFIX:NAME format |
| `normalizeSourceUrl` | `src/utils/url.utils.js` | Prepends API base URL to `/api/` and `/media/` paths |

---

## 4. Services Cleaned

| Service | Removed Exports | Remaining Exports |
|---------|----------------|-------------------|
| `CrmService` | `toSnakeCase`, `validateTagFormat`, `CANONICAL_TAG_PREFIXES` | 18 API passthrough methods |
| `FormsService` | `normalizeSourceUrl` | 12 API passthrough methods |
| `MediaService` | `getApiBaseUrl`, `withSessionToken` (re-exports only) | 34 API methods + `buildAssetUrl` + `voicePreviewBlob` |

**Items kept in services (not utilities):**
- `MediaService.buildAssetUrl` — Requires API-layer config (`getApiBaseUrl`, `withSessionToken`); not pure
- `MediaService.voicePreviewBlob` — IS an API call (fetches from `/api/media/voice-preview`)
- `AiService.sendVttCommand` / `sendAiCommandRaw` — ARE API calls (use `request()`)

---

## 5. UI Imports Updated

| Before | After |
|--------|-------|
| `import { CrmService, toSnakeCase } from '../../services/crm.service'` | `import { CrmService } from '../../services/crm.service'` + `import { toSnakeCase } from '../../utils/string.utils'` |
| `import { FormsService, normalizeSourceUrl } from '../../services/forms.service'` | `import { FormsService } from '../../services/forms.service'` + `import { normalizeSourceUrl } from '../../utils/url.utils'` |
| `import { normalizeSourceUrl } from '../../services/forms.service'` | `import { normalizeSourceUrl } from '../../utils/url.utils'` |

---

## 6. Files Deleted

| File | Reason |
|------|--------|
| `src/modules/VoiceCommand/index.jsx.tmp` | Backup file with backendApi import |
| `src/modules/Flows/FlowBuilder.jsx.tmp` | Backup file |

---

## 7. Final Violation Scan Result

```
✅ Service-layer isolation enforced. No violations found.
```

- Zero `backendApi` imports outside `/services/`
- Zero utility imports from service files
- Zero `.tmp`/`.bak`/`.old` files in `src/`
- Build passes: `npm run enforce && vite build` ✅
- PWA build passes ✅

---

## Architecture Enforcement Summary

| Mechanism | What It Blocks |
|-----------|---------------|
| ESLint `no-restricted-imports` | All `*/backendApi` imports in UI |
| Node.js enforcement scanner | `backendApi` imports, `fetch(`, `axios(`, `request(` in UI, utility imports from services |
| Shell enforcement script | Duplicate checks for CI environments |
| GitHub Actions | Runs `npm run enforce` on push/PR |
| Pre-commit hook | Runs `npm run enforce` |

---

FINAL STATE: SERVICES PURE, UTILITIES ISOLATED, ZERO VIOLATIONS, ARCHITECTURE ENFORCED