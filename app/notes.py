"""Shared development notes. No external database or additional dependencies."""
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, StrictBool, field_validator

router = APIRouter(prefix="/api/notes")


class Note(BaseModel):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    text: str = Field(min_length=1, max_length=4000)
    context: str = Field(default="", max_length=500)
    createdAt: datetime
    done: StrictBool = False

    @field_validator("text")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("내용을 입력하세요.")
        return value.strip()


class NoteUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=4000)
    done: StrictBool | None = None
    version: int = Field(ge=1)

    @field_validator("text")
    @classmethod
    def nonempty(cls, value):
        return Note.nonempty(value) if value is not None else None


class ImportNotes(BaseModel):
    notes: list[Note] = Field(max_length=500)


class NoteStore:
    def __init__(self):
        self.path = Path(os.environ.get("ADSIGHT_NOTES_DB") or
                         Path(__file__).resolve().parent.parent / "data" / "notes.sqlite3")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("""CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, text TEXT NOT NULL, context TEXT NOT NULL,
                createdAt TEXT NOT NULL, done INTEGER NOT NULL,
                version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0
            )""")

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def record(row):
        return {**dict(row), "done": bool(row["done"])}

    def list(self):
        with self.connection() as db:
            return [self.record(row) for row in db.execute(
                "SELECT id,text,context,createdAt,done,version FROM notes WHERE deleted=0 ORDER BY createdAt,id")]

    def add(self, notes):
        # Retried imports never overwrite shared edits or resurrect deleted notes.
        with self.connection() as db:
            for note in notes:
                date = note.createdAt
                if date.tzinfo is None:
                    date = date.replace(tzinfo=timezone.utc)
                db.execute("INSERT OR IGNORE INTO notes (id,text,context,createdAt,done) VALUES (?,?,?,?,?)",
                           (note.id, note.text, note.context, date.astimezone(timezone.utc).isoformat(), note.done))

    def change(self, note_id, version, *, text=None, done=None, delete=False):
        with self.connection() as db:
            row = db.execute("SELECT * FROM notes WHERE id=? AND deleted=0", (note_id,)).fetchone()
            if row is None:
                raise HTTPException(404, "기록이 삭제됐습니다. 목록을 새로고침해 주세요.")
            cursor = db.execute("""UPDATE notes SET text=?,done=?,deleted=?,version=version+1
                WHERE id=? AND version=? AND deleted=0""",
                (row["text"] if text is None else text, row["done"] if done is None else done,
                 delete, note_id, version))
            if cursor.rowcount != 1:
                raise HTTPException(409, "다른 사람이 먼저 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.")


@router.get("")
def list_notes(request: Request):
    return {"notes": request.app.state.notes.list()}


@router.post("")
def create_note(body: Note, request: Request):
    request.app.state.notes.add([body])
    return {"notes": request.app.state.notes.list()}


@router.post("/import")
def import_notes(body: ImportNotes, request: Request):
    request.app.state.notes.add(body.notes)
    return {"notes": request.app.state.notes.list()}


@router.patch("/{note_id}")
def update_note(note_id: str, body: NoteUpdate, request: Request):
    request.app.state.notes.change(note_id, body.version, text=body.text, done=body.done)
    return {"notes": request.app.state.notes.list()}


@router.delete("/{note_id}")
def delete_note(note_id: str, version: int, request: Request):
    request.app.state.notes.change(note_id, version, delete=True)
    return {"notes": request.app.state.notes.list()}
