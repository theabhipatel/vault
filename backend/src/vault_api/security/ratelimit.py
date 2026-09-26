"""Fixed-window rate limiting backed by PostgreSQL, so limits hold across API instances."""

from datetime import timedelta

from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from vault_api.db import SessionLocal, utcnow
from vault_api.models import RateLimit


class RateLimited(Exception):
    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many attempts")
        self.retry_after = retry_after


async def hit(key: str, limit: int, window: timedelta) -> None:
    """Count one attempt against `key`; raise RateLimited if the limit is exceeded.

    Uses its own transaction so the counter persists even if the request fails later.
    """
    now = utcnow()
    expired = RateLimit.window_start < now - window
    stmt = insert(RateLimit).values(key=key, window_start=now, count=1)
    stmt = stmt.on_conflict_do_update(
        index_elements=[RateLimit.key],
        set_={
            # Start a new window when the old one has elapsed, otherwise increment.
            "count": case((expired, 1), else_=RateLimit.count + 1),
            "window_start": case((expired, now), else_=RateLimit.window_start),
        },
    )
    async with SessionLocal() as db:
        result = await db.execute(stmt.returning(RateLimit.count, RateLimit.window_start))
        count, window_start = result.one()
        await db.commit()
    if count > limit:
        raise RateLimited(max(int((window_start + window - now).total_seconds()), 1))


async def is_limited(key: str, limit: int, window: timedelta) -> int | None:
    """Return seconds until reset if `key` is at/over its limit, without counting an attempt."""
    now = utcnow()
    async with SessionLocal() as db:
        row = (await db.execute(select(RateLimit).where(RateLimit.key == key))).scalar_one_or_none()
    if row is None or row.window_start + window <= now or row.count < limit:
        return None
    return max(int((row.window_start + window - now).total_seconds()), 1)


async def reset(key: str) -> None:
    async with SessionLocal() as db:
        await db.execute(delete(RateLimit).where(RateLimit.key == key))
        await db.commit()


async def purge_expired(db: AsyncSession, older_than: timedelta) -> None:
    await db.execute(delete(RateLimit).where(RateLimit.window_start < utcnow() - older_than))
