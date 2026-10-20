import unittest
import os
import tempfile
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.lark import LarkError, column_name, normalize, spreadsheet_token
from app.main import app


class TableTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        config = patch.dict(os.environ, {
            "ADSIGHT_NOTES_DB": directory.name + "/notes.sqlite3",
            "LARK_APP_ID": "test-app-id",
            "LARK_APP_SECRET": "test-secret",
            "LARK_SPREADSHEET_TOKEN": "testSpreadsheet123",
            "LARK_DOMAIN": "https://open.larksuite.com",
        })
        config.start()
        self.addCleanup(config.stop)

    def test_startup_settings(self):
        with patch.dict(os.environ, {"ADSIGHT_AUTOLOAD_DEFAULT": "true"}):
            with TestClient(app) as client:
                response = client.get("/api/startup")
                self.assertEqual(response.json(), {"autoload": True})
                self.assertNotIn("testSpreadsheet123", response.text)
        with patch.dict(os.environ, {"ADSIGHT_AUTOLOAD_DEFAULT": "false"}):
            with TestClient(app) as client:
                self.assertEqual(client.get("/api/startup").json(), {"autoload": False})

    def test_source_validation(self):
        token = "exampleSpreadsheet123"
        self.assertEqual(spreadsheet_token(" " + token + " "), token)
        self.assertEqual(spreadsheet_token("https://team.jp.larksuite.com/sheets/" + token + "?sheet=abc"), token)
        for source in ("https://evil.com/sheets/" + token,
                       "https://larksuite.com.evil.com/sheets/" + token,
                       "https://team.larksuite.com/wiki/" + token,
                       "http://team.larksuite.com/sheets/" + token, "../secret", ""):
            with self.assertRaises(LarkError):
                spreadsheet_token(source)

    def test_empty_ragged_and_header(self):
        self.assertEqual(normalize([None, [None, ""]])["rows"], [])
        result = normalize([[], ["Name", None], ["A", 0, False], [None], ["B"]])
        self.assertEqual(result["columns"], ["Name", "B", "C"])
        self.assertEqual(result["row_numbers"], [3, 5])
        self.assertEqual(result["rows"], [["A", 0, False], ["B", None, None]])
        self.assertEqual(column_name(703), "AAA")

    def test_http_and_error_redaction(self):
        def upstream(request):
            if request.method == "POST":
                return httpx.Response(200, json={"code": 0, "tenant_access_token": "private-token", "expire": 7200})
            if request.url.path.endswith("/get_node"):
                wiki_token = request.url.params["token"]
                if wiki_token == "missingPermission123":
                    return httpx.Response(200, json={"code": 99991672, "msg": "private-secret"})
                return httpx.Response(200, json={"code": 0, "data": {"node": {
                    "obj_type": "docx" if wiki_token == "ordinaryDocument123" else "sheet",
                    "obj_token": "resolvedSpreadsheet123"}}})
            self.assertNotIn("wikiSheetNode123", request.url.path)
            if "/values/" not in request.url.path and not request.url.path.endswith("/sheets/query"):
                return httpx.Response(200, json={"code": 0, "data": {"spreadsheet": {"title": "테스트 광고 데이터"}}})
            if request.url.path.endswith("/sheets/query"):
                return httpx.Response(200, json={"code": 0, "data": {"sheets": [{"sheet_id": "s1", "title": "Test", "grid_properties": {"row_count": 3, "column_count": 2}}]}})
            self.assertEqual(request.url.params["dateTimeRenderOption"], "FormattedString")
            return httpx.Response(200, json={"code": 0, "data": {"valueRange": {"values": [["Date", "Value"], ["2026/10/01", 46296], [None, None]]}}})

        with TestClient(app) as client:
            original = app.state.lark.http
            app.state.lark.http = httpx.AsyncClient(base_url="https://open.larksuite.com", transport=httpx.MockTransport(upstream))
            response = client.get("/api/sheets/s1")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["rows"], [["2026/10/01", 46296]])
            self.assertNotIn("private-token", response.text)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(client.get("/").status_code, 200)
            self.assertEqual(client.get("/static/app.js").status_code, 200)
            initial_source = app.state.lark.spreadsheet
            connected = client.post("/api/source/sheets", json={"source": "exampleSpreadsheet123"})
            self.assertEqual(connected.status_code, 200)
            self.assertEqual(connected.json()["document"]["title"], "테스트 광고 데이터")
            self.assertEqual(client.post("/api/source/sheets/s1", json={"source": "https://team.larksuite.com/sheets/anotherSpreadsheet456"}).json()["rows"], [["2026/10/01", 46296]])
            self.assertEqual(app.state.lark.spreadsheet, initial_source)
            self.assertEqual(client.post("/api/source/sheets", json={"source": ""}).status_code, 200)
            self.assertNotEqual(client.post("/api/source/sheets", json={"source": "https://evil.com/sheets/test"}).status_code, 200)
            wiki = "https://team.jp.larksuite.com/wiki/wikiSheetNode123?sheet=s1"
            self.assertEqual(client.post("/api/source/sheets", json={"source": wiki}).status_code, 200)
            self.assertEqual(client.post("/api/source/sheets/s1", json={"source": wiki}).json()["rows"], [["2026/10/01", 46296]])
            ordinary = client.post("/api/source/sheets", json={"source": "https://team.larksuite.com/wiki/ordinaryDocument123"})
            self.assertIn("스프레드시트가 아닙니다", ordinary.json()["detail"])
            denied = client.post("/api/source/sheets", json={"source": "https://team.larksuite.com/wiki/missingPermission123"})
            self.assertIn("Wiki 읽기 권한", denied.json()["detail"])
            self.assertNotIn("private-secret", denied.text)

            def failure(request):
                return httpx.Response(200, json={"code": 999, "msg": "private-token private-secret"})

            app.state.lark.http = httpx.AsyncClient(base_url="https://open.larksuite.com", transport=httpx.MockTransport(failure))
            response = client.get("/api/sheets")
            self.assertEqual(response.status_code, 502)
            self.assertNotIn("private-token", response.text)
            self.assertNotIn("private-secret", response.text)


if __name__ == "__main__":
    unittest.main()
