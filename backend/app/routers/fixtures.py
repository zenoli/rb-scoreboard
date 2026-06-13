from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.event import Event
from app.models.fixture import Fixture, FixtureParticipant
from app.models.season import Season
from app.services.scoring import compute_fixture_data

router = APIRouter()


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
    participants: list[ParticipantResponse]


@router.get("/fixtures", response_model=list[FixtureResponse])
async def get_fixtures(session: AsyncSession = Depends(get_db)):
    season_result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = season_result.scalar_one_or_none()

    stmt = select(Fixture).options(
        selectinload(Fixture.participants).selectinload(FixtureParticipant.team)
    ).order_by(Fixture.starting_at)

    if season is not None:
        stmt = stmt.where(Fixture.season_id == season.id)

    result = await session.execute(stmt)
    fixtures = result.scalars().all()
    return [
        FixtureResponse(
            id=f.id,
            name=f.name,
            starting_at=f.starting_at.isoformat() if f.starting_at else None,
            state=f.state,
            stage_id=f.stage_id,
            round_id=f.round_id,
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

    players, events = await compute_fixture_data(session, fixture)

    return FixtureDetailResponse(
        fixture_id=fixture.id,
        fixture_name=fixture.name,
        state=fixture.state,
        starting_at=fixture.starting_at.isoformat() if fixture.starting_at else None,
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
