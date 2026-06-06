from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.coach import Coach
from app.models.draft import Draft
from app.models.player import Player
from app.models.position import Position
from app.models.team import Team
from app.models.user import User
from app.services.scoring import compute_player_points

router = APIRouter()


class PlayerBrief(BaseModel):
    id: int
    display_name: str | None
    image_path: str | None
    team_name: str | None
    position_category: str | None

    model_config = {"from_attributes": True}


class CoachBrief(BaseModel):
    id: int
    display_name: str | None
    image_path: str | None
    team_name: str | None

    model_config = {"from_attributes": True}


class UserDraftResponse(BaseModel):
    user_id: int
    username: str
    is_active: bool
    players: list[PlayerBrief]
    coach: CoachBrief | None


class PlayerPointsResponse(BaseModel):
    player_id: int
    points: float


@router.get("/drafts/{user_id}/points", response_model=list[PlayerPointsResponse])
async def get_draft_points(user_id: int, session: AsyncSession = Depends(get_db)):
    points = await compute_player_points(session, user_id)
    return [PlayerPointsResponse(player_id=pid, points=pts) for pid, pts in points.items()]


@router.get("/drafts", response_model=list[UserDraftResponse])
async def get_drafts(session: AsyncSession = Depends(get_db)):
    users_result = await session.execute(
        select(User).options(
            selectinload(User.draft_entries)
            .selectinload(Draft.player)
            .selectinload(Player.team),
            selectinload(User.draft_entries)
            .selectinload(Draft.player)
            .selectinload(Player.position),
            selectinload(User.draft_entries)
            .selectinload(Draft.coach)
            .selectinload(Coach.team),
        )
    )
    users: list[User] = list(users_result.scalars().unique().all())

    result = []
    for user in users:
        players = []
        coach = None
        for entry in user.draft_entries:
            if entry.player:
                p = entry.player
                players.append(PlayerBrief(
                    id=p.id,
                    display_name=p.display_name,
                    image_path=p.image_path,
                    team_name=p.team.name if p.team else None,
                    position_category=p.position.category if p.position else None,
                ))
            if entry.coach:
                c = entry.coach
                coach = CoachBrief(
                    id=c.id,
                    display_name=c.display_name,
                    image_path=c.image_path,
                    team_name=c.team.name if c.team else None,
                )
        result.append(UserDraftResponse(
            user_id=user.id,
            username=user.username,
            is_active=user.is_active,
            players=players,
            coach=coach,
        ))
    return result
