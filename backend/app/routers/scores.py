from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.scoring import (
    ScoreEvent,
    ScoreHistory,
    ScoreHistorySeries,
    UserScore,
    compute_score_history,
    compute_scores,
    compute_user_score_events,
)

router = APIRouter()


class UserScoreResponse(BaseModel):
    user_id: int
    username: str
    is_active: bool
    goals: float
    assists: float
    yellow_cards: float
    red_cards: float
    clean_sheets: float
    coach_winner: float
    total: float


class ScoreboardResponse(BaseModel):
    users: list[UserScoreResponse]


class ScoreHistorySeriesResponse(BaseModel):
    user_id: int
    username: str
    points: list[float]


class ScoreHistoryResponse(BaseModel):
    dates: list[str]
    series: list[ScoreHistorySeriesResponse]


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


@router.get("/scores/history", response_model=ScoreHistoryResponse)
async def get_score_history(session: AsyncSession = Depends(get_db)):
    history = await compute_score_history(session)
    return ScoreHistoryResponse(
        dates=history.dates,
        series=[
            ScoreHistorySeriesResponse(
                user_id=s.user_id,
                username=s.username,
                points=s.points,
            )
            for s in history.series
        ],
    )


@router.get("/scores/{user_id}/events", response_model=list[ScoreEventResponse])
async def get_user_score_events(user_id: int, session: AsyncSession = Depends(get_db)):
    events = await compute_user_score_events(session, user_id)
    return [ScoreEventResponse(**e.__dict__) for e in events]


@router.get("/scores", response_model=ScoreboardResponse)
async def get_scores(session: AsyncSession = Depends(get_db)):
    scores = await compute_scores(session)
    return ScoreboardResponse(
        users=[
            UserScoreResponse(
                user_id=s.user_id,
                username=s.username,
                is_active=s.is_active,
                goals=s.goals,
                assists=s.assists,
                yellow_cards=s.yellow_cards,
                red_cards=s.red_cards,
                clean_sheets=s.clean_sheets,
                coach_winner=s.coach_winner,
                total=s.total,
            )
            for s in sorted(scores, key=lambda x: x.total, reverse=True)
        ]
    )
