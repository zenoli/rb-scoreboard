"""Sportmonks → SQLite sync logic."""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.services.scoring import LIVE_STATES
from app.models.coach import Coach
from app.models.event import Event
from app.models.event_type import EventType
from app.models.fixture import Fixture, FixtureParticipant
from app.models.lineup import Lineup
from app.models.player import Player
from app.models.season import Season
from app.models.team import Team
from app.sportmonks import client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

async def _upsert(session: AsyncSession, model, rows: list[dict]) -> None:
    if not rows:
        return
    stmt = sqlite_insert(model).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={k: stmt.excluded[k] for k in rows[0] if k != "id"},
    )
    await session.execute(stmt)
    await session.commit()


async def _upsert_composite(
    session: AsyncSession,
    model,
    rows: list[dict],
    pk_cols: list[str],
) -> None:
    if not rows:
        return
    stmt = sqlite_insert(model).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=pk_cols,
        set_={k: stmt.excluded[k] for k in rows[0] if k not in pk_cols},
    )
    await session.execute(stmt)
    await session.commit()


# ---------------------------------------------------------------------------
# Season helpers
# ---------------------------------------------------------------------------

async def _get_active_season(session: AsyncSession) -> Season:
    result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = result.scalar_one_or_none()
    if season is None:
        raise RuntimeError("No active season configured. Create and activate a season first.")
    return season


async def _get_season(session: AsyncSession, season_id: int | None = None) -> Season:
    if season_id is None:
        return await _get_active_season(session)
    result = await session.execute(select(Season).where(Season.id == season_id))
    season = result.scalar_one_or_none()
    if season is None:
        raise RuntimeError(f"Season {season_id} not found.")
    return season


# ---------------------------------------------------------------------------
# Sync functions
# ---------------------------------------------------------------------------


async def sync_event_types(session: AsyncSession) -> None:
    logger.info("Syncing event types...")
    raw = await client.get_paginated("core", "types", params={"per_page": 1000})
    rows = [
        {
            "id": t["id"],
            "name": t.get("name"),
            "code": t.get("code"),
            "developer_name": t.get("developer_name"),
        }
        for t in raw
    ]
    await _upsert(session, EventType, rows)
    logger.info("Synced %d event types", len(rows))


async def sync_teams(session: AsyncSession, season_id: int | None = None) -> None:
    season = await _get_season(session, season_id)
    logger.info("Syncing teams, players, and coaches for season %s...", season.name)
    raw = await client.get_paginated(
        "football", "teams", "seasons", season.sm_season_id,
        params={"include": "players.player;coaches"},
    )

    team_rows: list[dict] = []
    player_rows: list[dict] = []
    coach_rows: list[dict] = []

    for t in raw:
        # Only national teams
        if t.get("type") != "national":
            continue

        team_rows.append({
            "id": t["id"],
            "name": t["name"],
            "short_code": t.get("short_code"),
            "image_path": t.get("image_path"),
            "country_id": t.get("country_id"),
        })

        for tp in t.get("players", []):
            p = tp.get("player") or {}
            player_rows.append({
                "id": p.get("id") or tp.get("player_id"),
                "season_id": season.id,
                "common_name": p.get("common_name"),
                "display_name": p.get("display_name"),
                "image_path": p.get("image_path"),
                "team_id": t["id"],
                "position_id": p.get("position_id"),
                "jersey_number": tp.get("jersey_number") or p.get("jersey_number"),
            })

        for c in t.get("coaches", []):
            if not c.get("active", True):
                continue
            coach_rows.append({
                "id": c["id"],
                "season_id": season.id,
                "name": c.get("name"),
                "display_name": c.get("display_name"),
                "image_path": c.get("image_path"),
                "team_id": t["id"],
                "country_id": c.get("country_id"),
            })

    # Filter out players with no id
    player_rows = [r for r in player_rows if r.get("id")]

    await _upsert(session, Team, team_rows)
    await _upsert_composite(session, Player, player_rows, ["id", "season_id"])
    await _upsert_composite(session, Coach, coach_rows, ["id", "season_id"])
    logger.info(
        "Synced %d teams, %d players, %d coaches",
        len(team_rows), len(player_rows), len(coach_rows),
    )


