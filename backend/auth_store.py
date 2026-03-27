import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


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
                    settings_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    username TEXT,
                    display_name TEXT,
                    password_hash TEXT,
                    password_salt TEXT,
                    auth_provider TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'owner',
                    avatar_url TEXT,
                    last_login_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS app_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    token TEXT NOT NULL UNIQUE,
                    provider TEXT NOT NULL,
                    current_tenant_id TEXT,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memberships (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    tenant_id TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'member',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(user_id, tenant_id)
                );

                CREATE TABLE IF NOT EXISTS ai_runs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    user_id TEXT NOT NULL,
                    module TEXT NOT NULL,
                    surface TEXT NOT NULL,
                    field TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'completed',
                    agent_role TEXT,
                    intake_agent TEXT,
                    dispatcher_agent TEXT,
                    executing_agent TEXT,
                    requested_agent TEXT,
                    delegate_chain_json TEXT,
                    permission_tier TEXT,
                    thread_id TEXT,
                    contact_id TEXT,
                    company_id TEXT,
                    command_text TEXT,
                    provider_key TEXT,
                    provider_label TEXT,
                    model TEXT,
                    prompt TEXT NOT NULL,
                    result TEXT NOT NULL,
                    artifacts_json TEXT,
                    steps_json TEXT,
                    metadata_json TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS ai_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    provider_key TEXT NOT NULL,
                    label TEXT NOT NULL,
                    base_url TEXT,
                    model TEXT,
                    api_key TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    config_json TEXT,
                    last_tested_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(tenant_id, provider_key)
                );

                CREATE TABLE IF NOT EXISTS ai_routing_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL UNIQUE,
                    config_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );


                CREATE TABLE IF NOT EXISTS automation_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    provider_key TEXT NOT NULL,
                    label TEXT NOT NULL,
                    base_url TEXT,
                    api_key TEXT,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    config_json TEXT,
                    last_tested_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(tenant_id, provider_key)
                );

                CREATE TABLE IF NOT EXISTS payment_provider_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    provider_key TEXT NOT NULL,
                    label TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    config_json TEXT,
                    last_tested_at TEXT,
                    last_error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(tenant_id, provider_key)
                );

                CREATE TABLE IF NOT EXISTS omega_protocols (
                    tenant_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'idle',
                    armed_by_user_id TEXT,
                    armed_at TEXT,
                    execute_at TEXT,
                    arm_code_hash TEXT,
                    cancel_code_hash TEXT,
                    last_event TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS omega_protocol_events (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    user_id TEXT,
                    event_type TEXT NOT NULL,
                    detail TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS global_variables (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    description TEXT,
                    is_secret INTEGER NOT NULL DEFAULT 0,
                    is_system INTEGER NOT NULL DEFAULT 0,
                    created_by_user_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(tenant_id, key)
                );

                CREATE TABLE IF NOT EXISTS system_email_templates (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    template_key TEXT NOT NULL,
                    email_type TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    send_to TEXT NOT NULL,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    body_html TEXT,
                    body_text TEXT,
                    edited_by_user_id TEXT,
                    edited_by_name TEXT,
                    edited_at TEXT,
                    config_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(tenant_id, template_key)
                );

                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    priority TEXT NOT NULL DEFAULT 'normal',
                    link TEXT,
                    read INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            self._ensure_column(conn, "tenants", "settings_json", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(conn, "app_users", "username", "TEXT")
            self._ensure_column(conn, "app_users", "phone", "TEXT")
            self._ensure_column(conn, "app_users", "locale", "TEXT")
            self._ensure_column(conn, "app_users", "timezone", "TEXT")
            self._ensure_column(conn, "app_users", "email_signature", "TEXT")
            self._ensure_column(conn, "app_sessions", "current_tenant_id", "TEXT")
            self._ensure_column(conn, "app_sessions", "user_agent", "TEXT")
            self._ensure_column(conn, "ai_runs", "status", "TEXT NOT NULL DEFAULT 'completed'")
            self._ensure_column(conn, "ai_runs", "agent_role", "TEXT")
            self._ensure_column(conn, "ai_runs", "intake_agent", "TEXT")
            self._ensure_column(conn, "ai_runs", "dispatcher_agent", "TEXT")
            self._ensure_column(conn, "ai_runs", "executing_agent", "TEXT")
            self._ensure_column(conn, "ai_runs", "requested_agent", "TEXT")
            self._ensure_column(conn, "ai_runs", "delegate_chain_json", "TEXT")
            self._ensure_column(conn, "ai_runs", "permission_tier", "TEXT")
            self._ensure_column(conn, "ai_runs", "thread_id", "TEXT")
            self._ensure_column(conn, "ai_runs", "contact_id", "TEXT")
            self._ensure_column(conn, "ai_runs", "company_id", "TEXT")
            self._ensure_column(conn, "ai_runs", "command_text", "TEXT")
            self._ensure_column(conn, "ai_runs", "provider_key", "TEXT")
            self._ensure_column(conn, "ai_runs", "provider_label", "TEXT")
            self._ensure_column(conn, "ai_runs", "model", "TEXT")
            self._ensure_column(conn, "ai_runs", "artifacts_json", "TEXT")
            self._ensure_column(conn, "ai_runs", "steps_json", "TEXT")
            conn.execute("UPDATE tenants SET settings_json = COALESCE(settings_json, '{}')")
            self._backfill_usernames(conn)
            self._backfill_default_workspace(conn)
            self._seed_default_system_email_templates(conn)
            conn.commit()

    @staticmethod
    def _ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def _backfill_default_workspace(self, conn: sqlite3.Connection) -> None:
        now = utcnow_iso()
        tenant_row = conn.execute("SELECT * FROM tenants ORDER BY created_at ASC LIMIT 1").fetchone()
        if not tenant_row:
            tenant_id = "tenant-primary"
            tenant_name = "AIO CRM Workspace"
            conn.execute(
                "INSERT INTO tenants (id, name, slug, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (tenant_id, tenant_name, slugify(tenant_name), "{}", now, now),
            )
            tenant_row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()

        users = conn.execute("SELECT id, role FROM app_users").fetchall()
        for user in users:
            existing_membership = conn.execute(
                "SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1",
                (user["id"], tenant_row["id"]),
            ).fetchone()
            if not existing_membership:
                conn.execute(
                    """
                    INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (f"membership-{secrets.token_hex(8)}", user["id"], tenant_row["id"], user["role"] or "member", now, now),
                )

        sessions = conn.execute("SELECT id, user_id, current_tenant_id FROM app_sessions").fetchall()
        for session in sessions:
            current_tenant_id = session["current_tenant_id"]
            if current_tenant_id:
                membership = conn.execute(
                    "SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1",
                    (session["user_id"], current_tenant_id),
                ).fetchone()
                if membership:
                    continue
            default_membership = conn.execute(
                "SELECT tenant_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
                (session["user_id"],),
            ).fetchone()
            if default_membership:
                conn.execute(
                    "UPDATE app_sessions SET current_tenant_id = ? WHERE id = ?",
                    (default_membership["tenant_id"], session["id"]),
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
            for template_key, email_type, subject, send_to in defaults:
                existing = conn.execute(
                    "SELECT id FROM system_email_templates WHERE tenant_id = ? AND template_key = ? LIMIT 1",
                    (tenant_id, template_key),
                ).fetchone()
                if existing:
                    continue
                conn.execute(
                    """
                    INSERT INTO system_email_templates (
                        id, tenant_id, template_key, email_type, subject, send_to, enabled,
                        body_html, body_text, edited_by_name, edited_at, config_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"sysmail-{secrets.token_hex(8)}",
                        tenant_id,
                        template_key,
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
        rows = conn.execute("SELECT id, email, display_name, username FROM app_users ORDER BY created_at ASC").fetchall()
        for row in rows:
            if row["username"]:
                continue
            fallback_seed = row["display_name"] or row["email"].split("@")[0]
            username = self._resolve_unique_username(conn, row["email"].split("@")[0], fallback_seed)
            conn.execute("UPDATE app_users SET username = ?, updated_at = ? WHERE id = ?", (username, utcnow_iso(), row["id"]))

    @staticmethod
    def _omega_code_digest(value: str) -> str:
        return hashlib.sha256((value or "").encode("utf-8")).hexdigest()

    def _user_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS total FROM app_users").fetchone()
            return int(row["total"] if row else 0)

    def default_tenant_id(self) -> str:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1").fetchone()
        return row["id"] if row else "tenant-primary"

    def _public_user(self, record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        return {
            "id": record["id"],
            "email": record["email"],
            "username": record["username"],
            "name": record["display_name"] or record["email"],
            "role": record["role"],
            "provider": record["auth_provider"],
            "avatar_url": record["avatar_url"],
            "phone": record["phone"] if "phone" in record.keys() else None,
            "locale": record["locale"] if "locale" in record.keys() else None,
            "timezone": record["timezone"] if "timezone" in record.keys() else None,
            "email_signature": record["email_signature"] if "email_signature" in record.keys() else None,
        }

    def _public_tenant(self, membership: sqlite3.Row | dict[str, Any], selected: bool = False) -> dict[str, Any]:
        raw_settings = membership["settings_json"] if "settings_json" in membership.keys() else membership.get("settings_json")
        try:
            settings = json.loads(raw_settings) if raw_settings else {}
        except Exception:
            settings = {}
        return {
            "id": membership["tenant_id"],
            "name": membership["tenant_name"],
            "slug": membership["tenant_slug"],
            "role": membership["membership_role"],
            "settings": settings,
            "selected": selected,
        }

    def _tenant_memberships(self, conn: sqlite3.Connection, user_id: str, current_tenant_id: str | None) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        rows = conn.execute(
            """
            SELECT m.tenant_id, m.role AS membership_role, t.name AS tenant_name, t.slug AS tenant_slug, t.settings_json
            FROM memberships m
            JOIN tenants t ON t.id = m.tenant_id
            WHERE m.user_id = ?
            ORDER BY t.created_at ASC, t.name ASC
            """,
            (user_id,),
        ).fetchall()
        if not rows:
            return None, []
        resolved_tenant_id = current_tenant_id or rows[0]["tenant_id"]
        tenants: list[dict[str, Any]] = []
        current_tenant = None
        for row in rows:
            tenant = self._public_tenant(row, row["tenant_id"] == resolved_tenant_id)
            tenants.append(tenant)
            if tenant["selected"]:
                current_tenant = tenant
        if current_tenant is None:
            tenants[0]["selected"] = True
            current_tenant = tenants[0]
        return current_tenant, tenants

    def _membership_record(self, record: sqlite3.Row | dict[str, Any]) -> dict[str, Any]:
        return {
            "id": record["id"],
            "user_id": record["user_id"],
            "tenant_id": record["tenant_id"],
            "role": record["role"],
            "user_name": record["display_name"] or record["email"],
            "user_email": record["email"],
            "provider": record["auth_provider"],
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
        }

    def _ai_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
        config = json.loads(record["config_json"]) if record["config_json"] else {}
        payload = {
            "id": record["id"],
            "tenant_id": record["tenant_id"],
            "provider_key": record["provider_key"],
            "label": record["label"],
            "base_url": record["base_url"],
            "model": record["model"],
            "enabled": bool(record["enabled"]),
            "is_default": bool(record["is_default"]),
            "status": record["status"],
            "last_tested_at": record["last_tested_at"],
            "last_error": record["last_error"],
            "config": config,
            "system_guardrails": config.get("system_guardrails", ""),
            "task_guardrails": config.get("task_guardrails", ""),
            "api_key_present": bool(record["api_key"]),
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
        }
        if include_secret:
            payload["api_key"] = record["api_key"]
        return payload

    def _automation_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
        config = json.loads(record["config_json"]) if record["config_json"] else {}
        payload = {
            "id": record["id"],
            "tenant_id": record["tenant_id"],
            "provider_key": record["provider_key"],
            "label": record["label"],
            "base_url": record["base_url"],
            "enabled": bool(record["enabled"]),
            "status": record["status"],
            "last_tested_at": record["last_tested_at"],
            "last_error": record["last_error"],
            "config": config,
            "api_key_present": bool(record["api_key"]),
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
        }
        if include_secret:
            payload["api_key"] = record["api_key"]
        return payload

    def _payment_provider_record(self, record: sqlite3.Row | dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
        config = json.loads(record["config_json"]) if record["config_json"] else {}
        payload = {
            "id": record["id"],
            "tenant_id": record["tenant_id"],
            "provider_key": record["provider_key"],
            "label": record["label"],
            "enabled": bool(record["enabled"]),
            "status": record["status"],
            "last_tested_at": record["last_tested_at"],
            "last_error": record["last_error"],
            "config": config,
            "api_key_present": bool(config.get("api_key") or config.get("secret_key")),
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
        }
        if include_secret:
            payload["api_key"] = config.get("api_key")
            payload["secret_key"] = config.get("secret_key")
        return payload

    def _require_workspace_role(self, conn: sqlite3.Connection, user_id: str, tenant_id: str, allowed_roles: set[str]) -> sqlite3.Row:
        membership = conn.execute(
            "SELECT * FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1",
            (user_id, tenant_id),
        ).fetchone()
        if not membership:
            raise ValueError("User does not belong to that workspace.")
        if membership["role"] not in allowed_roles:
            raise ValueError("You do not have permission to manage this workspace.")
        return membership

    def _build_session(self, conn: sqlite3.Connection, record: sqlite3.Row) -> dict[str, Any]:
        current_tenant, tenants = self._tenant_memberships(conn, record["user_id"], record["current_tenant_id"])
        return {
            "id": record["id"],
            "token": record["token"],
            "provider": record["provider"],
            "created_at": record["created_at"],
            "expires_at": record["expires_at"],
            "user": self._public_user(record),
            "tenant": current_tenant,
            "tenants": tenants,
        }

    def list_ai_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM ai_provider_configs
                WHERE tenant_id = ?
                ORDER BY is_default DESC, enabled DESC, label ASC, provider_key ASC
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
                WHERE tenant_id = ? AND enabled = 1
                ORDER BY is_default DESC, updated_at DESC
                LIMIT 1
                """,
                (tenant_id,),
            ).fetchone()
        return self._ai_provider_record(row, include_secret=True) if row else None

    def get_ai_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE tenant_id = ? AND id = ? LIMIT 1",
                (tenant_id, config_id),
            ).fetchone()
        return self._ai_provider_record(row, include_secret=True) if row else None

    def _create_session(self, conn: sqlite3.Connection, user_id: str, provider: str, user_agent: str | None = None) -> dict[str, Any]:
        session_id = f"session-{secrets.token_hex(10)}"
        token = secrets.token_urlsafe(32)
        created_at = utcnow_iso()
        expires_at = (datetime.now(UTC) + timedelta(days=14)).isoformat()
        tenant_row = conn.execute(
            "SELECT tenant_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
            (user_id,),
        ).fetchone()
        current_tenant_id = tenant_row["tenant_id"] if tenant_row else None
        conn.execute(
            """
            INSERT INTO app_sessions (id, user_id, token, provider, current_tenant_id, created_at, expires_at, last_seen_at, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, user_id, token, provider, current_tenant_id, created_at, expires_at, created_at, user_agent),
        )
        record = conn.execute(
            """
            SELECT s.id, s.user_id, s.token, s.provider, s.current_tenant_id, s.created_at, s.expires_at, u.*
            FROM app_sessions s
            JOIN app_users u ON u.id = s.user_id
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
                INSERT INTO app_users (id, email, username, display_name, password_hash, password_salt, auth_provider, role, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'owner', ?, ?)
                """,
                (user_id, normalized, username, name.strip() or normalized, password_hash, password_salt, "local-password", now, now),
            )
            conn.execute(
                """
                INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
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
            if not record or not record["password_hash"] or not record["password_salt"]:
                raise ValueError("Invalid email or password.")
            if not verify_password(password, record["password_hash"], record["password_salt"]):
                raise ValueError("Invalid email or password.")
            now = utcnow_iso()
            conn.execute("UPDATE app_users SET last_login_at = ?, updated_at = ? WHERE id = ?", (now, now, record["id"]))
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
                    SET display_name = ?, avatar_url = ?, auth_provider = ?, last_login_at = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        (name or existing["display_name"] or normalized).strip(),
                        avatar_url or existing["avatar_url"],
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
                    INSERT INTO app_users (id, email, username, display_name, auth_provider, role, avatar_url, last_login_at, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 'google-oauth', 'owner', ?, ?, ?, ?)
                    """,
                    (user_id, normalized, username, (name or normalized).strip(), avatar_url, now, now, now),
                )
                conn.execute(
                    """
                    INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
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
                SELECT s.id, s.user_id, s.token, s.provider, s.current_tenant_id, s.created_at, s.expires_at, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.user_id
                WHERE s.token = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
            if not record:
                return None
            expires_at = datetime.fromisoformat(record["expires_at"])
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=UTC)
            if expires_at <= datetime.now(UTC):
                conn.execute("DELETE FROM app_sessions WHERE token = ?", (token,))
                conn.commit()
                return None
            conn.execute("UPDATE app_sessions SET last_seen_at = ? WHERE token = ?", (utcnow_iso(), token))
            conn.commit()
            return self._build_session(conn, record)

    def switch_session_tenant(self, token: str | None, tenant_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            record = conn.execute(
                """
                SELECT s.id, s.user_id, s.token, s.provider, s.current_tenant_id, s.created_at, s.expires_at, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.user_id
                WHERE s.token = ?
                LIMIT 1
                """,
                (token,),
            ).fetchone()
            if not record:
                raise ValueError("Session not found or expired.")
            membership = conn.execute(
                "SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1",
                (record["user_id"], tenant_id),
            ).fetchone()
            if not membership:
                raise ValueError("User does not belong to that workspace.")
            conn.execute(
                "UPDATE app_sessions SET current_tenant_id = ?, last_seen_at = ? WHERE token = ?",
                (tenant_id, utcnow_iso(), token),
            )
            conn.commit()
            refreshed = conn.execute(
                """
                SELECT s.id, s.user_id, s.token, s.provider, s.current_tenant_id, s.created_at, s.expires_at, u.*
                FROM app_sessions s
                JOIN app_users u ON u.id = s.user_id
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
            self._require_workspace_role(conn, session["user_id"], session["current_tenant_id"], {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["user_id"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            workspace_id = f"tenant-{secrets.token_hex(6)}"
            now = utcnow_iso()
            conn.execute(
                "INSERT INTO tenants (id, name, slug, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (workspace_id, workspace_name, f"{slugify(workspace_name)}-{secrets.token_hex(3)}", "{}", now, now),
            )
            conn.execute(
                """
                INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (f"membership-{secrets.token_hex(8)}", user["id"], workspace_id, "owner", now, now),
            )
            conn.execute(
                "UPDATE app_sessions SET current_tenant_id = ?, last_seen_at = ? WHERE token = ?",
                (workspace_id, now, token),
            )
            conn.commit()
            return {
                "workspace": {"id": workspace_id, "name": workspace_name, "slug": slugify(workspace_name)},
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
            session = conn.execute(
                "SELECT * FROM app_sessions WHERE token = ? LIMIT 1",
                (token,),
            ).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            now = utcnow_iso()
            assignments: list[str] = ["updated_at = ?"]
            params: list[Any] = [now]
            if name is not None:
                assignments.append("name = ?")
                params.append(workspace_name)
            if settings is not None:
                assignments.append("settings_json = ?")
                params.append(json.dumps(settings))
            params.append(tenant_id)
            conn.execute(f"UPDATE tenants SET {', '.join(assignments)} WHERE id = ?", params)
            conn.commit()
        return {"workspace": self.get_workspace(tenant_id)}

    def get_workspace(self, tenant_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE id = ? LIMIT 1", (tenant_id,)).fetchone()
        if not row:
            raise ValueError("Workspace not found.")
        try:
            settings = json.loads(row["settings_json"]) if row["settings_json"] else {}
        except Exception:
            settings = {}
        return {
            "id": row["id"],
            "name": row["name"],
            "slug": row["slug"],
            "settings": settings,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def list_notifications(self, token: str | None, tenant_id: str, limit: int = 50, unread_only: bool = False) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            query = "SELECT * FROM notifications WHERE tenant_id = ?"
            params: list[Any] = [tenant_id]
            if unread_only:
                query += " AND read = 0"
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(max(1, min(limit, 100)))
            rows = conn.execute(query, params).fetchall()
            unread_count = conn.execute(
                "SELECT COUNT(*) AS count FROM notifications WHERE tenant_id = ? AND read = 0",
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
                    "read": bool(row["read"]),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            now = utcnow_iso()
            notification = {
                "id": f"notif-{secrets.token_hex(8)}",
                "tenant_id": tenant_id,
                "type": (payload.get("type") or "info").strip() or "info",
                "title": (payload.get("title") or "").strip(),
                "message": (payload.get("message") or "").strip(),
                "priority": (payload.get("priority") or "normal").strip() or "normal",
                "link": (payload.get("link") or "").strip() or None,
                "read": 0,
                "created_at": now,
                "updated_at": now,
            }
            if not notification["title"] or not notification["message"]:
                raise ValueError("Notification title and message are required.")
            conn.execute(
                """
                INSERT INTO notifications (id, tenant_id, type, title, message, priority, link, read, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    notification["id"],
                    notification["tenant_id"],
                    notification["type"],
                    notification["title"],
                    notification["message"],
                    notification["priority"],
                    notification["link"],
                    notification["read"],
                    notification["created_at"],
                    notification["updated_at"],
                ),
            )
            conn.execute(
                """
                DELETE FROM notifications
                WHERE id IN (
                    SELECT id FROM notifications
                    WHERE tenant_id = ?
                    ORDER BY created_at DESC
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            row = conn.execute(
                "SELECT * FROM notifications WHERE id = ? AND tenant_id = ? LIMIT 1",
                (notification_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Notification not found.")
            now = utcnow_iso()
            if read is not None:
                conn.execute(
                    "UPDATE notifications SET read = ?, updated_at = ? WHERE id = ? AND tenant_id = ?",
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
            "read": bool(read if read is not None else row["read"]),
            "created_at": row["created_at"],
            "updated_at": now if read is not None else row["updated_at"],
        }

    def mark_all_notifications_read(self, token: str | None, tenant_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            now = utcnow_iso()
            conn.execute(
                "UPDATE notifications SET read = 1, updated_at = ? WHERE tenant_id = ?",
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            row = conn.execute(
                "SELECT id FROM notifications WHERE id = ? AND tenant_id = ? LIMIT 1",
                (notification_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Notification not found.")
            conn.execute("DELETE FROM notifications WHERE id = ? AND tenant_id = ?", (notification_id, tenant_id))
            conn.commit()
        return {"success": True}

    def list_workspace_memberships(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            rows = conn.execute(
                """
                SELECT m.*, u.email, u.display_name, u.auth_provider
                FROM memberships m
                JOIN app_users u ON u.id = m.user_id
                WHERE m.tenant_id = ?
                ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END, u.display_name ASC, u.email ASC
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            user = conn.execute("SELECT * FROM app_users WHERE email = ? LIMIT 1", (normalized_email,)).fetchone()
            if not user:
                raise ValueError("No app user exists for that email yet.")
            existing = conn.execute(
                "SELECT * FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1",
                (user["id"], tenant_id),
            ).fetchone()
            now = utcnow_iso()
            if existing:
                conn.execute(
                    "UPDATE memberships SET role = ?, updated_at = ? WHERE id = ?",
                    (role, now, existing["id"]),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
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

        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            acting = self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            existing_by_email = conn.execute("SELECT id FROM app_users WHERE email = ? LIMIT 1", (normalized_email,)).fetchone()
            if existing_by_email:
                raise ValueError("An app user with that email already exists.")
            if self._username_exists(conn, normalized_username):
                raise ValueError("That username is already in use.")

            user_id = f"user-{secrets.token_hex(8)}"
            password_hash, password_salt = hash_password(password)
            now = utcnow_iso()
            target_tenant_id = tenant_id
            target_role = role
            created_workspace = None

            if create_workspace:
                workspace_label = (workspace_name or "").strip() or f"{normalized_name} Workspace"
                target_tenant_id = f"tenant-{secrets.token_hex(6)}"
                workspace_slug = f"{slugify(workspace_label)}-{secrets.token_hex(3)}"
                conn.execute(
                    "INSERT INTO tenants (id, name, slug, settings_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (target_tenant_id, workspace_label, workspace_slug, "{}", now, now),
                )
                target_role = "owner"
                existing_owner_membership = conn.execute(
                    "SELECT id FROM memberships WHERE user_id = ? AND tenant_id = ? LIMIT 1",
                    (session["user_id"], target_tenant_id),
                ).fetchone()
                if not existing_owner_membership:
                    conn.execute(
                        """
                        INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
                        VALUES (?, ?, ?, 'owner', ?, ?)
                        """,
                        (f"membership-{secrets.token_hex(8)}", session["user_id"], target_tenant_id, now, now),
                    )
                created_workspace = {
                    "id": target_tenant_id,
                    "name": workspace_label,
                    "slug": workspace_slug,
                    "created_at": now,
                    "updated_at": now,
                }
            elif acting["role"] != "owner" and role == "owner":
                raise ValueError("Only owners can create another owner in this workspace.")

            conn.execute(
                """
                INSERT INTO app_users (id, email, username, display_name, password_hash, password_salt, auth_provider, role, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 'local-password', ?, ?, ?)
                """,
                (user_id, normalized_email, normalized_username, normalized_name, password_hash, password_salt, target_role, now, now),
            )
            conn.execute(
                """
                INSERT INTO memberships (id, user_id, tenant_id, role, created_at, updated_at)
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
                "role": target_role,
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
            acting = self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            membership = conn.execute(
                "SELECT * FROM memberships WHERE id = ? AND tenant_id = ? LIMIT 1",
                (membership_id, tenant_id),
            ).fetchone()
            if not membership:
                raise ValueError("Workspace member not found.")
            if acting["role"] != "owner" and role == "owner":
                raise ValueError("Only owners can assign the owner role.")
            if membership["user_id"] == session["user_id"] and role != membership["role"] and membership["role"] == "owner":
                raise ValueError("Transfer ownership before changing your own owner role.")
            conn.execute(
                "UPDATE memberships SET role = ?, updated_at = ? WHERE id = ?",
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
            acting = self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            membership = conn.execute(
                "SELECT * FROM memberships WHERE id = ? AND tenant_id = ? LIMIT 1",
                (membership_id, tenant_id),
            ).fetchone()
            if not membership:
                raise ValueError("Workspace member not found.")
            owners = conn.execute(
                "SELECT COUNT(*) AS total FROM memberships WHERE tenant_id = ? AND role = 'owner'",
                (tenant_id,),
            ).fetchone()
            if membership["role"] == "owner" and int(owners["total"] if owners else 0) <= 1:
                raise ValueError("Workspace must keep at least one owner.")
            if acting["role"] != "owner" and membership["role"] == "owner":
                raise ValueError("Only owners can remove another owner.")
            conn.execute("DELETE FROM memberships WHERE id = ?", (membership_id,))
            next_membership = conn.execute(
                "SELECT tenant_id FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
                (membership["user_id"],),
            ).fetchone()
            conn.execute(
                "UPDATE app_sessions SET current_tenant_id = ? WHERE user_id = ? AND current_tenant_id = ?",
                ((next_membership["tenant_id"] if next_membership else None), membership["user_id"], tenant_id),
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
            self._require_workspace_role(conn, session["user_id"], session["current_tenant_id"], {"owner", "admin", "staff"})
            user = conn.execute("SELECT * FROM app_users WHERE email = ? LIMIT 1", (normalized_email,)).fetchone()
            if not user:
                return None
            memberships = conn.execute(
                """
                SELECT m.*, t.name AS tenant_name, t.slug AS tenant_slug
                FROM memberships m
                JOIN tenants t ON t.id = m.tenant_id
                WHERE m.user_id = ?
                ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END, t.created_at ASC, t.name ASC
                """,
                (user["id"],),
            ).fetchall()
            session_memberships = {
                row["tenant_id"]
                for row in conn.execute("SELECT tenant_id FROM memberships WHERE user_id = ?", (session["user_id"],)).fetchall()
            }
            return {
                "user": self._public_user(user),
                "memberships": [
                    {
                        "id": membership["id"],
                        "tenant_id": membership["tenant_id"],
                        "workspace_name": membership["tenant_name"],
                        "workspace_slug": membership["tenant_slug"],
                        "role": membership["role"],
                        "can_switch_as_admin": membership["tenant_id"] in session_memberships,
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
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["user_id"],)).fetchone()
            if not user:
                raise ValueError("User not found.")

            display_name = (payload.get("display_name") or user["display_name"] or user["email"]).strip()
            if not display_name:
                raise ValueError("Display name is required.")

            phone = (payload.get("phone") or "").strip() or None
            locale = (payload.get("locale") or "").strip() or user["locale"] or "en-US"
            timezone_value = (payload.get("timezone") or "").strip() or user["timezone"] or "America/New_York"
            email_signature = payload.get("email_signature")
            if email_signature is not None:
                email_signature = str(email_signature).strip()
            else:
                email_signature = user["email_signature"]

            conn.execute(
                """
                UPDATE app_users
                SET display_name = ?, phone = ?, locale = ?, timezone = ?, email_signature = ?, updated_at = ?
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
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["user_id"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            if not user["password_hash"] or not user["password_salt"]:
                raise ValueError("This account does not have a local password yet.")
            if not verify_password(current_password or "", user["password_hash"], user["password_salt"]):
                raise ValueError("Current password is incorrect.")
            password_hash, password_salt = hash_password(new_password)
            conn.execute(
                "UPDATE app_users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?",
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
                SELECT id, provider, user_agent, created_at, expires_at, last_seen_at
                FROM app_sessions
                WHERE user_id = ?
                ORDER BY last_seen_at DESC, created_at DESC
                """,
                (current["user_id"],),
            ).fetchall()
        sessions = []
        for row in rows:
            provider_label = (row["provider"] or "session").replace("-", " ").title()
            user_agent = (row["user_agent"] or "").strip()
            sessions.append(
                {
                    "id": row["id"],
                    "provider": row["provider"],
                    "label": user_agent or provider_label,
                    "created_at": row["created_at"],
                    "expires_at": row["expires_at"],
                    "last_seen_at": row["last_seen_at"],
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
                "SELECT * FROM app_sessions WHERE id = ? AND user_id = ? LIMIT 1",
                (session_id, current["user_id"]),
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
            conn.execute("DELETE FROM app_sessions WHERE user_id = ? AND id != ?", (current["user_id"], current["id"]))
            conn.commit()

    def list_global_variables(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            rows = conn.execute(
                """
                SELECT *
                FROM global_variables
                WHERE tenant_id = ?
                ORDER BY is_system DESC, key ASC
                """,
                (tenant_id,),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "key": row["key"],
                "value": row["value"],
                "description": row["description"],
                "is_secret": bool(row["is_secret"]),
                "is_system": bool(row["is_system"]),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]

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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff"})
            existing = conn.execute(
                "SELECT * FROM global_variables WHERE tenant_id = ? AND key = ? LIMIT 1",
                (tenant_id, key),
            ).fetchone()
            now = utcnow_iso()
            if existing:
                conn.execute(
                    """
                    UPDATE global_variables
                    SET value = ?, description = ?, is_secret = ?, is_system = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        str(value),
                        (payload.get("description") or "").strip() or None,
                        1 if payload.get("is_secret") else 0,
                        1 if payload.get("is_system") else 0,
                        now,
                        existing["id"],
                    ),
                )
                variable_id = existing["id"]
            else:
                variable_id = f"gvar-{secrets.token_hex(8)}"
                conn.execute(
                    """
                    INSERT INTO global_variables (id, tenant_id, key, value, description, is_secret, is_system, created_by_user_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        variable_id,
                        tenant_id,
                        key,
                        str(value),
                        (payload.get("description") or "").strip() or None,
                        1 if payload.get("is_secret") else 0,
                        1 if payload.get("is_system") else 0,
                        session["user_id"],
                        now,
                        now,
                    ),
                )
            conn.commit()
            row = conn.execute("SELECT * FROM global_variables WHERE id = ? LIMIT 1", (variable_id,)).fetchone()
        return {
            "id": row["id"],
            "key": row["key"],
            "value": row["value"],
            "description": row["description"],
            "is_secret": bool(row["is_secret"]),
            "is_system": bool(row["is_system"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def delete_global_variable(self, token: str | None, tenant_id: str, variable_id: str) -> dict[str, Any]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff"})
            row = conn.execute(
                "SELECT * FROM global_variables WHERE id = ? AND tenant_id = ? LIMIT 1",
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
            query = """
                SELECT *
                FROM system_email_templates
                WHERE tenant_id = ?
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
            config = json.loads(row["config_json"]) if row["config_json"] else {}
            templates.append(
                {
                    "id": row["id"],
                    "template_key": row["template_key"],
                    "email_type": row["email_type"],
                    "subject": row["subject"],
                    "send_to": row["send_to"],
                    "enabled": bool(row["enabled"]),
                    "body_html": row["body_html"],
                    "body_text": row["body_text"],
                    "edited_by_name": row["edited_by_name"],
                    "edited_at": row["edited_at"],
                    "config": config,
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
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
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["user_id"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff"})
            row = conn.execute(
                "SELECT * FROM system_email_templates WHERE id = ? AND tenant_id = ? LIMIT 1",
                (template_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("System email template not found.")
            existing_config = json.loads(row["config_json"]) if row["config_json"] else {}
            next_config = payload.get("config") if payload.get("config") is not None else existing_config
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE system_email_templates
                SET subject = ?, send_to = ?, enabled = ?, body_html = ?, body_text = ?,
                    edited_by_user_id = ?, edited_by_name = ?, edited_at = ?, config_json = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    (payload.get("subject") or row["subject"]).strip(),
                    (payload.get("send_to") or row["send_to"]).strip(),
                    1 if payload.get("enabled", bool(row["enabled"])) else 0,
                    payload.get("body_html") if payload.get("body_html") is not None else row["body_html"],
                    payload.get("body_text") if payload.get("body_text") is not None else row["body_text"],
                    user["id"],
                    user["display_name"] or user["email"],
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
            "Legacy ai_runs persistence is disabled. Use the canonical ai_engine_runs store with a read-only projection adapter."
        )

    def list_ai_runs(self, token: str | None, limit: int = 50) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            tenant_id = session["current_tenant_id"]
            rows = conn.execute(
                """
                SELECT *
                FROM ai_runs
                WHERE tenant_id IS NULL OR tenant_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (tenant_id, max(1, min(limit, 200))),
            ).fetchall()
        runs = []
        for row in rows:
            try:
                metadata = json.loads(row["metadata_json"] or "{}")
            except json.JSONDecodeError:
                metadata = {}
            try:
                artifacts = json.loads(row["artifacts_json"] or "[]")
            except json.JSONDecodeError:
                artifacts = []
            try:
                steps = json.loads(row["steps_json"] or "[]")
            except json.JSONDecodeError:
                steps = []
            try:
                delegate_chain = json.loads(row["delegate_chain_json"] or "[]")
            except json.JSONDecodeError:
                delegate_chain = []
            runs.append(
                {
                    "id": row["id"],
                    "tenant_id": row["tenant_id"],
                    "user_id": row["user_id"],
                    "module": row["module"],
                    "surface": row["surface"],
                    "field": row["field"],
                    "intent": row["intent"],
                    "status": row["status"] or "completed",
                    "agent_role": row["agent_role"],
                    "intake_agent": row["intake_agent"],
                    "dispatcher_agent": row["dispatcher_agent"],
                    "executing_agent": row["executing_agent"],
                    "requested_agent": row["requested_agent"],
                    "delegate_chain": delegate_chain if isinstance(delegate_chain, list) else [],
                    "permission_tier": row["permission_tier"],
                    "thread_id": row["thread_id"],
                    "contact_id": row["contact_id"],
                    "company_id": row["company_id"],
                    "command_text": row["command_text"],
                    "provider_key": row["provider_key"],
                    "provider_label": row["provider_label"],
                    "model": row["model"],
                    "prompt": row["prompt"],
                    "result": row["result"],
                    "artifacts": artifacts if isinstance(artifacts, list) else [],
                    "steps": steps if isinstance(steps, list) else [],
                    "metadata": metadata,
                    "created_at": row["created_at"],
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner"})
            row = conn.execute("SELECT * FROM omega_protocols WHERE tenant_id = ? LIMIT 1", (tenant_id,)).fetchone()
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
            INSERT INTO omega_protocol_events (id, tenant_id, user_id, event_type, detail, created_at)
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner"})
            rows = conn.execute(
                """
                SELECT id, tenant_id, user_id, event_type, detail, created_at
                FROM omega_protocol_events
                WHERE tenant_id = ?
                ORDER BY created_at DESC
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner"})
            existing = conn.execute("SELECT * FROM omega_protocols WHERE tenant_id = ? LIMIT 1", (tenant_id,)).fetchone()
            if existing and (existing["status"] or "idle") == "armed":
                raise ValueError("Omega is already armed for this workspace.")
            if existing:
                conn.execute(
                    """
                    UPDATE omega_protocols
                    SET status = 'armed', armed_by_user_id = ?, armed_at = ?, execute_at = ?, arm_code_hash = ?, cancel_code_hash = ?, last_event = 'armed', updated_at = ?
                    WHERE tenant_id = ?
                    """,
                    (
                        session["user_id"],
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
                        tenant_id, status, armed_by_user_id, armed_at, execute_at, arm_code_hash, cancel_code_hash, last_event, updated_at
                    ) VALUES (?, 'armed', ?, ?, ?, ?, ?, 'armed', ?)
                    """,
                    (
                        tenant_id,
                        session["user_id"],
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
                session["user_id"],
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner"})
            existing = conn.execute("SELECT * FROM omega_protocols WHERE tenant_id = ? LIMIT 1", (tenant_id,)).fetchone()
            if not existing or (existing["status"] or "idle") != "armed":
                raise ValueError("Omega is not armed.")
            if not hmac.compare_digest(existing["cancel_code_hash"] or "", self._omega_code_digest(cancel_code.strip())):
                raise ValueError("Cancel code did not match.")
            conn.execute(
                """
                UPDATE omega_protocols
                SET status = 'cancelled', execute_at = NULL, arm_code_hash = NULL, cancel_code_hash = NULL, last_event = 'cancelled', updated_at = ?
                WHERE tenant_id = ?
                """,
                (now, tenant_id),
            )
            self._record_omega_event(conn, tenant_id, session["user_id"], "cancelled", "Omega arm sequence cancelled.")
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner"})
            existing = conn.execute("SELECT * FROM omega_protocols WHERE tenant_id = ? LIMIT 1", (tenant_id,)).fetchone()
            if not existing or (existing["status"] or "idle") != "armed":
                raise ValueError("Omega is not armed.")
            if not hmac.compare_digest(existing["arm_code_hash"] or "", self._omega_code_digest(confirmation_code.strip())):
                raise ValueError("Confirmation code did not match.")
            execute_at = existing["execute_at"]
            execute_dt = datetime.fromisoformat(execute_at) if execute_at else None
            if not execute_dt or execute_dt > datetime.now(UTC):
                raise ValueError("Omega countdown is still active.")
            protocol = dict(existing)
            protocol["verified_by_user_id"] = session["user_id"]
        return protocol

    def list_ai_provider_configs(self, token: str | None, tenant_id: str) -> list[dict[str, Any]]:
        if not token:
            raise ValueError("Session token is required.")
        with self._connect() as conn:
            session = conn.execute("SELECT * FROM app_sessions WHERE token = ? LIMIT 1", (token,)).fetchone()
            if not session:
                raise ValueError("Session not found or expired.")
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
        return self.list_ai_provider_configs_for_tenant(tenant_id)

    def get_ai_routing_record_for_tenant(self, tenant_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM ai_routing_configs WHERE tenant_id = ? LIMIT 1",
                (tenant_id,),
            ).fetchone()
        if not row:
            return None
        config = json.loads(row["config_json"]) if row["config_json"] else {}
        return {
            "id": row["id"],
            "tenant_id": row["tenant_id"],
            "config": config,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            existing = conn.execute("SELECT * FROM ai_routing_configs WHERE tenant_id = ? LIMIT 1", (tenant_id,)).fetchone()
            now = utcnow_iso()
            config_json = json.dumps(config or {})
            if existing:
                conn.execute("""
                    UPDATE ai_routing_configs
                    SET config_json = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (config_json, now, existing["id"]),
                )
            else:
                config_id = f"ai-routing-{secrets.token_hex(8)}"
                conn.execute("""
                    INSERT INTO ai_routing_configs (id, tenant_id, config_json, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (config_id, tenant_id, config_json, now, now),
                )
            conn.commit()
        return self.get_ai_routing_record_for_tenant(tenant_id) or {"tenant_id": tenant_id, "config": config}

    def list_automation_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM automation_provider_configs
                WHERE tenant_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._automation_provider_record(row) for row in rows]

    def get_automation_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE tenant_id = ? AND id = ? LIMIT 1",
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE tenant_id = ? AND provider_key = ? LIMIT 1",
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
                        last_tested_at = ?, last_error = ?, updated_at = ?
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
                        config_json, last_tested_at, last_error, created_at, updated_at
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM automation_provider_configs WHERE id = ? AND tenant_id = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Automation provider config not found.")
            conn.execute("DELETE FROM automation_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deleted_id": config_id, "provider_key": row["provider_key"]}

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
                "SELECT * FROM automation_provider_configs WHERE id = ? AND tenant_id = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Automation provider config not found.")
            config = json.loads(row["config_json"]) if row["config_json"] else {}
            if details:
                config.update(details)
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE automation_provider_configs
                SET status = ?, last_tested_at = ?, last_error = ?, config_json = ?, updated_at = ?
                WHERE id = ? AND tenant_id = ?
                """,
                (status, now, last_error, json.dumps(config), now, config_id, tenant_id),
            )
            conn.commit()
        return next((item for item in self.list_automation_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def list_payment_provider_configs_for_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM payment_provider_configs
                WHERE tenant_id = ?
                ORDER BY updated_at DESC, created_at DESC
                """,
                (tenant_id,),
            ).fetchall()
        return [self._payment_provider_record(row) for row in rows]

    def get_payment_provider_config_for_tenant(self, tenant_id: str, config_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM payment_provider_configs WHERE tenant_id = ? AND id = ? LIMIT 1",
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin", "staff", "viewer"})
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM payment_provider_configs WHERE tenant_id = ? AND provider_key = ? LIMIT 1",
                (tenant_id, normalized_provider),
            ).fetchone()
            now = utcnow_iso()
            label = (payload.get("label") or normalized_provider.replace("-", " ").title()).strip()
            config = payload.get("config") or {}
            enabled = 1 if payload.get("enabled") else 0
            status = (payload.get("status") or (existing["status"] if existing else ("configured" if enabled else "disconnected"))).strip()
            last_error = payload.get("last_error")
            if existing:
                resolved_last_tested_at = payload.get("last_tested_at", existing["last_tested_at"])
                conn.execute(
                    """
                    UPDATE payment_provider_configs
                    SET label = ?, enabled = ?, status = ?, config_json = ?,
                        last_tested_at = ?, last_error = ?, updated_at = ?
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
                        id, tenant_id, provider_key, label, enabled, status,
                        config_json, last_tested_at, last_error, created_at, updated_at
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
                        payload.get("last_tested_at"),
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM payment_provider_configs WHERE id = ? AND tenant_id = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("Payment provider config not found.")
            conn.execute("DELETE FROM payment_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deleted_id": config_id, "provider_key": row["provider_key"]}

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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            existing = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE tenant_id = ? AND provider_key = ? LIMIT 1",
                (tenant_id, normalized_provider),
            ).fetchone()
            now = utcnow_iso()
            label = (payload.get("label") or normalized_provider.replace("-", " ").title()).strip()
            base_url = (payload.get("base_url") or "").strip() or None
            model = (payload.get("model") or "").strip() or None
            api_key = payload.get("api_key")
            if api_key is not None:
                api_key = api_key.strip() or None
            is_default = 1 if payload.get("is_default") else 0
            enabled = 1 if payload.get("enabled") else 0
            
            # Lockdown Rules
            if is_default:
                enabled = 1  # Rule 1: If default, MUST be enabled
            if not enabled:
                is_default = 0  # Rule 2 & 5: If disabled, MUST NOT be default

            status = (payload.get("status") or (existing["status"] if existing else ("configured" if enabled else "disconnected"))).strip()
            last_error = payload.get("last_error")
            
            # Merge guardrails into config
            config = payload.get("config") or {}
            if existing:
                try:
                    existing_config = json.loads(existing["config_json"]) if existing["config_json"] else {}
                    config = {**existing_config, **config}
                except json.JSONDecodeError:
                    pass
            system_guardrails = (payload.get("system_guardrails") or "").strip()
            task_guardrails = (payload.get("task_guardrails") or "").strip()
            if system_guardrails:
                config["system_guardrails"] = system_guardrails
            if task_guardrails:
                config["task_guardrails"] = task_guardrails
            
            if existing:
                resolved_api_key = api_key if api_key is not None else existing["api_key"]
                resolved_last_tested_at = payload.get("last_tested_at", existing["last_tested_at"])
                conn.execute(
                    """
                    UPDATE ai_provider_configs
                    SET label = ?, base_url = ?, model = ?, api_key = ?, enabled = ?, is_default = ?, status = ?,
                        config_json = ?, last_tested_at = ?, last_error = ?, updated_at = ?
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
                        id, tenant_id, provider_key, label, base_url, model, api_key, enabled, is_default, status,
                        config_json, last_tested_at, last_error, created_at, updated_at
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
                        payload.get("last_tested_at"),
                        last_error,
                        now,
                        now,
                    ),
                )

            if is_default:
                conn.execute(
                    "UPDATE ai_provider_configs SET is_default = 0 WHERE tenant_id = ? AND id != ?",
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            row = conn.execute(
                "SELECT * FROM ai_provider_configs WHERE id = ? AND tenant_id = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("AI provider config not found.")
            conn.execute("DELETE FROM ai_provider_configs WHERE id = ?", (config_id,))
            conn.commit()
        return {"deleted_id": config_id, "provider_key": row["provider_key"]}

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
                "SELECT * FROM ai_provider_configs WHERE id = ? AND tenant_id = ? LIMIT 1",
                (config_id, tenant_id),
            ).fetchone()
            if not row:
                raise ValueError("AI provider config not found.")
            config = json.loads(row["config_json"]) if row["config_json"] else {}
            if connected_identity:
                config["connected_identity"] = connected_identity
            elif last_error:
                config.pop("connected_identity", None)
            now = utcnow_iso()
            conn.execute(
                """
                UPDATE ai_provider_configs
                SET status = ?, last_tested_at = ?, last_error = ?, config_json = ?, updated_at = ?
                WHERE id = ? AND tenant_id = ?
                """,
                (status, now, last_error, json.dumps(config), now, config_id, tenant_id),
            )
            conn.commit()
        return next((item for item in self.list_ai_provider_configs_for_tenant(tenant_id) if item["id"] == config_id), None)

    def _ensure_external_tables(self, conn: sqlite3.Connection) -> None:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS external_datasets (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                source TEXT NOT NULL,
                data_type TEXT NOT NULL,
                records_json TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS content_metrics (
                id TEXT PRIMARY KEY,
                tenant_id TEXT NOT NULL,
                platform TEXT NOT NULL,
                content_type TEXT NOT NULL,
                metrics_json TEXT NOT NULL,
                date TEXT,
                created_at TEXT NOT NULL
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
                INSERT INTO external_datasets (id, tenant_id, source, data_type, records_json, metadata_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (data_id, tenant_id, source, data_type, json.dumps(records), json.dumps(metadata), now, now))
            conn.commit()
        return data_id

    def list_external_datasets(self, tenant_id: str) -> list[dict]:
        with self._connect() as conn:
            self._ensure_external_tables(conn)
            rows = conn.execute("""
                SELECT id, tenant_id, source, data_type, metadata_json, created_at, updated_at
                FROM external_datasets
                WHERE tenant_id = ?
                ORDER BY created_at DESC
            """, (tenant_id,)).fetchall()
        return [
            {
                "id": row["id"],
                "tenant_id": row["tenant_id"],
                "source": row["source"],
                "data_type": row["data_type"],
                "metadata": json.loads(row["metadata_json"]) if row["metadata_json"] else {},
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
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
            "tenant_id": row["tenant_id"],
            "source": row["source"],
            "data_type": row["data_type"],
            "records": json.loads(row["records_json"]),
            "metadata": json.loads(row["metadata_json"]) if row["metadata_json"] else {},
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
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
                INSERT INTO content_metrics (id, tenant_id, platform, content_type, metrics_json, date, created_at)
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
                    WHERE tenant_id = ? AND platform = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                """, (tenant_id, platform, limit)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT * FROM content_metrics
                    WHERE tenant_id = ?
                    ORDER BY created_at DESC
                    LIMIT ?
                """, (tenant_id, limit)).fetchall()
        return [
            {
                "id": row["id"],
                "platform": row["platform"],
                "content_type": row["content_type"],
                "metrics": json.loads(row["metrics_json"]),
                "date": row["date"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]


def default_auth_db_path() -> str:
    return os.getenv("AUTH_DB_PATH") or os.getenv("SQLITE_DB_PATH") or str(Path(__file__).resolve().parent / "data" / "aio_crm.db")
