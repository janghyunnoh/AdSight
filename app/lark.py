"""Read-only Lark REST client. Never log upstream bodies or credentials."""
import asyncio
import os
import re
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parent.parent


class LarkError(Exception):
    pass


def parse_source(source):
    source = source.strip()
    kind = "sheets"
    if source.startswith(("https://", "http://")):
        parsed = urlparse(source)
        host = parsed.hostname or ""
        if parsed.scheme != "https" or not any(host == d or host.endswith("." + d) for d in ("larksuite.com", "feishu.cn")):
            raise LarkError("Lark Sheets 또는 Wiki의 HTTPS URL을 입력하세요.")
        match = re.fullmatch(r"/(sheets|wiki)/([A-Za-z0-9]+)/*", parsed.path)
        if not match:
            raise LarkError("Sheets 또는 Wiki 문서 URL을 입력하세요. Base 링크는 지원하지 않습니다.")
        kind, source = match.groups()
    if not re.fullmatch(r"[A-Za-z0-9]{10,128}", source):
        raise LarkError("올바른 스프레드시트 URL 또는 토큰을 입력하세요.")
    return kind, source


def spreadsheet_token(source):
    kind, token = parse_source(source)
    if kind != "sheets":
        raise LarkError("Wiki 링크는 문서 유형 확인 후 조회해야 합니다.")
    return token


def column_name(number):
    result = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def normalize(values):
    # First nonempty row is the header; retain original sheet row numbers.
    populated = [(i + 1, row or []) for i, row in enumerate(values)
                 if any(cell is not None and cell != "" for cell in (row or []))]
    if not populated:
        return {"columns": [], "rows": [], "row_numbers": []}
    width = max(len(row) for _, row in populated)
    while width and all(len(row) < width or row[width - 1] in (None, "")
                        for _, row in populated):
        width -= 1
    header = populated[0][1]
    columns = [str(header[i]) if i < len(header) and header[i] not in (None, "")
               else column_name(i + 1) for i in range(width)]
    return {"columns": columns,
            "rows": [(row + [None] * width)[:width] for _, row in populated[1:]],
            "row_numbers": [i for i, _ in populated[1:]]}


