import hashlib
import hmac
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
                """
            )
            self._ensure_column(conn, "app_users", "username", "TEXT")
            self._ensure_column(conn, "app_sessions", "current_tenant_id", "TEXT")
            self._backfill_usernames(conn)
            self._backfill_default_workspace(conn)
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
                "INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (tenant_id, tenant_name, slugify(tenant_name), now, now),
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
        }

    def _public_tenant(self, membership: sqlite3.Row | dict[str, Any], selected: bool = False) -> dict[str, Any]:
        return {
            "id": membership["tenant_id"],
            "name": membership["tenant_name"],
            "slug": membership["tenant_slug"],
            "role": membership["membership_role"],
            "selected": selected,
        }

    def _tenant_memberships(self, conn: sqlite3.Connection, user_id: str, current_tenant_id: str | None) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        rows = conn.execute(
            """
            SELECT m.tenant_id, m.role AS membership_role, t.name AS tenant_name, t.slug AS tenant_slug
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

    def _create_session(self, conn: sqlite3.Connection, user_id: str, provider: str) -> dict[str, Any]:
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
            INSERT INTO app_sessions (id, user_id, token, provider, current_tenant_id, created_at, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, user_id, token, provider, current_tenant_id, created_at, expires_at, created_at),
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

    def bootstrap_owner(self, name: str, email: str, password: str) -> dict[str, Any]:
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
            session = self._create_session(conn, user_id, "local-password")
            conn.commit()
        return session

    def login_with_password(self, email: str, password: str) -> dict[str, Any]:
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
            session = self._create_session(conn, record["id"], "local-password")
            conn.commit()
        return session

    def login_with_google(self, email: str, name: str | None = None, avatar_url: str | None = None) -> dict[str, Any]:
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

            session = self._create_session(conn, user_id, "google-oauth")
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
            user = conn.execute("SELECT * FROM app_users WHERE id = ? LIMIT 1", (session["user_id"],)).fetchone()
            if not user:
                raise ValueError("User not found.")
            workspace_id = f"tenant-{secrets.token_hex(6)}"
            now = utcnow_iso()
            conn.execute(
                "INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (workspace_id, workspace_name, f"{slugify(workspace_name)}-{secrets.token_hex(3)}", now, now),
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

    def rename_workspace(self, token: str | None, tenant_id: str, name: str) -> dict[str, Any]:
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
            self._require_workspace_role(conn, session["user_id"], tenant_id, {"owner", "admin"})
            now = utcnow_iso()
            conn.execute(
                "UPDATE tenants SET name = ?, updated_at = ? WHERE id = ?",
                (workspace_name, now, tenant_id),
            )
            conn.commit()
        return {"workspace": self.get_workspace(tenant_id)}

    def get_workspace(self, tenant_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE id = ? LIMIT 1", (tenant_id,)).fetchone()
        if not row:
            raise ValueError("Workspace not found.")
        return {"id": row["id"], "name": row["name"], "slug": row["slug"], "created_at": row["created_at"], "updated_at": row["updated_at"]}

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
                    "INSERT INTO tenants (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (target_tenant_id, workspace_label, workspace_slug, now, now),
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


def default_auth_db_path() -> str:
    return os.getenv("AUTH_DB_PATH") or os.getenv("SQLITE_DB_PATH") or str(Path(__file__).resolve().parent / "data" / "aio_crm.db")
