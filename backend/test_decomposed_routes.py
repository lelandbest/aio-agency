"""
Comprehensive regression and smoke tests for the decomposed AIO Nexus v2 backend.
Tests ASGI endpoints, route registration, blueprints discovery, and core utilities.
"""

import asyncio
import json
import unittest
from typing import Any, Dict, Optional, Tuple

from backend.app import app
from backend.deps import auth_store
from backend.flow_graph_utils import order_flow_nodes, extract_flow_graph, infer_flow_step_agent
from backend.cortex_service import cortex_service


class AsgiTestClient:
    """Lightweight pure-Python ASGI test client that requires no external dependencies."""

    def __init__(self, asgi_app):
        self.app = asgi_app

    async def _request(
        self,
        method: str,
        path: str,
        headers: Optional[list] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Tuple[int, Dict[str, str], bytes]:
        raw_headers = list(headers or [])
        body_bytes = b""
        if json_body is not None:
            body_bytes = json.dumps(json_body).encode("utf-8")
            raw_headers.append((b"content-type", b"application/json"))
        raw_headers.append((b"host", b"localhost"))

        disconnect_event = asyncio.Event()
        sent_request = False

        async def receive():
            nonlocal sent_request
            if not sent_request:
                sent_request = True
                return {
                    "type": "http.request",
                    "body": body_bytes,
                    "more_body": False,
                }
            await disconnect_event.wait()
            return {"type": "http.disconnect"}

        status_code = 500
        response_headers: Dict[str, str] = {}
        body_chunks = []

        async def send(message):
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                for k, v in message.get("headers", []):
                    response_headers[k.decode("latin1").lower()] = v.decode("latin1")
            elif message["type"] == "http.response.body":
                body_chunks.append(message.get("body", b""))
                if not message.get("more_body", False):
                    disconnect_event.set()

        scope = {
            "type": "http",
            "http_version": "1.1",
            "method": method.upper(),
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": raw_headers,
            "app": self.app,
        }

        try:
            await self.app(scope, receive, send)
        finally:
            disconnect_event.set()

        return status_code, response_headers, b"".join(body_chunks)

    def request(
        self,
        method: str,
        path: str,
        headers: Optional[list] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Tuple[int, Dict[str, str], bytes]:
        return asyncio.run(self._request(method, path, headers=headers, json_body=json_body))

    def get(self, path: str, headers: Optional[list] = None) -> Tuple[int, Dict[str, str], bytes]:
        return self.request("GET", path, headers=headers)

    def post(self, path: str, json_body: Optional[Dict[str, Any]] = None, headers: Optional[list] = None) -> Tuple[int, Dict[str, str], bytes]:
        return self.request("POST", path, headers=headers, json_body=json_body)


class DecomposedBackendRoutesTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = AsgiTestClient(app)
        # Create an operator session for authenticated tests
        with auth_store._connect() as conn:
            user = conn.execute("SELECT id FROM app_users WHERE role = 'operator' LIMIT 1").fetchone()
            if not user:
                user = conn.execute("SELECT id FROM app_users LIMIT 1").fetchone()
            cls.session = auth_store._create_session(conn, user["id"], "test-suite")
            conn.commit()
        cls.token = cls.session["token"]
        cls.auth_headers = [(b"x-session-token", cls.token.encode("latin1"))]

    def test_health_endpoint(self):
        status, _, raw = self.client.get("/api/health")
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["version"], "2.0.0")
        self.assertTrue(data["appliance"]["zero_cloud_rent"])
        self.assertTrue(data["appliance"]["cloud_agnostic"])

    def test_root_api_endpoint(self):
        status, _, raw = self.client.get("/api/")
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        self.assertIn("AIO Nexus", data["message"])
        self.assertEqual(data["status"], "online")

    def test_blueprints_discovery(self):
        blueprints = auth_store.list_blueprints()
        blueprint_ids = {bp["id"] for bp in blueprints}
        
        # Verify SOB blueprints exist
        self.assertIn("podcast_creator", blueprint_ids)
        self.assertIn("tech_director", blueprint_ids)

        podcast_bp = next(bp for bp in blueprints if bp["id"] == "podcast_creator")
        self.assertIn("Podcast", podcast_bp["name"])

        tech_bp = next(bp for bp in blueprints if bp["id"] == "tech_director")
        self.assertIn("Technical Director", tech_bp["name"])

    def test_pocket_brief_endpoint_authenticated(self):
        status, _, raw = self.client.get("/api/pocket/brief", headers=self.auth_headers)
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        self.assertEqual(data["status"], "success")
        self.assertIn("summary", data)
        self.assertIn("pendingApprovals", data)
        self.assertIn("todaySchedule", data)

    def test_pocket_approvals_endpoint_authenticated(self):
        status, _, raw = self.client.get("/api/pocket/approvals", headers=self.auth_headers)
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        self.assertEqual(data["status"], "success")
        self.assertIn("items", data)
        self.assertIn("count", data)

    def test_pocket_cues_endpoint_authenticated(self):
        status, _, raw = self.client.get("/api/pocket/cues", headers=self.auth_headers)
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        self.assertEqual(data["status"], "success")
        self.assertIn("cues", data)
        self.assertGreater(len(data["cues"]), 0)

    def test_pocket_capture_endpoint_authenticated(self):
        payload = {
            "type": "note",
            "title": "Quick Mobile Memo",
            "content": "Testing pocket memo ingestion into vault",
            "category": "note"
        }
        status, _, raw = self.client.post("/api/pocket/capture", json_body=payload, headers=self.auth_headers)
        self.assertEqual(status, 200)
        data = json.loads(raw.decode("utf-8"))
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["item"]["title"], "Quick Mobile Memo")

    def test_unauthenticated_pocket_access_blocked(self):
        status, _, _ = self.client.get("/api/pocket/brief")
        self.assertEqual(status, 401)

    def test_legacy_server_import_backwards_compatibility(self):
        from backend.server import app as legacy_app
        self.assertIs(legacy_app, app)

    def test_flow_graph_utils(self):
        nodes = [{"id": "n1"}, {"id": "n2"}, {"id": "n3"}]
        edges = [{"source": "n1", "target": "n2"}, {"source": "n2", "target": "n3"}]
        ordered = order_flow_nodes(nodes, edges)
        self.assertEqual([n["id"] for n in ordered], ["n1", "n2", "n3"])

        # Agent inference test
        node_agent = infer_flow_step_agent({"id": "step1", "assignedAgent": "VECTOR"})
        self.assertEqual(node_agent, "VECTOR")

    def test_cortex_query_vault(self):
        results = cortex_service.query_vault("microphone setup", limit=5)
        self.assertIsInstance(results, list)


if __name__ == "__main__":
    unittest.main()
