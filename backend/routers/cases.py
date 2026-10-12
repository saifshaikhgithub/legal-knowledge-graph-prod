"""
Case management: create, list, update, delete.
"""
import json
from datetime import datetime
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import audit
import billing
from auth import get_current_user
from database import get_db
from models import Case, Evidence, Message, User
from modules.graph_manager import CrimeGraph
from routers.common import get_owned_case, iso, save_graph

router = APIRouter(prefix="/api/cases", tags=["cases"])

Status = Literal["active", "cold", "closed"]
Priority = Literal["low", "medium", "high", "critical"]


class CaseCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    priority: Priority = "medium"


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=5000)
    status: Optional[Status] = None
    priority: Optional[Priority] = None


class CaseResponse(BaseModel):
    id: int
    title: str
    case_number: str
    description: str
    status: str
    priority: str
    created_at: str
    updated_at: str
    entity_count: int = 0
    message_count: int = 0
    evidence_count: int = 0


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: str


class CaseDetailResponse(CaseResponse):
    messages: List[MessageResponse]


def _entity_count(case: Case) -> int:
    try:
        return len(json.loads(case.graph_json or "{}").get("nodes", []))
    except json.JSONDecodeError:
        return 0


def _case_response(case: Case, message_count: int = 0, evidence_count: int = 0) -> CaseResponse:
    return CaseResponse(
        id=case.id,
        title=case.title,
        case_number=case.case_number or f"CI-{case.id:05d}",
        description=case.description or "",
        status=case.status or "active",
        priority=case.priority or "medium",
        created_at=iso(case.created_at),
        updated_at=iso(case.updated_at),
        entity_count=_entity_count(case),
        message_count=message_count,
        evidence_count=evidence_count,
    )


@router.get("", response_model=List[CaseResponse])
async def list_cases(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    cases = (await db.execute(
        select(Case).where(Case.user_id == current_user.id).order_by(Case.updated_at.desc(), Case.id.desc())
    )).scalars().all()
    ids = [c.id for c in cases]
    msg_counts, ev_counts = {}, {}
    if ids:
        msg_counts = dict((await db.execute(
            select(Message.case_id, func.count()).where(Message.case_id.in_(ids)).group_by(Message.case_id)
        )).all())
        ev_counts = dict((await db.execute(
            select(Evidence.case_id, func.count()).where(Evidence.case_id.in_(ids)).group_by(Evidence.case_id)
        )).all())
    return [_case_response(c, msg_counts.get(c.id, 0), ev_counts.get(c.id, 0)) for c in cases]


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(case_data: CaseCreate, current_user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    await billing.check_case_limit(db, current_user)
    case = Case(
        user_id=current_user.id,
        title=case_data.title.strip(),
        description=(case_data.description or "").strip() or None,
        priority=case_data.priority,
        status="active",
    )
    save_graph(case, CrimeGraph())
    db.add(case)
    await db.flush()
    case.case_number = f"CI-{datetime.now().year}-{case.id:04d}"
    audit.record(db, "case.create", user_id=current_user.id, case_id=case.id, detail=case.title)
    await db.commit()
    await db.refresh(case)
    return _case_response(case)


@router.get("/{case_id}", response_model=CaseDetailResponse)
async def get_case(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    messages = (await db.execute(
        select(Message).where(Message.case_id == case.id).order_by(Message.id)
    )).scalars().all()
    evidence_count = (await db.execute(
        select(func.count()).select_from(Evidence).where(Evidence.case_id == case.id)
    )).scalar_one()
    base = _case_response(case, len(messages), evidence_count)
    return CaseDetailResponse(
        **base.model_dump(),
        messages=[MessageResponse(id=m.id, role=m.role, content=m.content, created_at=iso(m.created_at))
                  for m in messages],
    )


@router.patch("/{case_id}", response_model=CaseResponse)
async def update_case(case_id: int, changes: CaseUpdate, current_user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    updates = changes.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(case, field, value.strip() if isinstance(value, str) else value)
    audit.record(db, "case.update", user_id=current_user.id, case_id=case.id, detail=json.dumps(updates))
    await db.commit()
    await db.refresh(case)
    return _case_response(case)


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(case_id: int, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    case = await get_owned_case(db, case_id, current_user)
    audit.record(db, "case.delete", user_id=current_user.id, case_id=case.id, detail=case.title)
    await db.delete(case)
    await db.commit()
