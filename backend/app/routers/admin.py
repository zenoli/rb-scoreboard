from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.coach import Coach
from app.models.draft import Draft
from app.models.player import Player
from app.models.position import Position
from app.models.scoring_rule import SCORE_KEYS, ScoringRule
from app.models.team import Team
from app.models.tournament_config import TournamentConfig
from app.models.user import User
from app.routers.deps import require_admin_key

router = APIRouter(dependencies=[Depends(require_admin_key)])

# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

VALID_SYNC_TARGETS = ("event_types", "teams", "fixtures", "events", "lineups")


@router.post("/sync/{target}")
async def trigger_sync(target: str):
    if target not in VALID_SYNC_TARGETS:
        raise HTTPException(status_code=400, detail=f"Unknown target. Valid: {VALID_SYNC_TARGETS}")
    from app.services.sync import run_sync
    await run_sync(target)
    return {"message": f"Sync completed for {target}"}


# ---------------------------------------------------------------------------
# Scoring rules
# ---------------------------------------------------------------------------

class ScoringRuleResponse(BaseModel):
    event_key: str
    weight: float

    model_config = {"from_attributes": True}


class UpdateWeightRequest(BaseModel):
    weight: float


@router.get("/scoring-rules", response_model=list[ScoringRuleResponse])
async def list_scoring_rules(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(ScoringRule))
    return result.scalars().all()


@router.put("/scoring-rules/{event_key}", response_model=ScoringRuleResponse)
async def update_scoring_rule(
    event_key: str,
    body: UpdateWeightRequest,
    session: AsyncSession = Depends(get_db),
):
    if event_key not in SCORE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown event key: {event_key}")
    result = await session.execute(
        select(ScoringRule).where(ScoringRule.event_key == event_key)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Scoring rule not found")
    rule.weight = body.weight
    await session.commit()
    await session.refresh(rule)
    return rule


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

class UserAdminResponse(BaseModel):
    id: int
    username: str
    email: str
    is_admin: bool
    is_active: bool

    model_config = {"from_attributes": True}


@router.get("/users", response_model=list[UserAdminResponse])
async def list_users(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(User))
    return result.scalars().all()


# ---------------------------------------------------------------------------
# Drafts
# ---------------------------------------------------------------------------

class DraftEntryResponse(BaseModel):
    player_id: int | None
    player_name: str | None
    coach_id: int | None
    coach_name: str | None


class UserDraftAdminResponse(BaseModel):
    user_id: int
    username: str
    is_active: bool
    entries: list[DraftEntryResponse]


class AssignDraftRequest(BaseModel):
    player_ids: list[int]  # exactly 16
    coach_id: int


@router.get("/drafts/{user_id}", response_model=UserDraftAdminResponse)
async def get_user_draft(user_id: int, session: AsyncSession = Depends(get_db)):
    user = await _get_user_or_404(session, user_id)
    result = await session.execute(
        select(Draft)
        .where(Draft.user_id == user_id)
        .options(selectinload(Draft.player), selectinload(Draft.coach))
    )
    entries = result.scalars().all()
    return UserDraftAdminResponse(
        user_id=user.id,
        username=user.username,
        is_active=user.is_active,
        entries=[
            DraftEntryResponse(
                player_id=e.player_id,
                player_name=e.player.display_name if e.player else None,
                coach_id=e.coach_id,
                coach_name=e.coach.display_name if e.coach else None,
            )
            for e in entries
        ],
    )


@router.put("/drafts/{user_id}", response_model=UserDraftAdminResponse)
async def assign_draft(
    user_id: int,
    body: AssignDraftRequest,
    session: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(session, user_id)
    await _validate_draft(session, body.player_ids, body.coach_id)

    # Delete existing draft entries for this user
    existing = await session.execute(select(Draft).where(Draft.user_id == user_id))
    for entry in existing.scalars().all():
        await session.delete(entry)

    # Create new entries
    for pid in body.player_ids:
        session.add(Draft(user_id=user_id, player_id=pid))
    session.add(Draft(user_id=user_id, coach_id=body.coach_id))

    # Activate user
    user.is_active = True
    await session.commit()

    return await get_user_draft(user_id, session)


async def _validate_draft(
    session: AsyncSession,
    player_ids: list[int],
    coach_id: int,
) -> None:
    if len(player_ids) != 16:
        raise HTTPException(status_code=400, detail="Exactly 16 players required")
    if len(set(player_ids)) != 16:
        raise HTTPException(status_code=400, detail="Duplicate players in draft")

    # Load players with positions and teams
    result = await session.execute(
        select(Player)
        .where(Player.id.in_(player_ids))
        .options(selectinload(Player.position), selectinload(Player.team))
    )
    players = result.scalars().all()
    if len(players) != 16:
        found = {p.id for p in players}
        missing = set(player_ids) - found
        raise HTTPException(status_code=400, detail=f"Players not found: {missing}")

    # Validate position composition: 1 GK, 5 DEF, 5 MID, 5 FWD
    category_counts: dict[str, int] = {}
    for p in players:
        cat = p.position.category if p.position else None
        if cat is None:
            raise HTTPException(
                status_code=400,
                detail=f"Player {p.id} has no position category assigned",
            )
        category_counts[cat] = category_counts.get(cat, 0) + 1

    expected = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 5}
    for cat, count in expected.items():
        if category_counts.get(cat, 0) != count:
            raise HTTPException(
                status_code=400,
                detail=f"Expected {count} {cat}, got {category_counts.get(cat, 0)}",
            )

    # Validate at most one player per team
    team_ids = [p.team_id for p in players if p.team_id]
    if len(team_ids) != len(set(team_ids)):
        raise HTTPException(status_code=400, detail="Multiple players from the same team")

    # Validate coach exists
    coach_result = await session.execute(select(Coach).where(Coach.id == coach_id))
    if coach_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail=f"Coach {coach_id} not found")


