import logging
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal, get_db
from app.models.fixture import Fixture
from app.models.player import Player
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
    result = await session.execute(select(Season).order_by(Season.sm_season_id.desc()))
    return result.scalars().all()


@admin_router.post("/seasons/fetch", response_model=list[SeasonResponse])
async def fetch_seasons_from_sportmonks(session: AsyncSession = Depends(get_db)):
    """Fetch all WC seasons from Sportmonks league 732 and upsert into DB."""
    await _upsert_wc_seasons(session)
    result = await session.execute(select(Season).order_by(Season.sm_season_id.desc()))
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


@admin_router.post("/seasons/{season_id}/sync")
async def sync_season(
    season_id: int,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_db),
):
    result = await session.execute(select(Season).where(Season.id == season_id))
    season = result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=404, detail="Season not found")

    _sync_status[season_id] = "syncing"
    background_tasks.add_task(_force_full_sync_for_season, season_id)
    return {"season_id": season_id, "status": "syncing"}



@admin_router.get("/seasons/{season_id}/sync-status", response_model=SyncStatusResponse)
async def get_sync_status(season_id: int):
    return SyncStatusResponse(season_id=season_id, status=_sync_status.get(season_id, "idle"))


# ---------------------------------------------------------------------------
# Shared helpers — used by routers and startup bootstrap
# ---------------------------------------------------------------------------


def _season_display_name(raw_name: str) -> str:
    """Extract the year from a Sportmonks season name, e.g. 'World Cup 2022' → '2022'."""
    m = re.search(r"\b(20\d{2})\b", raw_name)
    return m.group(1) if m else raw_name


async def _upsert_wc_seasons(session: AsyncSession) -> list[Season]:
    """Fetch WC seasons from Sportmonks and upsert (insert or update name) into DB."""
    resp = await client.get("football", "leagues", WC_LEAGUE_ID, params={"include": "seasons"})
    raw = (resp.get("data") or {}).get("seasons") or []
    for s in raw:
        sm_id = s["id"]
        name = _season_display_name(s.get("name") or f"Season {sm_id}")
        result = await session.execute(select(Season).where(Season.sm_season_id == sm_id))
        existing = result.scalars().first()
        if existing is None:
            new_season = Season(name=name, sm_season_id=sm_id, is_active=False)
            session.add(new_season)
            await session.flush()
            await seed_scoring_rules_for_season(session, new_season.id)
        else:
            existing.name = name
    await session.commit()
    result = await session.execute(select(Season).order_by(Season.sm_season_id.desc()))
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


async def _season_has_data(season_id: int) -> bool:
    """Check if a season already has fixtures and players in the DB."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Season).where(Season.id == season_id))
        season = result.scalar_one_or_none()
        if season is None:
            return False

        has_fixtures = (await session.execute(
            select(Fixture.id).where(Fixture.season_id == season.id).limit(1)
        )).first() is not None
        has_players = (await session.execute(
            select(Player.id).where(Player.season_id == season.id).limit(1)
        )).first() is not None

        return has_fixtures and has_players


async def _full_sync_for_season(season_id: int) -> None:
    """Background task: full data sync for the given season."""
    logger.info("Starting full sync for season %d", season_id)
    try:
        if await _season_has_data(season_id):
            logger.info("Season %d already has data, skipping full sync", season_id)
            _sync_status[season_id] = "done"
            return

        from app.services.sync import sync_all_events, sync_event_types, sync_fixtures, sync_teams

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: event types"
            await sync_event_types(session)

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: teams & players"
            await sync_teams(session)

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: fixtures"
            await sync_fixtures(session)

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: events (this may take a while)"
            await sync_all_events(session)
        _sync_status[season_id] = "done"
        logger.info("Full sync for season %d complete", season_id)
    except Exception as exc:
        _sync_status[season_id] = f"error: {exc}"
        logger.exception("Full sync for season %d failed", season_id)



async def _force_full_sync_for_season(season_id: int) -> None:
    """Background task: full data sync for the given season, always runs."""
    logger.info("Starting forced full sync for season %d", season_id)
    try:
        from app.services.sync import sync_all_events, sync_event_types, sync_fixtures, sync_teams

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: event types"
            await sync_event_types(session)

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: teams & players"
            await sync_teams(session, season_id)

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: fixtures"
            await sync_fixtures(session, season_id)

        async with AsyncSessionLocal() as session:
            _sync_status[season_id] = "syncing: events (this may take a while)"
            await sync_all_events(session, season_id)

        _sync_status[season_id] = "done"
        logger.info("Forced full sync for season %d complete", season_id)
    except Exception as exc:
        _sync_status[season_id] = f"error: {exc}"
        logger.exception("Forced full sync for season %d failed", season_id)


async def setup_seasons_on_startup() -> None:
    """Called at startup: fetch WC seasons, ensure WC2026 is active, kick off sync."""
    async with AsyncSessionLocal() as session:
        logger.info("Fetching WC seasons from Sportmonks (league %d)…", WC_LEAGUE_ID)
        try:
            seasons = await _upsert_wc_seasons(session)
        except Exception:
            logger.exception("Failed to fetch seasons from Sportmonks at startup")
            # Fall back to whatever is in the DB
            result = await session.execute(select(Season).order_by(Season.sm_season_id.desc()))
            seasons = list(result.scalars().all())

        if not seasons:
            logger.warning("No seasons available")
            return

        # Always prefer the newest season (highest sm_season_id) as the default
        target = max(seasons, key=lambda s: s.sm_season_id)
        active = next((s for s in seasons if s.is_active), None)

        if active is None or active.sm_season_id != target.sm_season_id:
            logger.info("Activating default season: %s (sm_id=%d)", target.name, target.sm_season_id)
            await _do_activate(session, target)
            active = target

        import asyncio
        logger.info("Active season: %s — triggering full sync", active.name)
        _sync_status[active.id] = "syncing"
        asyncio.create_task(_full_sync_for_season(active.id))
