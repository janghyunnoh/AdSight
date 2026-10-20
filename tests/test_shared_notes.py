import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class SharedNotesTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        config = patch.dict(os.environ, {
            "ADSIGHT_NOTES_DB": directory.name + "/notes.sqlite3",
            "LARK_APP_ID": "test-id", "LARK_APP_SECRET": "test-secret",
        })
        config.start()
        self.addCleanup(config.stop)
        self.note = dict(id="legacy-1", text="공유 요청", context="대시보드",
                         createdAt="2026-10-18T01:00:00Z", done=False)

    def test_shared_completion_and_restart(self):
        with TestClient(app) as first:
            with TestClient(app) as second:
                self.assertEqual(first.post("/api/notes", json=self.note).status_code, 200)
                item = second.get("/api/notes").json()["notes"][0]
                response = second.patch("/api/notes/legacy-1", json={"done": True, "version": item["version"]})
                self.assertEqual(response.status_code, 200)
                self.assertTrue(first.get("/api/notes").json()["notes"][0]["done"])
                conflict = first.patch("/api/notes/legacy-1", json={"text": "오래된 수정", "version": 1})
                self.assertEqual(conflict.status_code, 409)
        with TestClient(app) as restarted:
            item = restarted.get("/api/notes").json()["notes"][0]
            self.assertTrue(item["done"])
            self.assertEqual(item["text"], "공유 요청")
            response = restarted.patch("/api/notes/legacy-1", json={"done": False, "text": "수정", "version": 2})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["notes"][0]["text"], "수정")

    def test_import_idempotency_and_deletion(self):
        with TestClient(app) as client:
            for _ in range(2):
                response = client.post("/api/notes/import", json={"notes": [self.note, self.note]})
                self.assertEqual(len(response.json()["notes"]), 1)
            client.patch("/api/notes/legacy-1", json={"done": True, "version": 1})
            imported = client.post("/api/notes/import", json={"notes": [self.note]}).json()["notes"]
            self.assertTrue(imported[0]["done"])
            self.assertEqual(client.delete("/api/notes/legacy-1?version=1").status_code, 409)
            self.assertEqual(client.delete("/api/notes/legacy-1?version=2").json()["notes"], [])
            self.assertEqual(client.post("/api/notes/import", json={"notes": [self.note]}).json()["notes"], [])
            self.assertEqual(client.patch("/api/notes/legacy-1", json={"done": True, "version": 2}).status_code, 404)

    def test_validation_and_db_not_public(self):
        with TestClient(app) as client:
            for values in ({"text": " "}, {"text": "a" * 4001}, {"id": "../x"}, {"done": "false"}, {"createdAt": "invalid"}):
                self.assertEqual(client.post("/api/notes", json={**self.note, **values}).status_code, 422)
            self.assertEqual(client.get("/data/notes.sqlite3").status_code, 404)
            self.assertEqual(client.get("/api/notes").headers["cache-control"], "no-store")
