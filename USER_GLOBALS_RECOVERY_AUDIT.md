# USER GLOBALS RECOVERY AUDIT

## USER GLOBALS RECOVERY

### CONFIRMED

| Key | Purpose | Source |
|-----|---------|--------|
| `globalVariables` (container) | Tenant-scoped user-defined variables | `tenantSettings.globalVariables` |
| Variable structure | `key`, `label`, `category`, `description`, `value`, `isSecret`, `isSystem`, `editableByClient` | `operator_assist.py:165-181` |
| CRUD operations | Create, read, update, delete | `auth_store.py:2685-2741` |

### POSSIBLE

| Key | Rationale | Source |
|-----|-----------|--------|
| `sender_name`, `sender_email` | Used in comms contexts but NOT in globalVariables - would be user-defined if added | Inference from usage patterns |
| `company_name`, `brand_voice` | Used in Brain profile but NOT in globalVariables - would be user-defined if added | Inference from usage patterns |
| `timezone` | User-level preference but stored in user profile, NOT globalVariables | `auth_store.py:354` |

### CONTAINERS

| Container | Source |
|-----------|--------|
| `globals.*` | Orchestration context at `orchestration.py:816-859` |
| `tenantSettings.globalVariables` | Canonical settings at `canonical_settings.py:56` |

---

## FINAL VERDICT

**CONTAINERS ONLY**

The system provides:
- A container (`globalVariables`) in tenant settings
- CRUD operations to manage user-defined variables
- Context injection into AI/flow execution (`globals.*` path)
- UI to manage variables (`Settings/index.jsx`)

**No pre-defined user globals exist in the codebase.**

The variable system was designed as a **blank container** for users to populate themselves. There is:
- No seed data for default globals
- No canonical list of expected variables
- No preset variable keys

Users must create their own globals like:
- `sender_name`
- `sender_email`
- `company_name`
- `brand_voice`
- etc.

These would be entirely user-defined and stored in `tenantSettings.globalVariables`.

---

## EVIDENCE

1. **Empty default**: `canonical_settings.py:56` - `"globalVariables": {}`
2. **No seed**: Search of entire codebase shows no seed/preset global variables
3. **User-managed**: Frontend `Settings/index.jsx` shows UI for users to add/edit variables
4. **Flexible schema**: Variables can have any `key`, with optional `label`, `category`, `description`, `value`, `isSecret`