async def sync_fixtures(session: AsyncSession, season_id: int | None = None) -> None:
    """Sync fixtures from the schedules endpoint (data → stages → rounds → fixtures)."""
    season = await _get_season(session, season_id)
    logger.info("Syncing fixtures for season %s...", season.name)
    data = await client.get(
        "football", "schedules", "seasons", season.sm_season_id,
    )
    raw_fixtures = _flatten_schedule_fixtures(data.get("data", []))

    fixture_rows: list[dict] = []
    participant_rows: list[dict] = []

    for f in raw_fixtures:
        fixture_rows.append({
            "id": f["id"],
            "season_id": season.id,
            "name": f.get("name"),
            "starting_at": _parse_dt(f.get("starting_at")),
            "stage_id": f.get("stage_id"),
            "round_id": f.get("round_id"),
        })
        for p in f.get("participants", []):
            participant_rows.append({
                "fixture_id": f["id"],
                "team_id": p["id"],
                "location": (p.get("meta") or {}).get("location"),
            })

    await _upsert(session, Fixture, fixture_rows)
    if participant_rows:
        await _upsert_composite(session, FixtureParticipant, participant_rows, ["fixture_id", "team_id"])
    logger.info("Synced %d fixtures, %d participants", len(fixture_rows), len(participant_rows))


async def sync_all_events(session: AsyncSession, season_id: int | None = None) -> None:
    """Sync events for ALL fixtures of the given (or active) season regardless of state."""
    season = await _get_season(session, season_id)
    logger.info("Syncing events for all fixtures of season %s...", season.name)
    result = await session.execute(
        select(Fixture.id).where(Fixture.season_id == season.id)
    )
    all_ids = list(result.scalars().all())
    if not all_ids:
        logger.info("No fixtures found for active season")
        return
    await _sync_events_for_fixtures(session, all_ids)


async def sync_events(session: AsyncSession) -> None:
    """Sync events only for fixtures that are currently LIVE or recently finished."""
    season = await _get_active_season(session)
    logger.info("Syncing events for active fixtures of season %s...", season.name)
    active_ids = await _active_fixture_ids(session, season.id)
    if not active_ids:
        logger.info("No active fixtures, skipping event sync")
        return

    await _sync_events_for_fixtures(session, active_ids)


async def _sync_events_for_fixtures(session: AsyncSession, fixture_ids: list[int]) -> None:
    event_rows: list[dict] = []
    for fixture_id in fixture_ids:
        raw = await client.get(
            "football", "fixtures", fixture_id,
            params={"include": "events;state"},
        )
        fixture_data = raw.get("data", {})
        state = _extract_state(fixture_data)
        if state is not None:
            await session.execute(
                Fixture.__table__.update()
                .where(Fixture.id == fixture_id)
                .values(state=state)
            )
        for e in fixture_data.get("events", []):
            event_rows.append({
                "id": e["id"],
                "fixture_id": fixture_id,
                "team_id": e.get("team_id"),
                "player_id": e.get("player_id"),
                "related_player_id": e.get("related_player_id"),
                "type_id": e.get("type_id"),
                "period_id": e.get("period_id"),
                "minute": e.get("minute"),
                "extra_minute": e.get("extra_minute"),
            })

    if fixture_ids:
        await session.execute(
            Event.__table__.delete().where(Event.fixture_id.in_(fixture_ids))
        )
    await _upsert(session, Event, event_rows)
    await session.commit()
    logger.info("Synced %d events across %d fixtures", len(event_rows), len(fixture_ids))


