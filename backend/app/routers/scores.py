from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.scoring import UserScore, compute_scores

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
