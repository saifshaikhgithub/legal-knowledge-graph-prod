"""
Subscriptions: plans, Razorpay checkout, cancellation, payment history and the Razorpay webhook.

Flow: POST /subscribe creates a Razorpay subscription -> the browser opens Razorpay Checkout ->
POST /verify checks the payment signature and turns Pro on immediately -> webhooks keep the plan in
sync from then on (renewals, failed charges, cancellations).
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import audit
import billing
import config
from auth import get_current_user
from database import get_db
from models import Payment, User
from modules import payments
from routers.common import iso

router = APIRouter(prefix="/api/billing", tags=["billing"])

ACTIVE = {"authenticated", "active"}
ENDED = {"cancelled", "completed", "expired"}


class SubscribeRequest(BaseModel):
    interval: Literal["monthly", "yearly"]


class VerifyRequest(BaseModel):
    razorpay_payment_id: str
    razorpay_subscription_id: str
    razorpay_signature: str


def _ts(value) -> Optional[datetime]:
    return datetime.fromtimestamp(int(value), timezone.utc).replace(tzinfo=None) if value else None


def _apply_subscription(user: User, sub: dict) -> None:
    """Mirror a Razorpay subscription onto the user."""
    if sub["id"] != user.subscription_id:
        user.cancel_at_period_end = False  # a new subscription starts clean
    user.subscription_id = sub["id"]
    user.subscription_status = sub.get("status")
    user.plan_interval = payments.subscription_interval(sub) or user.plan_interval
    if end := _ts(sub.get("current_end")):
        user.current_period_end = end
    if sub.get("status") in ENDED:
        user.cancel_at_period_end = True
        # Cancelled immediately (e.g. from the Razorpay dashboard): access ends now, not at period end.
        ended = _ts(sub.get("ended_at"))
        if ended and user.current_period_end and ended < user.current_period_end:
            user.current_period_end = ended


async def _record_payment(db: AsyncSession, user: User, payment: dict, subscription_id: str) -> None:
    exists = (await db.execute(
        select(Payment).where(Payment.provider_payment_id == payment["id"])
    )).scalar_one_or_none()
    if exists:
        return
    db.add(Payment(user_id=user.id, provider_payment_id=payment["id"], subscription_id=subscription_id,
                   amount=int(payment.get("amount") or 0), currency=payment.get("currency") or "INR",
                   method=payment.get("method"), status=payment.get("status") or "captured"))


def _gateway_error(e: Exception) -> HTTPException:
    print(f"[ERROR] razorpay: {e}")
    detail = str(e) if config.DEBUG_ERRORS else "The payment provider could not be reached. Please try again."
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail)


# ----------------------------------------------------------------- public

@router.get("/plans")
async def plans():
    monthly, yearly = config.PRO_MONTHLY_PRICE_INR, config.PRO_YEARLY_PRICE_INR
    savings = monthly * 12 - yearly
    return {
        "enabled": payments.enabled(),
        "key_id": config.RAZORPAY_KEY_ID or None,
        "currency": "INR",
        "monthly": {"price": monthly},
        "yearly": {"price": yearly, "per_month": round(yearly / 12),
                   "savings": savings, "savings_pct": int(savings * 100 / (monthly * 12)) if monthly else 0},
        "free_limits": config.FREE_LIMITS,
        "pro_limits": config.PRO_LIMITS,
    }


# ----------------------------------------------------------------- account

@router.get("/me")
async def my_billing(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await billing.summary(db, current_user)


@router.get("/payments")
async def my_payments(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(Payment).where(Payment.user_id == current_user.id).order_by(Payment.id.desc()).limit(100)
    )).scalars().all()
    return [{"id": p.provider_payment_id, "amount": p.amount / 100, "currency": p.currency,
             "method": p.method, "status": p.status, "created_at": iso(p.created_at)} for p in rows]


@router.post("/subscribe")
async def subscribe(body: SubscribeRequest, current_user: User = Depends(get_current_user),
                    db: AsyncSession = Depends(get_db)):
    if not payments.enabled():
        raise HTTPException(status_code=503, detail="Online payments aren't enabled yet. Please contact sales.")
    if billing.is_pro(current_user) and not current_user.cancel_at_period_end:
        raise HTTPException(status_code=409, detail="You already have an active Pro plan.")
    try:
        sub = await payments.create_subscription(body.interval, current_user.id)
    except payments.RazorpayError as e:
        raise _gateway_error(e)
    audit.record(db, "billing.checkout", user_id=current_user.id, detail=f"{body.interval} {sub['id']}")
    await db.commit()
    price = config.PRO_MONTHLY_PRICE_INR if body.interval == "monthly" else config.PRO_YEARLY_PRICE_INR
    return {"subscription_id": sub["id"], "key_id": config.RAZORPAY_KEY_ID, "interval": body.interval,
            "amount": price, "product": config.PRODUCT_NAME}


@router.post("/verify")
async def verify(body: VerifyRequest, current_user: User = Depends(get_current_user),
                 db: AsyncSession = Depends(get_db)):
    """Called by the browser right after Checkout succeeds, so Pro is on before the webhook arrives."""
    if not payments.verify_checkout(body.razorpay_payment_id, body.razorpay_subscription_id, body.razorpay_signature):
        audit.record(db, "billing.bad_signature", user_id=current_user.id, detail=body.razorpay_subscription_id)
        await db.commit()
        raise HTTPException(status_code=400, detail="Payment could not be verified.")
    try:
        sub = await payments.fetch_subscription(body.razorpay_subscription_id)
    except payments.RazorpayError as e:
        raise _gateway_error(e)
    if payments.subscription_user_id(sub) != current_user.id:
        raise HTTPException(status_code=403, detail="This subscription belongs to another account.")

    _apply_subscription(current_user, sub)
    if not sub.get("current_end"):
        # Charged but Razorpay hasn't filled the cycle in yet; the webhook will correct this shortly.
        days = 366 if current_user.plan_interval == "yearly" else 31
        current_user.current_period_end = billing.utcnow() + timedelta(days=days)
    try:
        payment = await payments.fetch_payment(body.razorpay_payment_id)
    except payments.RazorpayError:
        price = config.PRO_YEARLY_PRICE_INR if current_user.plan_interval == "yearly" else config.PRO_MONTHLY_PRICE_INR
        payment = {"id": body.razorpay_payment_id, "amount": price * 100, "status": "captured"}
    await _record_payment(db, current_user, payment, sub["id"])
    audit.record(db, "billing.subscribed", user_id=current_user.id, detail=f"{current_user.plan_interval} {sub['id']}")
    try:
        await db.commit()
    except IntegrityError:  # the webhook recorded this payment at the same moment
        await db.rollback()
    await db.refresh(current_user)
    return await billing.summary(db, current_user)


@router.post("/cancel")
async def cancel(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Stop auto-renewal. Pro stays on until the end of the period already paid for."""
    if not current_user.subscription_id or not billing.is_pro(current_user):
        raise HTTPException(status_code=400, detail="There is no active subscription to cancel.")
    if not current_user.cancel_at_period_end:
        try:
            sub = await payments.cancel_subscription(current_user.subscription_id, at_cycle_end=True)
        except payments.RazorpayError as e:
            raise _gateway_error(e)
        current_user.subscription_status = sub.get("status", current_user.subscription_status)
        current_user.cancel_at_period_end = True
        audit.record(db, "billing.cancel", user_id=current_user.id, detail=current_user.subscription_id)
        await db.commit()
    return await billing.summary(db, current_user)


