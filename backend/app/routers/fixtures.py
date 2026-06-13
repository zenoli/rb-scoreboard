from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.event import Event
from app.models.fixture import Fixture, FixtureParticipant
from app.models.player import Player
from app.models.season import Season
from app.services.scoring import (
    ACTIVE_STATES,
    PENALTY_SHOOTOUT_PERIOD,
    _GOAL_TYPES,
    compute_fixture_data,
)

router = APIRouter()

_SCORE_EVENT_TYPES = _GOAL_TYPES | {"OWNGOAL"}


def _compute_score(
    fixture: Fixture,
    player_team_db: dict[int, int],
) -> tuple[int | None, int | None]:
    """Derive home/away score from goal events (excluding penalty shootout)."""
    if fixture.state not in ACTIVE_STATES:
        return None, None
    home_team = next((p.team_id for p in fixture.participants if p.location == "home"), None)
    away_team = next((p.team_id for p in fixture.participants if p.location == "away"), None)
    if home_team is None or away_team is None:
        return None, None

    # player_team: lineups first, then fall back to players table
    player_team: dict[int, int] = dict(player_team_db)
    for lu in fixture.lineups:
        if lu.player_id and lu.team_id:
            player_team[lu.player_id] = lu.team_id

    home_score = 0
    away_score = 0
    for event in fixture.events:
        if not event.event_type or event.period_id == PENALTY_SHOOTOUT_PERIOD:
            continue
        dev = (event.event_type.developer_name or "").upper()
        if dev not in _SCORE_EVENT_TYPES:
            continue

        t = event.team_id or (player_team.get(event.player_id) if event.player_id else None)

        if dev in _GOAL_TYPES:
            if t == home_team:
                home_score += 1
            elif t == away_team:
                away_score += 1
        else:  # OWNGOAL — own team concedes
            if t == home_team:
                away_score += 1
            elif t == away_team:
                home_score += 1

    return home_score, away_score


async def _build_player_team_map(
    session: AsyncSession, player_ids: set[int], season_id: int
) -> dict[int, int]:
    """Return player_id → team_id from the players table for the given season."""
    if not player_ids:
        return {}
    result = await session.execute(
        select(Player.id, Player.team_id)
        .where(Player.id.in_(player_ids))
        .where(Player.season_id == season_id)
        .where(Player.team_id.isnot(None))
    )
    return {row.id: row.team_id for row in result}


class ParticipantResponse(BaseModel):
    team_id: int
    team_name: str | None
    team_image_path: str | None
    location: str | None


class FixtureResponse(BaseModel):
    id: int
    name: str | None
    starting_at: str | None
    state: str | None
    stage_id: int | None
    round_id: int | None
    home_score: int | None
    away_score: int | None
    participants: list[ParticipantResponse]


@router.get("/fixtures", response_model=list[FixtureResponse])
async def get_fixtures(session: AsyncSession = Depends(get_db)):
    season_result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = season_result.scalar_one_or_none()

    stmt = (
        select(Fixture)
        .options(
            selectinload(Fixture.participants).selectinload(FixtureParticipant.team),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
        .order_by(Fixture.starting_at)
    )

    if season is not None:
        stmt = stmt.where(Fixture.season_id == season.id)

    result = await session.execute(stmt)
    fixtures = result.scalars().all()

    # Collect all player_ids from goal/owngoal events across all fixtures
    player_ids: set[int] = set()
    for f in fixtures:
        for ev in f.events:
            if ev.player_id and ev.team_id is None:
                player_ids.add(ev.player_id)

    player_team_db = await _build_player_team_map(session, player_ids, season.id) if season else {}

    return [
        FixtureResponse(
            id=f.id,
            name=f.name,
            starting_at=f.starting_at.isoformat() + 'Z' if f.starting_at else None,
            state=f.state,
            stage_id=f.stage_id,
            round_id=f.round_id,
            home_score=_compute_score(f, player_team_db)[0],
            away_score=_compute_score(f, player_team_db)[1],
            participants=[
                ParticipantResponse(
                    team_id=p.team_id,
                    team_name=p.team.name if p.team else None,
                    team_image_path=p.team.image_path if p.team else None,
                    location=p.location,
                )
                for p in f.participants
            ],
        )
        for f in fixtures
    ]


class FixtureDetailTeamResponse(BaseModel):
    team_id: int
    team_name: str | None
    team_image_path: str | None
    location: str | None


class FixturePlayerResponse(BaseModel):
    player_id: int
    display_name: str | None
    image_path: str | None
    team_image_path: str | None
    position_category: str | None
    drafted_by_username: str
    points: float


class FixtureEventResponse(BaseModel):
    player_id: int | None
    player_name: str | None
    player_image_path: str | None
    team_name: str | None
    team_image_path: str | None
    drafted_by_username: str | None
    event_type: str
    minute: int | None
    points: float
    fixture_name: str | None


class FixtureDetailResponse(BaseModel):
    fixture_id: int
    fixture_name: str | None
    state: str | None
    starting_at: str | None
    home_score: int | None
    away_score: int | None
    participants: list[FixtureDetailTeamResponse]
    players: list[FixturePlayerResponse]
    events: list[FixtureEventResponse]


@router.get("/fixtures/{fixture_id}/detail", response_model=FixtureDetailResponse)
async def get_fixture_detail(fixture_id: int, session: AsyncSession = Depends(get_db)):
    season_result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = season_result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=404, detail="No active season")

    fx_result = await session.execute(
        select(Fixture)
        .where(Fixture.id == fixture_id)
        .where(Fixture.season_id == season.id)
        .options(
            selectinload(Fixture.participants).selectinload(FixtureParticipant.team),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    fixture = fx_result.scalar_one_or_none()
    if fixture is None:
        raise HTTPException(status_code=404, detail="Fixture not found")

    if not fixture.participants:
        raise HTTPException(status_code=404, detail="Fixture has no teams assigned yet")

    player_ids = {ev.player_id for ev in fixture.events if ev.player_id and ev.team_id is None}
    player_team_db = await _build_player_team_map(session, player_ids, season.id)

    home_score, away_score = _compute_score(fixture, player_team_db)
    players, events = await compute_fixture_data(session, fixture)

    return FixtureDetailResponse(
        fixture_id=fixture.id,
        fixture_name=fixture.name,
        state=fixture.state,
        starting_at=fixture.starting_at.isoformat() + 'Z' if fixture.starting_at else None,
        home_score=home_score,
        away_score=away_score,
        participants=[
            FixtureDetailTeamResponse(
                team_id=p.team_id,
                team_name=p.team.name if p.team else None,
                team_image_path=p.team.image_path if p.team else None,
                location=p.location,
            )
            for p in fixture.participants
        ],
        players=[FixturePlayerResponse(**p.__dict__) for p in players],
        events=[FixtureEventResponse(**e.__dict__) for e in events],
    )
