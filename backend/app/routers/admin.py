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
from app.models.season import Season, SeasonParticipant
from app.models.team import Team
from app.models.tournament_config import TournamentConfig
from app.models.user import User
from app.routers.deps import require_admin_key
from app.services.auth import hash_password

router = APIRouter(dependencies=[Depends(require_admin_key)])

# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

VALID_SYNC_TARGETS = ("event_types", "teams", "fixtures", "events", "all_events", "lineups")


@router.post("/sync/{target}")
async def trigger_sync(target: str):
    if target not in VALID_SYNC_TARGETS:
        raise HTTPException(status_code=400, detail=f"Unknown target. Valid: {VALID_SYNC_TARGETS}")
    from app.services.sync import run_sync
    await run_sync(target)
    return {"message": f"Sync completed for {target}"}


# ---------------------------------------------------------------------------
# Scoring rules (per active season)
# ---------------------------------------------------------------------------

class ScoringRuleResponse(BaseModel):
    event_key: str
    weight: float

    model_config = {"from_attributes": True}


class UpdateWeightRequest(BaseModel):
    weight: float


@router.get("/scoring-rules", response_model=list[ScoringRuleResponse])
async def list_scoring_rules(session: AsyncSession = Depends(get_db)):
    season = await _get_active_season_or_404(session)
    result = await session.execute(
        select(ScoringRule).where(ScoringRule.season_id == season.id)
    )
    return result.scalars().all()


