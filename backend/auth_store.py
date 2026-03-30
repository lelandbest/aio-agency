import copy
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

try:
    from backend.canonical_settings import (
        DEFAULT_SYSTEM_SETTINGS,
        DEFAULT_TENANT_SETTINGS,
        DEFAULT_USER_SETTINGS,
        FIELD_POLICIES,
        build_settings_bundle,
        export_tenant_blueprint as build_tenant_blueprint,
        import_tenant_blueprint as load_tenant_blueprint,
        merge_with_defaults,
        normalize_system_settings_payload,
        normalize_tenant_settings_payload,
        normalize_user_settings_payload,
        strip_derived_tenant_sections,
        tenant_settings_to_legacy_view,
        validate_against_schema,
    )
    from backend.tenant_deployment import DeploymentFailureError, build_deployment_plan, list_blueprint_registry
except ModuleNotFoundError:
    from canonical_settings import (
        DEFAULT_SYSTEM_SETTINGS,
        DEFAULT_TENANT_SETTINGS,
        DEFAULT_USER_SETTINGS,
        FIELD_POLICIES,
        build_settings_bundle,
        export_tenant_blueprint as build_tenant_blueprint,
        import_tenant_blueprint as load_tenant_blueprint,
        merge_with_defaults,
        normalize_system_settings_payload,
        normalize_tenant_settings_payload,
        normalize_user_settings_payload,
        strip_derived_tenant_sections,
        tenant_settings_to_legacy_view,
        validate_against_schema,
    )
    from tenant_deployment import DeploymentFailureError, build_deployment_plan, list_blueprint_registry


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat()


def normalize_email(value: str) -> str:
    return value.strip().lower()


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    resolved_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), resolved_salt.encode("utf-8"), 240000).hex()
    return digest, resolved_salt


def verify_password(password: str, password_hash: str, password_salt: str) -> bool:
    digest, _ = hash_password(password, password_salt)
    return hmac.compare_digest(digest, password_hash)


def slugify(value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in (value or "").strip())
    compact = "-".join(part for part in normalized.split("-") if part)
    return compact or "workspace"


USER_ROLES = {"operator", "client"}
WORKSPACE_MEMBERSHIP_ROLES = {"owner", "admin", "staff", "viewer", "member"}


def normalize_user_role(value: Any) -> str:
    return "client" if str(value or "").strip().lower() == "client" else "operator"


def resolve_workspace_membership_seed_role(value: Any) -> str:
    role = str(value or "").strip().lower()
    return role if role in WORKSPACE_MEMBERSHIP_ROLES else "owner"


class AuthStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    slug TEXT NOT NULL UNIQUE,
                    settingsJson TEXT NOT NULL DEFAULT '{}',
                    archivedAt TEXT,
                    archivedByUserId TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    username TEXT,
                    displayName TEXT,
                    passwordHash TEXT,
                    passwordSalt TEXT,
                    authProvider TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'operator',
                    avatarUrl TEXT,
                    lastLoginAt TEXT,
                    userSettingsJson TEXT NOT NULL DEFAULT '{}',
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    id TEXT PRIMARY KEY,
                    systemSettingsJson TEXT NOT NULL DEFAULT '{}',
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_sessions (
                    id TEXT PRIMARY KEY,
                    userId TEXT NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    provider TEXT NOT NULL,
                    currentTenantId TEXT,
                    createdAt TEXT NOT NULL,
                    expiresAt TEXT NOT NULL,
                    lastSeenAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memberships (
                    id TEXT PRIMARY KEY,
                    userId TEXT NOT NULL,
                    tenantId TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'member',
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(userId, tenantId)
                );

                CREATE TABLE IF NOT EXISTS aiEngineRuns (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    userId TEXT NOT NULL,
                    module TEXT NOT NULL,
                    surface TEXT NOT NULL,
                    field TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'completed',
                    agentRole TEXT,
                    intakeAgent TEXT,
                    dispatcherAgent TEXT,
                    executingAgent TEXT,
                    requestedAgent TEXT,
                    delegateChainJson TEXT,
                    permissionTier TEXT,
                    threadId TEXT,
                    contactId TEXT,
                    companyId TEXT,
                    commandText TEXT,
                    providerKey TEXT,
                    providerLabel TEXT,
                    model TEXT,
                    prompt TEXT NOT NULL,
                    result TEXT NOT NULL,
                    artifactsJson TEXT,
                    stepsJson TEXT,
                    metadataJson TEXT,
                    createdAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ai_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    providerKey TEXT NOT NULL,
                    label TEXT NOT NULL,
                    baseUrl TEXT,
                    model TEXT,
                    apiKey TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    isDefault INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    configJson TEXT,
                    lastTestedAt TEXT,
                    lastError TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(tenantId, providerKey)
                );

                CREATE TABLE IF NOT EXISTS ai_routing_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL UNIQUE,
                    configJson TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );


                CREATE TABLE IF NOT EXISTS automation_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    providerKey TEXT NOT NULL,
                    label TEXT NOT NULL,
                    baseUrl TEXT,
                    apiKey TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    configJson TEXT,
                    lastTestedAt TEXT,
                    lastError TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(tenantId, providerKey)
                );

                CREATE TABLE IF NOT EXISTS payment_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    providerKey TEXT NOT NULL,
                    label TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    configJson TEXT,
                    lastTestedAt TEXT,
                    lastError TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(tenantId, providerKey)
                );

                CREATE TABLE IF NOT EXISTS media_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    providerKey TEXT NOT NULL,
                    label TEXT NOT NULL,
                    baseUrl TEXT,
                    apiKey TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    configJson TEXT,
                    lastTestedAt TEXT,
                    lastError TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(tenantId, providerKey)
                );

                CREATE TABLE IF NOT EXISTS omega_protocols (
                    tenantId TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'idle',
                    armedByUserId TEXT,
                    armedAt TEXT,
                    executeAt TEXT,
                    armCodeHash TEXT,
                    cancelCodeHash TEXT,
                    lastEvent TEXT,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS omega_protocol_events (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    userId TEXT,
                    eventType TEXT NOT NULL,
                    detail TEXT,
                    createdAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS global_variables (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    description TEXT,
                    isSecret INTEGER NOT NULL DEFAULT 0,
                    isSystem INTEGER NOT NULL DEFAULT 0,
                    configJson TEXT,
                    createdByUserId TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(tenantId, key)
                );

                CREATE TABLE IF NOT EXISTS system_email_templates (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    templateKey TEXT NOT NULL,
                    emailType TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    sendTo TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    bodyHtml TEXT,
                    bodyText TEXT,
                    editedByUserId TEXT,
                    editedByName TEXT,
                    editedAt TEXT,
                    configJson TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    UNIQUE(tenantId, templateKey)
                );

                CREATE TABLE IF NOT EXISTS flows (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    nodesJson TEXT NOT NULL,
                    edgesJson TEXT NOT NULL,
                    specJson TEXT,
                    metadataJson TEXT NOT NULL,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL,
                    createdBy TEXT,
                    lastEditedBy TEXT
                );

                CREATE TABLE IF NOT EXISTS tenant_deployments (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT,
                    blueprintId TEXT,
                    blueprintName TEXT,
                    blueprintVersion TEXT,
                    blueprintSource TEXT,
                    status TEXT NOT NULL,
                    validationJson TEXT,
                    errorJson TEXT,
                    initiatedByUserId TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY,
                    tenantId TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    priority TEXT NOT NULL DEFAULT 'normal',
                    link TEXT,
                    isRead INTEGER NOT NULL DEFAULT 0,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                );
                """
            )
            self._ensure_column(conn, "tenants", "settingsJson", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(conn, "tenants", "archivedAt", "TEXT")
            self._ensure_column(conn, "tenants", "archivedByUserId", "TEXT")
            self._ensure_column(conn, "app_users", "username", "TEXT")
            self._ensure_column(conn, "app_users", "phone", "TEXT")
            self._ensure_column(conn, "app_users", "locale", "TEXT")
            self._ensure_column(conn, "app_users", "timezone", "TEXT")
            self._ensure_column(conn, "app_users", "emailSignature", "TEXT")
            self._ensure_column(conn, "app_users", "userSettingsJson", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(conn, "app_sessions", "currentTenantId", "TEXT")
            self._ensure_column(conn, "app_sessions", "userAgent", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "status", "TEXT NOT NULL DEFAULT 'completed'")
            self._ensure_column(conn, "aiEngineRuns", "agentRole", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "intakeAgent", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "dispatcherAgent", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "executingAgent", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "requestedAgent", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "delegateChainJson", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "permissionTier", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "threadId", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "contactId", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "companyId", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "commandText", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "providerKey", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "providerLabel", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "model", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "artifactsJson", "TEXT")
            self._ensure_column(conn, "aiEngineRuns", "stepsJson", "TEXT")
            self._ensure_column(conn, "global_variables", "configJson", "TEXT")
            conn.execute("UPDATE tenants SET settingsJson = COALESCE(settingsJson, '{}')")
            conn.execute("UPDATE app_users SET userSettingsJson = COALESCE(userSettingsJson, '{}')")
            conn.execute(
                """
                UPDATE app_users
                SET role = CASE
                    WHEN lower(COALESCE(role, '')) = 'client' THEN 'client'
                    ELSE 'operator'
                END
                """
            )
            self._backfill_usernames(conn)
            self._backfill_default_workspace(conn)
            self._seed_system_settings(conn)
            self._seed_default_system_email_templates(conn)
            conn.commit()

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def _backfill_default_workspace(self, conn: sqlite3.Connection) -> None:
        now = utcnow_iso()
        tenant_row = conn.execute("SELECT * FROM tenants ORDER BY createdAt ASC LIMIT 1").fetchone()
        if not tenant_row:
            tenant_id = "tenant-primary"
            tenant_name = "AIO CRM Workspace"
            persisted_settings = {"tenantSettings": strip_derived_tenant_sections(DEFAULT_TENANT_SETTINGS)}
            conn.execute(
                "INSERT INTO tenants (id, name, slug, settingsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                (tenant_id, tenant_name, slugify(tenant_name), json.dumps(persisted_settings), now, now),
            )
            tenant_row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()

        users = conn.execute("SELECT id, role FROM app_users").fetchall()
        for user in users:
            existing_membership = conn.execute(
                "SELECT id FROM memberships WHERE userId = ? AND tenantId = ? LIMIT 1",
                (user["id"], tenant_row["id"]),
            ).fetchone()
            if not existing_membership:
                conn.execute(
                    """
                    INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"membership-{secrets.token_hex(8)}",
                        user["id"],
                        tenant_row["id"],
                        resolve_workspace_membership_seed_role(user["role"]),
                        now,
                        now,
                    ),
                )

        sessions = conn.execute("SELECT id, userId, currentTenantId FROM app_sessions").fetchall()
        for session in sessions:
            currentTenantId = session["currentTenantId"]
            if currentTenantId:
                membership = conn.execute(
                    "SELECT id FROM memberships WHERE userId = ? AND tenantId = ? LIMIT 1",
                    (session["userId"], currentTenantId),
                ).fetchone()
                if membership:
                    continue
            default_membership = conn.execute(
                """
                SELECT m.tenantId
                FROM memberships m
                JOIN tenants t ON t.id = m.tenantId
                WHERE m.userId = ?
                  AND t.archivedAt IS NULL
                ORDER BY m.createdAt ASC
                LIMIT 1
                """,
                (session["userId"],),
            ).fetchone()
            if default_membership:
                conn.execute(
                    "UPDATE app_sessions SET currentTenantId = ? WHERE id = ?",
                    (default_membership["tenantId"], session["id"]),
                )

    def _seed_system_settings(self, conn: sqlite3.Connection) -> None:
        existing = conn.execute("SELECT id FROM app_settings WHERE id = 'system-primary' LIMIT 1").fetchone()
        if existing:
            return
        now = utcnow_iso()
        conn.execute(
            "INSERT INTO app_settings (id, systemSettingsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
            ("system-primary", json.dumps(DEFAULT_SYSTEM_SETTINGS), now, now),
        )

    def _seed_default_system_email_templates(self, conn: sqlite3.Connection) -> None:
        tenants = conn.execute("SELECT id FROM tenants").fetchall()
        if not tenants:
            return
        defaults = [
            ("upcoming-payment-reminder", "Upcoming Payment Reminder", "Upcoming Payment Reminder", "Customer"),
            ("negative-balance-alert", "Negative Balance Alert", "Negative Balance Alert", "System Owner"),
            ("new-voicemail", "New Voicemail", "New Voicemail", "Voicemail Owner"),
            ("new-system-user-welcome", "New System User Welcome", "New System User Welcome", "New CRM User"),
            ("new-membership-user-welcome", "New Membership User Welcome", "New Membership User Welcome", "New Membership User"),
            ("new-meeting", "New Meeting", "New Meeting", "Meeting Link Owner"),
            ("missed-call", "Missed Call", "Missed Call", "Phone Number Owner"),
            ("new-form-submission", "New Form Submission", "New Form Submission", "Form Owner"),
            ("forgot-password", "Forgot Password", "Forgot Password", "Requestor"),
            ("email-verification", "Email Verification", "Email Verification", "Requestor"),
            ("domain-connection-failed", "Domain Connection Failed", "Domain Connection Failed", "Domain Owner"),
            ("domain-connected-successfully", "Domain Connected Successfully", "Domain Connected Successfully", "Domain Owner"),
            ("chat-new-message", "Chat New Message", "{contact.first_name} you have a missed chat message", "Conversation Assignee"),
            ("successfully-charged", "Successfully Charged", "Successfully Charged", "Charged Contact"),
            ("failed-to-charge", "Failed to Charge", "Failed to Charge", "Charged Contact"),
            ("auto-recharge-failed", "Auto Recharge Failed", "Auto Recharge Failed", "System Owner"),
            ("auto-recharge", "Auto Recharge", "Auto Recharge", "System Owner"),
            ("auto-charge-enabled", "Auto Charge Enabled", "Auto Charge Enabled", "System Owner"),
        ]
        now = utcnow_iso()
        for tenant in tenants:
            tenant_id = tenant["id"]
            for templateKey, email_type, subject, send_to in defaults:
                existing = conn.execute(
                    "SELECT id FROM system_email_templates WHERE tenantId = ? AND templateKey = ? LIMIT 1",
                    (tenant_id, templateKey),
                ).fetchone()
                if existing:
                    continue
                conn.execute(
                    """
                    INSERT INTO system_email_templates (
                        id, tenantId, templateKey, emailType, subject, sendTo, enabled,
                        bodyHtml, bodyText, editedByName, editedAt, configJson, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"sysmail-{secrets.token_hex(8)}",
                        tenant_id,
                        templateKey,
                        email_type,
                        subject,
                        send_to,
                        None,
                        f"{subject}\n\nThis system email is ready to be customized.",
                        "AIO Flow\u2122",
                        now,
                        json.dumps({}),
                        now,
                        now,
                    ),
                )

    def _username_exists(self, conn: sqlite3.Connection, username: str, exclude_user_id: str | None = None) -> bool:
        query = "SELECT id FROM app_users WHERE lower(username) = lower(?)"
        params: list[Any] = [username]
        if exclude_user_id:
            query += " AND id != ?"
            params.append(exclude_user_id)
        row = conn.execute(query + " LIMIT 1", params).fetchone()
        return bool(row)

    def _make_username_candidate(self, seed: str) -> str:
        candidate = "".join(char.lower() if char.isalnum() else "." for char in (seed or "").strip())
        compact = ".".join(part for part in candidate.split(".") if part)
        return compact[:40] or "user"

    def _resolve_unique_username(self, conn: sqlite3.Connection, preferred: str | None, fallback_seed: str) -> str:
        base = self._make_username_candidate(preferred or fallback_seed)
        candidate = base
        suffix = 1
        while self._username_exists(conn, candidate):
            candidate = f"{base}.{suffix}"
            suffix += 1
        return candidate

    def _backfill_usernames(self, conn: sqlite3.Connection) -> None:
        rows = conn.execute("SELECT id, email, displayName, username FROM app_users ORDER BY createdAt ASC").fetchall()
        for row in rows:
            if row["username"]:
                continue
            fallback_seed = row["displayName"] or row["email"].split("@")[0]
            username = self._resolve_unique_username(conn, row["email"].split("@")[0], fallback_seed)
            conn.execute("UPDATE app_users SET username = ?, updatedAt = ? WHERE id = ?", (username, utcnow_iso(), row["id"]))

    @staticmethod
    def _omega_code_digest(value: str) -> str:
        return hashlib.sha256((value or "").encode("utf-8")).hexdigest()

    def _user_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS total FROM app_users").fetchone()
            return int(row["total"] if row else 0)

    @staticmethod
    def _json_loads(value: str | None, default: Any) -> Any:
        try:
            return json.loads(value) if value else copy.deepcopy(default)
        except Exception:
            return copy.deepcopy(default)

    def _system_settings_from_conn(self, conn: sqlite3.Connection) -> dict[str, Any]:
        row = conn.execute("SELECT systemSettingsJson FROM app_settings WHERE id = 'system-primary' LIMIT 1").fetchone()
        raw = self._json_loads(row["systemSettingsJson"] if row else None, DEFAULT_SYSTEM_SETTINGS)
        settings = normalize_system_settings_payload(raw, include_defaults=True)
        valid, errors = validate_against_schema(
            "tenant-settings",
            {
                "system": settings,
                "tenant": DEFAULT_TENANT_SETTINGS,
                "user": DEFAULT_USER_SETTINGS,
                "fieldPolicies": FIELD_POLICIES,
            },
        )
        if not valid:
            raise ValueError(f"Invalid system settings payload: {'; '.join(errors)}")
        return settings

    def _user_settings_from_record(self, record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        raw = record["userSettingsJson"] if "userSettingsJson" in record.keys() else record.get("userSettingsJson")
        payload = self._json_loads(raw, DEFAULT_USER_SETTINGS)
        normalized = normalize_user_settings_payload(payload, include_defaults=True)
        normalized["profile"] = {
            **normalized.get("profile", {}),
            "phone": record["phone"] if "phone" in record.keys() else normalized.get("profile", {}).get("phone", ""),
        }
        normalized["preferences"] = {
            **normalized.get("preferences", {}),
            "locale": record["locale"] if "locale" in record.keys() else normalized.get("preferences", {}).get("locale", "en-US"),
            "timezone": record["timezone"] if "timezone" in record.keys() else normalized.get("preferences", {}).get("timezone", "America/New_York"),
        }
        normalized["comms"] = {
            **normalized.get("comms", {}),
            "emailSignature": record["emailSignature"] if "emailSignature" in record.keys() else normalized.get("comms", {}).get("emailSignature", ""),
        }
        return normalized

    def _list_global_variable_records_for_tenant(self, conn: sqlite3.Connection, tenant_id: str) -> list[dict[str, Any]]:
        rows = conn.execute(
            """
            SELECT *
            FROM global_variables
            WHERE tenantId = ?
            ORDER BY isSystem DESC, key ASC
            """,
            (tenant_id,),
        ).fetchall()
        records: list[dict[str, Any]] = []
        for row in rows:
            config = self._json_loads(row["configJson"] if "configJson" in row.keys() else {})
            records.append(
                {
                    "id": row["id"],
                    "key": row["key"],
                    "value": row["value"],
                    "label": config.get("label") or row["key"],
                    "category": config.get("category") or ("system" if bool(row["isSystem"]) else "custom"),
                    "editableByClient": bool(config.get("editableByClient", not bool(row["isSystem"]))),
                    "isSecret": bool(row["isSecret"]),
                    "isSystem": bool(row["isSystem"]),
                    "config": config,
                    "createdAt": row["createdAt"],
                    "updatedAt": row["updatedAt"],
                }
            )
        return records

    def _canonical_global_variables(self, conn: sqlite3.Connection, tenant_id: str) -> dict[str, Any]:
        variables: dict[str, Any] = {}
        for row in self._list_global_variable_records_for_tenant(conn, tenant_id):
            variables[row["key"]] = {
                "id": row["id"],
                "value": row["value"],
                "label": row["label"],
                "category": row["category"],
                "editableByClient": row["editableByClient"],
                "description": row["description"] or "",
                "isSecret": row["isSecret"],
                "isSystem": row["isSystem"],
            }
        return variables

    def _canonical_system_email_templates(self, conn: sqlite3.Connection, tenant_id: str) -> dict[str, Any]:
        rows = conn.execute(
            """
            SELECT *
            FROM system_email_templates
            WHERE tenantId = ?
            ORDER BY emailType ASC
            """,
            (tenant_id,),
        ).fetchall()
        templates: dict[str, Any] = {}
        for row in rows:
            config = self._json_loads(row["configJson"], {})
            templates[row["templateKey"]] = {
                "id": row["id"],
                "templateKey": row["templateKey"],
                "emailType": row["emailType"],
                "subject": row["subject"],
                "sendTo": row["sendTo"],
                "enabled": bool(row["enabled"]),
                "bodyHtml": row["bodyHtml"],
                "bodyText": row["bodyText"],
                "config": config,
                "editedAt": row["editedAt"],
                "updatedAt": row["updatedAt"],
            }
        return templates

    def _tenant_settings_from_raw(self, conn: sqlite3.Connection, tenant_id: str, raw_settings: str | None = None) -> dict[str, Any]:
        if raw_settings is None:
            row = conn.execute("SELECT settingsJson FROM tenants WHERE id = ? LIMIT 1", (tenant_id,)).fetchone()
            raw_settings = row["settingsJson"] if row else None
        payload = self._json_loads(raw_settings, DEFAULT_TENANT_SETTINGS)
        # Projected fields are not persisted in `tenants.settingsJson`. Always assemble tenant
        # settings through the canonical helper path so projections are applied consistently.
        settings = normalize_tenant_settings_payload(payload, include_defaults=True)
        settings["globalVariables"] = self._canonical_global_variables(conn, tenant_id)
        comms = settings.get("comms") if isinstance(settings.get("comms"), dict) else {}
        comms["systemEmailTemplates"] = self._canonical_system_email_templates(conn, tenant_id)
        settings["comms"] = comms
        valid, errors = validate_against_schema(
            "tenant-settings",
            {
                "system": DEFAULT_SYSTEM_SETTINGS,
                "tenant": settings,
                "user": DEFAULT_USER_SETTINGS,
                "fieldPolicies": FIELD_POLICIES,
            },
        )
        if not valid:
            raise ValueError(f"Invalid tenant settings payload: {'; '.join(errors)}")
        return settings

    def default_tenant_id(self) -> str:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM tenants ORDER BY createdAt ASC LIMIT 1").fetchone()
        return row["id"] if row else "tenant-primary"

    def _public_user(self, record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        settings = self._user_settings_from_record(record)
        return {
            "id": record["id"],
            "email": record["email"],
            "username": record["username"],
            "name": record["displayName"] or record["email"],
            "role": normalize_user_role(record["role"]),
            "provider": record["authProvider"],
            "avatarUrl": record["avatarUrl"],
            "phone": record["phone"] if "phone" in record.keys() else None,
            "locale": record["locale"] if "locale" in record.keys() else None,
            "timezone": record["timezone"] if "timezone" in record.keys() else None,
            "emailSignature": record["emailSignature"] if "emailSignature" in record.keys() else None,
            "settings": settings,
        }

    def _public_tenant(self, conn: sqlite3.Connection, membership: sqlite3.Row | dict[str, Any], selected: bool = False) -> dict[str, Any]:
        raw_settings = membership["settingsJson"] if "settingsJson" in membership.keys() else membership.get("settingsJson")
        tenant_settings = self._tenant_settings_from_raw(conn, membership["tenantId"], raw_settings)
        return {
            "id": membership["tenantId"],
            # Tenant row fields remain the identity authority for routing/lookups.
            "name": membership["tenantName"],
            "slug": membership["tenantSlug"],
            "role": membership["membershipRole"],
            # `settings` remains the compatibility projection consumed by the current frontend.
            # Operational metadata belongs in `tenant_settings.internal`, not in row identity fields.
            "settings": tenant_settings_to_legacy_view(tenant_settings),
            "tenant_settings": tenant_settings,
            "system_settings": self._system_settings_from_conn(conn),
            "selected": selected,
        }

    def _tenant_memberships(self, conn: sqlite3.Connection, user_id: str, currentTenantId: str | None) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        rows = conn.execute(
            """
            SELECT m.tenantId, m.role AS membershipRole, t.name AS tenantName, t.slug AS tenantSlug, t.settingsJson
            FROM memberships m
            JOIN tenants t ON t.id = m.tenantId
            WHERE m.userId = ?
              AND t.archivedAt IS NULL
            ORDER BY t.createdAt ASC, t.name ASC
            """,
            (user_id,),
        ).fetchall()
        if not rows:
            return None, []
        resolved_tenant_id = currentTenantId or rows[0]["tenantId"]
        tenants: list[dict[str, Any]] = []
        current_tenant = None
        for row in rows:
            tenant = self._public_tenant(conn, row, row["tenantId"] == resolved_tenant_id)
            tenants.append(tenant)
            if tenant["selected"]:
                current_tenant = tenant
        if current_tenant is None:
            tenants[0]["selected"] = True
            current_tenant = tenants[0]
        return current_tenant, tenants

    def _require_active_workspace_row(self, conn: sqlite3.Connection, tenant_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM tenants WHERE id = ? LIMIT 1", (tenant_id,)).fetchone()
        if not row or row["archivedAt"]:
            raise ValueError("Workspace not found.")
        return row

    def _membership_record(self, record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        return {
            "id": record["id"],
            "userId": record["userId"],
            "tenantId": record["tenantId"],
            "role": record["role"],
            "userName": record["displayName"] or record["email"],
            "userEmail": record["email"],
            "provider": record["authProvider"],
            "createdAt": record["createdAt"],
            "updatedAt": record["updatedAt"],
        }

    def _ai_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
        config = json.loads(record["configJson"]) if record["configJson"] else {}
        payload = {
            "id": record["id"],
            "tenantId": record["tenantId"],
            "providerKey": record["providerKey"],
            "label": record["label"],
            "baseUrl": record["baseUrl"],
            "model": record["model"],
            "enabled": bool(record["enabled"]),
            "isDefault": bool(record["isDefault"]),
            "status": record["status"],
            "lastTestedAt": record["lastTestedAt"],
            "lastError": record["lastError"],
            "config": config,
            "systemGuardrails": config.get("systemGuardrails", ""),
            "taskGuardrails": config.get("taskGuardrails", ""),
            "apiKeyPresent": bool(record["apiKey"]),
            "createdAt": record["createdAt"],
            "updatedAt": record["updatedAt"],
        }
        if include_secret:
            payload["apiKey"] = record["apiKey"]
        return payload

    def _automation_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
        config = json.loads(record["configJson"]) if record["configJson"] else {}
        payload = {
            "id": record["id"],
            "tenantId": record["tenantId"],
            "providerKey": record["providerKey"],
            "label": record["label"],
            "baseUrl": record["baseUrl"],
            "enabled": bool(record["enabled"]),
            "status": record["status"],
            "lastTestedAt": record["lastTestedAt"],
            "lastError": record["lastError"],
            "config": config,
            "apiKeyPresent": bool(record["apiKey"]),
            "createdAt": record["createdAt"],
            "updatedAt": record["updatedAt"],
        }
        if include_secret:
            payload["apiKey"] = record["apiKey"]
        return payload

    def _payment_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
        config = json.loads(record["configJson"]) if record["configJson"] else {}
        payload = {
            "id": record["id"],
            "tenantId": record["tenantId"],
            "providerKey": record["providerKey"],
            "label": record["label"],
            "enabled": bool(record["enabled"]),
            "status": record["status"],
            "lastTestedAt": record["lastTestedAt"],
            "lastError": record["lastError"],
            "config": config,
            "apiKeyPresent": bool(config.get("apiKey") or config.get("secretKey")),
            "createdAt": record["createdAt"],
            "updatedAt": record["updatedAt"],
        }
        if include_secret:
            payload["apiKey"] = config.get("apiKey")
            payload["secretKey"] = config.get("secretKey")
        return payload

    def _require_workspace_role(self, conn: sqlite3.Connection, user_id: str, tenant_id: str, allowed_roles: set[str]) -> sqlite3.Row:
        self._require_active_workspace_row(conn, tenant_id)
        membership = conn.execute(
            "SELECT * FROM memberships WHERE userId = ? AND tenantId = ? LIMIT 1",
            (user_id, tenant_id),
        ).fetchone()
        if not membership:
            raise ValueError("User does not belong to that workspace.")
        if membership["role"] not in allowed_roles:
            raise ValueError("You do not have permission to manage this workspace.")
        return membership

    def _build_session(self, conn: sqlite3.Connection, record: sqlite3.Row) -> dict[str, Any]:
        current_tenant, tenants = self._tenant_memberships(conn, record["userId"], record["currentTenantId"])
        return {
            "id": record["id"],
            "token": record["token"],
            "provider": record["provider"],
            "createdAt": record["createdAt"],
            "expiresAt": record["expiresAt"],
            "user": self._public_user(record),
            "tenant": current_tenant,
            "tenants": tenants,
        }

    @staticmethod
    def _persistable_user_settings(user_settings: dict[str, Any]) -> dict[str, Any]:
        persisted = normalize_user_settings_payload(user_settings, include_defaults=True)
        persisted["profile"]["phone"] = ""
        persisted["preferences"]["locale"] = ""
        persisted["preferences"]["timezone"] = ""
        persisted["comms"]["emailSignature"] = ""
        return persisted

    def _upsert_global_variables_from_canonical(self, conn: sqlite3.Connection, tenant_id: str, user_id: str | None, variables: dict[str, Any]) -> None:
        for key, details in variables.items():
            if not isinstance(details, dict):
                continue
            value = details.get("value")
            if value is None:
                continue
            label = (details.get("label") or key).strip()
            category = (details.get("category") or ("system" if details.get("isSystem") else "custom")).strip() or "custom"
            config = {
                "label": label,
                "category": category,
                "editableByClient": bool(details.get("editableByClient", not details.get("isSystem"))),
            }
            existing = conn.execute(
                "SELECT id FROM global_variables WHERE tenantId = ? AND key = ? LIMIT 1",
                (tenant_id, key),
            ).fetchone()
            now = utcnow_iso()
            params = (
                str(value),
                (details.get("description") or "").strip() or None,
                1 if details.get("isSecret") else 0,
                1 if details.get("isSystem") else 0,
                json.dumps(config),
                now,
            )
            if existing:
                conn.execute(
                    """
                    UPDATE global_variables
                    SET value = ?, description = ?, isSecret = ?, isSystem = ?, configJson = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (*params, existing["id"]),
                )
                continue
            conn.execute(
                """
                INSERT INTO global_variables (id, tenantId, key, value, description, isSecret, isSystem, configJson, createdByUserId, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"gvar-{secrets.token_hex(8)}",
                    tenant_id,
                    key,
                    str(value),
                    (details.get("description") or "").strip() or None,
                    1 if details.get("isSecret") else 0,
                    1 if details.get("isSystem") else 0,
                    json.dumps(config),
                    userId,
                    now,
                    now,
                ),
            )

    def _upsert_system_email_templates_from_canonical(self, conn: sqlite3.Connection, tenant_id: str, user: sqlite3.Row, templates: dict[str, Any]) -> None:
        for templateKey, details in templates.items():
            if not isinstance(details, dict):
                continue
            existing = conn.execute(
                "SELECT * FROM system_email_templates WHERE tenantId = ? AND templateKey = ? LIMIT 1",
                (tenant_id, templateKey),
            ).fetchone()
            email_type = (details.get("emailType") or templateKey.replace("_", " ").title()).strip()
            subject = (details.get("subject") or (existing["subject"] if existing else email_type)).strip()
            send_to = (details.get("sendTo") or (existing["send_to"] if existing else "{{owner.email}}")).strip()
            enabled = 1 if details.get("enabled", True) else 0
            config = details.get("config") if isinstance(details.get("config"), dict) else {}
            now = utcnow_iso()
            if existing:
                conn.execute(
                    """
                    UPDATE system_email_templates
                    SET email_type = ?, subject = ?, send_to = ?, enabled = ?, body_html = ?, body_text = ?,
                        edited_by_userId = ?, edited_by_name = ?, edited_at = ?, config_json = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (
                        email_type,
                        subject,
                        send_to,
                        enabled,
                        details.get("bodyHtml") if details.get("bodyHtml") is not None else existing["body_html"],
                        details.get("bodyText") if details.get("bodyText") is not None else existing["body_text"],
                        user["id"],
                        user["displayName"] or user["email"],
                        now,
                        json.dumps(config),
                        now,
                        existing["id"],
                    ),
                )
                continue
            conn.execute(
                """
                INSERT INTO system_email_templates (
                    id, tenantId, templateKey, emailType, subject, sendTo, enabled,
                    bodyHtml, bodyText, editedByUserId, editedByName, editedAt, configJson, createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"system-email-{secrets.token_hex(8)}",
                    tenant_id,
                    templateKey,
                    email_type,
                    subject,
                    send_to,
                    enabled,
                    details.get("bodyHtml"),
                    details.get("bodyText"),
                    user["id"],
                    user["displayName"] or user["email"],
                    now,
                    json.dumps(config),
                    now,
                    now,
                ),
            )

    def _replace_global_variables_from_canonical(self, conn: sqlite3.Connection, tenant_id: str, user_id: str | None, variables: dict[str, Any]) -> None:
        conn.execute("DELETE FROM global_variables WHERE tenantId = ?", (tenant_id,))
        if isinstance(variables, dict) and variables:
            self._upsert_global_variables_from_canonical(conn, tenant_id, user_id, variables)

    def _replace_system_email_templates_from_canonical(self, conn: sqlite3.Connection, tenant_id: str, user: sqlite3.Row, templates: dict[str, Any]) -> None:
        conn.execute("DELETE FROM system_email_templates WHERE tenantId = ?", (tenant_id,))
        if isinstance(templates, dict) and templates:
            self._upsert_system_email_templates_from_canonical(conn, tenant_id, user, templates)

    def _unique_workspace_slug(self, conn: sqlite3.Connection, workspace_name: str) -> str:
        base_slug = slugify(workspace_name)
        candidate = base_slug
        suffix = 1
        while conn.execute("SELECT 1 FROM tenants WHERE slug = ? LIMIT 1", (candidate,)).fetchone():
            suffix += 1
            candidate = f"{base_slug}-{suffix}"
        return candidate

    def _normalize_blueprint_flow_record(self, tenant_id: str, flow: dict[str, Any], position: int, actor_label: str) -> dict[str, Any]:
        source_id = str(flow.get("id") or flow.get("name") or f"flow-{position + 1}").strip() or f"flow-{position + 1}"
        flow_slug = slugify(source_id)
        flow_id = f"{tenant_id}-{flow_slug}-{position + 1}"
        now = utcnow_iso()
        metadata = flow.get("metadata") if isinstance(flow.get("metadata"), dict) else {}
        merged_metadata = {
            **metadata,
            "deploymentManaged": True,
            "deploymentSourceFlowId": source_id,
        }
        return {
            "id": flow_id,
            "tenantId": tenant_id,
            "name": str(flow.get("name") or f"Blueprint Flow {position + 1}").strip() or f"Blueprint Flow {position + 1}",
            # Deployment blueprints must not leave dormant flows behind.
            "status": "Active",
            "nodesJson": json.dumps(flow.get("nodes") if isinstance(flow.get("nodes"), list) else []),
            "edgesJson": json.dumps(flow.get("edges") if isinstance(flow.get("edges"), list) else []),
            "specJson": json.dumps(flow.get("spec")) if flow.get("spec") is not None else None,
            "metadataJson": json.dumps(merged_metadata),
            "createdAt": flow.get("createdAt") or now,
            "updatedAt": flow.get("updatedAt") or now,
            "createdBy": flow.get("createdBy") or actor_label,
            "lastEditedBy": flow.get("lastEditedBy") or actor_label,
        }

    def _replace_deployment_flows(self, conn: sqlite3.Connection, tenant_id: str, flows: list[dict[str, Any]], actor_label: str) -> list[dict[str, Any]]:
        conn.execute("DELETE FROM flows WHERE tenantId = ?", (tenant_id,))
        inserted: list[dict[str, Any]] = []
        for index, flow in enumerate(flows):
            record = self._normalize_blueprint_flow_record(tenant_id, flow, index, actor_label)
            conn.execute(
                """
                INSERT INTO flows (
                    id, tenantId, name, status, nodesJson, edgesJson, specJson, metadataJson,
                    createdAt, updatedAt, createdBy, lastEditedBy
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record["tenantId"],
                    record["name"],
                    record["status"],
                    record["nodesJson"],
                    record["edgesJson"],
                    record["specJson"],
                    record["metadataJson"],
                    record["createdAt"],
                    record["updatedAt"],
                    record["createdBy"],
                    record["lastEditedBy"],
                ),
            )
            inserted.append(record)
        return inserted

    def _record_tenant_deployment(
        self,
        conn: sqlite3.Connection,
        *,
        deployment_id: str,
        tenant_id: str | None,
        blueprint_id: str | None,
        blueprint_name: str | None,
        blueprint_version: Any,
        blueprint_source: str | None,
        status: str,
        validation: dict[str, Any] | None,
        error_payload: dict[str, Any] | None,
        initiated_by_user_id: str | None,
        createdAt: str | None = None,
    ) -> dict[str, Any]:
        now = utcnow_iso()
        timestamp = createdAt or now
        record = {
            "id": deployment_id,
            "tenantId": tenant_id,
            "blueprintId": blueprint_id,
            "blueprintName": blueprint_name,
            "blueprintVersion": "" if blueprint_version is None else str(blueprint_version),
            "blueprintSource": blueprint_source or "",
            "status": status,
            "validationJson": json.dumps(validation or {}),
            "errorJson": json.dumps(error_payload or {}),
            "initiatedByUserId": initiated_by_user_id,
            "createdAt": timestamp,
            "updatedAt": now,
        }
        conn.execute(
            """
            INSERT INTO tenant_deployments (
                id, tenantId, blueprintId, blueprintName, blueprintVersion, blueprintSource,
                status, validationJson, errorJson, initiatedByUserId, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["id"],
                record["tenantId"],
                record["blueprintId"],
                record["blueprintName"],
                record["blueprintVersion"],
                record["blueprintSource"],
                record["status"],
                record["validationJson"],
                record["errorJson"],
                record["initiatedByUserId"],
                record["createdAt"],
                record["updatedAt"],
            ),
        )
        return record

    @staticmethod
    def _tenant_deployment_record(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if not row:
            return None
        try:
            validation = json.loads(row["validationJson"] or "{}")
        except json.JSONDecodeError:
            validation = {}
        try:
            error_payload = json.loads(row["errorJson"] or "{}")
        except json.JSONDecodeError:
            error_payload = {}
        return {
            "deploymentId": row["id"],
            "tenantId": row["tenantId"],
            "blueprintId": row["blueprintId"],
            "blueprintName": row["blueprintName"],
            "blueprintVersion": row["blueprintVersion"] or None,
            "blueprintSource": row["blueprintSource"] or None,
            "status": row["status"],
            "validation": validation,
            "error": error_payload,
            "timestamp": row["createdAt"],
            "updatedAt": row["updatedAt"],
        }

    def _deployment_validation_result(
        self,
        conn: sqlite3.Connection,
        tenant_id: str,
        tenant_settings: dict[str, Any],
        *,
        expected_variables: int,
        expected_templates: int,
        expected_flows: int,
    ) -> dict[str, Any]:
        checks: list[dict[str, Any]] = []

        def add_check(key: str, ok: bool, critical: bool, detail: str, value: Any = None) -> None:
            checks.append(
                {
                    "key": key,
                    "ok": bool(ok),
                    "critical": critical,
                    "detail": detail,
                    "value": value,
                }
            )

        valid_contract, contract_errors = validate_against_schema(
            "tenant-settings",
            {
                "system": self._system_settings_from_conn(conn),
                "tenant": tenant_settings,
                "user": DEFAULT_USER_SETTINGS,
                "fieldPolicies": FIELD_POLICIES,
            },
        )
        add_check(
            "tenantSettings",
            valid_contract,
            True,
            "Canonical tenant settings exist and satisfy the schema." if valid_contract else "; ".join(contract_errors),
        )

        branding = tenant_settings.get("branding") if isinstance(tenant_settings.get("branding"), dict) else {}
        add_check("branding", bool(branding.get("brandName") or branding.get("companyName")), True, "Branding is populated.", branding.get("brandName") or branding.get("companyName"))

        navigation = tenant_settings.get("navigation") if isinstance(tenant_settings.get("navigation"), dict) else {}
        menu_structure = navigation.get("menuStructure") if "menuStructure" in navigation else None
        navigation_valid = menu_structure is None or isinstance(menu_structure, list)
        menu_structure_length = len(menu_structure) if isinstance(menu_structure, list) else None
        add_check(
            "navigation",
            navigation_valid,
            True,
            "Navigation menu structure preserves the canonical null-vs-array contract.",
            menu_structure_length,
        )

        comms = tenant_settings.get("comms") if isinstance(tenant_settings.get("comms"), dict) else {}
        comms_defaults = comms.get("defaults") if isinstance(comms.get("defaults"), dict) else {}
        add_check("commsDefaults", bool(comms_defaults), True, "Comms defaults are populated.", len(comms_defaults))

        calendar = tenant_settings.get("calendar") if isinstance(tenant_settings.get("calendar"), dict) else {}
        calendar_defaults = calendar.get("defaults") if isinstance(calendar.get("defaults"), dict) else {}
        add_check("calendarDefaults", bool(calendar_defaults), True, "Calendar defaults are populated.", calendar_defaults)

        variable_count = conn.execute("SELECT COUNT(*) AS count FROM global_variables WHERE tenantId = ?", (tenant_id,)).fetchone()["count"]
        add_check(
            "globalVariables",
            variable_count >= expected_variables,
            True,
            f"Expected at least {expected_variables} global variables and found {variable_count}.",
            variable_count,
        )

        template_count = conn.execute("SELECT COUNT(*) AS count FROM system_email_templates WHERE tenantId = ?", (tenant_id,)).fetchone()["count"]
        add_check(
            "systemEmailTemplates",
            template_count >= expected_templates,
            True,
            f"Expected at least {expected_templates} comms templates and found {template_count}.",
            template_count,
        )

        active_flow_count = conn.execute(
            "SELECT COUNT(*) AS count FROM flows WHERE tenantId = ? AND lower(status) = 'active'",
            (tenant_id,),
        ).fetchone()["count"]
        flow_check_ok = expected_flows == 0 or active_flow_count >= expected_flows
        add_check(
            "activeFlows",
            flow_check_ok,
            expected_flows > 0,
            f"Expected at least {expected_flows} active flows and found {active_flow_count}.",
            active_flow_count,
        )

        critical_failures = [check for check in checks if check["critical"] and not check["ok"]]
        return {
            "valid": not critical_failures,
            "checks": checks,
            "criticalFailures": critical_failures,
        }

    def deploy_tenant(
        self,
        token: str | None,
        tenant_name: str,
        *,
        blueprint_id: str | None = None,
        blueprint_payload: dict[str, Any] | None = None,
        overrides: dict[str, Any] | None = None,
        switch_to_tenant: bool = False,
    ) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        workspace_name = (tenant_name or "").strip()
        if len(workspace_name) < 2:
            raise ValueError("Tenant name must be at least 2 characters.")
        deployment_id = f"deployment-{secrets.token_hex(8)}"
        createdAt = utcnow_iso()
        requested_blueprint_id = (blueprint_id or (blueprint_payload or {}).get("blueprintId") or "").strip() or None

        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], session["currentTenantId"], {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            tenant_id: str | None = None
            tenant_slug: str | None = None
            validation: dict[str, Any] | None = None
            plan: dict[str, Any] | None = None

            try:
                plan = build_deployment_plan(
                    blueprint_id=blueprint_id,
                    blueprint_payload=blueprint_payload,
                    overrides=overrides,
                )
                final_tenant_settings = plan["tenantSettings"]
                final_comms = final_tenant_settings.get("comms") if isinstance(final_tenant_settings.get("comms"), dict) else {}
                final_templates = final_comms.get("systemEmailTemplates") if isinstance(final_comms.get("systemEmailTemplates"), dict) else {}
                tenant_id = f"tenant-{secrets.token_hex(6)}"
                tenant_slug = self._unique_workspace_slug(conn, workspace_name)
                actor_label = user["displayName"] or user["email"] or "Current User"
                persisted_settings = strip_derived_tenant_sections(final_tenant_settings)
                settingsJson = json.dumps({"tenantSettings": persisted_settings})
                now = utcnow_iso()

                conn.execute(
                    "INSERT INTO tenants (id, name, slug, settingsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                    (tenant_id, workspace_name, tenant_slug, settingsJson, now, now),
                )
                conn.execute(
                    """
                    INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (f"membership-{secrets.token_hex(8)}", user["id"], tenant_id, "owner", now, now),
                )

                self._replace_global_variables_from_canonical(
                    conn,
                    tenant_id,
                    user["id"],
                    final_tenant_settings.get("globalVariables") if isinstance(final_tenant_settings.get("globalVariables"), dict) else {},
                )
                self._replace_system_email_templates_from_canonical(conn, tenant_id, user, final_templates)
                self._replace_deployment_flows(conn, tenant_id, plan["flows"], actor_label)
                if switch_to_tenant:
                    conn.execute(
                        "UPDATE app_sessions SET currentTenantId = ?, lastSeenAt = ? WHERE token = ?",
                        (tenant_id, now, token),
                    )

                tenant_settings_snapshot = self._tenant_settings_from_raw(conn, tenant_id, settingsJson)
                validation = self._deployment_validation_result(
                    conn,
                    tenant_id,
                    tenant_settings_snapshot,
                    expected_variables=plan["expected"]["globalVariables"],
                    expected_templates=plan["expected"]["systemEmailTemplates"],
                    expected_flows=plan["expected"]["flows"],
                )
                if not validation["valid"]:
                    failure_summary = "; ".join(check["detail"] for check in validation["criticalFailures"])
                    raise DeploymentFailureError(
                        "Tenant deployment validation failed.",
                        code="tenant_deployment_validation_failed",
                        detail={"errors": failure_summary, "validation": validation},
                    )

                self._record_tenant_deployment(
                    conn,
                    deployment_id=deployment_id,
                    tenant_id=tenant_id,
                    blueprint_id=plan["blueprintId"],
                    blueprint_name=plan["blueprintName"],
                    blueprint_version=plan["blueprintVersion"],
                    blueprint_source=plan["blueprintSource"],
                    status="success",
                    validation=validation,
                    error_payload=None,
                    initiated_by_user_id=user["id"],
                    createdAt=createdAt,
                )

                conn.commit()
            except DeploymentFailureError as error:
                conn.rollback()
                self._record_tenant_deployment(
                    conn,
                    deployment_id=deployment_id,
                    tenant_id=tenant_id,
                    blueprint_id=(plan or {}).get("blueprintId") or requested_blueprint_id,
                    blueprint_name=(plan or {}).get("blueprintName") or (blueprint_payload or {}).get("name"),
                    blueprint_version=(plan or {}).get("blueprintVersion") or (blueprint_payload or {}).get("version") or (blueprint_payload or {}).get("blueprintVersion"),
                    blueprint_source=(plan or {}).get("blueprintSource") or ((blueprint_payload or {}).get("source") or ("filesystem" if blueprint_id else "payload")),
                    status="failed",
                    validation=(error.payload or {}).get("detail", {}).get("validation"),
                    error_payload=error.payload,
                    initiated_by_user_id=user["id"],
                    createdAt=createdAt,
                )
                conn.commit()
                raise
            except Exception as error:
                conn.rollback()
                structured_error = DeploymentFailureError(
                    "Tenant deployment failed.",
                    code="tenant_deployment_failed",
                    detail={"reason": str(error)},
                )
                self._record_tenant_deployment(
                    conn,
                    deployment_id=deployment_id,
                    tenant_id=tenant_id,
                    blueprint_id=(plan or {}).get("blueprintId") or requested_blueprint_id,
                    blueprint_name=(plan or {}).get("blueprintName") or (blueprint_payload or {}).get("name"),
                    blueprint_version=(plan or {}).get("blueprintVersion") or (blueprint_payload or {}).get("version") or (blueprint_payload or {}).get("blueprintVersion"),
                    blueprint_source=(plan or {}).get("blueprintSource") or ((blueprint_payload or {}).get("source") or ("filesystem" if blueprint_id else "payload")),
                    status="failed",
                    validation=None,
                    error_payload=structured_error.payload,
                    initiated_by_user_id=user["id"],
                    createdAt=createdAt,
                )
                conn.commit()
                raise structured_error

        return {
            "deploymentId": deployment_id,
            "tenantId": tenant_id,
            "tenantSlug": tenant_slug,
            "tenantSettings": self.get_tenant_settings(tenant_id),
            "validation": validation,
            "switchedToTenant": bool(switch_to_tenant),
            "activeTenantId": tenant_id if switch_to_tenant else session["currentTenantId"],
        }

    def get_system_settings(self) -> dict[str, Any]:
        with self._connect() as conn:
            return self._system_settings_from_conn(conn)

    def get_tenant_settings(self, tenant_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            return self._tenant_settings_from_raw(conn, tenant_id)

    def get_user_settings(self, token: str | None = None, user_id: str | None = None) -> dict[str, Any]:
        with self._connect() as conn:
            if token:
                session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
                if not session:
                    raise ValueError("Session not found or expired.")
                user_id = session["userId"]
            if not user_id:
                raise ValueError("User context is required.")
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (user_id,)).fetchone()
            if not user:
                raise ValueError("User not found.")
            return self._user_settings_from_record(user)

    def update_system_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as conn:
            current = self._system_settings_from_conn(conn)
            patch = normalize_system_settings_payload(payload, include_defaults=False)
            updated = merge_with_defaults(current, patch)
            valid, errors = validate_against_schema(
                "tenant-settings",
                {
                    "system": updated,
                    "tenant": DEFAULT_TENANT_SETTINGS,
                    "user": DEFAULT_USER_SETTINGS,
                    "fieldPolicies": FIELD_POLICIES,
                },
            )
            if not valid:
                raise ValueError(f"Invalid system settings payload: {'; '.join(errors)}")
            conn.execute(
                "UPDATE app_settings SET systemSettingsJson = ?, updatedAt = ? WHERE id = 'system-primary'",
                (json.dumps(updated), utcnow_iso()),
            )
            conn.commit()
        return updated

    def update_tenant_settings(self, token: str | None, tenant_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")

            current = self._tenant_settings_from_raw(conn, tenant_id)
            patch = normalize_tenant_settings_payload(payload, include_defaults=False)
            merged = merge_with_defaults(current, patch)
            valid, errors = validate_against_schema(
                "tenant-settings",
                {
                    "system": self._system_settings_from_conn(conn),
                    "tenant": merged,
                    "user": self._user_settings_from_record(user),
                    "fieldPolicies": FIELD_POLICIES,
                },
            )
            if not valid:
                raise ValueError(f"Invalid tenant settings payload: {'; '.join(errors)}")

            if isinstance(patch.get("globalVariables"), dict):
                self._upsert_global_variables_from_canonical(conn, tenant_id, user["id"], patch["globalVariables"])
            comms_patch = patch.get("comms") if isinstance(patch.get("comms"), dict) else {}
            if isinstance(comms_patch.get("systemEmailTemplates"), dict):
                self._upsert_system_email_templates_from_canonical(conn, tenant_id, user, comms_patch["systemEmailTemplates"])

            persisted = strip_derived_tenant_sections(merged)
            # Compatibility note:
            # `tenants.settingsJson` now stores canonical tenantSettings. Legacy `tenant.settings`
            # is projected from this payload at read time so the current frontend can keep working.
            # Boundary note:
            # tenant row fields (`id`, `name`, `slug`, other lookup-critical identity fields)
            # remain authoritative on the row. `tenantSettings.internal` is for operational
            # metadata only and must not become a mirrored identity store.
            conn.execute(
                "UPDATE tenants SET settingsJson = ?, updatedAt = ? WHERE id = ?",
                (json.dumps({"tenantSettings": persisted}), utcnow_iso(), tenant_id),
            )
            conn.commit()
        return self.get_tenant_settings(tenant_id)

    def update_user_settings(self, token: str | None, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")

            current = self._user_settings_from_record(user)
            patch = normalize_user_settings_payload(payload, include_defaults=False)
            merged = merge_with_defaults(current, patch)
            valid, errors = validate_against_schema(
                "tenant-settings",
                {
                    "system": self._system_settings_from_conn(conn),
                    "tenant": DEFAULT_TENANT_SETTINGS,
                    "user": merged,
                    "fieldPolicies": FIELD_POLICIES,
                },
            )
            if not valid:
                raise ValueError(f"Invalid user settings payload: {'; '.join(errors)}")

            persisted = self._persistable_user_settings(merged)
            conn.execute(
                """
                UPDATE app_users
                SET phone = ?, locale = ?, timezone = ?, emailSignature = ?, userSettingsJson = ?, updatedAt = ?
                WHERE id = ?
                """,
                (
                    merged["profile"].get("phone") or None,
                    merged["preferences"].get("locale") or "en-US",
                    merged["preferences"].get("timezone") or "America/New_York",
                    merged["comms"].get("emailSignature") or "",
                    json.dumps(persisted),
                    utcnow_iso(),
                    user["id"],
                ),
            )
            conn.commit()
        return self.get_user_settings(token=token)

    def export_tenant_blueprint(self, tenant_id: str) -> dict[str, Any]:
        tenant_settings = self.get_tenant_settings(tenant_id)
        workspace = self.get_workspace(tenant_id)
        flows = []
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT * FROM flows
                WHERE tenantId = ?
                ORDER BY createdAt ASC, updatedAt ASC
                """,
                (tenant_id,),
            ).fetchall()
            deployment = self._tenant_deployment_record(
                conn.execute(
                    """
                    SELECT *
                    FROM tenant_deployments
                    WHERE tenantId = ?
                    ORDER BY createdAt DESC
                    LIMIT 1
                    """,
                    (tenant_id,),
                ).fetchone()
            )
        for row in rows:
            nodes = self._json_loads(row["nodesJson"], [])
            if str(row["status"] or "").strip().lower() != "active":
                continue
            if not any(str(node.get("type") or "").lower() == "trigger" for node in nodes if isinstance(node, dict)):
                continue
            flows.append(
                {
                    "id": row["id"],
                    "name": row["name"],
                    "status": row["status"],
                    "nodes": nodes,
                    "edges": self._json_loads(row["edgesJson"], []),
                    "spec": self._json_loads(row["specJson"], None),
                    "metadata": self._json_loads(row["metadataJson"], {}),
                }
            )
        blueprint = build_tenant_blueprint(
            tenant_settings,
            flows=flows,
            blueprint_id=(deployment or {}).get("blueprintId") or tenant_settings.get("internal", {}).get("blueprintId") or workspace["slug"],
            name=f"{workspace['name']} Export",
            description=f"Portable export for tenant {workspace['name']}.",
            source="tenant-export",
            version=(deployment or {}).get("blueprintVersion") or 1,
        )
        valid, errors = validate_against_schema("tenant-blueprint", blueprint)
        if not valid:
            raise ValueError(f"Invalid tenant blueprint payload: {'; '.join(errors)}")
        return blueprint

    def import_tenant_blueprint(self, token: str | None, tenant_id: str, blueprint: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        plan = build_deployment_plan(blueprint_payload=blueprint)
        final_tenant_settings = plan["tenantSettings"]
        final_comms = final_tenant_settings.get("comms") if isinstance(final_tenant_settings.get("comms"), dict) else {}
        final_templates = final_comms.get("systemEmailTemplates") if isinstance(final_comms.get("systemEmailTemplates"), dict) else {}
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            persisted_settings = strip_derived_tenant_sections(final_tenant_settings)
            settingsJson = json.dumps({"tenantSettings": persisted_settings})
            conn.execute("UPDATE tenants SET settingsJson = ?, updatedAt = ? WHERE id = ?", (settingsJson, utcnow_iso(), tenant_id))
            self._replace_global_variables_from_canonical(
                conn,
                tenant_id,
                user["id"],
                final_tenant_settings.get("globalVariables") if isinstance(final_tenant_settings.get("globalVariables"), dict) else {},
            )
            self._replace_system_email_templates_from_canonical(conn, tenant_id, user, final_templates)
            self._replace_deployment_flows(conn, tenant_id, plan["flows"], user["displayName"] or user["email"] or "Current User")
            conn.commit()
        return self.get_tenant_settings(tenant_id)

    def list_blueprints(self) -> list[dict[str, Any]]:
        return [
            {
                "id": entry["id"],
                "name": entry["name"],
                "version": entry["version"],
                "description": entry["description"],
                "source": entry["source"],
            }
            for entry in list_blueprint_registry()
        ]

    def get_tenant_deployment(self, token: str | None, tenant_id: str) -> dict[str, Any] | None:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            row = conn.execute(
                """
                SELECT *
                FROM tenant_deployments
                WHERE tenantId = ?
                ORDER BY createdAt DESC
                LIMIT 1
                """,
                (tenant_id,),
            ).fetchone()
        return self._tenant_deployment_record(row)

    def list_tenant_deployments(self, token: str | None, tenant_id: str, limit: int = 25) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            rows = conn.execute(
                """
                SELECT *
                FROM tenant_deployments
                WHERE tenantId = ?
                ORDER BY createdAt DESC
                LIMIT ?
                """,
                (tenant_id, max(1, min(limit, 100))),
            ).fetchall()
        return [record for record in (self._tenant_deployment_record(row) for row in rows) if record]

    def get_canonical_settings_bundle(self, token: str | None, tenant_id: str, user_id: str | None = None) -> dict[str, Any]:
        # Projected tenant fields such as global variables and system email templates are only
        # complete on the canonical bundle path. Do not read raw tenant JSON for full settings.
        tenant_settings = self.get_tenant_settings(tenant_id)
        user_settings = self.get_user_settings(token=token, user_id=user_id)
        return build_settings_bundle(self.get_system_settings(), tenant_settings, user_settings)

    def list_ai_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM ai_provider_configs
                WHERE tenantId = ?
                ORDER BY isDefault DESC, enabled DESC, label ASC, providerKey ASC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._ai_provider_record(row) for row in rows]

    def get_default_ai_provider_config_for_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT *
                FROM ai_provider_configs
                WHERE tenantId = ? AND enabled = 1
                ORDER BY isDefault DESC, updatedAt DESC
                LIMIT 1
                """,
                (tenant_id,),
            ).fetchone()
        return self._ai_provider_record(row, include_secret=True) if row else None

    def get_ai_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE tenantId = ? AND id = ? LIMIT 1",
                (tenant_id, config_id),
            ).fetchone()
        return self._ai_provider_record(row, include_secret=True) if row else None

    def _create_session(self, conn: sqlite3.Connection, user_id: str, provider: str, user_agent: str | None = None) -> dict[str, Any]:
        session_id = f"session-{secrets.token_hex(10)}"
        token = secrets.token_urlsafe(32)
        createdAt = utcnow_iso()
        expiresAt = (datetime.now(UTC) + timedelta(days=14)).isoformat()
        tenant_row = conn.execute(
            """
            SELECT m.tenantId
            FROM memberships m
            JOIN tenants t ON t.id = m.tenantId
            WHERE m.userId = ?
              AND t.archivedAt IS NULL
            ORDER BY m.createdAt ASC
            LIMIT 1
            """,
            (user_id,),
        ).fetchone()
        currentTenantId = tenant_row["tenantId"] if tenant_row else None
        conn.execute(
            """
            INSERT INTO app_sessions (id, userId, token, provider, currentTenantId, createdAt, expiresAt, lastSeenAt, userAgent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, user_id, token, provider, currentTenantId, createdAt, expiresAt, createdAt, user_agent),
        )
        record = conn.execute(
            """
            SELECT s.id, s.userId, s.token, s.provider, s.currentTenantId, s.createdAt, s.expiresAt, u.*
            FROM app_sessions s
            JOIN app_users u ON u.id = s.userId
            WHERE s.id = ?
            """,
            (session_id,),
        ).fetchone()
        return self._build_session(conn, record)

    def auth_status(self) -> dict[str, Any]:
        has_users = self._user_count() > 0
        return {
            "has_users": has_users,
            "can_bootstrap_owner": not has_users,
            "providers": ["local-password", "google-oauth"],
        }

    def bootstrap_owner(self, name: str, email: str, password: str, user_agent: str | None = None) -> dict[str, Any]:
        normalized = normalize_email(email)
        if self._user_count() > 0:
            raise ValueError("Owner account already exists.")
        if len(password or "") < 8:
            raise ValueError("Password must be at least 8 characters.")
        password_hash, password_salt = hash_password(password)
        user_id = f"user-{secrets.token_hex(8)}"
        now = utcnow_iso()
        with self._connect() as conn:
            tenant_id = self.default_tenant_id()
            username = self._resolve_unique_username(conn, normalized.split("@")[0], name)
            conn.execute(
                """
                INSERT INTO app_users (id, email, username, displayName, passwordHash, passwordSalt, authProvider, role, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'operator', ?, ?)
                """,
                (user_id, normalized, username, name.strip() or normalized, password_hash, password_salt, "local-password", now, now),
            )
            conn.execute(
                """
                INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                VALUES (?, ?, ?, 'owner', ?, ?)
                """,
                (f"membership-{secrets.token_hex(8)}", user_id, tenant_id, now, now),
            )
            session = self._create_session(conn, user_id, "local-password", user_agent=user_agent)
            conn.commit()
        return session

    def login_with_password(self, email: str, password: str, user_agent: str | None = None) -> dict[str, Any]:
        normalized = normalize_email(email)
        with self._connect() as conn:
            record = conn.execute(
                "SELECT * FROM app_users WHERE lower(email) = lower(?) OR lower(username) = lower(?) LIMIT 1",
                (normalized, normalized),
            ).fetchone()
            if not record or not record["passwordHash"] or not record["passwordSalt"]:
                raise ValueError("Invalid email or password.")
            if not verify_password(password, record["passwordHash"], record["passwordSalt"]):
                raise ValueError("Invalid email or password.")
            now = utcnow_iso()
            conn.execute("UPDATE app_users SET lastLoginAt = ?, updatedAt = ? WHERE id = ?", (now, now, record["id"]))
            session = self._create_session(conn, record["id"], "local-password", user_agent=user_agent)
            conn.commit()
        return session

    def login_with_google(self, email: str, name: str | None = None, avatar_url: str | None = None, user_agent: str | None = None) -> dict[str, Any]:
        normalized = normalize_email(email)
        with self._connect() as conn:
            existing = conn.execute("SELECT * FROM app_users WHERE email = ? LIMIT 1", (normalized,)).fetchone()
            user_count = conn.execute("SELECT COUNT(*) AS total FROM app_users").fetchone()
            total_users = int(user_count["total"] if user_count else 0)
            now = utcnow_iso()

            if existing:
                conn.execute(
                    """
                    UPDATE app_users
                    SET displayName = ?, avatarUrl = ?, authProvider = ?, lastLoginAt = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (
                        (name or existing["displayName"] or normalized).strip(),
                        avatar_url or existing["avatarUrl"],
                        "google-oauth",
                        now,
                        now,
                        existing["id"],
                    ),
                )
                user_id = existing["id"]
            elif total_users == 0:
                user_id = f"user-{secrets.token_hex(8)}"
                tenant_id = self.default_tenant_id()
                username = self._resolve_unique_username(conn, normalized.split("@")[0], name or normalized)
                conn.execute(
                    """
                    INSERT INTO app_users (id, email, username, displayName, authProvider, role, avatarUrl, lastLoginAt, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, 'google-oauth', 'operator', ?, ?, ?, ?)
                    """,
                    (user_id, normalized, username, (name or normalized).strip(), avatar_url, now, now, now),
                )
                conn.execute(
                    """
                    INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                    VALUES (?, ?, ?, 'owner', ?, ?)
                    """,
                    (f"membership-{secrets.token_hex(8)}", user_id, tenant_id, now, now),
                )
            else:
                raise ValueError("No AIO CRM account exists for this Google identity. Use the owner account or create a local login first.")

            session = self._create_session(conn, user_id, "google-oauth", user_agent=user_agent)
            conn.commit()
        return session

    def get_session(self, token: str | None) -> dict[str, Any] | None:
        if not token:
            return None
        with self._connect() as conn:
            record = conn.execute(
                """
                SELECT s.id, s.userId, s.token, s.provider, s.currentTenantId, s.createdAt, s.expiresAt, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.userId
                WHERE s.token = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
            if not record:
                return None
            expiresAt = datetime.fromisoformat(record["expiresAt"])
            if expiresAt.tzinfo is None:
                expiresAt = expiresAt.replace(tzinfo=UTC)
            if expiresAt <= datetime.now(UTC):
                conn.execute("DELETE FROM app_sessions WHERE token = ?", (token,))
                conn.commit()
                return None
            conn.execute("UPDATE app_sessions SET lastSeenAt = ? WHERE token = ?", (utcnow_iso(), token))
            session = self._build_session(conn, record)
            resolved_tenant_id = (session.get("tenant") or {}).get("id") if isinstance(session.get("tenant"), dict) else None
            if resolved_tenant_id != record["currentTenantId"]:
                conn.execute(
                    "UPDATE app_sessions SET currentTenantId = ?, lastSeenAt = ? WHERE token = ?",
                    (resolved_tenant_id, utcnow_iso(), token),
                )
            conn.commit()
            return session

    def switch_session_tenant(self, token: str | None, tenant_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            record = conn.execute(
                """
                SELECT s.id, s.userId, s.token, s.provider, s.currentTenantId, s.createdAt, s.expiresAt, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.userId
                WHERE s.token = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
            if not record:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, record["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            conn.execute(
                "UPDATE app_sessions SET currentTenantId = ?, lastSeenAt = ? WHERE token = ?",
                (tenant_id, utcnow_iso(), token),
            )
            conn.commit()
            refreshed = conn.execute(
                """
                SELECT s.id, s.userId, s.token, s.provider, s.currentTenantId, s.createdAt, s.expiresAt, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.userId
                WHERE s.token = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
            return self._build_session(conn, refreshed)

    def create_workspace(self, token: str | None, name: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        workspace_name = (name or "").strip()
        if len(workspace_name) < 2:
            raise ValueError("Workspace name must be at least 2 characters.")
        with self._connect() as conn:
            session = conn.execute(
                "SELECT * FROM app_sessions WHERE token = ? LIMIT 1",
                (token,),
            ).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], session["currentTenantId"], {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            workspace_id = f"tenant-{secrets.token_hex(6)}"
            now = utcnow_iso()
            persisted_settings = {"tenantSettings": strip_derived_tenant_sections(DEFAULT_TENANT_SETTINGS)}
            conn.execute(
                "INSERT INTO tenants (id, name, slug, settingsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                (workspace_id, workspace_name, f"{slugify(workspace_name)}-{secrets.token_hex(3)}", json.dumps(persisted_settings), now, now),
            )
            conn.execute(
                """
                INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (f"membership-{secrets.token_hex(8)}", user["id"], workspace_id, "owner", now, now),
            )
            conn.execute(
                "UPDATE app_sessions SET currentTenantId = ?, lastSeenAt = ? WHERE token = ?",
                (workspace_id, now, token),
            )
            conn.commit()
            return {
                "workspace": self.get_workspace(workspace_id),
                "session": self.get_session(token),
            }

    def rename_workspace(self, token: str | None, tenant_id: str, name: str | None = None, settings: dict[str, Any] | None = None) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        workspace_name = (name or "").strip()
        if name is not None and len(workspace_name) < 2:
            raise ValueError("Workspace name must be at least 2 characters.")
        if name is None and settings is None:
            raise ValueError("No workspace changes provided.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            if name is not None:
                # Workspace identity stays on the tenant row. Do not mirror `name` into
                # `tenantSettings.internal`; operational metadata is updated separately.
                conn.execute("UPDATE tenants SET name = ?, updatedAt = ? WHERE id = ?", (workspace_name, utcnow_iso(), tenant_id))
                conn.commit()
        if settings is not None:
            self.update_tenant_settings(token, tenant_id, settings)
        return {"workspace": self.get_workspace(tenant_id)}

    def archive_workspace(self, token: str | None, tenant_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner"})
            active_memberships = conn.execute(
                """
                SELECT m.tenantId
                FROM memberships m
                JOIN tenants t ON t.id = m.tenantId
                WHERE m.userId = ?
                  AND t.archivedAt IS NULL
                ORDER BY t.createdAt ASC, t.name ASC
                """,
                (session["userId"],),
            ).fetchall()
            if len(active_memberships) <= 1:
                raise ValueError("You cannot archive your only remaining accessible workspace.")
            fallback_row = next((row for row in active_memberships if row["tenantId"] != tenant_id), None)
            if not fallback_row:
                raise ValueError("No alternate workspace is available for this session.")
            workspace = self._require_active_workspace_row(conn, tenant_id)
            now = utcnow_iso()
            conn.execute(
                "UPDATE tenants SET archivedAt = ?, archivedByUserId = ?, updatedAt = ? WHERE id = ?",
                (now, session["userId"], now, tenant_id),
            )
            conn.execute(
                "UPDATE app_sessions SET currentTenantId = NULL, lastSeenAt = ? WHERE currentTenantId = ?",
                (now, tenant_id),
            )
            conn.execute(
                "UPDATE app_sessions SET currentTenantId = ?, lastSeenAt = ? WHERE token = ?",
                (fallback_row["tenantId"], now, token),
            )
            conn.commit()
            refreshed = conn.execute(
                """
                SELECT s.id, s.userId, s.token, s.provider, s.currentTenantId, s.createdAt, s.expiresAt, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.userId
                WHERE s.token = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
            return {
                "workspace": {
                    "id": workspace["id"],
                    "name": workspace["name"],
                    "slug": workspace["slug"],
                    "archivedAt": now,
                },
                "fallback_workspace_id": fallback_row["tenantId"],
                "session": self._build_session(conn, refreshed),
            }

    def get_workspace(self, tenant_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE id = ? AND archivedAt IS NULL LIMIT 1", (tenant_id,)).fetchone()
        if not row:
            raise ValueError("Workspace not found.")
        tenant_settings = self.get_tenant_settings(tenant_id)
        system_settings = self.get_system_settings()
        return {
            "id": row["id"],
            # Identity/index fields are authoritative on the tenant row.
            "name": row["name"],
            "slug": row["slug"],
            # Operational metadata is carried inside `tenant_settings.internal`.
            "settings": tenant_settings_to_legacy_view(tenant_settings),
            "tenant_settings": tenant_settings,
            "system_settings": system_settings,
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
        }

    def list_notifications(self, token: str | None, tenant_id: str, limit: int = 50, unread_only: bool = False) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            query = "SELECT * FROM notifications WHERE tenantId = ?"
            params: list[Any] = [tenant_id]
            if unread_only:
                query += " AND isRead = 0"
            query += " ORDER BY createdAt DESC LIMIT ?"
            params.append(max(1, min(limit, 100)))
            rows = conn.execute(query, params).fetchall()
            unread_count = conn.execute(
                "SELECT COUNT(*) AS count FROM notifications WHERE tenantId = ? AND isRead = 0",
                (tenant_id,),
            ).fetchone()["count"]
        return {
            "notifications": [
                {
                    "id": row["id"],
                    "type": row["type"],
                    "title": row["title"],
                    "message": row["message"],
                    "priority": row["priority"],
                    "link": row["link"],
                    "read": bool(row["isRead"]),
                    "createdAt": row["createdAt"],
                    "updatedAt": row["updatedAt"],
                }
                for row in rows
            ],
            "unread_count": unread_count,
        }

    def create_notification(self, token: str | None, tenant_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            now = utcnow_iso()
            notification = {
                "id": f"notif-{secrets.token_hex(8)}",
                "tenantId": tenant_id,
                "type": (payload.get("type") or "info").strip() or "info",
                "title": (payload.get("title") or "").strip(),
                "message": (payload.get("message") or "").strip(),
                "priority": (payload.get("priority") or "normal").strip() or "normal",
                "link": (payload.get("link") or "").strip() or None,
                "read": 0,
                "createdAt": now,
                "updatedAt": now,
            }
            if not notification["title"] or not notification["message"]:
                raise ValueError("Notification title and message are required.")
            conn.execute(
                """
                INSERT INTO notifications (id, tenantId, type, title, message, priority, link, isRead, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    notification["id"],
                    notification["tenantId"],
                    notification["type"],
                    notification["title"],
                    notification["message"],
                    notification["priority"],
                    notification["link"],
                    notification["isRead"],
                    notification["createdAt"],
                    notification["updatedAt"],
                ),
            )
            conn.execute(
                """
                DELETE FROM notifications
                WHERE id IN (
                    SELECT id FROM notifications
                    WHERE tenantId = ?
                    ORDER BY createdAt DESC
                    LIMIT -1 OFFSET 100
                )
                """,
                (tenant_id,),
            )
            conn.commit()
        notification["read"] = False
        return notification

    def update_notification(self, token: str | None, tenant_id: str, notification_id: str, read: bool | None = None) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            row = conn.execute(
                "SELECT * FROM notifications WHERE id = ? AND tenantId = ? LIMIT 1",
                (notification_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Notification not found.")
            now = utcnow_iso()
            if read is not None:
                conn.execute(
                    "UPDATE notifications SET isRead = ?, updatedAt = ? WHERE id = ? AND tenantId = ?",
                    (1 if read else 0, now, notification_id, tenant_id),
                )
            conn.commit()
        return {
            "id": row["id"],
            "type": row["type"],
            "title": row["title"],
            "message": row["message"],
            "priority": row["priority"],
            "link": row["link"],
            "read": bool(read if read is not None else row["isRead"]),
            "createdAt": row["createdAt"],
            "updatedAt": now if read is not None else row["updatedAt"],
        }

    def mark_all_notifications_read(self, token: str | None, tenant_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            now = utcnow_iso()
            conn.execute(
                "UPDATE notifications SET read = 1, updatedAt = ? WHERE tenantId = ?",
                (now, tenant_id),
            )
            conn.commit()
        return {"success": True}

    def delete_notification(self, token: str | None, tenant_id: str, notification_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            row = conn.execute(
                "SELECT id FROM notifications WHERE id = ? AND tenantId = ? LIMIT 1",
                (notification_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Notification not found.")
            conn.execute("DELETE FROM notifications WHERE id = ? AND tenantId = ?", (notification_id, tenant_id))
            conn.commit()
        return {"success": True}

    def list_workspace_memberships(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            rows = conn.execute(
                """
                SELECT m.*, u.email, u.displayName, u.authProvider
                FROM memberships m
                JOIN app_users u ON u.id = m.userId
                WHERE m.tenantId = ?
                ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END, u.displayName ASC, u.email ASC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._membership_record(row) for row in rows]

    def add_workspace_member(self, token: str | None, tenant_id: str, email: str, role: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        normalized_email = normalize_email(email)
        if role not in {"admin", "staff", "viewer"}:
            raise ValueError("Invalid workspace role.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE email = ? LIMIT 1", (normalized_email,)).fetchone()
            if not user:
                raise ValueError("No app user exists for that email yet.")
            existing = conn.execute(
                "SELECT * FROM memberships WHERE userId = ? AND tenantId = ? LIMIT 1",
                (user["id"], tenant_id),
            ).fetchone()
            now = utcnow_iso()
            if existing:
                conn.execute(
                    "UPDATE memberships SET role = ?, updatedAt = ? WHERE id = ?",
                    (role, now, existing["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (f"membership-{secrets.token_hex(8)}", user["id"], tenant_id, role, now, now),
                )
            conn.commit()
        return {"memberships": self.list_workspace_memberships(token, tenant_id)}

    def create_workspace_user(
        self,
        token: str | None,
        tenant_id: str,
        username: str,
        email: str,
        password: str,
        display_name: str,
        role: str = "staff",
        user_role: str = "operator",
        create_workspace: bool = False,
        workspace_name: str | None = None,
    ) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        normalized_email = normalize_email(email)
        normalized_name = (display_name or "").strip()
        normalized_username = (username or "").strip()
        if not normalized_name:
            raise ValueError("Name is required.")
        if not normalized_username:
            raise ValueError("Username is required.")
        if len(password or "") < 8:
            raise ValueError("Password must be at least 8 characters.")
        if role not in {"owner", "admin", "staff", "viewer"}:
            raise ValueError("Invalid workspace role.")
        resolved_user_role = normalize_user_role(user_role)

        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            acting = self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            existing_by_email = conn.execute("SELECT id FROM app_users WHERE email = ? LIMIT 1", (normalized_email,)).fetchone()
            if existing_by_email:
                raise ValueError("An app user with that email already exists.")
            if self._username_exists(conn, normalized_username):
                raise ValueError("That username is already in use.")

            user_id = f"user-{secrets.token_hex(8)}"
            passwordHash, passwordSalt = hash_password(password)
            now = utcnow_iso()
            target_tenant_id = tenant_id
            target_role = role
            created_workspace = None

            if create_workspace:
                workspace_label = (workspace_name or "").strip() or f"{normalized_name} Workspace"
                target_tenant_id = f"tenant-{secrets.token_hex(6)}"
                workspace_slug = f"{slugify(workspace_label)}-{secrets.token_hex(3)}"
                persisted_settings = {"tenantSettings": strip_derived_tenant_sections(DEFAULT_TENANT_SETTINGS)}
                conn.execute(
                    "INSERT INTO tenants (id, name, slug, settingsJson, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
                    (target_tenant_id, workspace_label, workspace_slug, json.dumps(persisted_settings), now, now),
                )
                target_role = "owner"
                existing_owner_membership = conn.execute(
                    "SELECT id FROM memberships WHERE userId = ? AND tenantId = ? LIMIT 1",
                    (session["userId"], target_tenant_id),
                ).fetchone()
                if not existing_owner_membership:
                    conn.execute(
                        """
                        INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                        VALUES (?, ?, ?, 'owner', ?, ?)
                        """,
                        (f"membership-{secrets.token_hex(8)}", session["userId"], target_tenant_id, now, now),
                    )
                created_workspace = {
                    "id": target_tenant_id,
                    "name": workspace_label,
                    "slug": workspace_slug,
                    "createdAt": now,
                    "updatedAt": now,
                }
            elif acting["role"] != "owner" and role == "owner":
                raise ValueError("Only owners can create another owner in this workspace.")

            conn.execute(
                """
                INSERT INTO app_users (id, email, username, displayName, passwordHash, passwordSalt, authProvider, role, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, 'local-password', ?, ?, ?)
                """,
                (user_id, normalized_email, normalized_username, normalized_name, password_hash, password_salt, resolved_user_role, now, now),
            )
            conn.execute(
                """
                INSERT INTO memberships (id, userId, tenantId, role, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (f"membership-{secrets.token_hex(8)}", user_id, target_tenant_id, target_role, now, now),
            )
            conn.commit()

        return {
            "user": {
                "id": user_id,
                "email": normalized_email,
                "username": normalized_username,
                "name": normalized_name,
                "role": resolved_user_role,
                "workspace_role": target_role,
            },
            "workspace": created_workspace or self.get_workspace(target_tenant_id),
            "memberships": self.list_workspace_memberships(token, target_tenant_id),
        }

    def update_workspace_member(self, token: str | None, tenant_id: str, membership_id: str, role: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        if role not in {"owner", "admin", "staff", "viewer"}:
            raise ValueError("Invalid workspace role.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            acting = self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            membership = conn.execute(
                "SELECT * FROM memberships WHERE id = ? AND tenantId = ? LIMIT 1",
                (membership_id, tenant_id),
            ).fetchone()
            if not membership:
                raise ValueError("Workspace member not found.")
            if acting["role"] != "owner" and role == "owner":
                raise ValueError("Only owners can assign the owner role.")
            if membership["userId"] == session["userId"] and role != membership["role"] and membership["role"] == "owner":
                raise ValueError("Transfer ownership before changing your own owner role.")
            conn.execute(
                "UPDATE memberships SET role = ?, updatedAt = ? WHERE id = ?",
                (role, utcnow_iso(), membership_id),
            )
            conn.commit()
        return {"memberships": self.list_workspace_memberships(token, tenant_id)}

    def remove_workspace_member(self, token: str | None, tenant_id: str, membership_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            acting = self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            membership = conn.execute(
                "SELECT * FROM memberships WHERE id = ? AND tenantId = ? LIMIT 1",
                (membership_id, tenant_id),
            ).fetchone()
            if not membership:
                raise ValueError("Workspace member not found.")
            owners = conn.execute(
                "SELECT COUNT(*) AS total FROM memberships WHERE tenantId = ? AND role = 'owner'",
                (tenant_id,),
            ).fetchone()
            if membership["role"] == "owner" and int(owners["total"] if owners else 0) <= 1:
                raise ValueError("Workspace must keep at least one owner.")
            if acting["role"] != "owner" and membership["role"] == "owner":
                raise ValueError("Only owners can remove another owner.")
            conn.execute("DELETE FROM memberships WHERE id = ?", (membership_id,))
            next_membership = conn.execute(
                """
                SELECT m.tenant_id
                FROM memberships m
                JOIN tenants t ON t.id = m.tenant_id
                WHERE m.userId = ?
                  AND t.archivedAt IS NULL
                ORDER BY m.createdAt ASC
                LIMIT 1
                """,
                (membership["userId"],),
            ).fetchone()
            conn.execute(
                "UPDATE app_sessions SET currentTenantId = ? WHERE userId = ? AND currentTenantId = ?",
                ((next_membership["tenantId"] if next_membership else None), membership["userId"], tenant_id),
            )
            conn.commit()
        return {"memberships": self.list_workspace_memberships(token, tenant_id)}

    def get_user_access_by_email(self, token: str | None, email: str) -> dict[str, Any] | None:
        if not token:
            raise ValueError("Session token is required.")
        normalized_email = normalize_email(email)
        if not normalized_email:
            return None
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], session["currentTenantId"], {"owner", "admin", "staff"})
            user = conn.execute("SELECT * FROM app_users WHERE email = ? LIMIT 1", (normalized_email,)).fetchone()
            if not user:
                return None
            memberships = conn.execute(
                """
                SELECT m.*, t.name AS tenantName, t.slug AS tenantSlug
                FROM memberships m
                JOIN tenants t ON t.id = m.tenantId
                WHERE m.userId = ?
                  AND t.archivedAt IS NULL
                ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END, t.createdAt ASC, t.name ASC
                """,
                (user["id"],),
            ).fetchall()
            session_memberships = {
                row["tenantId"]
                for row in conn.execute(
                    """
                    SELECT m.tenantId
                    FROM memberships m
                    JOIN tenants t ON t.id = m.tenantId
                    WHERE m.userId = ?
                      AND t.archivedAt IS NULL
                    """,
                    (session["userId"],),
                ).fetchall()
            }
            return {
                "user": self._public_user(user),
                "memberships": [
                    {
                        "id": membership["id"],
                        "tenantId": membership["tenantId"],
                        "workspaceName": membership["tenantName"],
                        "workspaceSlug": membership["tenantSlug"],
                        "role": membership["role"],
                        "canSwitchAsAdmin": membership["tenantId"] in session_memberships,
                    }
                    for membership in memberships
                ],
            }

    def logout(self, token: str | None) -> None:
        if not token:
            return
        with self._connect() as conn:
            conn.execute("DELETE FROM app_sessions WHERE token = ?", (token,))
            conn.commit()

    def get_profile(self, token: str | None) -> dict[str, Any]:
        session = self.get_session(token)
        if not session:
            raise ValueError("Session not found or expired.")
        return session.get("user") or {}

    def update_profile(self, token: str | None, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")

            display_name = (payload.get("displayName") or user["displayName"] or user["email"]).strip()
            if not display_name:
                raise ValueError("Display name is required.")

            phone = (payload.get("phone") or "").strip() or None
            locale = (payload.get("locale") or "").strip() or user["locale"] or "en-US"
            timezone_value = (payload.get("timezone") or "").strip() or user["timezone"] or "America/New_York"
            email_signature = payload.get("emailSignature")
            if email_signature is not None:
                email_signature = str(email_signature).strip()
            else:
                email_signature = user["emailSignature"]

            conn.execute(
                """
                UPDATE app_users
                SET displayName = ?, phone = ?, locale = ?, timezone = ?, emailSignature = ?, updatedAt = ?
                WHERE id = ?
                """,
                (display_name, phone, locale, timezone_value, email_signature, utcnow_iso(), user["id"]),
            )
            conn.commit()
        updated = self.get_session(token)
        if not updated:
            raise ValueError("Unable to refresh session after profile update.")
        return updated.get("user") or {}

    def change_password(self, token: str | None, current_password: str, new_password: str) -> None:
        if not token:
            raise ValueError("Session token is required.")
        if len(new_password or "") < 8:
            raise ValueError("New password must be at least 8 characters.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            if not user["passwordHash"] or not user["passwordSalt"]:
                raise ValueError("This account does not have a local password yet.")
            if not verify_password(current_password or "", user["passwordHash"], user["passwordSalt"]):
                raise ValueError("Current password is incorrect.")
            password_hash, password_salt = hash_password(new_password)
            conn.execute(
                "UPDATE app_users SET passwordHash = ?, passwordSalt = ?, updatedAt = ? WHERE id = ?",
                (password_hash, password_salt, utcnow_iso(), user["id"]),
            )
            conn.commit()

    def list_sessions(self, token: str | None) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            current = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not current:
                raise ValueError("Session not found or expired.")
            rows = conn.execute(
                """
                SELECT id, provider, userAgent, createdAt, expiresAt, lastSeenAt
                FROM app_sessions
                WHERE userId = ?
                ORDER BY lastSeenAt DESC, createdAt DESC
                """,
                (current["userId"],),
            ).fetchall()
        sessions = []
        for row in rows:
            provider_label = (row["provider"] or "session").replace("-", " ").title()
            user_agent = (row["userAgent"] or "").strip()
            sessions.append(
                {
                    "id": row["id"],
                    "provider": row["provider"],
                    "label": user_agent or provider_label,
                    "createdAt": row["createdAt"],
                    "expiresAt": row["expiresAt"],
                    "lastSeenAt": row["lastSeenAt"],
                    "is_current": row["id"] == current["id"],
                }
            )
        return sessions

    def revoke_session(self, token: str | None, session_id: str) -> None:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            current = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not current:
                raise ValueError("Session not found or expired.")
            target = conn.execute(
                "SELECT * FROM app_sessions WHERE id = ? AND userId = ? LIMIT 1",
                (session_id, current["userId"]),
            ).fetchone()
            if not target:
                raise ValueError("Session not found.")
            conn.execute("DELETE FROM app_sessions WHERE id = ?", (session_id,))
            conn.commit()

    def logout_other_sessions(self, token: str | None) -> None:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            current = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not current:
                raise ValueError("Session not found or expired.")
            conn.execute("DELETE FROM app_sessions WHERE userId = ? AND id != ?", (current["userId"], current["id"]))
            conn.commit()

    def list_global_variables(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            rows = self._list_global_variable_records_for_tenant(conn, tenant_id)
        return rows

    def upsert_global_variable(self, token: str | None, tenant_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        key = (payload.get("key") or "").strip()
        value = payload.get("value")
        if not key or value is None or str(value) == "":
            raise ValueError("Key and value are required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff"})
            self._upsert_global_variables_from_canonical(
                conn,
                tenant_id,
                session["userId"],
                {
                    key: {
                        "value": str(value),
                        "label": payload.get("label") or key,
                        "category": payload.get("category") or ("system" if payload.get("is_system") else "custom"),
                        "editableByClient": payload.get("editable_by_client", not payload.get("is_system")),
                        "description": payload.get("description") or "",
                        "isSecret": bool(payload.get("is_secret")),
                        "isSystem": bool(payload.get("is_system")),
                    }
                },
            )
            conn.commit()
        return next(item for item in self.list_global_variables(token, tenant_id) if item["key"] == key)

    def delete_global_variable(self, token: str | None, tenant_id: str, variable_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff"})
            row = conn.execute(
                "SELECT * FROM global_variables WHERE id = ? AND tenantId = ? LIMIT 1",
                (variable_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Variable not found.")
            conn.execute("DELETE FROM global_variables WHERE id = ?", (variable_id,))
            conn.commit()
        return {"deleted_id": variable_id}

    def list_system_email_templates(self, token: str | None, tenant_id: str, search: str | None = None) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
            query = """
                SELECT *
                FROM system_email_templates
                WHERE tenantId = ?
            """
            params: list[Any] = [tenant_id]
            search_value = (search or "").strip().lower()
            if search_value:
                query += " AND (lower(email_type) LIKE ? OR lower(subject) LIKE ? OR lower(send_to) LIKE ?)"
                like = f"%{search_value}%"
                params.extend([like, like, like])
            query += " ORDER BY email_type ASC"
            rows = conn.execute(query, params).fetchall()
        templates = []
        for row in rows:
            config = json.loads(row["configJson"]) if row["configJson"] else {}
            templates.append(
                {
                    "id": row["id"],
                    "templateKey": row["templateKey"],
                    "emailType": row["emailType"],
                    "subject": row["subject"],
                    "sendTo": row["sendTo"],
                    "enabled": bool(row["enabled"]),
                    "bodyHtml": row["bodyHtml"],
                    "bodyText": row["bodyText"],
                    "editedByName": row["editedByName"],
                    "editedAt": row["editedAt"],
                    "config": config,
                    "createdAt": row["createdAt"],
                    "updatedAt": row["updatedAt"],
                }
            )
        return templates

    def update_system_email_template(self, token: str | None, tenant_id: str, template_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["userId"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff"})
            row = conn.execute(
                "SELECT * FROM system_email_templates WHERE id = ? AND tenantId = ? LIMIT 1",
                (template_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("System email template not found.")
            existing_config = json.loads(row["configJson"]) if row["configJson"] else {}
            next_config = payload.get("config") if payload.get("config") is not None else existing_config
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE system_email_templates
                SET subject = ?, sendTo = ?, enabled = ?, bodyHtml = ?, bodyText = ?,
                    editedByUserId = ?, editedByName = ?, editedAt = ?, configJson = ?, updatedAt = ?
                WHERE id = ?
                """,
                (
                    (payload.get("subject") or row["subject"]).strip(),
                    (payload.get("sendTo") or row["sendTo"]).strip(),
                    1 if payload.get("enabled", bool(row["enabled"])) else 0,
                    payload.get("bodyHtml") if payload.get("bodyHtml") is not None else row["bodyHtml"],
                    payload.get("bodyText") if payload.get("bodyText") is not None else row["bodyText"],
                    user["id"],
                    user["displayName"] or user["email"],
                    now,
                    json.dumps(next_config or {}),
                    now,
                    template_id,
                ),
            )
            conn.commit()
        return next((item for item in self.list_system_email_templates(token, tenant_id) if item["id"] == template_id), None)

    def record_ai_run(
        self,
        *,
        user_id: str,
        tenant_id: str | None,
        module: str,
        surface: str,
        field: str,
        intent: str,
        prompt: str,
        result: str,
        status: str = "completed",
        agent_role: str | None = None,
        intake_agent: str | None = None,
        dispatcher_agent: str | None = None,
        executing_agent: str | None = None,
        requested_agent: str | None = None,
        delegate_chain: list[str] | None = None,
        permission_tier: str | None = None,
        thread_id: str | None = None,
        contact_id: str | None = None,
        company_id: str | None = None,
        command_text: str | None = None,
        provider_key: str | None = None,
        provider_label: str | None = None,
        model: str | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        steps: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        raise NotImplementedError(
            "Legacy aiEngineRuns persistence is disabled. Use the canonical aiEngineRuns store with a read-only projection adapter."
        )

    def list_ai_runs(self, token: str | None, limit: int = 50) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            tenant_id = session["currentTenantId"]
            rows = conn.execute(
                """
                SELECT *
                FROM aiEngineRuns
                WHERE tenantId = ?
                ORDER BY createdAt DESC
                LIMIT ?
                """,
                (tenant_id, max(1, min(limit, 200))),
            ).fetchall()
        runs = []
        for row in rows:
            try:
                metadata = json.loads(row["metadataJson"] or "{}")
            except json.JSONDecodeError:
                metadata = {}
            try:
                artifacts = json.loads(row["artifactsJson"] or "[]")
            except json.JSONDecodeError:
                artifacts = []
            try:
                steps = json.loads(row["stepsJson"] or "[]")
            except json.JSONDecodeError:
                steps = []
            try:
                delegate_chain = json.loads(row["delegateChainJson"] or "[]")
            except json.JSONDecodeError:
                delegate_chain = []
            runs.append(
                {
                    "id": row["id"],
                    "tenantId": row["tenantId"],
                    "userId": row["userId"],
                    "module": row["module"],
                    "surface": row["surface"],
                    "field": row["field"],
                    "intent": row["intent"],
                    "status": row["status"] or "completed",
                    "agentRole": row["agentRole"],
                    "intakeAgent": row["intakeAgent"],
                    "dispatcherAgent": row["dispatcherAgent"],
                    "executingAgent": row["executingAgent"],
                    "requestedAgent": row["requestedAgent"],
                    "delegateChain": delegate_chain if isinstance(delegate_chain, list) else [],
                    "permissionTier": row["permissionTier"],
                    "threadId": row["threadId"],
                    "contactId": row["contactId"],
                    "companyId": row["companyId"],
                    "commandText": row["commandText"],
                    "providerKey": row["providerKey"],
                    "providerLabel": row["providerLabel"],
                    "model": row["model"],
                    "prompt": row["prompt"],
                    "result": row["result"],
                    "artifacts": artifacts if isinstance(artifacts, list) else [],
                    "steps": steps if isinstance(steps, list) else [],
                    "metadata": metadata,
                    "createdAt": row["createdAt"],
                }
            )
        return runs

    def get_omega_protocol(self, token: str | None, tenant_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner"})
            row = conn.execute("SELECT * FROM omega_protocols WHERE tenantId = ? LIMIT 1", (tenant_id,)).fetchone()
        if not row:
            return {
                "tenant_id": tenant_id,
                "status": "idle",
                "armed_by_user_id": None,
                "armed_at": None,
                "execute_at": None,
                "last_event": "idle",
            }
        payload = dict(row)
        payload.pop("arm_code_hash", None)
        payload.pop("cancel_code_hash", None)
        return payload

    def _record_omega_event(self, conn: sqlite3.Connection, tenant_id: str, user_id: str | None, event_type: str, detail: str | None = None) -> None:
        conn.execute(
            """
            INSERT INTO omega_protocol_events (id, tenantId, userId, eventType, detail, createdAt)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                secrets.token_hex(16),
                tenant_id,
                user_id,
                event_type,
                (detail or "").strip() or None,
                utcnow_iso(),
            ),
        )

    def list_omega_protocol_events(self, token: str | None, tenant_id: str, limit: int = 25) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner"})
            rows = conn.execute(
                """
                SELECT id, tenant_id, user_id, event_type, detail, createdAt
                FROM omega_protocol_events
                WHERE tenantId = ?
                ORDER BY createdAt DESC
                LIMIT ?
                """,
                (tenant_id, max(1, limit)),
            ).fetchall()
        return [dict(row) for row in rows]

    def arm_omega_protocol(self, token: str | None, tenant_id: str, confirmation_code: str, cancel_code: str, delay_minutes: int = 5) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        if not confirmation_code.strip() or not cancel_code.strip():
            raise ValueError("Both confirmation and cancel codes are required.")
        if confirmation_code.strip() == cancel_code.strip():
            raise ValueError("Cancel code must be different from the confirmation code.")
        now = utcnow_iso()
        execute_at = (datetime.now(UTC) + timedelta(minutes=max(1, delay_minutes))).isoformat()
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner"})
            existing = conn.execute("SELECT * FROM omega_protocols WHERE tenantId = ? LIMIT 1", (tenant_id,)).fetchone()
            if existing and (existing["status"] or "idle") == "armed":
                raise ValueError("Omega is already armed for this workspace.")
            if existing:
                conn.execute(
                    """
                    UPDATE omega_protocols
                    SET status = 'armed', armed_by_userId = ?, armed_at = ?, execute_at = ?, arm_code_hash = ?, cancel_code_hash = ?, last_event = 'armed', updatedAt = ?
                    WHERE tenantId = ?
                    """,
                    (
                        session["userId"],
                        now,
                        execute_at,
                        self._omega_code_digest(confirmation_code.strip()),
                        self._omega_code_digest(cancel_code.strip()),
                        now,
                        tenant_id,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO omega_protocols (
                        tenant_id, status, armed_by_user_id, armed_at, execute_at, arm_code_hash, cancel_code_hash, last_event, updatedAt
                    ) VALUES (?, 'armed', ?, ?, ?, ?, ?, 'armed', ?)
                    """,
                    (
                        tenant_id,
                        session["userId"],
                        now,
                        execute_at,
                        self._omega_code_digest(confirmation_code.strip()),
                        self._omega_code_digest(cancel_code.strip()),
                        now,
                    ),
                )
            self._record_omega_event(
                conn,
                tenant_id,
                session["userId"],
                "armed",
                f"Omega armed with {max(1, delay_minutes)} minute delay.",
            )
            conn.commit()
        return self.get_omega_protocol(token, tenant_id)

    def cancel_omega_protocol(self, token: str | None, tenant_id: str, cancel_code: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        if not cancel_code.strip():
            raise ValueError("Cancel code is required.")
        now = utcnow_iso()
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner"})
            existing = conn.execute("SELECT * FROM omega_protocols WHERE tenantId = ? LIMIT 1", (tenant_id,)).fetchone()
            if not existing or (existing["status"] or "idle") != "armed":
                raise ValueError("Omega is not armed.")
            if not hmac.compare_digest(existing["cancel_code_hash"] or "", self._omega_code_digest(cancel_code.strip())):
                raise ValueError("Cancel code did not match.")
            conn.execute(
                """
                UPDATE omega_protocols
                SET status = 'cancelled', execute_at = NULL, arm_code_hash = NULL, cancel_code_hash = NULL, last_event = 'cancelled', updatedAt = ?
                WHERE tenantId = ?
                """,
                (now, tenant_id),
            )
            self._record_omega_event(conn, tenant_id, session["userId"], "cancelled", "Omega arm sequence cancelled.")
            conn.commit()
        return self.get_omega_protocol(token, tenant_id)

    def verify_omega_execution(self, token: str | None, tenant_id: str, confirmation_code: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        if not confirmation_code.strip():
            raise ValueError("Confirmation code is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner"})
            existing = conn.execute("SELECT * FROM omega_protocols WHERE tenantId = ? LIMIT 1", (tenant_id,)).fetchone()
            if not existing or (existing["status"] or "idle") != "armed":
                raise ValueError("Omega is not armed.")
            if not hmac.compare_digest(existing["arm_code_hash"] or "", self._omega_code_digest(confirmation_code.strip())):
                raise ValueError("Confirmation code did not match.")
            execute_at = existing["execute_at"]
            execute_dt = datetime.fromisoformat(execute_at) if execute_at else None
            if not execute_dt or execute_dt > datetime.now(UTC):
                raise ValueError("Omega countdown is still active.")
            protocol = dict(existing)
            protocol["verified_by_user_id"] = session["userId"]
        return protocol

    def list_ai_provider_configs(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
        return self.list_ai_provider_configs_for_tenant(tenant_id)

    def get_ai_routing_record_for_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ai_routing_configs WHERE tenantId = ? LIMIT 1",
                (tenant_id,),
            ).fetchone()
        if not row:
            return None
        config = json.loads(row["configJson"]) if row["configJson"] else {}
        return {
            "id": row["id"],
            "tenantId": row["tenantId"],
            "config": config,
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
        }

    def get_ai_routing_config_for_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        record = self.get_ai_routing_record_for_tenant(tenant_id)
        return record.get("config") if record else None

    def upsert_ai_routing_config(self, token: str | None, tenant_id: str, config: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            existing = conn.execute("SELECT * FROM ai_routing_configs WHERE tenantId = ? LIMIT 1", (tenant_id,)).fetchone()
            now = utcnow_iso()
            config_json = json.dumps(config or {})
            if existing:
                conn.execute("""
                    UPDATE ai_routing_configs
                    SET configJson = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (config_json, now, existing["id"]),
                )
            else:
                config_id = f"ai-routing-{secrets.token_hex(8)}"
                conn.execute("""
                    INSERT INTO ai_routing_configs (id, tenantId, configJson, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (config_id, tenant_id, config_json, now, now),
                )
            conn.commit()
        return self.get_ai_routing_record_for_tenant(tenant_id) or {"tenantId": tenant_id, "config": config}

    def list_automation_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM automation_provider_configs
                WHERE tenantId = ?
                ORDER BY updatedAt DESC, createdAt DESC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._automation_provider_record(row) for row in rows]

    def get_automation_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE tenantId = ? AND id = ? LIMIT 1",
                (tenant_id, config_id),
            ).fetchone()
        return self._automation_provider_record(row, include_secret=True) if row else None

    def list_automation_provider_configs(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
        return self.list_automation_provider_configs_for_tenant(tenant_id)

    def upsert_automation_provider_config(self, token: str | None, tenant_id: str, provider_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        normalized_provider = (provider_key or "").strip().lower()
        if not normalized_provider:
            raise ValueError("Provider key is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE tenantId = ? AND provider_key = ? LIMIT 1",
                (tenant_id, normalized_provider),
            ).fetchone()
            now = utcnow_iso()
            label = (payload.get("label") or normalized_provider.replace("-", " ").title()).strip()
            config = payload.get("config") or {}
            base_url = (payload.get("base_url") or "").strip() or None
            api_key = payload.get("api_key")
            if api_key is not None:
                api_key = api_key.strip() or None
            enabled = 1 if payload.get("enabled") else 0
            status = (payload.get("status") or (existing["status"] if existing else ("configured" if enabled else "disconnected"))).strip()
            last_error = payload.get("last_error")
            if existing:
                resolved_api_key = api_key if api_key is not None else existing["api_key"]
                resolved_last_tested_at = payload.get("last_tested_at", existing["last_tested_at"])
                conn.execute(
                    """
                    UPDATE automation_provider_configs
                    SET label = ?, base_url = ?, api_key = ?, enabled = ?, status = ?, config_json = ?,
                        last_tested_at = ?, last_error = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (
                        label,
                        base_url,
                        resolved_api_key,
                        enabled,
                        status,
                        json.dumps(config),
                        resolved_last_tested_at,
                        last_error,
                        now,
                        existing["id"],
                    ),
                )
                config_id = existing["id"]
            else:
                config_id = f"automation-provider-{secrets.token_hex(8)}"
                conn.execute(
                    """
                    INSERT INTO automation_provider_configs (
                        id, tenant_id, provider_key, label, base_url, api_key, enabled, status,
                        config_json, last_tested_at, last_error, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config_id,
                        tenant_id,
                        normalized_provider,
                        label,
                        base_url,
                        api_key,
                        enabled,
                        status,
                        json.dumps(config),
                        payload.get("last_tested_at"),
                        last_error,
                        now,
                        now,
                    ),
                )
            conn.commit()
        return next((item for item in self.list_automation_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def delete_automation_provider_config(self, token: str | None, tenant_id: str, config_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Automation provider config not found.")
            conn.execute("DELETE FROM automation_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deletedId": config_id, "providerKey": row["providerKey"]}

    def save_automation_provider_test_result(
        self,
        tenant_id: str,
        config_id: str,
        *,
        status: str,
        last_error: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Automation provider config not found.")
            config = json.loads(row["configJson"]) if row["configJson"] else {}
            if details:
                config.update(details)
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE automation_provider_configs
                SET status = ?, lastTestedAt = ?, lastError = ?, configJson = ?, updatedAt = ?
                WHERE id = ? AND tenantId = ?
                """,
                (status, now, last_error, json.dumps(config), now, config_id, tenant_id),
            )
            conn.commit()
        return next((item for item in self.list_automation_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def _media_provider_record(self, row: sqlite3.Row | None, include_secret: bool = False) -> dict[str, Any] | None:
        if not row:
            return None
        config = json.loads(row["configJson"]) if row["configJson"] else {}
        return {
            "id": row["id"],
            "tenantId": row["tenantId"],
            "providerKey": row["providerKey"],
            "label": row["label"],
            "baseUrl": row["baseUrl"],
            "apiKey": row["apiKey"] if include_secret else bool(row["apiKey"]),
            "enabled": bool(row["enabled"]),
            "status": row["status"],
            "config": config,
            "lastTestedAt": row["lastTestedAt"],
            "lastError": row["lastError"],
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
        }

    def list_media_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM media_provider_configs
                WHERE tenantId = ?
                ORDER BY updatedAt DESC, createdAt DESC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._media_provider_record(row) for row in rows]

    def get_media_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM media_provider_configs WHERE tenantId = ? AND id = ? LIMIT 1",
                (tenant_id, config_id),
            ).fetchone()
        return self._media_provider_record(row, include_secret=True) if row else None

    def list_media_provider_configs(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
        return self.list_media_provider_configs_for_tenant(tenant_id)

    def upsert_media_provider_config(self, token: str | None, tenant_id: str, providerKey: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        normalized_provider = (providerKey or "").strip().lower()
        if not normalized_provider:
            raise ValueError("Provider key is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM media_provider_configs WHERE tenantId = ? AND providerKey = ? LIMIT 1",
                (tenant_id, normalized_provider),
            ).fetchone()
            now = utcnow_iso()
            label = (payload.get("label") or normalized_provider.replace("-", " ").title()).strip()
            config = payload.get("config") or {}
            baseUrl = (payload.get("baseUrl") or "").strip() or None
            apiKey = payload.get("apiKey")
            if apiKey is not None:
                apiKey = apiKey.strip() or None
            enabled = 1 if payload.get("enabled") else 0
            status = (payload.get("status") or (existing["status"] if existing else ("configured" if enabled else "disconnected"))).strip()
            lastError = payload.get("lastError")
            if existing:
                resolved_api_key = apiKey if apiKey is not None else existing["apiKey"]
                resolved_last_tested_at = payload.get("lastTestedAt", existing["lastTestedAt"])
                conn.execute(
                    """
                    UPDATE media_provider_configs
                    SET label = ?, baseUrl = ?, apiKey = ?, enabled = ?, status = ?, configJson = ?,
                    lastTestedAt = ?, lastError = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (
                        label,
                        baseUrl,
                        resolved_api_key,
                        enabled,
                        status,
                        json.dumps(config),
                        resolved_last_tested_at,
                        lastError,
                        now,
                        existing["id"],
                    ),
                )
                config_id = existing["id"]
            else:
                config_id = f"media-prov-{secrets.token_hex(8)}"
                conn.execute(
                    """
                    INSERT INTO media_provider_configs (id, tenantId, providerKey, label, baseUrl, apiKey, enabled, status, configJson, createdAt, updatedAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config_id,
                        tenant_id,
                        normalized_provider,
                        label,
                        baseUrl,
                        apiKey,
                        enabled,
                        status,
                        json.dumps(config),
                        now,
                        now,
                    ),
                )
            conn.commit()
        return next((item for item in self.list_media_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def delete_media_provider_config(self, token: str | None, tenant_id: str, config_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM media_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Media provider config not found.")
            conn.execute("DELETE FROM media_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deletedId": config_id, "providerKey": row["providerKey"]}

    def save_media_provider_test_result(
        self,
        tenant_id: str,
        config_id: str,
        *,
        status: str,
        lastError: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM media_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Media provider config not found.")
            config = json.loads(row["configJson"]) if row["configJson"] else {}
            if details:
                config.update(details)
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE media_provider_configs
                SET status = ?, lastTestedAt = ?, lastError = ?, configJson = ?, updatedAt = ?
                WHERE id = ? AND tenantId = ?
                """,
                (status, now, lastError, json.dumps(config), now, config_id, tenant_id),
            )
            conn.commit()
        return self.get_media_provider_config_for_tenant(tenant_id, config_id)

    def list_payment_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM payment_provider_configs
                WHERE tenantId = ?
                ORDER BY updatedAt DESC, createdAt DESC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._payment_provider_record(row) for row in rows]

    def get_payment_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM payment_provider_configs WHERE tenantId = ? AND id = ? LIMIT 1",
                (tenant_id, config_id),
            ).fetchone()
        return self._payment_provider_record(row, include_secret=True) if row else None

    def list_payment_provider_configs(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin", "staff", "viewer"})
        return self.list_payment_provider_configs_for_tenant(tenant_id)

    def upsert_payment_provider_config(self, token: str | None, tenant_id: str, provider_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        normalized_provider = (provider_key or "").strip().lower()
        if not normalized_provider:
            raise ValueError("Provider key is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM payment_provider_configs WHERE tenantId = ? AND providerKey = ? LIMIT 1",
                (tenant_id, normalized_provider),
            ).fetchone()
            now = utcnow_iso()
            label = (payload.get("label") or normalized_provider.replace("-", " ").title()).strip()
            config = payload.get("config") or {}
            enabled = 1 if payload.get("enabled") else 0
            status = (payload.get("status") or (existing["status"] if existing else ("configured" if enabled else "disconnected"))).strip()
            last_error = payload.get("lastError")
            if existing:
                resolved_last_tested_at = payload.get("lastTestedAt", existing["lastTestedAt"])
                conn.execute(
                    """
                    UPDATE payment_provider_configs
                    SET label = ?, enabled = ?, status = ?, configJson = ?,
                        lastTestedAt = ?, lastError = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (
                        label,
                        enabled,
                        status,
                        json.dumps(config),
                        resolved_last_tested_at,
                        last_error,
                        now,
                        existing["id"],
                    ),
                )
                config_id = existing["id"]
            else:
                config_id = f"payment-provider-{secrets.token_hex(8)}"
                conn.execute(
                    """
                    INSERT INTO payment_provider_configs (
                        id, tenantId, providerKey, label, enabled, status,
                        configJson, lastTestedAt, lastError, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config_id,
                        tenant_id,
                        normalized_provider,
                        label,
                        enabled,
                        status,
                        json.dumps(config),
                        payload.get("lastTestedAt"),
                        last_error,
                        now,
                        now,
                    ),
                )
            conn.commit()
        return next((item for item in self.list_payment_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def delete_payment_provider_config(self, token: str | None, tenant_id: str, config_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM payment_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Payment provider config not found.")
            conn.execute("DELETE FROM payment_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deletedId": config_id, "providerKey": row["providerKey"]}

    def upsert_ai_provider_config(self, token: str | None, tenant_id: str, provider_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        normalized_provider = (provider_key or "").strip().lower()
        if not normalized_provider:
            raise ValueError("Provider key is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE tenantId = ? AND providerKey = ? LIMIT 1",
                (tenant_id, normalized_provider),
            ).fetchone()
            now = utcnow_iso()
            label = (payload.get("label") or normalized_provider.replace("-", " ").title()).strip()
            base_url = (payload.get("baseUrl") or "").strip() or None
            model = (payload.get("model") or "").strip() or None
            api_key = payload.get("apiKey")
            if api_key is not None:
                api_key = api_key.strip() or None
            is_default = 1 if payload.get("isDefault") else 0
            enabled = 1 if payload.get("enabled") else 0
            
            # Lockdown Rules
            if is_default:
                enabled = 1  # Rule 1: If default, MUST be enabled
            if not enabled:
                is_default = 0  # Rule 2 & 5: If disabled, MUST NOT be default

            status = (payload.get("status") or (existing["status"] if existing else ("configured" if enabled else "disconnected"))).strip()
            last_error = payload.get("lastError")
            
            # Merge guardrails into config
            config = payload.get("config") or {}
            if existing:
                try:
                    existing_config = json.loads(existing["configJson"]) if existing["configJson"] else {}
                    config = {**existing_config, **config}
                except json.JSONDecodeError:
                    pass
            system_guardrails = (payload.get("systemGuardrails") or "").strip()
            task_guardrails = (payload.get("taskGuardrails") or "").strip()
            if system_guardrails:
                config["systemGuardrails"] = system_guardrails
            if task_guardrails:
                config["taskGuardrails"] = task_guardrails
            
            if existing:
                resolved_api_key = api_key if api_key is not None else existing["apiKey"]
                resolved_last_tested_at = payload.get("lastTestedAt", existing["lastTestedAt"])
                conn.execute(
                    """
                    UPDATE ai_provider_configs
                    SET label = ?, baseUrl = ?, model = ?, apiKey = ?, enabled = ?, isDefault = ?, status = ?,
                        configJson = ?, lastTestedAt = ?, lastError = ?, updatedAt = ?
                    WHERE id = ?
                    """,
                    (
                        label,
                        base_url,
                        model,
                        resolved_api_key,
                        enabled,
                        is_default,
                        status,
                        json.dumps(config),
                        resolved_last_tested_at,
                        last_error,
                        now,
                        existing["id"],
                    ),
                )
                config_id = existing["id"]
            else:
                config_id = f"ai-provider-{secrets.token_hex(8)}"
                conn.execute(
                    """
                    INSERT INTO ai_provider_configs (
                        id, tenantId, providerKey, label, baseUrl, model, apiKey, enabled, isDefault, status,
                        configJson, lastTestedAt, lastError, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config_id,
                        tenant_id,
                        normalized_provider,
                        label,
                        base_url,
                        model,
                        api_key,
                        enabled,
                        is_default,
                        status,
                        json.dumps(config),
                        payload.get("lastTestedAt"),
                        last_error,
                        now,
                        now,
                    ),
                )


            if is_default:
                conn.execute(
                    "UPDATE ai_provider_configs SET isDefault = 0 WHERE tenantId = ? AND id != ?",
                    (tenant_id, config_id),
                )
            conn.commit()
        return next((item for item in self.list_ai_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def delete_ai_provider_config(self, token: str | None, tenant_id: str, config_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["userId"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("AI provider config not found.")
            conn.execute("DELETE FROM ai_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deletedId": config_id, "providerKey": row["providerKey"]}

    def save_ai_provider_test_result(
        self,
        tenant_id: str,
        config_id: str,
        *,
        status: str,
        last_error: str | None = None,
        connected_identity: str | None = None,
    ) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE id = ? AND tenantId = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("AI provider config not found.")
            config = json.loads(row["configJson"]) if row["configJson"] else {}
            if connected_identity:
                config["connectedIdentity"] = connected_identity
            elif last_error:
                config.pop("connectedIdentity", None)
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE ai_provider_configs
                SET status = ?, lastTestedAt = ?, lastError = ?, configJson = ?, updatedAt = ?
                WHERE id = ? AND tenantId = ?
                """,
                (status, now, last_error, json.dumps(config), now, config_id, tenant_id),
            )
            conn.commit()
        return next((item for item in self.list_ai_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def _ensure_external_tables(self, conn: sqlite3.Connection) -> None:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS external_datasets (
                id TEXT PRIMARY KEY,
                tenantId TEXT NOT NULL,
                source TEXT NOT NULL,
                dataType TEXT NOT NULL,
                recordsJson TEXT NOT NULL,
                metadataJson TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS content_metrics (
                id TEXT PRIMARY KEY,
                tenantId TEXT NOT NULL,
                platform TEXT NOT NULL,
                contentType TEXT NOT NULL,
                metricsJson TEXT NOT NULL,
                date TEXT,
                createdAt TEXT NOT NULL
            )
        """)
        conn.commit()

    def save_external_dataset(self, tenant_id: str, source: str, data_type: str, records: list[dict], metadata: dict) -> str:
        import uuid
        data_id = str(uuid.uuid4())
        now = utcnow_iso()
        
        with self._connect() as conn:
            self._ensure_external_tables(conn)
            conn.execute("""
                INSERT INTO external_datasets (id, tenantId, source, dataType, recordsJson, metadataJson, createdAt, updatedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (data_id, tenant_id, source, data_type, json.dumps(records), json.dumps(metadata), now, now))
            conn.commit()
        return data_id

    def list_external_datasets(self, tenant_id: str) -> list[dict]:
        with self._connect() as conn:
            self._ensure_external_tables(conn)
            rows = conn.execute("""
                SELECT id, tenantId, source, dataType, metadataJson, createdAt, updatedAt
                FROM external_datasets
                WHERE tenantId = ?
                ORDER BY createdAt DESC
            """, (tenant_id,)).fetchall()
        return [
            {
                "id": row["id"],
                "tenantId": row["tenantId"],
                "source": row["source"],
                "dataType": row["dataType"],
                "metadata": json.loads(row["metadataJson"]) if row["metadataJson"] else {},
                "createdAt": row["createdAt"],
                "updatedAt": row["updatedAt"],
            }
            for row in rows
        ]

    def get_external_dataset(self, data_id: str) -> dict | None:
        with self._connect() as conn:
            self._ensure_external_tables(conn)
            row = conn.execute("SELECT * FROM external_datasets WHERE id = ?", (data_id,)).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "tenantId": row["tenantId"],
            "source": row["source"],
            "dataType": row["dataType"],
            "records": json.loads(row["recordsJson"]),
            "metadata": json.loads(row["metadataJson"]) if row["metadataJson"] else {},
            "createdAt": row["createdAt"],
            "updatedAt": row["updatedAt"],
        }

    def delete_external_dataset(self, data_id: str) -> bool:
        with self._connect() as conn:
            conn.execute("DELETE FROM external_datasets WHERE id = ?", (data_id,))
            conn.commit()
        return True

    def save_content_metrics(self, tenant_id: str, platform: str, content_type: str, metrics: dict, date: str | None) -> str:
        import uuid
        metrics_id = str(uuid.uuid4())
        now = utcnow_iso()
        
        with self._connect() as conn:
            self._ensure_external_tables(conn)
            conn.execute("""
                INSERT INTO content_metrics (id, tenantId, platform, contentType, metricsJson, date, createdAt)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (metrics_id, tenant_id, platform, content_type, json.dumps(metrics), date, now))
            conn.commit()
        return metrics_id

    def list_content_metrics(self, tenant_id: str, platform: str | None = None, limit: int = 50) -> list[dict]:
        with self._connect() as conn:
            self._ensure_external_tables(conn)
            if platform:
                rows = conn.execute("""
                    SELECT * FROM content_metrics
                    WHERE tenantId = ? AND platform = ?
                    ORDER BY createdAt DESC
                    LIMIT ?
                """, (tenant_id, platform, limit)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT * FROM content_metrics
                    WHERE tenantId = ?
                    ORDER BY createdAt DESC
                    LIMIT ?
                """, (tenant_id, limit)).fetchall()
        return [
            {
                "id": row["id"],
                "platform": row["platform"],
                "contentType": row["contentType"],
                "metrics": json.loads(row["metricsJson"]),
                "date": row["date"],
                "createdAt": row["createdAt"],
            }
            for row in rows
        ]


def default_auth_db_path() -> str:
    return os.getenv("AUTH_DB_PATH") or os.getenv("SQLITE_DB_PATH") or str(Path(__file__).resolve().parent / "data" / "aio_crm.db")
