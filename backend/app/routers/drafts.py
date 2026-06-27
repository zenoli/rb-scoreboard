import networkx as nx
from fastapi import APIRouter, Depends, HTTPException
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
from app.routers.players import PlayerResponse
from app.services.scoring import compute_all_player_points, compute_player_points

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


_POS_CAPS = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 5}


@router.get("/drafts/optimal", response_model=list[PlayerResponse])
async def get_optimal_draft(session: AsyncSession = Depends(get_db)):
    season_result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = season_result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=404, detail="No active season")

    players_result = await session.execute(
        select(Player)
        .where(Player.season_id == season.id)
        .options(selectinload(Player.team), selectinload(Player.position))
    )
    all_players = players_result.scalars().all()
    points_map = await compute_all_player_points(session)

    drafts_result = await session.execute(
        select(Draft.player_id, User.username)
        .join(User, Draft.user_id == User.id)
        .where(Draft.season_id == season.id)
        .where(Draft.player_id.is_not(None))
    )
    draft_map: dict[int, str] = {row.player_id: row.username for row in drafts_result.all()}

    # Build flow graph: source → team → player → pos → sink
    G = nx.DiGraph()
    for pos, cap in _POS_CAPS.items():
        G.add_edge(f"pos_{pos}", "t", capacity=cap, weight=0)

    teams_seen: set[int] = set()
    eligible: list[Player] = []
    for p in all_players:
        if not p.team_id or not p.position or p.position.category not in _POS_CAPS:
            continue
        if p.team_id not in teams_seen:
            G.add_edge("s", f"team_{p.team_id}", capacity=1, weight=0)
            teams_seen.add(p.team_id)
        score = points_map[p.id].total if p.id in points_map else 0.0
        G.add_edge(f"team_{p.team_id}", f"player_{p.id}", capacity=1, weight=0)
        G.add_edge(f"player_{p.id}", f"pos_{p.position.category}", capacity=1, weight=-score)
        eligible.append(p)

    flow = nx.max_flow_min_cost(G, "s", "t")

    selected = {
        p.id for p in eligible
        if flow.get(f"player_{p.id}", {}).get(f"pos_{p.position.category}", 0) == 1
    }

    result = []
    for p in eligible:
        if p.id not in selected:
            continue
        bd = points_map.get(p.id)
        result.append(PlayerResponse(
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
            position_category=p.position.category,
            total_points=bd.total if bd else 0.0,
            goal_points=bd.goal if bd else 0.0,
            assist_points=bd.assist if bd else 0.0,
            card_points=bd.card if bd else 0.0,
            clean_sheet_points=bd.clean_sheet if bd else 0.0,
            drafted_by_username=draft_map.get(p.id),
        ))

    return result


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
