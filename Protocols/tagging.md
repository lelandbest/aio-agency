# Tagging Protocol

Agents MUST follow these rules when working with tags.

---

## Golden Rule

**NEVER create tags without explicit operator approval.**

Tags are managed by the system. Agents only READ and ASSIGN existing tags.

---

## Required Tag Prefixes

Only these prefixes are valid:

| Prefix | Purpose |
|--------|---------|
| AI | AI-related tags |
| AUT | Authoring/automation tags |
| CRM | Customer relationship management |
| CS | Customer service |
| MKG | Marketing |
| MKT | Marketing campaigns |
| MTG | Meetings |
| CP | Capture/prospecting |
| CD | Content/creative assets |
| EVT | Events |
| OPS | Operations |
| PM | Project management |
| META | Meta/system tags |
| ROLE | User roles |

---

## Required System Tags

These tags MUST exist and be locked:

### Meta
- `META:AGENT`
- `META:ACCESS:INTERNAL`
- `META:DOC:HELP`

### CRM
- `CRM:HOT`
- `CRM:WARM`
- `CRM:COLD`

### Roles
- `ROLE:CMD`, `ROLE:BIZ`, `ROLE:CS`, `ROLE:VIS`, `ROLE:COM`
- `ROLE:CPY`, `ROLE:DEV`, `ROLE:FIN`, `ROLE:OPS`, `ROLE:SEO`
- `ROLE:HR`, `ROLE:SLS`, `ROLE:DES`, `ROLE:SYS`

### Other
- `AI:BOT`, `AI:AUT`
- `MKG:EMAIL`, `MKT:DIGITAL`
- `MTG:SCHEDULE`, `CP:LEAD`, `CD:ASSET`
- `EVT:WEBINAR`, `PM:PROJECT`

---

## Tag Format

All tags MUST follow: `PREFIX:NAME`

- Uppercase only
- Colon separator
- No spaces
- Examples: `CRM:HOT`, `ROLE:DEV`, `META:AGENT`

---

## Agent Behavior

### DO:
- Read available tags from `/api/tags`
- Assign existing tags to contacts/resources
- Filter contacts by existing tags
- Suggest new tags to operator (never create)

### DON'T:
- Create tags via API
- Use hardcoded mock tags
- Suggest tags outside canonical prefix list
- Modify tag structure without approval

---

## If a Needed Tag Doesn't Exist

1. Stop
2. Report to operator: "Tag [X] doesn't exist. Please create it or approve creation."
3. Wait for approval
4. Never proceed with ad-hoc tag creation

---

## Compliance Check

Before any tag-related operation:
- Verify tag exists in database
- Verify tag follows `PREFIX:NAME` format
- Verify tag has correct prefix from allowed list

If any check fails → report to operator, do not proceed.
