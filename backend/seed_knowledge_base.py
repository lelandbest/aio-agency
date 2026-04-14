import sqlite3
import json
import uuid
from pathlib import Path
from datetime import datetime

# Pathing
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "data" / "aio_crm.db"
TENANT_ID = "tenant-primary"

ARTICLES = [
    {
        "title": "AIO System Foundations",
        "category": "system",
        "tags": ["META:DOC:HELP", "SYSTEM:CORE"],
        "content": """# AIO System Foundations

The AIO platform is built on a three-pillar architecture:

1. **Cortex (Execution)**: The reactive heart of the system. It handles triggers, runs workflows, and executes atomic actions (SMS, Email, Calendar).
2. **Brain (Memory)**: A persistent knowledge layer. It stores system data, documentation (META:DOC:HELP), and historical context.
3. **Agents (Intelligence)**: Specialized processes like Charlie, Alpha, and Omega that interact with users and the system.

## Guidance Layers
- **Brain Icon**: Accesses global system knowledge and diagnostic state.
- **Crosshair Icon**: Provides module-specific guidance grounded on these help articles."""
    },
    {
        "title": "Operator Standard Operating Procedure",
        "category": "operations",
        "tags": ["META:DOC:HELP", "OPS:SOP"],
        "content": """# Operator Standard Operating Procedure (SOP)

As an AIO Operator, your primary goal is to ensure the deterministic execution of the Cortex.

## Daily Triage Lifecycle
1. **Monitor Active Runs**: Check the Agents module for execution status.
2. **Diagnose Failures**: If a run fails, use the Brain icon to ask for a diagnostic. Common causes include missing Global Variables or API provider disconnects.
3. **Field Guidance**: Use Crosshair in any module to get immediate help on specific field requirements or procedure steps.

## Escalation
If a self-constructing help article is marked as PENDING, it means the system has identified a knowledge gap and is queuing content generation."""
    },
    {
        "title": "CRM & Lead Management",
        "category": "crm",
        "tags": ["META:DOC:HELP", "CRM:GUIDE"],
        "content": """# CRM & Lead Management Guide

The CRM module is the central repository for all client interactions.

## Key Procedures
- **Lead Statuses**: Use HOT, WARM, and COLD tags to prioritize follow-up.
- **Contact Ingest**: Leads from SMS/Email flows are automatically ingested into the CRM.
- **Bulk Actions**: You can select multiple contacts to trigger collective flows or tag updates.

## Integrations
The CRM is bi-directionally linked with the Comms module. A change in CRM status can trigger automated SMS follow-ups via the Flows engine."""
    }
]

def seed_knowledge_base():
    if not DB_PATH.exists():
        print(f"Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    print(f"Seeding {len(ARTICLES)} help articles...")

    for article in ARTICLES:
        item_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        
        # Insert into brain_items using correct column names
        cursor.execute(
            """INSERT INTO brain_items 
               (id, tenantId, title, category, content, tagsJson, metadataJson, createdAt, updatedAt) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                item_id,
                TENANT_ID,
                article["title"],
                article["category"],
                article["content"],
                json.dumps(article["tags"]),
                json.dumps({"source": "seed_script", "author": "Antigravity"}),
                now,
                now
            )
        )

    conn.commit()
    conn.close()
    print("Seeding complete.")

if __name__ == "__main__":
    seed_knowledge_base()
