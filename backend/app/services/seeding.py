"""Seeds static reference data and default weights on startup."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.position import Position
from app.models.scoring_rule import SCORE_KEYS, ScoringRule
from app.models.season import Season

# Sportmonks v3 position IDs are fixed constants
POSITIONS = [
    {"id": 1, "name": "Goalkeeper", "code": "GK", "category": "GK"},
    {"id": 2, "name": "Defender",   "code": "DEF", "category": "DEF"},
    {"id": 3, "name": "Midfielder", "code": "MID", "category": "MID"},
    {"id": 4, "name": "Attacker",   "code": "FWD", "category": "FWD"},
]

DEFAULT_WEIGHTS = {
    "goal": 1.0,
    "assist": 1.0,
    "yellow_card": 1.0,
    "red_card": 1.0,
    "clean_sheet": 1.0,
    "coach_winner": settings.coach_winner_points,
}


async def seed_positions(session: AsyncSession) -> None:
    for pos in POSITIONS:
        result = await session.execute(select(Position).where(Position.id == pos["id"]))
        if result.scalar_one_or_none() is None:
            session.add(Position(**pos))
    await session.commit()


async def seed_scoring_rules_for_season(session: AsyncSession, season_id: int) -> None:
    """Seed default scoring rules for a season if none exist yet."""
    for key in SCORE_KEYS:
        result = await session.execute(
            select(ScoringRule).where(
                ScoringRule.event_key == key,
                ScoringRule.season_id == season_id,
            )
        )
        if result.scalar_one_or_none() is None:
            session.add(ScoringRule(event_key=key, weight=DEFAULT_WEIGHTS[key], season_id=season_id))
    await session.commit()


async def seed_all(session: AsyncSession) -> None:
    await seed_positions(session)
    # Seed scoring rules for any season that doesn't have them yet
    seasons_result = await session.execute(select(Season))
    for season in seasons_result.scalars().all():
        await seed_scoring_rules_for_season(session, season.id)
