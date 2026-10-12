"""
Registration and login.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import audit
from auth import hash_password, verify_password, create_access_token, get_current_user
from config import INVITE_CODES
from database import get_db
from models import User

router = APIRouter(prefix="/auth", tags=["authentication"])

_login_limiter = audit.RateLimiter(limit=10, window_seconds=60)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    full_name: Optional[str] = Field(default=None, max_length=255)
    organization: Optional[str] = Field(default=None, max_length=255)
    badge_role: Optional[str] = Field(default=None, max_length=100)
    invite_code: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    organization: Optional[str] = None
    badge_role: Optional[str] = None


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, full_name=user.full_name,
                        organization=user.organization, badge_role=user.badge_role)


@router.get("/config")
async def auth_config():
    """Lets the sign-up page know whether an agency invite code is required."""
    return {"invite_required": bool(INVITE_CODES)}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserRegister, db: AsyncSession = Depends(get_db)):
    if INVITE_CODES and (user_data.invite_code or "").strip() not in INVITE_CODES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="A valid agency invite code is required")

    email = user_data.email.lower()
    if (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=hash_password(user_data.password),
        full_name=(user_data.full_name or "").strip() or None,
        organization=(user_data.organization or "").strip() or None,
        badge_role=(user_data.badge_role or "").strip() or None,
    )
    db.add(user)
    await db.flush()
    audit.record(db, "user.register", user_id=user.id, detail=email)
    await db.commit()
    return Token(access_token=create_access_token(user.id))


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    email = user_data.email.lower()
    _login_limiter.check(f"{request.client.host if request.client else 'unknown'}:{email}")

    user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if not user or not verify_password(user_data.password, user.hashed_password):
        audit.record(db, "user.login_failed", detail=email)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    audit.record(db, "user.login", user_id=user.id)
    await db.commit()
    return Token(access_token=create_access_token(user.id))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)
