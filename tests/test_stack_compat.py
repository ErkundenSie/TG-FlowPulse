"""Offline compatibility contract: never mount production data or credentials."""
import json
import os
import tempfile
import unittest
from datetime import datetime
from types import SimpleNamespace
from typing import Any, TypeVar

from pydantic import BaseModel

ModelT = TypeVar("ModelT", bound=BaseModel)


def validate(model: type[ModelT], data: dict[str, Any]) -> ModelT:
    """Exercise external JSON input, including values normalized by validators."""
    method = getattr(model, "model_validate", None) or model.parse_obj
    return method(data)

os.environ.setdefault("APP_DATA_DIR", tempfile.mkdtemp(prefix="tg-stack-test-"))
os.environ.setdefault("APP_SECRET_KEY", "isolated-test-secret-not-for-production")


class StackCompatibilityTests(unittest.TestCase):
    def test_testclient_and_health(self):
        from fastapi import FastAPI
        from starlette.testclient import TestClient
        app = FastAPI()
        @app.get("/health")
        def health():
            return {"status": "ok"}
        with TestClient(app) as client:
            self.assertEqual(client.get("/health").json(), {"status": "ok"})

    def test_backend_routes_and_openapi(self):
        from starlette.testclient import TestClient

        from backend.main import app
        # No lifespan: this test must not start scheduled jobs.
        client = TestClient(app)
        self.assertEqual(client.get("/healthz").status_code, 200)
        self.assertIn("paths", app.openapi())
        self.assertEqual(client.post("/api/auth/login", json={}).status_code, 422)

    def test_settings_environment(self):
        from backend.core.config import Settings
        self.assertEqual(str(Settings().data_dir), os.environ["APP_DATA_DIR"])
        self.assertEqual(Settings().secret_key, os.environ["APP_SECRET_KEY"])

    def test_orm_response(self):
        from backend.schemas.auth import UserOut
        obj = SimpleNamespace(id=1, username="fixture", is_admin=True,
                              is_active=True, created_at=datetime(2026, 1, 1))
        result = UserOut.model_validate(obj) if hasattr(UserOut, "model_validate") else UserOut.from_orm(obj)
        self.assertEqual(result.username, "fixture")

    def test_monitor_normalization(self):
        from backend.api.routes.monitors import MonitorRule
        rule = validate(MonitorRule, {"chat_id": "-100123", "keywords": [" hello ", ""],
                           "message_thread_ids": ["12", "", 13], "ai_context_messages": 99})
        self.assertEqual(rule.chat_id, -100123)
        self.assertEqual(rule.keywords, ["hello"])
        self.assertEqual(rule.message_thread_ids, [12, 13])
        self.assertEqual(rule.ai_context_messages, 20)

    def test_monitor_cross_field_validation(self):
        from pydantic import ValidationError

        from backend.api.routes.monitors import MonitorRule
        with self.assertRaises(ValidationError):
            MonitorRule(chat_id=123, keywords=[])
        rule = validate(MonitorRule, {"monitor_scope": "private", "push_channel": "continue", "auto_reply_text": "hello"})
        self.assertTrue(rule.match_all)
        with self.assertRaises(ValidationError):
            validate(MonitorRule, {"match_all": True, "active_time_start": "25:00"})

    def test_sign_configuration_roundtrip(self):
        from tg_signer.config import SendTextAction, SignConfigV3
        raw = {"sign_at": "0 8 * * *", "chats": [{"chat_id": -100123,
               "actions": [{"action": 1, "text": "hello"}]}]}
        parsed = SignConfigV3.valid(raw)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        restored = SignConfigV3.valid(json.loads(json.dumps(parsed.to_jsonable())))
        assert restored is not None
        action = restored.chats[0].actions[0]
        assert isinstance(action, SendTextAction)
        self.assertEqual(action.text, "hello")

    def test_legacy_config_migration(self):
        from tg_signer.config import SendTextAction, SignConfigV3
        raw = {"sign_at": "08:00:00", "chats": [{"chat_id": "-100123", "sign_text": "hello"}]}
        result = SignConfigV3.load(raw)
        assert result is not None
        config, migrated = result
        self.assertTrue(migrated)
        action = config.chats[0].actions[0]
        assert isinstance(action, SendTextAction)
        self.assertEqual(action.text, "hello")

    def test_numeric_string_ids_remain_numbers(self):
        from tg_signer.config import MatchConfig
        config = MatchConfig(chat_id="-100123", from_user_ids=["123", "@fixture"], forward_to_chat_id="456")
        self.assertEqual(config.chat_id, -100123)
        self.assertEqual(config.from_user_ids, [123, "@fixture"])
        self.assertEqual(config.forward_to_chat_id, 456)

    def test_missing_monitor_fields_are_safe(self):
        from tg_signer.config import MatchConfig
        config = MatchConfig()
        self.assertEqual(config.from_user_set, set())
        self.assertFalse(config.match_text(None))
        self.assertFalse(config.match_chat(None))

    def test_callback_configuration_json(self):
        from tg_signer.config import MatchConfig
        cfg = validate(MatchConfig, {"chat_id": 123, "external_forwards": [{"type": "http", "url": "https://example.com/hook"}]})
        encoded = json.loads(json.dumps(cfg.to_jsonable()))
        self.assertEqual(encoded["external_forwards"][0]["url"], "https://example.com/hook")

    def test_z_lifespan_login_and_orm_response(self):
        from starlette.testclient import TestClient

        from backend.main import app
        os.environ["ADMIN_PASSWORD"] = "isolated-fixture-password"
        with TestClient(app) as client:
            response = client.post("/api/auth/login", json={
                "username": "admin", "password": "isolated-fixture-password"
            })
            self.assertEqual(response.status_code, 200, response.text)
            token = response.json()["access_token"]
            response = client.get("/api/auth/me", headers={"Authorization": "Bearer " + token})
            self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(response.json()["username"], "admin")
            self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_password_hash_compatibility(self):
        from backend.core.security import hash_password, verify_password
        hashed = hash_password("fixture-password")
        self.assertTrue(verify_password("fixture-password", hashed))
        self.assertFalse(verify_password("wrong-password", hashed))


if __name__ == "__main__":
    unittest.main(verbosity=2)
