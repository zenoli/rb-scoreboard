from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.coach import Coach
from app.models.player import Player

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

    model_config = {"from_attributes": True}


@router.get("/players", response_model=list[PlayerResponse])
async def get_players(
    team_id: int | None = Query(None),
    position_category: str | None = Query(None),
    session: AsyncSession = Depends(get_db),
):
    stmt = select(Player).options(
        selectinload(Player.team),
        selectinload(Player.position),
    )
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
async def get_coaches(session: AsyncSession = Depends(get_db)):
    result = await session.execute(
        select(Coach).options(selectinload(Coach.team))
    )
    coaches = result.scalars().all()
    return [
        CoachResponse(
            id=c.id,
            display_name=c.display_name,
            name=c.name,
            image_path=c.image_path,
            team_id=c.team_id,
            team_name=c.team.name if c.team else None,
        )
        for c in coaches
    ]
