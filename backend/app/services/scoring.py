"""Score computation — always recomputed from events, never stored."""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.draft import Draft
from app.models.event import Event
from app.models.event_type import EventType
from app.models.fixture import Fixture, FixtureParticipant
from app.models.lineup import Lineup
from app.models.scoring_rule import ScoringRule
from app.models.tournament_config import TournamentConfig
from app.models.user import User

# Sportmonks developer_name values
_GOAL_TYPES = {"GOAL", "PENALTY"}
_ASSIST_TYPES = {"ASSIST"}
_YELLOW_TYPES = {"YELLOWCARD"}
_RED_TYPES = {"REDCARD", "YELLOWRED"}

# Lineup type IDs
LINEUP_STARTER = 11

# Penalty shootout period (Sportmonks period_id = 5)
PENALTY_SHOOTOUT_PERIOD = 5


@dataclass
class UserScore:
    user_id: int
    username: str
    is_active: bool
    goals: float = 0.0
    assists: float = 0.0
    yellow_cards: float = 0.0
    red_cards: float = 0.0
    clean_sheets: float = 0.0
    coach_winner: float = 0.0

    @property
    def total(self) -> float:
        return (
            self.goals
            + self.assists
            + self.yellow_cards
            + self.red_cards
            + self.clean_sheets
            + self.coach_winner
        )


async def compute_scores(session: AsyncSession) -> list[UserScore]:
    # Load scoring weights
    weights = await _load_weights(session)

    # Load all users with their draft entries
    users_result = await session.execute(
        select(User).options(
            selectinload(User.draft_entries)
            .selectinload(Draft.player)
            .selectinload("position"),
            selectinload(User.draft_entries).selectinload(Draft.coach),
        )
    )
    users: list[User] = list(users_result.scalars().all())

    # Load tournament winner team_id
    tc_result = await session.execute(select(TournamentConfig))
    tc = tc_result.scalar_one_or_none()
    winner_team_id = tc.winner_team_id if tc else None

    # Build player_id → set of user_ids lookup
    player_to_users: dict[int, list[int]] = {}
    user_scores: dict[int, UserScore] = {}
    user_draft_player_ids: dict[int, set[int]] = {}
    user_coach_team_id: dict[int, int | None] = {}

    for user in users:
        us = UserScore(user_id=user.id, username=user.username, is_active=user.is_active)
        user_scores[user.id] = us
        player_ids = set()
        coach_team = None
        for entry in user.draft_entries:
            if entry.player_id:
                player_to_users.setdefault(entry.player_id, []).append(user.id)
                player_ids.add(entry.player_id)
            if entry.coach_id and entry.coach and entry.coach.team_id:
                coach_team = entry.coach.team_id
        user_draft_player_ids[user.id] = player_ids
        user_coach_team_id[user.id] = coach_team

    # Load all events with their type
    events_result = await session.execute(
        select(Event).options(selectinload(Event.event_type))
    )
    events: list[Event] = list(events_result.scalars().all())

    for event in events:
        if not event.player_id or not event.event_type:
            continue
        dev_name = (event.event_type.developer_name or "").upper()
        affected_users = player_to_users.get(event.player_id, [])

        for uid in affected_users:
            us = user_scores[uid]
            if dev_name in _GOAL_TYPES:
                us.goals += weights["goal"]
            elif dev_name in _ASSIST_TYPES:
                us.assists += weights["assist"]
            elif dev_name in _YELLOW_TYPES:
                us.yellow_cards += weights["yellow_card"]
            elif dev_name in _RED_TYPES:
                us.red_cards += weights["red_card"]

        # Assists are stored as a separate event with related_player_id
        # (also handle the case where assist comes via related_player_id on a goal event)
        if dev_name in _GOAL_TYPES and event.related_player_id:
            for uid in player_to_users.get(event.related_player_id, []):
                user_scores[uid].assists += weights["assist"]

    # Clean sheet calculation
    await _apply_clean_sheets(session, user_scores, user_draft_player_ids, weights)

    # Coach winner bonus
    if winner_team_id is not None:
        for uid, team_id in user_coach_team_id.items():
            if team_id == winner_team_id:
                user_scores[uid].coach_winner += weights["coach_winner"]

    return list(user_scores.values())


