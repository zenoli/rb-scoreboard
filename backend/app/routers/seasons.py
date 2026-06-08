import asyncio
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models.season import Season, SeasonParticipant
from app.models.user import User
from app.routers.deps import require_admin_key
from app.services.seeding import seed_scoring_rules_for_season
from app.sportmonks import client

WC_LEAGUE_ID = 732

logger = logging.getLogger(__name__)

# In-memory sync status: season_id -> status string
_sync_status: dict[int, str] = {}

# Public router — mounted at /api
public_router = APIRouter()

# Admin router — mounted at /admin
admin_router = APIRouter(dependencies=[Depends(require_admin_key)])


class SeasonResponse(BaseModel):
    id: int
    name: str
    sm_season_id: int
    is_active: bool

    model_config = {"from_attributes": True}


class SyncStatusResponse(BaseModel):
    season_id: int
    status: str


@public_router.get("/seasons", response_model=list[SeasonResponse])
async def list_seasons(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Season).order_by(Season.id))
    return result.scalars().all()


@admin_router.post("/seasons/fetch", response_model=list[SeasonResponse])
async def fetch_seasons_from_sportmonks(session: AsyncSession = Depends(get_db)):
    """Fetch all WC seasons from Sportmonks league 732 and upsert into DB."""
    await _upsert_wc_seasons(session)
    result = await session.execute(select(Season).order_by(Season.id))
    return result.scalars().all()


@admin_router.put("/seasons/{season_id}/activate", response_model=SeasonResponse)
async def activate_season(
    season_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(Season).where(Season.id == season_id))
    season = result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=404, detail="Season not found")

    await _do_activate(session, season)

    _sync_status[season_id] = "syncing"
    background_tasks.add_task(_full_sync_for_season, season_id)

    return season


@admin_router.get("/seasons/{season_id}/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(season_id: int):
    return SyncStatusResponse(season_id=season_id, status=_sync_status.get(season_id, "idle"))


# ---------------------------------------------------------------------------
# Shared helpers — used by routers and startup bootstrap
# ---------------------------------------------------------------------------


async def _upsert_wc_seasons(session: AsyncSession) -> list[Season]:
    """Fetch WC seasons from Sportmonks and insert any that don't exist yet."""
    resp = await client.get("football", "leagues", WC_LEAGUE_ID, params={"include": "seasons"})
    raw = (resp.get("data") or {}).get("seasons") or []
    for s in raw:
        sm_id = s["id"]
        name = s.get("name") or f"Season {sm_id}"
        existing = await session.execute(select(Season).where(Season.sm_season_id == sm_id))
        if existing.scalar_one_or_none() is None:
            new_season = Season(name=name, sm_season_id=sm_id, is_active=False)
            session.add(new_season)
            await session.flush()
            await seed_scoring_rules_for_season(session, new_season.id)
    await session.commit()
    result = await session.execute(select(Season).order_by(Season.id))
    return list(result.scalars().all())


async def _do_activate(session: AsyncSession, season: Season) -> None:
    """Flip is_active flags, enroll all users, seed scoring rules."""
    all_result = await session.execute(select(Season))
    for s in all_result.scalars().all():
        s.is_active = False
    season.is_active = True

    users_result = await session.execute(select(User))
    for user in users_result.scalars().all():
        stmt = (
            sqlite_insert(SeasonParticipant)
            .values(user_id=user.id, season_id=season.id, is_active=True)
            .on_conflict_do_nothing()
        )
        await session.execute(stmt)

    await session.commit()
    await session.refresh(season)
    await seed_scoring_rules_for_season(session, season.id)


async def _full_sync_for_season(season_id: int) -> None:
    """Background task: full data sync for the given season."""
    logger.info("Starting full sync for season %d", season_id)
    try:
        from app.services.sync import sync_all_events, sync_event_types, sync_fixtures, sync_teams

        async with AsyncSessionLocal() as session:
            await sync_event_types(session)
            await sync_teams(session)
            await sync_fixtures(session)
            await sync_all_events(session)
        _sync_status[season_id] = "done"
        logger.info("Full sync for season %d complete", season_id)
    except Exception as exc:
        _sync_status[season_id] = f"error: {exc}"
        logger.exception("Full sync for season %d failed", season_id)


async def bootstrap_seasons_if_empty() -> None:
    """Called at startup: fetch WC seasons and activate WC2026 if DB is empty."""
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(Season))
        if existing.scalars().all():
            return  # already populated

        logger.info("No seasons found — fetching from Sportmonks (league %d)…", WC_LEAGUE_ID)
        try:
            seasons = await _upsert_wc_seasons(session)
        except Exception:
            logger.exception("Failed to fetch seasons from Sportmonks at startup")
            return

        if not seasons:
            logger.warning("Sportmonks returned no seasons for league %d", WC_LEAGUE_ID)
            return

        # Prefer the season whose name contains "2026", otherwise pick highest sm_season_id
        target = next((s for s in seasons if "2026" in s.name), None)
        if target is None:
            target = max(seasons, key=lambda s: s.sm_season_id)

        logger.info("Auto-activating season: %s (sm_id=%d)", target.name, target.sm_season_id)
        await _do_activate(session, target)
        _sync_status[target.id] = "syncing"
        asyncio.create_task(_full_sync_for_season(target.id))
