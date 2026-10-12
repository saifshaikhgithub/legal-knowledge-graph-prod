"""
Central configuration. Every setting comes from the environment (or backend/.env).
"""
import os
import secrets

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


PRODUCT_NAME = os.getenv("PRODUCT_NAME", "Sentinel")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
IS_PRODUCTION = ENVIRONMENT == "production"

# ---- LLM (NVIDIA NIM / any OpenAI-compatible endpoint) ----
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")
LLM_API_KEY = (os.getenv("NVIDIA_API_KEY") or os.getenv("LLM_API_KEY") or "").strip()
# Deep reasoning: case analysis, briefs, suspect assessment
REASONING_MODEL = os.getenv("REASONING_MODEL", "nvidia/nemotron-3-super-120b-a12b")
# Structured extraction: entities / relations / timeline as JSON
EXTRACTION_MODEL = os.getenv("EXTRACTION_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
# Image evidence description
VISION_MODEL = os.getenv("VISION_MODEL", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning")
# Backups used automatically when the free hosted endpoint for a model is overloaded (HTTP 429/5xx/timeout).
REASONING_FALLBACK_MODEL = os.getenv("REASONING_FALLBACK_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b")
EXTRACTION_FALLBACK_MODEL = os.getenv("EXTRACTION_FALLBACK_MODEL", "nvidia/nemotron-3-super-120b-a12b")
# Optional: DeepSeek V4.1 Flash also reads images, but takes ~2 minutes per photo on the free tier.
VISION_FALLBACK_MODEL = os.getenv("VISION_FALLBACK_MODEL", "")
LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "180"))
# Show the analyst's step-by-step reasoning in chat (slower, but transparent and more thorough).
ANALYST_THINKING = _bool("ANALYST_THINKING", True)

# ---- Database ----
def _normalize_db_url(url: str) -> str:
    """Accept the URL formats hosting providers hand out and pick the async driver."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgresql+asyncpg://") and "?" in url:
        # Neon/Supabase URLs carry libpq options that asyncpg doesn't understand.
        base, query = url.split("?", 1)
        params = []
        for p in query.split("&"):
            key = p.split("=", 1)[0]
            if key == "sslmode":
                params.append("ssl=" + p.split("=", 1)[1])
            elif key != "channel_binding":
                params.append(p)
        url = base + ("?" + "&".join(params) if params else "")
    if url.startswith("sqlite:///"):
        url = "sqlite+aiosqlite:///" + url[len("sqlite:///"):]
    return url


DATABASE_URL = _normalize_db_url(os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./crime_investigation.db"))

# ---- Auth ----
SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    if IS_PRODUCTION:
        raise RuntimeError("SECRET_KEY must be set in production")
    # Dev only: random per process, so tokens reset on restart instead of using a guessable default.
    SECRET_KEY = secrets.token_urlsafe(48)
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "12"))
# Comma-separated invite codes. When set, registration requires one (agency onboarding).
INVITE_CODES = {c.strip() for c in os.getenv("INVITE_CODES", "").split(",") if c.strip()}

# ---- HTTP ----
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if o.strip()
]
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
CHAT_RATE_LIMIT_PER_MIN = int(os.getenv("CHAT_RATE_LIMIT_PER_MIN", "20"))
DEBUG_ERRORS = _bool("DEBUG_ERRORS", not IS_PRODUCTION)

# ---- Billing (Razorpay subscriptions, INR) ----
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()  # pasted values often carry a newline
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "").strip()
# Optional: plan ids from the Razorpay dashboard. Left empty, matching plans are found or created on first use.
RAZORPAY_PLAN_MONTHLY = os.getenv("RAZORPAY_PLAN_MONTHLY", "")
RAZORPAY_PLAN_YEARLY = os.getenv("RAZORPAY_PLAN_YEARLY", "")
PRO_MONTHLY_PRICE_INR = int(os.getenv("PRO_MONTHLY_PRICE_INR", "2900"))
PRO_YEARLY_PRICE_INR = int(os.getenv("PRO_YEARLY_PRICE_INR", "20000"))

# Monthly allowances. Free is a taste of the product; Pro limits are a fair-use ceiling, not a selling point.
FREE_LIMITS = {
    "cases": int(os.getenv("FREE_CASE_LIMIT", "2")),
    "messages": int(os.getenv("FREE_MESSAGES_PER_MONTH", "30")),
    "uploads": int(os.getenv("FREE_UPLOADS_PER_MONTH", "5")),
    "briefs": int(os.getenv("FREE_BRIEFS_PER_MONTH", "2")),
}
PRO_LIMITS = {
    "cases": int(os.getenv("PRO_CASE_LIMIT", "1000")),
    "messages": int(os.getenv("PRO_MESSAGES_PER_MONTH", "3000")),
    "uploads": int(os.getenv("PRO_UPLOADS_PER_MONTH", "1000")),
    "briefs": int(os.getenv("PRO_BRIEFS_PER_MONTH", "300")),
}
# Comma-separated emails that always get Pro (founders, pilot agencies on invoice billing).
PRO_EMAILS = {e.strip().lower() for e in os.getenv("PRO_EMAILS", "").split(",") if e.strip()}
