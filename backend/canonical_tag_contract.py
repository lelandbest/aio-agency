"""
CANONICAL TAG SYSTEM CONTRACT
==============================

Version: 1.0
Last Updated: 2026-03-30

This document defines the canonical tag system rules enforced by the codebase.

------------------------------------------------------------------------
CANONICAL PREFIXES
------------------------------------------------------------------------

Only these prefixes are recognized for system tags:

    AI, AUT, CRM, CS, MKT, MKG, MTG, CP, CD, EVT, OPS, PM, META, ROLE

------------------------------------------------------------------------
CANONICAL FORMAT
------------------------------------------------------------------------

All canonical system tags MUST follow:

    PREFIX:NAME

Where:
- PREFIX is one of the canonical prefixes (uppercase)
- NAME is uppercase (e.g., CRM:HOT, META:AGENT)

------------------------------------------------------------------------
TAG TYPES
------------------------------------------------------------------------

- system:   Canonical taxonomy tags (locked)
- user:     User-created tags (not locked)
- meta:     Metadata tags (if needed)

------------------------------------------------------------------------
LOCK RULES
------------------------------------------------------------------------

- System tags (type=system) MUST be locked (is_locked=1)
- Locked tags CANNOT be renamed via update_tag()
- Locked tags CANNOT be deleted via delete_tag()
- Lock protection is enforced in data_provider.py:5085-5086 and 5102-5103

------------------------------------------------------------------------
DUPLICATE RULES
------------------------------------------------------------------------

- Tag names are unique case-insensitively
- Duplicate creation is blocked in data_provider.py:5051-5052
- Exact duplicate rows should not exist

------------------------------------------------------------------------
ENFORCEMENT POINTS
------------------------------------------------------------------------

The following code paths enforce the canonical tag contract:

1. data_provider.py:5043-5044
   - Format validation: requires PREFIX:NAME

2. data_provider.py:5047-5049
   - Prefix validation: only canonical prefixes allowed

3. data_provider.py:5051-5052
   - Duplicate prevention: blocks duplicate names

4. data_provider.py:5085-5086
   - Lock protection: prevents rename of locked tags

5. data_provider.py:5102-5103
   - Lock protection: prevents delete of system/locked tags

------------------------------------------------------------------------
REQUIRED SYSTEM TAGS
------------------------------------------------------------------------

The following tags MUST exist and be locked:

META:
    META:AGENT
    META:ACCESS:INTERNAL
    META:DOC:HELP

CRM:
    CRM:HOT
    CRM:WARM
    CRM:COLD

ROLE:
    ROLE:CMD
    ROLE:BIZ
    ROLE:CS
    ROLE:VIS
    ROLE:COM
    ROLE:CPY
    ROLE:DEV
    ROLE:FIN
    ROLE:OPS
    ROLE:SEO
    ROLE:HR
    ROLE:SLS
    ROLE:DES
    ROLE:SYS

------------------------------------------------------------------------
STORAGE
------------------------------------------------------------------------

- Table: tags
- Location: aio_crm.db
- Read/Write: data_provider.py (list_tags, create_tag, update_tag, delete_tag)
- API: /api/tags (GET, POST, PATCH, DELETE)

------------------------------------------------------------------------
NON-CANONICAL USER TAGS
------------------------------------------------------------------------

User tags without PREFIX:NAME format (e.g., "Customer", "VIP", "Hot Lead")
are preserved but:
- Are not locked
- Are not system tags
- Do not have prefix populated

These should be reviewed for potential migration to canonical format.

------------------------------------------------------------------------
CASING CONTRACT (UPPERCASE ENFORCEMENT)
------------------------------------------------------------------------

- All tags (system and user) are canonically stored in UPPERCASE.
- Mixed-case or lowercase tags are NOT permitted in persistence.
- Normalization to UPPERCASE is enforced before database/state writes.
- API-returned tags are guaranteed to be uppercase by the service layer.
- UI must NOT be treated as the source of truth for casing logic.
- NEW TAG WRITE PATHS must reuse the canonical normalization helpers 
  (e.g., media_engine.py:normalize_controlled_tags or data_provider.py 
  creation methods) and MUST NOT implement local casing behavior.

------------------------------------------------------------------------
"""

CANONICAL_PREFIXES = frozenset({
    "AI", "AUT", "CRM", "CS", "MKT", "MKG", "MTG", "CP", "CD", "EVT", "OPS", "PM", "META", "ROLE"
})

REQUIRED_SYSTEM_TAGS = frozenset({
    "META:AGENT",
    "META:ACCESS:INTERNAL", 
    "META:DOC:HELP",
    "CRM:HOT",
    "CRM:WARM",
    "CRM:COLD",
    "ROLE:CMD",
    "ROLE:BIZ",
    "ROLE:CS",
    "ROLE:VIS",
    "ROLE:COM",
    "ROLE:CPY",
    "ROLE:DEV",
    "ROLE:FIN",
    "ROLE:OPS",
    "ROLE:SEO",
    "ROLE:HR",
    "ROLE:SLS",
    "ROLE:DES",
    "ROLE:SYS",
})

def validate_tag_name(name: str) -> tuple[bool, str | None]:
    """Validate tag name follows canonical format PREFIX:NAME"""
    if ":" not in name:
        return False, "Tag must follow PREFIX:NAME format"
    
    prefix, _, rest = name.partition(":")
    if not prefix or not rest:
        return False, "Tag must follow PREFIX:NAME format"
    
    if prefix.upper() not in CANONICAL_PREFIXES:
        return False, f"Invalid prefix '{prefix}'. Allowed: {', '.join(sorted(CANONICAL_PREFIXES))}"
    
    return True, None

def get_required_system_tags() -> set:
    """Return the set of required system tag names"""
    return REQUIRED_SYSTEM_TAGS
