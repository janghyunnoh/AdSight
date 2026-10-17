"""Read-only smoke test; prints counts, never credentials or sheet contents."""
import re
from fastapi.testclient import TestClient
from app.main import app


with TestClient(app) as client:
    sheets_response = client.get("/api/sheets")
    if sheets_response.status_code != 200:
        raise SystemExit("FAIL: sheet list: " + sheets_response.json().get("detail", "unknown"))
    sheets = sheets_response.json()["sheets"]
    print("PASS: live sheet list; sheets =", len(sheets))
    if not sheets:
        raise SystemExit("FAIL: no readable sheets")
    for _ in range(2):
        response = client.get("/api/sheets/" + sheets[0]["id"])
        if response.status_code != 200:
            raise SystemExit("FAIL: cells: " + response.json().get("detail", "unknown"))
        data = response.json()
        assert all(len(row) == len(data["columns"]) for row in data["rows"])
        for private in (app.state.lark.secret, app.state.lark.token, app.state.lark.spreadsheet):
            assert private not in response.text
        print("PASS: live cells; columns =", len(data["columns"]), "; rows =", len(data["rows"]))
        if "Date" in data["columns"]:
            dates = [row[data["columns"].index("Date")] for row in data["rows"]]
            formatted = all(isinstance(value, str) and not re.fullmatch(r"\d+(\.\d+)?", value) for value in dates)
            print("Date rendered as formatted strings:", formatted)
            assert formatted, "Date serials need explicit display handling"
    for path in ("/", "/static/app.js", "/static/style.css"):
        assert client.get(path).status_code == 200
    print("PASS: page, static assets, repeat fetch, credential redaction")
    source = app.state.lark.spreadsheet
    for supplied in (source, "https://example.larksuite.com/sheets/" + source):
        response = client.post("/api/source/sheets", json={"source": supplied})
        assert response.status_code == 200, "Source sheet list failed"
        sheet_id = response.json()["sheets"][0]["id"]
        response = client.post("/api/source/sheets/" + sheet_id, json={"source": supplied})
        assert response.status_code == 200, "Source cell read failed"
        assert len(response.json()["rows"]) == len(data["rows"])
        assert app.state.lark.spreadsheet == source
    print("PASS: URL and token input, source isolation, POST cell reads")
