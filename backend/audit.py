"""
Audit logging and a small in-process rate limiter.
"""
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from models import AuditLog


def record(db: AsyncSession, action: str, user_id: Optional[int] = None,
           case_id: Optional[int] = None, detail: Optional[str] = None) -> None:
    """Queue an audit entry on the session; it is written with the caller's commit."""
    db.add(AuditLog(user_id=user_id, case_id=case_id, action=action, detail=(detail or "")[:2000]))


class RateLimiter:
    """Sliding-window limiter keyed by user. Good enough for a single instance."""

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str) -> None:
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests - slow down and try again in a minute.",
            )
        hits.append(now)
