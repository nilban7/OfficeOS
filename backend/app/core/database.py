from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()
db_url = settings.database_url
if "pooler.supabase.com:5432" in db_url:
    # Use transaction pooler on port 6543 to avoid strict 15-connection session limit
    db_url = db_url.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543")

is_postgres = "postgres" in db_url
engine_kwargs: dict = {
    "pool_pre_ping": True,
    "pool_recycle": 180,  # Recycle connections every 3 minutes before remote poolers drop them
}

if is_postgres:
    engine_kwargs.update({
        "pool_size": 5,
        "max_overflow": 10,
        "pool_timeout": 15,
        "connect_args": {
            "command_timeout": 25,
            "timeout": 10,
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "server_settings": {
                "statement_timeout": "25000",
            },
        },
    })

engine = create_async_engine(db_url, **engine_kwargs)
session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def set_transaction_context(session: AsyncSession, user_id: str, organization_id: str) -> None:
    """Set tenant context on the same transaction used by subsequent queries."""
    await session.execute(text("SET LOCAL ROLE authenticated"))
    await session.execute(
        text("SELECT set_config('app.user_id', :user_id, true)"),
        {"user_id": user_id},
    )
    await session.execute(
        text("SELECT set_config('app.organization_id', :organization_id, true)"),
        {"organization_id": organization_id},
    )
    await session.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": user_id},
    )
    await session.execute(
        text("SELECT set_config('app.current_organization_id', :organization_id, true)"),
        {"organization_id": organization_id},
    )


async def set_user_context(session: AsyncSession, user_id: str) -> None:
    """Set only identity context for organization-discovery endpoints."""
    await session.execute(text("SET LOCAL ROLE authenticated"))
    await session.execute(
        text("SELECT set_config('app.user_id', :user_id, true)"),
        {"user_id": user_id},
    )
    await session.execute(
        text("SELECT set_config('app.current_user_id', :user_id, true)"),
        {"user_id": user_id},
    )