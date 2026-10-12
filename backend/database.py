"""
Async SQLAlchemy setup. SQLite locally, Postgres (asyncpg) in production.
"""
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

async_session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


# Columns added after the first release. create_all() never alters existing tables,
# so older databases get these added in place on startup.
_ADDED_COLUMNS = {
    "users": {
        "full_name": "VARCHAR(255)",
        "organization": "VARCHAR(255)",
        "badge_role": "VARCHAR(100)",
        "subscription_id": "VARCHAR(64)",
        "subscription_status": "VARCHAR(20)",
        "plan_interval": "VARCHAR(10)",
        "current_period_end": "TIMESTAMP",
        "cancel_at_period_end": "BOOLEAN DEFAULT FALSE",
    },
    "cases": {
        "case_number": "VARCHAR(50)",
        "description": "TEXT",
        "status": "VARCHAR(20) DEFAULT 'active'",
        "priority": "VARCHAR(20) DEFAULT 'medium'",
        "brief_json": "TEXT",
        "brief_generated_at": "TIMESTAMP",
        "layout_json": "TEXT",
    },
}


def _add_missing_columns(sync_conn) -> None:
    inspector = inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())
    for table, columns in _ADDED_COLUMNS.items():
        if table not in existing_tables:
            continue
        present = {c["name"] for c in inspector.get_columns(table)}
        for name, ddl in columns.items():
            if name not in present:
                sync_conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


async def init_db():
    """Create tables and bring older schemas up to date."""
    import models  # noqa: F401  (registers models on Base.metadata)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


async def get_db():
    """FastAPI dependency yielding a session."""
    async with async_session_maker() as session:
        yield session