async def _apply_clean_sheets(
    session: AsyncSession,
    user_scores: dict[int, "UserScore"],
    user_draft_player_ids: dict[int, set[int]],
    weights: dict[str, float],
) -> None:
    # Load fixtures with participants and events
    fixtures_result = await session.execute(
        select(Fixture).options(
            selectinload(Fixture.participants).selectinload(FixtureParticipant.team),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    fixtures: list[Fixture] = list(fixtures_result.scalars().all())

    # Load GK player ids (position category = GK)
    from app.models.player import Player
    from app.models.position import Position
    gk_result = await session.execute(
        select(Player.id).join(Position).where(Position.category == "GK")
    )
    gk_ids = set(gk_result.scalars().all())

    for fixture in fixtures:
        if fixture.state not in ("LIVE", "FT", "AET", "FT_PEN"):
            continue

        # Goals conceded per team (excluding penalty shootout)
        goals_conceded: dict[int, int] = {}
        for event in fixture.events:
            if not event.event_type:
                continue
            dev_name = (event.event_type.developer_name or "").upper()
            if dev_name in _GOAL_TYPES and event.period_id != PENALTY_SHOOTOUT_PERIOD:
                # A goal event's team_id is the team that SCORED
                # So the team that conceded is the opponent
                if event.team_id:
                    for participant in fixture.participants:
                        if participant.team_id != event.team_id:
                            goals_conceded[participant.team_id] = (
                                goals_conceded.get(participant.team_id, 0) + 1
                            )

        # Build lineup lookup: player_id → (type_id, minute)
        starter_ids: dict[int, int] = {}  # player_id → type_id
        sub_on_events: dict[int, int] = {}  # player_id → minute substituted on
        sub_off_events: dict[int, int] = {}  # player_id → minute substituted off

        for lu in fixture.lineups:
            if lu.player_id:
                starter_ids[lu.player_id] = lu.type_id or 0

        for event in fixture.events:
            if not event.event_type:
                continue
            dev_name = (event.event_type.developer_name or "").upper()
            if dev_name == "SUBSTITUTION":
                if event.player_id:  # player coming on
                    sub_on_events[event.player_id] = event.minute or 0
                if event.related_player_id:  # player going off
                    sub_off_events[event.related_player_id] = event.minute or 0

        fixture_team_ids = {p.team_id for p in fixture.participants}

        for uid, player_ids in user_draft_player_ids.items():
            for pid in player_ids:
                if pid not in gk_ids:
                    continue
                # Find which team this keeper belongs to in this fixture
                # We need to check if this player's team participated
                # We'll match via lineups or sub events
                keeper_team_id = _find_keeper_team(pid, fixture, starter_ids, sub_on_events)
                if keeper_team_id not in fixture_team_ids:
                    continue

                if not _keeper_played(pid, starter_ids, sub_on_events, sub_off_events):
                    continue

                if goals_conceded.get(keeper_team_id, 0) == 0:
                    user_scores[uid].clean_sheets += weights["clean_sheet"]


def _find_keeper_team(
    player_id: int,
    fixture: "Fixture",
    starter_ids: dict[int, int],
    sub_on_events: dict[int, int],
) -> int | None:
    for lu in fixture.lineups:
        if lu.player_id == player_id:
            return lu.team_id
    return None


def _keeper_played(
    player_id: int,
    starter_ids: dict[int, int],
    sub_on_events: dict[int, int],
    sub_off_events: dict[int, int],
) -> bool:
    is_starter = player_id in starter_ids and starter_ids[player_id] == LINEUP_STARTER
    came_on = player_id in sub_on_events

    if is_starter:
        # Subbed off before minute 1?
        subbed_off_at = sub_off_events.get(player_id, 999)
        return subbed_off_at > 1

    if came_on:
        # Came on at or before minute 89
        return sub_on_events[player_id] <= 89

    return False


async def _load_weights(session: AsyncSession) -> dict[str, float]:
    result = await session.execute(select(ScoringRule))
    rules = result.scalars().all()
    return {r.event_key: r.weight for r in rules}
