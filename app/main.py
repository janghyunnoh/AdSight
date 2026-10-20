from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.lark import LarkClient, LarkError
from app.ai import AIClient, router as ai_router
from app.notes import NoteStore, router as notes_router
from app.settings import router as settings_router, initialize as initialize_settings, read as read_settings

STATIC = Path(__file__).parent / "static"


@asynccontextmanager
async def lifespan(app):
    app.state.lark = LarkClient()
    app.state.notes = NoteStore()
    initialize_settings(app.state.notes)
    app.state.ai = AIClient()
    with app.state.notes.connection() as db:
        db.execute("CREATE TABLE IF NOT EXISTS ai_usage (tokens INTEGER NOT NULL)")
    app.state.ai.usage_store = app.state.notes
    yield
    await app.state.lark.http.aclose()
    await app.state.ai.http.aclose()


app = FastAPI(title="AdSight", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.include_router(notes_router)
app.include_router(ai_router)
app.include_router(settings_router)


@app.middleware("http")
async def headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"
    return response


@app.exception_handler(LarkError)
async def lark_error(request, exc):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.get("/")
async def home():
    return FileResponse(STATIC / "index.html")


@app.get("/api/sheets")
async def sheets(request: Request):
    return {"sheets": await request.app.state.lark.sheets()}


@app.get("/api/startup")
async def startup_settings(request: Request):
    client = request.app.state.lark
    return {"autoload": bool(client.autoload_default and client.spreadsheet)}


@app.get("/api/sheets/{sheet_id}")
async def table(sheet_id: str, request: Request):
    return await request.app.state.lark.table(sheet_id)


class SheetSource(BaseModel):
    source: str = Field(default="", max_length=2048)


@app.post("/api/source/sheets")
async def source_sheets(body: SheetSource, request: Request):
    source = await request.app.state.lark.resolve_source(body.source.strip())
    document = await request.app.state.lark.document(source)
    return {"document": document, "sheets": await request.app.state.lark.sheets(source)}


@app.post("/api/source/sheets/{sheet_id}")
async def source_table(sheet_id: str, body: SheetSource, request: Request):
    source = await request.app.state.lark.resolve_source(body.source.strip())
    data = await request.app.state.lark.table(sheet_id, source)
    return {**data, 'document_id': source, 'approved_settings': read_settings(request.app.state.notes, source, sheet_id)}