async def sync_lineups(session: AsyncSession) -> None:
    """Sync lineups for fixtures transitioning to LIVE."""
    season = await _get_active_season(session)
    logger.info("Syncing lineups for season %s...", season.name)
    active_ids = await _active_fixture_ids(session, season.id)
    if not active_ids:
        return

    await _sync_lineups_for_fixtures(session, active_ids)


async def sync_all_lineups(session: AsyncSession, season_id: int | None = None) -> None:
    """Sync lineups for ALL fixtures of the given (or active) season regardless of state."""
    season = await _get_season(session, season_id)
    logger.info("Syncing lineups for all fixtures of season %s...", season.name)
    result = await session.execute(
        select(Fixture.id).where(Fixture.season_id == season.id)
    )
    all_ids = list(result.scalars().all())
    if not all_ids:
        logger.info("No fixtures found for active season")
        return
    await _sync_lineups_for_fixtures(session, all_ids)


async def _sync_lineups_for_fixtures(session: AsyncSession, fixture_ids: list[int]) -> None:
    lineup_rows: list[dict] = []
    for fixture_id in fixture_ids:
        raw = await client.get(
            "football", "fixtures", fixture_id,
            params={"include": "lineups"},
        )
        for lu in raw.get("data", {}).get("lineups", []):
            lineup_rows.append({
                "id": lu["id"],
                "fixture_id": fixture_id,
                "player_id": lu.get("player_id"),
                "team_id": lu.get("team_id"),
                "type_id": lu.get("type_id"),
                "position": lu.get("position"),
            })

    await _upsert(session, Lineup, lineup_rows)
    await session.commit()
    logger.info("Synced %d lineup entries across %d fixtures", len(lineup_rows), len(fixture_ids))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _flatten_schedule_fixtures(data: list | dict) -> list[dict]:
    """Traverse data → (stages →) rounds → fixtures and return a flat fixture list."""
    fixtures: list[dict] = []
    items = data if isinstance(data, list) else [data]
    for item in items:
        stages = item.get("stages") if isinstance(item, dict) else None
        rounds_src = stages if stages is not None else [item]
        for stage in (rounds_src if isinstance(rounds_src, list) else [rounds_src]):
            for round_ in (stage.get("rounds", []) if isinstance(stage, dict) else []):
                for fixture in (round_.get("fixtures", []) if isinstance(round_, dict) else []):
                    fixtures.append(fixture)
            for fixture in (stage.get("fixtures", []) if isinstance(stage, dict) else []):
                fixtures.append(fixture)
    return fixtures


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _extract_state(fixture_data: dict) -> str | None:
    state = fixture_data.get("state")
    if isinstance(state, dict):
        return state.get("developer_name") or state.get("short_name") or state.get("name")
    return state


async def _active_fixture_ids(session: AsyncSession, season_id: int) -> list[int]:
    """Return IDs of fixtures for the given season that are live or recently started."""
    from datetime import timedelta
    from app.config import settings

    now = datetime.utcnow()
    window_start = now - timedelta(minutes=settings.match_window_after_minutes)
    window_end = now + timedelta(minutes=settings.match_window_before_minutes)

    result = await session.execute(
        select(Fixture.id).where(
            Fixture.season_id == season_id,
        ).where(
            (Fixture.starting_at >= window_start) & (Fixture.starting_at <= window_end)
            | (Fixture.state.in_(list(LIVE_STATES)))
        )
    )
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Entry point used by scheduler and admin router
# ---------------------------------------------------------------------------

SYNC_TARGETS = {
    "event_types": sync_event_types,
    "teams": sync_teams,
    "fixtures": sync_fixtures,
    "events": sync_events,
    "all_events": sync_all_events,
    "lineups": sync_lineups,
    "all_lineups": sync_all_lineups,
}


async def run_sync(target: str) -> None:
    async with AsyncSessionLocal() as session:
        fn = SYNC_TARGETS.get(target)
        if fn is None:
            raise ValueError(f"Unknown sync target: {target}")
        await fn(session)