# ----------------------------------------------------------------- webhook

@router.post("/webhook", include_in_schema=False)
async def webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """
    Razorpay -> us. Configure in Dashboard > Webhooks with the subscription.* events and
    RAZORPAY_WEBHOOK_SECRET. Only signed requests are trusted.
    """
    body = await request.body()
    if not payments.verify_webhook(body, request.headers.get("X-Razorpay-Signature", "")):
        raise HTTPException(status_code=400, detail="Invalid signature")
    event = json.loads(body)
    name = event.get("event", "")
    payload = event.get("payload", {})
    sub = (payload.get("subscription") or {}).get("entity")
    if not sub or not name.startswith("subscription."):
        return {"ok": True, "ignored": name}

    user = (await db.execute(select(User).where(User.subscription_id == sub["id"]))).scalar_one_or_none()
    if user is None and (uid := payments.subscription_user_id(sub)):
        user = await db.get(User, uid)
    if user is None:
        return {"ok": True, "ignored": "unknown subscription"}
    # Events for an older or abandoned subscription must not overwrite the current one,
    # unless the user actually paid for it.
    if user.subscription_id and user.subscription_id != sub["id"] and sub.get("status") not in ACTIVE:
        return {"ok": True, "ignored": "stale subscription"}

    _apply_subscription(user, sub)
    payment = (payload.get("payment") or {}).get("entity")
    if name == "subscription.charged" and payment:
        await _record_payment(db, user, payment, sub["id"])
    audit.record(db, f"billing.{name.split('.', 1)[1]}", user_id=user.id, detail=sub["id"])
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return {"ok": True}
