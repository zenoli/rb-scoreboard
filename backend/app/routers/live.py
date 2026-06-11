from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.scoring import LiveData, compute_live_data

router = APIRouter()


class LivePlayerResponse(BaseModel):
    player_id: int
    display_name: str | None
    image_path: str | None
    team_image_path: str | None
    position_category: str | None
    drafted_by_username: str
    total_points: float
    live_points: float
    is_active: bool


class LiveScoreEventResponse(BaseModel):
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


class LiveResponse(BaseModel):
    is_live: bool
    players: list[LivePlayerResponse]
    events: list[LiveScoreEventResponse]


@router.get("/live", response_model=LiveResponse)
async def get_live(session: AsyncSession = Depends(get_db)):
    data: LiveData = await compute_live_data(session)
    return LiveResponse(
        is_live=data.is_live,
        players=[LivePlayerResponse(**p.__dict__) for p in data.players],
        events=[LiveScoreEventResponse(**e.__dict__) for e in data.events],
    )
