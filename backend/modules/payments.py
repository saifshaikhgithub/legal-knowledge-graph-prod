"""
Razorpay REST client for recurring subscriptions (cards, UPI AutoPay, e-mandates).

Uses the HTTP API directly (httpx is already installed via the OpenAI SDK) rather than the
synchronous razorpay SDK, so payment calls never block the event loop.
"""
import hashlib
import hmac
from typing import Any, Dict, Optional

import httpx

import config

BASE_URL = "https://api.razorpay.com/v1"

# interval -> (Razorpay period, price in rupees, number of billing cycles before the mandate ends)
PLANS = {
    "monthly": ("monthly", config.PRO_MONTHLY_PRICE_INR, 120),
    "yearly": ("yearly", config.PRO_YEARLY_PRICE_INR, 10),
}

_plan_ids: Dict[str, str] = {}


class RazorpayError(Exception):
    pass


def enabled() -> bool:
    return bool(config.RAZORPAY_KEY_ID and config.RAZORPAY_KEY_SECRET)


async def _call(method: str, path: str, *, json: Optional[dict] = None, params: Optional[dict] = None) -> Any:
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=20,
                                 auth=(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)) as client:
        response = await client.request(method, path, json=json, params=params)
    if response.status_code >= 400:
        try:
            message = response.json()["error"]["description"]
        except Exception:
            message = response.text[:300]
        raise RazorpayError(f"Razorpay {response.status_code}: {message}")
    return response.json()


def _notes(entity: dict) -> dict:
    notes = entity.get("notes")
    return notes if isinstance(notes, dict) else {}  # Razorpay sends [] when there are no notes


async def plan_id(interval: str) -> str:
    """
    The Razorpay plan for an interval. Uses the configured id when set; otherwise finds the plan this
    app created earlier for the same price, or creates it. Changing the price creates a new plan, and
    existing subscribers stay on the old price until they resubscribe.
    """
    configured = config.RAZORPAY_PLAN_MONTHLY if interval == "monthly" else config.RAZORPAY_PLAN_YEARLY
    if configured:
        return configured
    if interval in _plan_ids:
        return _plan_ids[interval]

    period, price, _ = PLANS[interval]
    amount = price * 100  # paise
    marker = f"pro-{interval}-{amount}"
    skip = 0
    while True:
        page = await _call("GET", "/plans", params={"count": 100, "skip": skip})
        items = page.get("items", [])
        for plan in items:
            if _notes(plan).get("app_plan") == marker:
                _plan_ids[interval] = plan["id"]
                return plan["id"]
        if len(items) < 100:
            break
        skip += 100

    plan = await _call("POST", "/plans", json={
        "period": period,
        "interval": 1,
        "item": {
            "name": f"{config.PRODUCT_NAME} Pro ({interval})",
            "amount": amount,
            "currency": "INR",
            "description": f"{config.PRODUCT_NAME} Pro, billed {interval}",
        },
        "notes": {"app_plan": marker},
    })
    _plan_ids[interval] = plan["id"]
    return plan["id"]


async def create_subscription(interval: str, user_id: int) -> dict:
    _, _, total_count = PLANS[interval]
    return await _call("POST", "/subscriptions", json={
        "plan_id": await plan_id(interval),
        "total_count": total_count,
        "quantity": 1,
        "customer_notify": 1,
        "notes": {"user_id": str(user_id), "interval": interval},
    })


async def fetch_subscription(subscription_id: str) -> dict:
    return await _call("GET", f"/subscriptions/{subscription_id}")


async def fetch_payment(payment_id: str) -> dict:
    return await _call("GET", f"/payments/{payment_id}")


async def cancel_subscription(subscription_id: str, at_cycle_end: bool = True) -> dict:
    return await _call("POST", f"/subscriptions/{subscription_id}/cancel",
                       json={"cancel_at_cycle_end": 1 if at_cycle_end else 0})


def subscription_user_id(subscription: dict) -> Optional[int]:
    try:
        return int(_notes(subscription).get("user_id"))
    except (TypeError, ValueError):
        return None


def subscription_interval(subscription: dict) -> Optional[str]:
    interval = _notes(subscription).get("interval")
    return interval if interval in PLANS else None


def _hmac(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_checkout(payment_id: str, subscription_id: str, signature: str) -> bool:
    """Signature Razorpay Checkout returns after a subscription's first payment."""
    expected = _hmac(config.RAZORPAY_KEY_SECRET, f"{payment_id}|{subscription_id}".encode())
    return hmac.compare_digest(expected, signature or "")


def verify_webhook(body: bytes, signature: str) -> bool:
    if not config.RAZORPAY_WEBHOOK_SECRET:
        return False
    return hmac.compare_digest(_hmac(config.RAZORPAY_WEBHOOK_SECRET, body), signature or "")
