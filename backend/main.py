"""
Crime Investigation GPT API.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import config
from database import init_db
from routers import auth as auth_router
from routers import billing as billing_router
from routers import cases as cases_router
from routers import investigation as investigation_router

VERSION = "3.0.0"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="Crime Investigation GPT API",
    version=VERSION,
    lifespan=lifespan,
    docs_url=None if config.IS_PRODUCTION else "/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    print(f"[ERROR] {request.method} {request.url.path}: {type(exc).__name__}: {exc}")
    detail = f"{type(exc).__name__}: {exc}" if config.DEBUG_ERRORS else "Internal server error"
    return JSONResponse(status_code=500, content={"detail": detail})


app.include_router(auth_router.router)
app.include_router(cases_router.router)
app.include_router(investigation_router.router)
app.include_router(billing_router.router)


@app.get("/")
async def root():
    return {"message": "Crime Investigation GPT API", "version": VERSION}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": VERSION,
        "ai_online": investigation_router.analyst.ready,
        "reasoning_model": config.REASONING_MODEL,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