class LarkClient:
    def __init__(self):
        # Root .env takes precedence; never modify the MCP checkout.
        path = ROOT / ".env"
        if not path.exists():
            path = ROOT / "lark-openapi-mcp" / ".env"
        config = {**dotenv_values(path), **os.environ}
        self.app_id = config.get("LARK_APP_ID")
        self.secret = config.get("LARK_APP_SECRET")
        self.spreadsheet = config.get("LARK_SPREADSHEET_TOKEN")
        self.autoload_default = config.get("ADSIGHT_AUTOLOAD_DEFAULT", "").lower() in ("1", "true", "yes")
        domain = config.get("LARK_DOMAIN", "https://open.larksuite.com").rstrip("/")
        if domain not in ("https://open.larksuite.com", "https://open.feishu.cn"):
            raise LarkError("LARK_DOMAIN은 공식 Lark 또는 Feishu HTTPS 주소여야 합니다.")
        if not all((self.app_id, self.secret)):
            raise LarkError(".env의 LARK_APP_ID, LARK_APP_SECRET을 확인하세요.")
        self.http = httpx.AsyncClient(base_url=domain, timeout=30)
        self.token = None
        self.expires = 0
        self.lock = asyncio.Lock()

    async def _json(self, method, path, **kwargs):
        try:
            response = await self.http.request(method, path, **kwargs)
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            raise LarkError("Lark 연결에 실패했습니다. 네트워크와 앱 설정을 확인하세요.") from None
        if payload.get("code") != 0:
            code = payload.get("code")
            safe_code = str(code) if isinstance(code, int) else "unknown"
            raise LarkError("Lark API 오류 (code: " + safe_code + "). 문서 공유 및 Sheets 권한을 확인하세요.")
        if not response.is_success:
            raise LarkError(f"Lark HTTP 오류 ({response.status_code}). 앱 권한과 문서 접근 설정을 확인하세요.")
        return payload

    async def access_token(self):
        async with self.lock:
            if time.monotonic() >= self.expires:
                payload = await self._json("POST", "/open-apis/auth/v3/tenant_access_token/internal",
                                           json={"app_id": self.app_id, "app_secret": self.secret})
                self.token = payload["tenant_access_token"]
                self.expires = time.monotonic() + max(0, payload.get("expire", 7200) - 120)
            return self.token

    async def get(self, path, **kwargs):
        return await self._json("GET", path, headers={"Authorization": "Bearer " + await self.access_token()}, **kwargs)

    async def resolve_source(self, source=None):
        kind, token = parse_source(source or self.spreadsheet or "")
        if kind == "sheets":
            return token
        try:
            payload = await self.get("/open-apis/wiki/v2/spaces/get_node", params={"token": token})
        except LarkError as exc:
            raise LarkError("Wiki 문서 확인에 실패했습니다. Wiki 읽기 권한(wiki:wiki:readonly 또는 wiki:node:read), 권한 변경 후 버전 게시, 앱의 지식공간·문서 접근 권한을 확인하세요. " + str(exc)) from None
        node = payload.get("data", {}).get("node", {})
        if node.get("obj_type") != "sheet":
            raise LarkError("이 Wiki 링크는 스프레드시트가 아닙니다. Wiki 안의 Sheets 문서 링크를 입력하세요. 일반 문서·Base·문서에 삽입된 표는 아직 지원하지 않습니다.")
        token = node.get("obj_token")
        if not token:
            raise LarkError("Wiki에서 실제 스프레드시트를 찾지 못했습니다.")
        return spreadsheet_token(token)

    async def document(self, spreadsheet=None):
        token = quote(spreadsheet_token(spreadsheet or self.spreadsheet or ""), safe="")
        payload = await self.get(f"/open-apis/sheets/v3/spreadsheets/{token}")
        document = payload["data"].get("spreadsheet", {})
        return {"title": document.get("title") or "제목 없는 스프레드시트"}

    async def sheets(self, spreadsheet=None):
        token = quote(spreadsheet_token(spreadsheet or self.spreadsheet or ""), safe="")
        payload = await self.get(f"/open-apis/sheets/v3/spreadsheets/{token}/sheets/query")
        return [{"id": s["sheet_id"], "title": s.get("title", s["sheet_id"]),
                 "row_count": s.get("grid_properties", {}).get("row_count", 0),
                 "column_count": s.get("grid_properties", {}).get("column_count", 0)}
                for s in payload["data"].get("sheets", []) if s.get("sheet_type", "grid") == "grid"]

    async def table(self, sheet_id, spreadsheet=None):
        spreadsheet = spreadsheet_token(spreadsheet or self.spreadsheet or "")
        sheets = await self.sheets(spreadsheet)
        sheet = next((s for s in sheets if s["id"] == sheet_id), None)
        if sheet is None:
            raise LarkError("시트를 찾을 수 없습니다. 목록을 새로고침하세요.")
        values = []
        row_count, width = sheet["row_count"], sheet["column_count"]
        if row_count and width:
            # Lark per-request limits: <= 5,000 rows and <= 100 columns.
            # Chunk both dimensions; never silently truncate a sheet.
            for start in range(1, row_count + 1, 1000):
                count = min(1000, row_count - start + 1)
                block = [[] for _ in range(count)]
                for col in range(1, width + 1, 100):
                    end_col = min(width, col + 99)
                    cell_range = f"{sheet_id}!{column_name(col)}{start}:{column_name(end_col)}{start + count - 1}"
                    path = f"/open-apis/sheets/v2/spreadsheets/{quote(spreadsheet, safe='')}/values/{quote(cell_range, safe='')}"
                    payload = await self.get(path, params={"valueRenderOption": "ToString", "dateTimeRenderOption": "FormattedString"})
                    rows = payload["data"].get("valueRange", {}).get("values") or []
                    for i, row in enumerate(rows[:count]):
                        block[i].extend((row or []) + [None] * (end_col - col + 1 - len(row or [])))
                    for i in range(len(rows), count):
                        block[i].extend([None] * (end_col - col + 1))
                values.extend(block)
        return {"sheet": sheet, **normalize(values)}
