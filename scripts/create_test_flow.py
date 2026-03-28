import sqlite3
import json
import os

DB_PATH = r"D:\AIOCRM\backend\data\aio_crm.db"

flow_data = {
    "id": "cold-outreach-test-123",
    "name": "Cold Outreach Test Flow",
    "status": "active",
    "nodes": [
        {
            "id": "trigger-1",
            "type": "trigger",
            "position": {"x": 100, "y": 100},
            "data": {
                "templateId": "manual-trigger",
                "label": "Start Outreach"
            }
        },
        {
            "id": "ai-1",
            "type": "action",
            "position": {"x": 400, "y": 100},
            "data": {
                "templateId": "echo-email-template",
                "label": "Generate Email",
                "config": {
                    "prompt": "Personalized outreach for {{ lead.firstName }} ({{ lead.email }}) interested in {{ lead.keyword }}. Business Type: {{ lead.businessType }}."
                }
            }
        },
        {
            "id": "send-1",
            "type": "action",
            "position": {"x": 700, "y": 100},
            "data": {
                "templateId": "send-email",
                "label": "Send Personalized Email",
                "config": {
                    "to": "{{ lead.email }}",
                    "subject": "Quick question about {{ lead.keyword }}",
                    "body": "{{ nodes.ai-1.data.body }}"
                }
            }
        },
        {
            "id": "delay-1",
            "type": "logic",
            "position": {"x": 1000, "y": 100},
            "data": {
                "templateId": "time-delay",
                "label": "Wait 1 Minute",
                "config": {
                    "duration": 1,
                    "unit": "minutes"
                }
            }
        },
        {
            "id": "if-1",
            "type": "logic",
            "position": {"x": 1300, "y": 100},
            "data": {
                "templateId": "if-then",
                "label": "Check Interest",
                "config": {
                    "operator": "equals",
                    "left": "{{ lead.keyword }}",
                    "right": "AI"
                }
            }
        },
        {
            "id": "set-1",
            "type": "action",
            "position": {"x": 1600, "y": 0},
            "data": {
                "templateId": "set-variable",
                "label": "Flag as High Priority",
                "config": {
                    "values": {
                        "priority": "high"
                    }
                }
            }
        },
        {
            "id": "set-2",
            "type": "action",
            "position": {"x": 1600, "y": 200},
            "data": {
                "templateId": "set-variable",
                "label": "Flag as Standard",
                "config": {
                    "values": {
                        "priority": "normal"
                    }
                }
            }
        }
    ],
    "edges": [
        {"id": "e1", "source": "trigger-1", "target": "ai-1"},
        {"id": "e2", "source": "ai-1", "target": "send-1"},
        {"id": "e3", "source": "send-1", "target": "delay-1"},
        {"id": "e4", "source": "delay-1", "target": "if-1"},
        {"id": "e5", "source": "if-1", "target": "set-1", "label": "true", "sourceHandle": "true"},
        {"id": "e6", "source": "if-1", "target": "set-2", "label": "false", "sourceHandle": "false"}
    ]
}

def setup():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Delete existing test flow if any
    cursor.execute("DELETE FROM flows WHERE id = ?", (flow_data["id"],))
    
    # Insert new flow
    cursor.execute(
        """
        INSERT INTO flows (
            id, tenant_id, name, status, nodes_json, edges_json, 
            spec_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """,
        (
            flow_data["id"],
            "tenant-primary",
            flow_data["name"],
            flow_data["status"],
            json.dumps(flow_data["nodes"]),
            json.dumps(flow_data["edges"]),
            "{}",
            "{}"
        )
    )
    
    conn.commit()
    conn.close()
    print(f"Flow '{flow_data['name']}' created successfully with ID: {flow_data['id']}")

if __name__ == "__main__":
    setup()