# ---------------------------------------------------------------------------
# Tournament winner
# ---------------------------------------------------------------------------

class SetWinnerRequest(BaseModel):
    team_id: int


class TournamentConfigResponse(BaseModel):
    winner_team_id: int | None
    winner_team_name: str | None


@router.get("/tournament/winner", response_model=TournamentConfigResponse)
async def get_tournament_winner(session: AsyncSession = Depends(get_db)):
    tc = await _get_or_create_tournament_config(session)
    team_name = None
    if tc.winner_team_id:
        team_result = await session.execute(
            select(Team).where(Team.id == tc.winner_team_id)
        )
        team = team_result.scalar_one_or_none()
        team_name = team.name if team else None
    return TournamentConfigResponse(
        winner_team_id=tc.winner_team_id,
        winner_team_name=team_name,
    )


@router.put("/tournament/winner", response_model=TournamentConfigResponse)
async def set_tournament_winner(
    body: SetWinnerRequest,
    session: AsyncSession = Depends(get_db),
):
    team_result = await session.execute(select(Team).where(Team.id == body.team_id))
    team = team_result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail=f"Team {body.team_id} not found")

    tc = await _get_or_create_tournament_config(session)
    tc.winner_team_id = body.team_id
    await session.commit()
    return TournamentConfigResponse(
        winner_team_id=tc.winner_team_id,
        winner_team_name=team.name,
    )


# ---------------------------------------------------------------------------
# Position category mapping
# ---------------------------------------------------------------------------

class UpdatePositionCategoryRequest(BaseModel):
    category: str  # GK, DEF, MID, FWD


@router.get("/positions", response_model=list[dict])
async def list_positions(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Position))
    return [
        {"id": p.id, "name": p.name, "code": p.code, "category": p.category}
        for p in result.scalars().all()
    ]


@router.put("/positions/{position_id}/category")
async def set_position_category(
    position_id: int,
    body: UpdatePositionCategoryRequest,
    session: AsyncSession = Depends(get_db),
):
    if body.category not in ("GK", "DEF", "MID", "FWD"):
        raise HTTPException(status_code=400, detail="category must be GK, DEF, MID, or FWD")
    result = await session.execute(select(Position).where(Position.id == position_id))
    pos = result.scalar_one_or_none()
    if pos is None:
        raise HTTPException(status_code=404, detail="Position not found")
    pos.category = body.category
    await session.commit()
    return {"id": pos.id, "name": pos.name, "category": pos.category}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user_or_404(session: AsyncSession, user_id: int) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _get_or_create_tournament_config(session: AsyncSession) -> TournamentConfig:
    result = await session.execute(select(TournamentConfig))
    tc = result.scalar_one_or_none()
    if tc is None:
        tc = TournamentConfig(id=1)
        session.add(tc)
        await session.commit()
        await session.refresh(tc)
    return tc
