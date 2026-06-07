from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.fixture import Fixture, FixtureParticipant
from app.models.season import Season

router = APIRouter()


class ParticipantResponse(BaseModel):
    team_id: int
    team_name: str | None
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
                    location=p.location,
                )
                for p in f.participants
            ],
        )
        for f in fixtures
    ]
