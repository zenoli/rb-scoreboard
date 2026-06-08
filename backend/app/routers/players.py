from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.coach import Coach
from app.models.player import Player
from app.models.season import Season
from app.services.scoring import ScoreEvent, compute_player_score_events

router = APIRouter()


class PlayerResponse(BaseModel):
    id: int
    display_name: str | None
    common_name: str | None
    image_path: str | None
    jersey_number: int | None
    team_id: int | None
    team_name: str | None
    team_image_path: str | None
    team_short_code: str | None
    position_id: int | None
    position_name: str | None
    position_category: str | None

    model_config = {"from_attributes": True}


class CoachResponse(BaseModel):
    id: int
    display_name: str | None
    name: str | None
    image_path: str | None
    team_id: int | None
    team_name: str | None
    team_image_path: str | None

    model_config = {"from_attributes": True}


class ScoreEventResponse(BaseModel):
    player_id: int | None
    player_name: str | None
    player_image_path: str | None
    team_name: str | None
    team_image_path: str | None
    opponent_name: str | None
    opponent_image_path: str | None
    event_type: str
    minute: int | None
    points: float
    fixture_name: str | None


async def _get_active_season_id(session: AsyncSession) -> int | None:
    result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = result.scalar_one_or_none()
    return season.id if season else None


@router.get("/players/{player_id}/events", response_model=list[ScoreEventResponse])
async def get_player_score_events(player_id: int, session: AsyncSession = Depends(get_db)):
    events = await compute_player_score_events(session, player_id)
    return [ScoreEventResponse(**e.__dict__) for e in events]


@router.get("/players/{player_id}", response_model=PlayerResponse)
async def get_player(player_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(Player)
        .where(Player.id == player_id)
        .options(selectinload(Player.team), selectinload(Player.position))
    )
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Player not found")
    return PlayerResponse(
        id=p.id,
        display_name=p.display_name,
        common_name=p.common_name,
        image_path=p.image_path,
        jersey_number=p.jersey_number,
        team_id=p.team_id,
        team_name=p.team.name if p.team else None,
        team_image_path=p.team.image_path if p.team else None,
        team_short_code=p.team.short_code if p.team else None,
        position_id=p.position_id,
        position_name=p.position.name if p.position else None,
        position_category=p.position.category if p.position else None,
    )


@router.get("/players", response_model=list[PlayerResponse])
async def get_players(
    team_id: int | None = Query(None),
    position_category: str | None = Query(None),
    season_id: int | None = Query(None),
    session: AsyncSession = Depends(get_db),
):
    if season_id is None:
        season_id = await _get_active_season_id(session)

    stmt = select(Player).options(
        selectinload(Player.team),
        selectinload(Player.position),
    )
    if season_id is not None:
        stmt = stmt.where(Player.season_id == season_id)
    if team_id is not None:
        stmt = stmt.where(Player.team_id == team_id)
    if position_category is not None:
        from app.models.position import Position
        stmt = stmt.join(Position).where(Position.category == position_category)
    result = await session.execute(stmt)
    players = result.scalars().all()
    return [
        PlayerResponse(
            id=p.id,
            display_name=p.display_name,
            common_name=p.common_name,
            image_path=p.image_path,
            jersey_number=p.jersey_number,
            team_id=p.team_id,
            team_name=p.team.name if p.team else None,
            team_image_path=p.team.image_path if p.team else None,
            team_short_code=p.team.short_code if p.team else None,
            position_id=p.position_id,
            position_name=p.position.name if p.position else None,
            position_category=p.position.category if p.position else None,
        )
        for p in players
    ]


@router.get("/coaches", response_model=list[CoachResponse])
async def get_coaches(
    season_id: int | None = Query(None),
    session: AsyncSession = Depends(get_db),
):
    if season_id is None:
        season_id = await _get_active_season_id(session)

    stmt = select(Coach).options(selectinload(Coach.team))
    if season_id is not None:
        stmt = stmt.where(Coach.season_id == season_id)
    result = await session.execute(stmt)
    coaches = result.scalars().all()
    return [
        CoachResponse(
            id=c.id,
            display_name=c.display_name,
            name=c.name,
            image_path=c.image_path,
            team_id=c.team_id,
            team_name=c.team.name if c.team else None,
            team_image_path=c.team.image_path if c.team else None,
        )
        for c in coaches
    ]
