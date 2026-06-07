from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.coach import Coach
from app.models.draft import Draft
from app.models.player import Player
from app.models.season import Season, SeasonParticipant
from app.models.user import User
from app.services.scoring import compute_player_points

router = APIRouter()


class PlayerBrief(BaseModel):
    id: int
    display_name: str | None
    image_path: str | None
    team_name: str | None
    team_image_path: str | None
    position_category: str | None

    model_config = {"from_attributes": True}


class CoachBrief(BaseModel):
    id: int
    display_name: str | None
    image_path: str | None
    team_name: str | None
    team_image_path: str | None

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
    # Get active season
    season_result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = season_result.scalar_one_or_none()
    if season is None:
        return []

    # Load all users
    users_result = await session.execute(select(User))
    users: list[User] = list(users_result.scalars().unique().all())

    # Load season participants for active season
    sp_result = await session.execute(
        select(SeasonParticipant).where(SeasonParticipant.season_id == season.id)
    )
    sp_map = {sp.user_id: sp.is_active for sp in sp_result.scalars().all()}

    # Load draft entries for active season
    drafts_result = await session.execute(
        select(Draft)
        .where(Draft.season_id == season.id)
        .options(
            selectinload(Draft.player).selectinload(Player.team),
            selectinload(Draft.player).selectinload(Player.position),
            selectinload(Draft.coach).selectinload(Coach.team),
        )
    )
    draft_entries = list(drafts_result.scalars().all())

    # Group entries by user
    from collections import defaultdict
    entries_by_user: dict[int, list[Draft]] = defaultdict(list)
    for entry in draft_entries:
        entries_by_user[entry.user_id].append(entry)

    result = []
    for user in users:
        entries = entries_by_user[user.id]
        players = []
        coach = None
        for entry in entries:
            if entry.player:
                p = entry.player
                players.append(PlayerBrief(
                    id=p.id,
                    display_name=p.display_name,
                    image_path=p.image_path,
                    team_name=p.team.name if p.team else None,
                    team_image_path=p.team.image_path if p.team else None,
                    position_category=p.position.category if p.position else None,
                ))
            if entry.coach:
                c = entry.coach
                coach = CoachBrief(
                    id=c.id,
                    display_name=c.display_name,
                    image_path=c.image_path,
                    team_name=c.team.name if c.team else None,
                    team_image_path=c.team.image_path if c.team else None,
                )
        result.append(UserDraftResponse(
            user_id=user.id,
            username=user.username,
            is_active=sp_map.get(user.id, False),
            players=players,
            coach=coach,
        ))
    return result
