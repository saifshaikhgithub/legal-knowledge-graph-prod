"""
Plans, entitlements and metered usage.

Pro access is time-based: a user is Pro while `current_period_end` (mirrored from Razorpay) is in the
future, plus a short grace period so a renewal charge that lands a few hours late never locks anyone out.
"""
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import config
from models import Case, Usage, User

GRACE = timedelta(days=1)
METERED = ("messages", "uploads", "briefs")
LABELS = {"cases": "cases", "messages": "AI questions", "uploads": "evidence uploads", "briefs": "case briefs"}


def utcnow() -> datetime:
    """Naive UTC, matching how timestamps are stored."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def is_pro(user: User) -> bool:
    if user.email.lower() in config.PRO_EMAILS:
        return True
    end = user.current_period_end
    # The grace period covers a late renewal charge; a subscription that has ended gets none.
    grace = timedelta(0) if user.subscription_status in ("cancelled", "completed", "expired") else GRACE
    return bool(end and utcnow() < end + grace)


def limits_for(user: User) -> Dict[str, int]:
    return config.PRO_LIMITS if is_pro(user) else config.FREE_LIMITS


def current_period() -> str:
    return utcnow().strftime("%Y-%m")


def _next_reset() -> datetime:
    now = utcnow()
    return datetime(now.year + (now.month == 12), now.month % 12 + 1, 1)


def _limit_error(user: User, metric: str, limit: int) -> HTTPException:
    label = LABELS[metric]
    if is_pro(user):
        # Pro limits are a fair-use ceiling; hitting one is a support conversation, not an upsell.
        return HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={
            "code": "fair_use",
            "metric": metric,
            "message": f"You've reached the fair-use limit of {limit} {label} this month. Contact support to raise it.",
        })
    period = "" if metric == "cases" else " this month"
    return HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
        "code": "limit_reached",
        "metric": metric,
        "message": f"You've used all {limit} free {label}{period}. Upgrade to Pro to keep investigating.",
    })


def require_pro(user: User, feature: str) -> None:
    if not is_pro(user):
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={
            "code": "pro_feature",
            "metric": None,
            "message": f"{feature} is a Pro feature. Upgrade to unlock it.",
        })


async def _usage_row(db: AsyncSession, user_id: int, create: bool) -> Optional[Usage]:
    period = current_period()
    row = (await db.execute(
        select(Usage).where(Usage.user_id == user_id, Usage.period == period)
    )).scalar_one_or_none()
    if row is None and create:
        row = Usage(user_id=user_id, period=period, messages=0, uploads=0, briefs=0)
        db.add(row)
        await db.flush()
    return row


async def consume(db: AsyncSession, user: User, metric: str, amount: int = 1) -> None:
    """
    Count one use of a metered feature, or raise 402/429 when the allowance is spent.
    The increment is written with the caller's commit, so a request that fails afterwards is not charged.
    """
    limit = limits_for(user)[metric]
    row = await _usage_row(db, user.id, create=True)
    used = getattr(row, metric) or 0
    if used + amount > limit:
        raise _limit_error(user, metric, limit)
    setattr(row, metric, used + amount)


async def case_count(db: AsyncSession, user_id: int) -> int:
    return (await db.execute(select(func.count()).select_from(Case).where(Case.user_id == user_id))).scalar_one()


async def check_case_limit(db: AsyncSession, user: User) -> None:
    limit = limits_for(user)["cases"]
    if await case_count(db, user.id) >= limit:
        raise _limit_error(user, "cases", limit)


async def summary(db: AsyncSession, user: User) -> Dict[str, Any]:
    """Everything the billing page and the in-app usage meter need."""
    row = await _usage_row(db, user.id, create=False)
    usage = {m: (getattr(row, m) or 0) if row else 0 for m in METERED}
    usage["cases"] = await case_count(db, user.id)
    pro = is_pro(user)
    return {
        "plan": "pro" if pro else "free",
        "interval": user.plan_interval if pro else None,
        "status": user.subscription_status,
        "current_period_end": user.current_period_end.isoformat() if pro and user.current_period_end else None,
        "cancel_at_period_end": bool(user.cancel_at_period_end) if pro else False,
        "complimentary": user.email.lower() in config.PRO_EMAILS,
        "limits": limits_for(user),
        "usage": usage,
        "usage_resets_at": _next_reset().isoformat(),
    }
