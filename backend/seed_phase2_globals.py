#!/usr/bin/env python3
"""
Phase 2 User Globals Seeding Script

This script implements the approved Phase 2 globals from Phase 1 analysis.
Only true global candidates are implemented as structured email templates.

Implements:
- emailTemplates (variant1, variant2, variant3) - structured
- Backward-compatible flat keys for legacy access
"""

import json
import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "aio_crm.db"

STRUCTURED_EMAIL_TEMPLATES = {
    "variant1": {
        "header": "",
        "subject": "",
        "salutation": "",
        "body": "",
        "cta": "",
        "close": "",
        "signature": "",
        "footer": ""
    },
    "variant2": {
        "header": "",
        "subject": "",
        "salutation": "",
        "body": "",
        "cta": "",
        "close": "",
        "signature": "",
        "footer": ""
    },
    "variant3": {
        "header": "",
        "subject": "",
        "salutation": "",
        "body": "",
        "cta": "",
        "close": "",
        "signature": "",
        "footer": ""
    }
}

BACKWARD_COMPAT_KEYS = {
    "emailTemplates": {
        "value": json.dumps(STRUCTURED_EMAIL_TEMPLATES),
        "label": "Email Templates",
        "category": "templates",
        "description": "Structured email template variants (variant1, variant2, variant3)",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailHeader1": {
        "value": "",
        "label": "Email Header 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.header",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSubject1": {
        "value": "",
        "label": "Email Subject 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.subject",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSalutation1": {
        "value": "",
        "label": "Email Salutation 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.salutation",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailBody1": {
        "value": "",
        "label": "Email Body 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.body",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailCTA1": {
        "value": "",
        "label": "Email CTA 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.cta",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailClose1": {
        "value": "",
        "label": "Email Close 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.close",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSignature1": {
        "value": "",
        "label": "Email Signature 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.signature",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailFooter1": {
        "value": "",
        "label": "Email Footer 1",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant1.footer",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailHeader2": {
        "value": "",
        "label": "Email Header 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.header",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSubject2": {
        "value": "",
        "label": "Email Subject 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.subject",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSalutation2": {
        "value": "",
        "label": "Email Salutation 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.salutation",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailBody2": {
        "value": "",
        "label": "Email Body 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.body",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailCTA2": {
        "value": "",
        "label": "Email CTA 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.cta",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailClose2": {
        "value": "",
        "label": "Email Close 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.close",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSignature2": {
        "value": "",
        "label": "Email Signature 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.signature",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailFooter2": {
        "value": "",
        "label": "Email Footer 2",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant2.footer",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailHeader3": {
        "value": "",
        "label": "Email Header 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.header",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSubject3": {
        "value": "",
        "label": "Email Subject 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.subject",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSalutation3": {
        "value": "",
        "label": "Email Salutation 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.salutation",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailBody3": {
        "value": "",
        "label": "Email Body 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.body",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailCTA3": {
        "value": "",
        "label": "Email CTA 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.cta",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailClose3": {
        "value": "",
        "label": "Email Close 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.close",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailSignature3": {
        "value": "",
        "label": "Email Signature 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.signature",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    },
    "emailFooter3": {
        "value": "",
        "label": "Email Footer 3",
        "category": "email",
        "description": "Legacy: Use emailTemplates.variant3.footer",
        "isSystem": False,
        "isSecret": False,
        "editableByClient": True
    }
}

MIGRATION_MAPPING = {
    "emailHeader1": "emailTemplates.variant1.header",
    "emailSubject1": "emailTemplates.variant1.subject",
    "emailSalutation1": "emailTemplates.variant1.salutation",
    "emailBody1": "emailTemplates.variant1.body",
    "emailCTA1": "emailTemplates.variant1.cta",
    "emailClose1": "emailTemplates.variant1.close",
    "emailSignature1": "emailTemplates.variant1.signature",
    "emailFooter1": "emailTemplates.variant1.footer",
    "emailHeader2": "emailTemplates.variant2.header",
    "emailSubject2": "emailTemplates.variant2.subject",
    "emailSalutation2": "emailTemplates.variant2.salutation",
    "emailBody2": "emailTemplates.variant2.body",
    "emailCTA2": "emailTemplates.variant2.cta",
    "emailClose2": "emailTemplates.variant2.close",
    "emailSignature2": "emailTemplates.variant2.signature",
    "emailFooter2": "emailTemplates.variant2.footer",
    "emailHeader3": "emailTemplates.variant3.header",
    "emailSubject3": "emailTemplates.variant3.subject",
    "emailSalutation3": "emailTemplates.variant3.salutation",
    "emailBody3": "emailTemplates.variant3.body",
    "emailCTA3": "emailTemplates.variant3.cta",
    "emailClose3": "emailTemplates.variant3.close",
    "emailSignature3": "emailTemplates.variant3.signature",
    "emailFooter3": "emailTemplates.variant3.footer",
}


def get_tenants(conn: sqlite3.Connection) -> list[tuple]:
    return conn.execute("SELECT id, name FROM tenants WHERE archivedAt IS NULL").fetchall()


def seed_globals_for_tenant(conn: sqlite3.Connection, tenant_id: str, user_id: str) -> dict:
    import secrets
    from datetime import datetime
    
    results = {"created": [], "skipped": [], "errors": []}
    now = datetime.utcnow().isoformat()
    
    for key, details in BACKWARD_COMPAT_KEYS.items():
        existing = conn.execute(
            "SELECT id FROM global_variables WHERE tenantId = ? AND key = ? LIMIT 1",
            (tenant_id, key),
        ).fetchone()
        
        if existing:
            results["skipped"].append(key)
            continue
        
        try:
            config = json.dumps({
                "label": details["label"],
                "category": details["category"],
                "editableByClient": details["editableByClient"]
            })
            
            conn.execute(
                """
                INSERT INTO global_variables 
                (id, tenantId, key, value, description, isSecret, isSystem, configJson, createdByUserId, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"gvar-{secrets.token_hex(8)}",
                    tenant_id,
                    key,
                    str(details["value"]),
                    details["description"],
                    1 if details["isSecret"] else 0,
                    1 if details["isSystem"] else 0,
                    config,
                    user_id,
                    now,
                    now,
                ),
            )
            results["created"].append(key)
        except Exception as e:
            results["errors"].append(f"{key}: {str(e)}")
    
    conn.commit()
    return results


def main():
    if not DB_PATH.exists():
        print(f"ERROR: Database not found at {DB_PATH}")
        sys.exit(1)
    
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    
    try:
        tenants = get_tenants(conn)
        if not tenants:
            print("No tenants found in database")
            sys.exit(1)
        
        print(f"Found {len(tenants)} tenant(s)")
        
        for tenant_id, tenant_name in tenants:
            print(f"\nSeeding globals for tenant: {tenant_name} ({tenant_id})")
            
            user_id = conn.execute(
                "SELECT userId FROM memberships WHERE tenantId = ? LIMIT 1",
                (tenant_id,)
            ).fetchone()
            
            if not user_id:
                print(f"  No users found for tenant, using placeholder")
                user_id = "system-seed"
            else:
                user_id = user_id[0]
            
            results = seed_globals_for_tenant(conn, tenant_id, user_id)
            
            print(f"  Created: {len(results['created'])}")
            print(f"  Skipped (already exists): {len(results['skipped'])}")
            if results['errors']:
                print(f"  Errors: {results['errors']}")
        
        print("\n=== PHASE 2 GLOBALS SEEDING COMPLETE ===")
        print("\nSTRUCTURED OBJECT:")
        print(json.dumps(STRUCTURED_EMAIL_TEMPLATES, indent=2))
        
        print("\nMIGRATION MAPPING (legacy flat key -> structured path):")
        for flat, structured in MIGRATION_MAPPING.items():
            print(f"  {flat} -> {structured}")
        
    finally:
        conn.close()


if __name__ == "__main__":
    main()
