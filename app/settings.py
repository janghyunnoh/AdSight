"""Server-side, approved per-document worksheet configuration."""
import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix='/api/settings')


class ColumnSetting(BaseModel):
    role: Literal['date', 'dimension', 'identifier', 'metric', 'ignore']
    unit: str = Field(default='', max_length=30)
    aggregation: Literal['mean', 'sum']
    label: str = Field(default='', max_length=100)
    description: str = Field(default='', max_length=500)
    rationale: str = Field(default='', max_length=300)
    reason: str = Field(default='', max_length=500)
    priority: int = Field(default=1, ge=1, le=5)
    confidence: Literal['high', 'medium', 'low'] | None = None
    question: str = Field(default='', max_length=300)
    reviewRequired: bool = False
    reviewAcknowledged: bool = False


class Metadata(BaseModel):
    summary: str = Field(max_length=2000)
    provider: str = Field(max_length=30)
    model: str = Field(max_length=150)


class Approval(BaseModel):
    source: str = Field(max_length=2048)
    sheet_id: str = Field(min_length=1, max_length=100)
    columns: list[str] = Field(min_length=1, max_length=100)
    settings: list[ColumnSetting] = Field(min_length=1, max_length=100)
    interpretation: Metadata | None = None


def initialize(store):
    with store.connection() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS approved_settings (
          document_id TEXT NOT NULL, sheet_id TEXT NOT NULL, payload TEXT NOT NULL,
          PRIMARY KEY(document_id,sheet_id))''')


def read(store, document_id, sheet_id):
    with store.connection() as db:
        row = db.execute('SELECT payload FROM approved_settings WHERE document_id=? AND sheet_id=?',
                         (document_id, sheet_id)).fetchone()
    return json.loads(row['payload']) if row else None


@router.post('')
async def approve(body: Approval, request: Request):
    if len(body.columns) != len(body.settings) or any(len(name)>500 for name in body.columns):
        raise HTTPException(422, '컬럼 설정을 확인해 주세요.')
    if sum(item.role == 'date' for item in body.settings)>1:
        raise HTTPException(422, '날짜 기준은 하나만 지정해 주세요.')
    for item in body.settings:
        if (item.reviewRequired or item.question.strip() or item.confidence in ('medium','low')) and not item.reviewAcknowledged:
            raise HTTPException(422, '확인 필요 항목을 먼저 확인해 주세요.')
    document_id = await request.app.state.lark.resolve_source(body.source.strip())
    payload = body.model_dump(exclude={'source','sheet_id'})
    payload['savedAt'] = datetime.now(timezone.utc).isoformat()
    with request.app.state.notes.connection() as db:
        db.execute('INSERT OR REPLACE INTO approved_settings VALUES (?,?,?)',
                   (document_id, body.sheet_id, json.dumps(payload, ensure_ascii=False)))
    return {'saved': True}


class DashboardLayout(BaseModel):
    columns: list[str] = Field(min_length=1, max_length=100)
    cards: list[int] = Field(max_length=100)
    selected_metric: int = Field(ge=-1, le=99)
    comparison_metrics: list[int] | None = Field(default=None, max_length=100)


class DashboardUpdate(BaseModel):
    source: str = Field(max_length=2048)
    sheet_id: str = Field(min_length=1, max_length=100)
    dashboard: DashboardLayout


@router.patch('/dashboard')
async def update_dashboard(body: DashboardUpdate, request: Request):
    document_id = await request.app.state.lark.resolve_source(body.source.strip())
    layout = body.dashboard
    with request.app.state.notes.connection() as db:
        row = db.execute('SELECT payload FROM approved_settings WHERE document_id=? AND sheet_id=?',
                         (document_id, body.sheet_id)).fetchone()
        if not row:
            raise HTTPException(409, '컬럼 설정을 먼저 적용해 주세요.')
        saved = json.loads(row['payload'])
        old = saved['columns']
        exact = layout.columns == old
        reordered = len(set(old)) == len(old) and len(set(layout.columns)) == len(layout.columns) and sorted(old) == sorted(layout.columns)
        if not (exact or reordered):
            raise HTTPException(409, '컬럼 구성이 바뀌었습니다. 설정을 다시 적용해 주세요.')
        positive = [index for index in layout.cards if index >= 0]
        if len(set(positive)) != len(positive) or any(index < -1 or index >= len(layout.columns) for index in layout.cards):
            raise HTTPException(422, '카드 구성을 확인해 주세요.')
        if layout.selected_metric != -1 and layout.selected_metric not in positive:
            raise HTTPException(422, '선택 지표는 카드에 포함되어야 합니다.')
        comparison = layout.comparison_metrics or []
        if len(set(comparison)) != len(comparison) or any(index < 0 or index >= len(layout.columns) for index in comparison):
            raise HTTPException(422, '비교 지표 구성을 확인해 주세요.')
        for index in set(positive + comparison):
            original_index = index if exact else old.index(layout.columns[index])
            if saved['settings'][original_index]['role'] != 'metric':
                raise HTTPException(422, '수치 지표만 카드로 사용할 수 있습니다.')
        saved['dashboard'] = layout.model_dump(exclude_none=True)
        db.execute('UPDATE approved_settings SET payload=? WHERE document_id=? AND sheet_id=?',
                   (json.dumps(saved, ensure_ascii=False), document_id, body.sheet_id))
    return {'saved': True}
