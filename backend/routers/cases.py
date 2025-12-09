"""
Case management routes for creating, listing, and managing investigation cases.
"""
import json
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import User, Case, Message
from auth import get_current_user

router = APIRouter(prefix="/api/cases", tags=["cases"])


# Pydantic schemas
class CaseCreate(BaseModel):
    title: str


class CaseResponse(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class CaseDetailResponse(BaseModel):
    id: int
    title: str
    created_at: str
    updated_at: str
    messages: List["MessageResponse"]

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    id: int
    role: str
    content: str
    created_at: str

    class Config:
        from_attributes = True


@router.get("", response_model=List[CaseResponse])
async def list_cases(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all cases for the current user.
    """
    result = await db.execute(
        select(Case)
        .where(Case.user_id == current_user.id)
        .order_by(Case.updated_at.desc())
    )
    cases = result.scalars().all()
    
    return [
        CaseResponse(
            id=case.id,
            title=case.title,
            created_at=case.created_at.isoformat(),
            updated_at=case.updated_at.isoformat()
        )
        for case in cases
    ]


@router.post("", response_model=CaseResponse, status_code=status.HTTP_201_CREATED)
async def create_case(
    case_data: CaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new investigation case.
    """
    new_case = Case(
        user_id=current_user.id,
        title=case_data.title,
        graph_json=json.dumps({"directed": False, "multigraph": False, "graph": {}, "nodes": [], "links": []})
    )
    db.add(new_case)
    await db.commit()
    await db.refresh(new_case)
    
    return CaseResponse(
        id=new_case.id,
        title=new_case.title,
        created_at=new_case.created_at.isoformat(),
        updated_at=new_case.updated_at.isoformat()
    )


@router.get("/{case_id}", response_model=CaseDetailResponse)
async def get_case(
    case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get case details including messages.
    """
    result = await db.execute(
        select(Case)
        .options(selectinload(Case.messages))
        .where(Case.id == case_id, Case.user_id == current_user.id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found"
        )
    
    return CaseDetailResponse(
        id=case.id,
        title=case.title,
        created_at=case.created_at.isoformat(),
        updated_at=case.updated_at.isoformat(),
        messages=[
            MessageResponse(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                created_at=msg.created_at.isoformat()
            )
            for msg in case.messages
        ]
    )


@router.delete("/{case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_case(
    case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a case and all its messages.
    """
    result = await db.execute(
        select(Case).where(Case.id == case_id, Case.user_id == current_user.id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found"
        )
    
    await db.delete(case)
    await db.commit()


@router.get("/{case_id}/messages", response_model=List[MessageResponse])
async def get_case_messages(
    case_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all messages for a specific case.
    """
    # Verify case belongs to user
    result = await db.execute(
        select(Case).where(Case.id == case_id, Case.user_id == current_user.id)
    )
    case = result.scalar_one_or_none()
    
    if not case:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found"
        )
    
    # Get messages
    result = await db.execute(
        select(Message)
        .where(Message.case_id == case_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    
    return [
        MessageResponse(
            id=msg.id,
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at.isoformat()
        )
        for msg in messages
    ]
