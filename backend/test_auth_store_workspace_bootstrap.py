import unittest
from pathlib import Path
import shutil
import uuid

from backend.auth_store import AuthStore


class AuthStoreWorkspaceBootstrapTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(__file__).resolve().parents[1] / ".tmp-auth-store-tests" / uuid.uuid4().hex
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.temp_dir / "auth-store.db"
        self.store = AuthStore(str(self.db_path))

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_login_creates_default_workspace_when_user_has_no_memberships(self) -> None:
        session = self.store.bootstrap_owner("Owner User", "owner@example.com", "password123")
        user_id = session["user"]["id"]

        with self.store._connect() as conn:
            conn.execute("DELETE FROM memberships WHERE userId = ?", (user_id,))
            conn.execute("DELETE FROM app_sessions")
            conn.commit()

        session = self.store.login_with_password("owner@example.com", "password123")

        self.assertEqual(session["tenant"]["id"], f"tenant-home-{user_id}")
        self.assertEqual(session["tenant"]["role"], "owner")
        self.assertEqual(session["tenant"]["name"], "Owner User Workspace")

    def test_get_session_creates_default_workspace_when_active_tenant_is_missing(self) -> None:
        session = self.store.bootstrap_owner("Owner User", "owner@example.com", "password123")
        token = session["token"]
        user_id = session["user"]["id"]

        with self.store._connect() as conn:
            conn.execute("UPDATE app_sessions SET currentTenantId = NULL WHERE token = ?", (token,))
            conn.commit()

        refreshed = self.store.get_session(token)

        self.assertIsNotNone(refreshed)
        assert refreshed is not None
        self.assertEqual(refreshed["tenant"]["id"], f"tenant-home-{user_id}")
        self.assertEqual(refreshed["tenant"]["role"], "owner")
        self.assertIn(f"tenant-home-{user_id}", {tenant["id"] for tenant in refreshed["tenants"]})


if __name__ == "__main__":
    unittest.main()
