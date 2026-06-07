from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.season import Season


async def get_active_season(session: AsyncSession) -> Season | None:
    result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    return result.scalar_one_or_none()
