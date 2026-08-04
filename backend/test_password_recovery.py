import unittest
import os
import shutil
import tempfile
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.auth_store import AuthStore, hash_password

class TestPasswordRecovery(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.temp_dir, "test_auth.db")
        self.store = AuthStore(self.db_path)
        
        # Seed test user
        with self.store._connect() as conn:
            p_hash, p_salt = hash_password("oldpassword123")
            conn.execute(
                """
                INSERT INTO app_users (id, email, username, displayName, passwordHash, passwordSalt, authProvider, role, createdAt, updatedAt)
                VALUES ('user-test-1', 'user@example.com', 'testuser', 'Test User', ?, ?, 'local', 'operator', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
                """,
                (p_hash, p_salt)
            )
            conn.commit()

    def tearDown(self):
        try:
            shutil.rmtree(self.temp_dir)
        except Exception:
            pass

    def test_create_and_validate_reset_token(self):
        # Non-existent user returns None
        res_none = self.store.create_password_reset_token("nonexistent@example.com")
        self.assertIsNone(res_none)

        # Existing user returns token info
        res = self.store.create_password_reset_token("user@example.com")
        self.assertIsNotNone(res)
        self.assertEqual(res["email"], "user@example.com")
        self.assertTrue(len(res["token"]) > 20)

        # Validate token
        val = self.store.validate_password_reset_token(res["token"])
        self.assertEqual(val["email"], "user@example.com")

    def test_reset_password_success(self):
        token_info = self.store.create_password_reset_token("user@example.com")
        token = token_info["token"]

        # Reset password
        self.store.reset_password_with_token(token, "newpassword123")

        # Verify old password fails and new password succeeds
        session = self.store.login_with_password("user@example.com", "newpassword123")
        self.assertIsNotNone(session)
        self.assertIn("token", session)

        with self.assertRaises(ValueError):
            self.store.login_with_password("user@example.com", "oldpassword123")

        # Token cannot be re-used
        with self.assertRaises(ValueError):
            self.store.validate_password_reset_token(token)

if __name__ == "__main__":
    unittest.main()
