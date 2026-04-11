import copy


CAPABILITY_CATALOG = [
    {
        "id": "crm",
        "label": "CRM",
        "capabilities": [
            {"id": "crm.view", "label": "View CRM", "description": "Read contacts, companies, and CRM records."},
            {"id": "crm.edit", "label": "Edit CRM", "description": "Create and update CRM records and activities."},
            {"id": "crm.delete", "label": "Delete CRM", "description": "Archive or permanently delete CRM records."},
        ],
    },
    {
        "id": "comms",
        "label": "Comms",
        "capabilities": [
            {"id": "comms.view", "label": "View Comms", "description": "Read threads, call logs, and mailbox data."},
            {"id": "comms.operate", "label": "Operate Comms", "description": "Send messages, place calls, and run operator actions."},
            {"id": "comms.admin", "label": "Admin Comms", "description": "Manage numbers, plans, and provider-level comms settings."},
        ],
    },
    {
        "id": "studio",
        "label": "Studio",
        "capabilities": [
            {"id": "studio.view", "label": "View Studio", "description": "Read media assets, jobs, and publishing surfaces."},
            {"id": "studio.create", "label": "Create Studio Jobs", "description": "Create rendering, transcription, and publishing jobs."},
            {"id": "studio.manage", "label": "Manage Studio", "description": "Delete assets or manage studio configuration."},
        ],
    },
    {
        "id": "flows",
        "label": "Flows",
        "capabilities": [
            {"id": "flows.view", "label": "View Flows", "description": "Read workflow and draft state."},
            {"id": "flows.edit", "label": "Edit Flows", "description": "Create, update, and save workflow definitions."},
            {"id": "flows.execute", "label": "Execute Flows", "description": "Run flows and manual triggers."},
        ],
    },
    {
        "id": "forms",
        "label": "Forms",
        "capabilities": [
            {"id": "forms.view", "label": "View Forms", "description": "Read forms, folders, and submissions."},
            {"id": "forms.edit", "label": "Edit Forms", "description": "Create and update forms and folders."},
            {"id": "forms.delete", "label": "Delete Forms", "description": "Remove forms and form folders."},
        ],
    },
    {
        "id": "cortex",
        "label": "Cortex / Brain",
        "capabilities": [
            {"id": "cortex.view", "label": "View Cortex", "description": "Read Brain, vault, analytics, and knowledge surfaces."},
            {"id": "cortex.edit", "label": "Edit Cortex", "description": "Create or update Brain knowledge, sources, and assets."},
            {"id": "cortex.execute", "label": "Operate Cortex", "description": "Run reports, ingests, and AI-assisted analysis."},
        ],
    },
    {
        "id": "vault",
        "label": "Vault",
        "capabilities": [
            {"id": "vault.view", "label": "View Vault", "description": "Read secured vault inventory and asset tags."},
            {"id": "vault.manage", "label": "Manage Vault", "description": "Update vault asset metadata and protected assets."},
        ],
    },
    {
        "id": "integrations",
        "label": "Integrations",
        "capabilities": [
            {"id": "integrations.view", "label": "View Integrations", "description": "Inspect connected providers and health."},
            {"id": "integrations.manage", "label": "Manage Integrations", "description": "Connect, edit, and test providers."},
        ],
    },
    {
        "id": "system",
        "label": "System / Admin",
        "capabilities": [
            {"id": "system.view", "label": "View System", "description": "Read variables, settings, and system health."},
            {"id": "system.manage", "label": "Manage Settings", "description": "Edit protected settings, variables, and tenant controls."},
            {"id": "system.admin", "label": "Admin Authority", "description": "Manage roles, workspace administration, and restricted controls."},
            {"id": "system.omega", "label": "Omega Control", "description": "Access owner-only Omega protocol controls."},
        ],
    },
    {
        "id": "client",
        "label": "Client / Guest",
        "capabilities": [
            {"id": "client.access", "label": "Client Access", "description": "Restricted access for client-facing surfaces and PII filtering."},
        ],
    },
]

ALL_CAPABILITY_IDS = tuple(
    capability["id"]
    for domain in CAPABILITY_CATALOG
    for capability in domain["capabilities"]
)

SYSTEM_ROLE_TEMPLATES = {
    "owner": {
        "name": "Owner",
        "description": "Full workspace authority including protected system controls.",
        "capabilities": ALL_CAPABILITY_IDS,
    },
    "admin": {
        "name": "Admin",
        "description": "Administrative operator with broad management authority across workspace systems.",
        "capabilities": tuple(capability for capability in ALL_CAPABILITY_IDS if capability != "system.omega"),
    },
    "staff": {
        "name": "Staff",
        "description": "Operational role for day-to-day execution across active work surfaces.",
        "capabilities": (
            "crm.view",
            "crm.edit",
            "comms.view",
            "comms.operate",
            "studio.view",
            "studio.create",
            "flows.view",
            "flows.edit",
            "flows.execute",
            "forms.view",
            "forms.edit",
            "cortex.view",
            "cortex.edit",
            "cortex.execute",
            "vault.view",
            "integrations.view",
            "system.view",
        ),
    },
    "viewer": {
        "name": "Viewer",
        "description": "Read-only workspace access across approved surfaces.",
        "capabilities": (
            "crm.view",
            "comms.view",
            "studio.view",
            "flows.view",
            "forms.view",
            "cortex.view",
            "vault.view",
            "integrations.view",
            "system.view",
        ),
    },
}


def clone_capability_catalog():
    return copy.deepcopy(CAPABILITY_CATALOG)


def clone_system_role_templates():
    return copy.deepcopy(SYSTEM_ROLE_TEMPLATES)