@router.put("/scoring-rules/{event_key}", response_model=ScoringRuleResponse)
async def update_scoring_rule(
    event_key: str,
    body: UpdateWeightRequest,
    session: AsyncSession = Depends(get_db),
):
    if event_key not in SCORE_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown event key: {event_key}")
    season = await _get_active_season_or_404(session)
    result = await session.execute(
        select(ScoringRule).where(
            ScoringRule.event_key == event_key,
            ScoringRule.season_id == season.id,
        )
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Scoring rule not found")
    rule.weight = body.weight
    await session.commit()
    await session.refresh(rule)
    return rule


# ---------------------------------------------------------------------------
# Users (is_active derived from SeasonParticipant for active season)
# ---------------------------------------------------------------------------

class UserAdminResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    is_active: bool


class CreateUserRequest(BaseModel):
    username: str
    password: str


class SetActiveRequest(BaseModel):
    is_active: bool


@router.get("/users", response_model=list[UserAdminResponse])
async def list_users(session: AsyncSession = Depends(get_db)):
    season = await _get_active_season_or_404(session)

    users_result = await session.execute(select(User))
    users = list(users_result.scalars().all())

    sp_result = await session.execute(
        select(SeasonParticipant).where(SeasonParticipant.season_id == season.id)
    )
    sp_map = {sp.user_id: sp.is_active for sp in sp_result.scalars().all()}

    return [
        UserAdminResponse(
            id=u.id,
            username=u.username,
            is_admin=u.is_admin,
            is_active=sp_map.get(u.id, False),
        )
        for u in users
    ]


@router.post("/users", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_user(body: CreateUserRequest, session: AsyncSession = Depends(get_db)):
    existing = await session.execute(
        select(User).where(User.username == body.username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return UserAdminResponse(id=user.id, username=user.username, is_admin=user.is_admin, is_active=False)


@router.put("/users/{user_id}/active", response_model=UserAdminResponse)
async def set_user_active(
    user_id: int,
    body: SetActiveRequest,
    session: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(session, user_id)
    season = await _get_active_season_or_404(session)

    sp = await _get_or_create_participant(session, user_id, season.id)
    sp.is_active = body.is_active
    await session.commit()

    return UserAdminResponse(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        is_active=sp.is_active,
    )


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, session: AsyncSession = Depends(get_db)):
    user = await _get_user_or_404(session, user_id)
    await session.delete(user)
    await session.commit()


# ---------------------------------------------------------------------------
# Drafts (scoped to active season)
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
    season = await _get_active_season_or_404(session)

    result = await session.execute(
        select(Draft)
        .where(Draft.user_id == user_id, Draft.season_id == season.id)
        .options(selectinload(Draft.player), selectinload(Draft.coach))
    )
    entries = result.scalars().all()

    sp_result = await session.execute(
        select(SeasonParticipant).where(
            SeasonParticipant.user_id == user_id,
            SeasonParticipant.season_id == season.id,
        )
    )
    sp = sp_result.scalar_one_or_none()
    is_active = sp.is_active if sp else False

    return UserDraftAdminResponse(
        user_id=user.id,
        username=user.username,
        is_active=is_active,
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
    season = await _get_active_season_or_404(session)
    await _validate_draft(session, season.id, body.player_ids, body.coach_id)

    # Delete existing draft entries for this user + season
    existing = await session.execute(
        select(Draft).where(Draft.user_id == user_id, Draft.season_id == season.id)
    )
    for entry in existing.scalars().all():
        await session.delete(entry)

    # Create new entries
    for pid in body.player_ids:
        session.add(Draft(user_id=user_id, season_id=season.id, player_id=pid))
    session.add(Draft(user_id=user_id, season_id=season.id, coach_id=body.coach_id))

    # Activate user for this season
    sp = await _get_or_create_participant(session, user_id, season.id)
    sp.is_active = True
    await session.commit()

    return await get_user_draft(user_id, session)


class AddPickRequest(BaseModel):
    player_id: int | None = None
    coach_id: int | None = None


@router.post("/drafts/{user_id}/pick", response_model=UserDraftAdminResponse)
async def add_pick(
    user_id: int,
    body: AddPickRequest,
    session: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(session, user_id)
    season = await _get_active_season_or_404(session)

    if body.player_id is not None:
        player_result = await session.execute(
            select(Player)
            .where(Player.id == body.player_id, Player.season_id == season.id)
            .options(selectinload(Player.position), selectinload(Player.team))
        )
        player = player_result.scalar_one_or_none()
        if player is None:
            raise HTTPException(status_code=404, detail=f"Player {body.player_id} not found in active season")

        cat = player.position.category if player.position else None
        if cat is None:
            raise HTTPException(status_code=400, detail="Player has no position category")

        existing_result = await session.execute(
            select(Draft)
            .where(Draft.user_id == user_id, Draft.season_id == season.id, Draft.player_id.isnot(None))
            .options(
                selectinload(Draft.player).selectinload(Player.position),
                selectinload(Draft.player).selectinload(Player.team),
            )
        )
        current = existing_result.scalars().all()

        if any(e.player_id == body.player_id for e in current):
            raise HTTPException(status_code=400, detail="Player already in draft")

        required = {"GK": 1, "DEF": 5, "MID": 5, "FWD": 5}
        count_in_pos = sum(
            1 for e in current
            if e.player and e.player.position and e.player.position.category == cat
        )
        if count_in_pos >= required.get(cat, 0):
            raise HTTPException(status_code=400, detail=f"Position {cat} is full")

        if player.team_id and any(
            e.player and e.player.team_id == player.team_id for e in current
        ):
            raise HTTPException(status_code=400, detail="Player's team already in draft")

        session.add(Draft(user_id=user_id, season_id=season.id, player_id=body.player_id))

    elif body.coach_id is not None:
        coach_result = await session.execute(
            select(Coach).where(Coach.id == body.coach_id, Coach.season_id == season.id)
        )
        if coach_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail=f"Coach {body.coach_id} not found in active season")

        existing_coach = await session.execute(
            select(Draft).where(Draft.user_id == user_id, Draft.season_id == season.id, Draft.coach_id.isnot(None))
        )
        for e in existing_coach.scalars().all():
            await session.delete(e)

        session.add(Draft(user_id=user_id, season_id=season.id, coach_id=body.coach_id))

    else:
        raise HTTPException(status_code=400, detail="Provide player_id or coach_id")

    await session.commit()
    return await get_user_draft(user_id, session)


@router.delete("/drafts/{user_id}/pick", response_model=UserDraftAdminResponse)
async def remove_pick(
    user_id: int,
    player_id: int | None = None,
    coach_id: int | None = None,
    session: AsyncSession = Depends(get_db),
):
    await _get_user_or_404(session, user_id)
    season = await _get_active_season_or_404(session)

    if player_id is not None:
        result = await session.execute(
            select(Draft).where(
                Draft.user_id == user_id,
                Draft.season_id == season.id,
                Draft.player_id == player_id,
            )
        )
        entry = result.scalar_one_or_none()
        if entry:
            await session.delete(entry)
    elif coach_id is not None:
        result = await session.execute(
            select(Draft).where(
                Draft.user_id == user_id,
                Draft.season_id == season.id,
                Draft.coach_id == coach_id,
            )
        )
        entry = result.scalar_one_or_none()
        if entry:
            await session.delete(entry)
    else:
        raise HTTPException(status_code=400, detail="Provide player_id or coach_id")

    await session.commit()
    return await get_user_draft(user_id, session)


async def _validate_draft(
    session: AsyncSession,
    season_id: int,
    player_ids: list[int],
    coach_id: int,
) -> None:
    if len(player_ids) != 16:
        raise HTTPException(status_code=400, detail="Exactly 16 players required")
    if len(set(player_ids)) != 16:
        raise HTTPException(status_code=400, detail="Duplicate players in draft")

    result = await session.execute(
        select(Player)
        .where(Player.id.in_(player_ids), Player.season_id == season_id)
        .options(selectinload(Player.position), selectinload(Player.team))
    )
    players = result.scalars().all()
    if len(players) != 16:
        found = {p.id for p in players}
        missing = set(player_ids) - found
        raise HTTPException(status_code=400, detail=f"Players not found in active season: {missing}")

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

    team_ids = [p.team_id for p in players if p.team_id]
    if len(team_ids) != len(set(team_ids)):
        raise HTTPException(status_code=400, detail="Multiple players from the same team")

    coach_result = await session.execute(
        select(Coach).where(Coach.id == coach_id, Coach.season_id == season_id)
    )
    if coach_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=400, detail=f"Coach {coach_id} not found in active season")


# ---------------------------------------------------------------------------
# Tournament winner (per active season)
# ---------------------------------------------------------------------------

class SetWinnerRequest(BaseModel):
    team_id: int


class TournamentConfigResponse(BaseModel):
    winner_team_id: int | None
    winner_team_name: str | None


@router.get("/tournament/winner", response_model=TournamentConfigResponse)
async def get_tournament_winner(session: AsyncSession = Depends(get_db)):
    season = await _get_active_season_or_404(session)
    tc = await _get_or_create_tournament_config(session, season.id)
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

    season = await _get_active_season_or_404(session)
    tc = await _get_or_create_tournament_config(session, season.id)
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
# Reset database
# ---------------------------------------------------------------------------

@router.post("/reset-db", status_code=status.HTTP_204_NO_CONTENT)
async def reset_db(session: AsyncSession = Depends(get_db)):
    """Delete all users, drafts, season participants, and tournament configs."""
    from sqlalchemy import delete as sa_delete
    await session.execute(sa_delete(Draft))
    await session.execute(sa_delete(SeasonParticipant))
    await session.execute(sa_delete(TournamentConfig))
    await session.execute(sa_delete(User))
    await session.commit()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_user_or_404(session: AsyncSession, user_id: int) -> User:
    result = await session.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _get_active_season_or_404(session: AsyncSession) -> Season:
    result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    season = result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=503, detail="No active season configured")
    return season


async def _get_or_create_tournament_config(session: AsyncSession, season_id: int) -> TournamentConfig:
    result = await session.execute(
        select(TournamentConfig).where(TournamentConfig.season_id == season_id)
    )
    tc = result.scalar_one_or_none()
    if tc is None:
        tc = TournamentConfig(season_id=season_id)
        session.add(tc)
        await session.commit()
        await session.refresh(tc)
    return tc


async def _get_or_create_participant(
    session: AsyncSession, user_id: int, season_id: int
) -> SeasonParticipant:
    result = await session.execute(
        select(SeasonParticipant).where(
            SeasonParticipant.user_id == user_id,
            SeasonParticipant.season_id == season_id,
        )
    )
    sp = result.scalar_one_or_none()
    if sp is None:
        sp = SeasonParticipant(user_id=user_id, season_id=season_id, is_active=False)
        session.add(sp)
        await session.flush()
    return sp
