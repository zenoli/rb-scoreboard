"""Score computation — always recomputed from events, never stored."""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.coach import Coach
from app.models.draft import Draft
from app.models.event import Event
from app.models.event_type import EventType
from app.models.fixture import Fixture, FixtureParticipant
from app.models.lineup import Lineup
from app.models.player import Player
from app.models.position import Position
from app.models.scoring_rule import ScoringRule
from app.models.season import Season, SeasonParticipant
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

# Sportmonks fixture states considered "in play" (live)
LIVE_STATES = {"LIVE", "INPLAY_1ST_HALF", "INPLAY_2ND_HALF", "HT", "INPLAY_ET", "INPLAY_ET_2ND_HALF", "PEN_LIVE"}

# Fixture states where the match is finished
FINISHED_STATES = {"FT", "AET", "FT_PEN"}

# All states where scoring should be counted (live + finished)
ACTIVE_STATES = LIVE_STATES | FINISHED_STATES


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
    volatile_clean_sheets: float = 0.0
    coach_winner: float = 0.0

    @property
    def total(self) -> float:
        return (
            self.goals
            + self.assists
            + self.yellow_cards
            + self.red_cards
            + self.clean_sheets
            + self.volatile_clean_sheets
            + self.coach_winner
        )


async def _get_active_season(session: AsyncSession) -> Season | None:
    result = await session.execute(select(Season).where(Season.is_active == True))  # noqa: E712
    return result.scalar_one_or_none()


async def compute_scores(session: AsyncSession) -> tuple[list[UserScore], str | None]:
    """Returns (scores, season_name). season_name is None if no active season."""
    season = await _get_active_season(session)
    if season is None:
        return [], None

    weights = await _load_weights(session, season.id)

    # Load all season participants
    sp_result = await session.execute(
        select(SeasonParticipant).where(SeasonParticipant.season_id == season.id)
    )
    participants = {sp.user_id: sp.is_active for sp in sp_result.scalars().all()}

    # Load all users
    users_result = await session.execute(select(User))
    users: list[User] = list(users_result.scalars().all())

    # Load draft entries for this season
    drafts_result = await session.execute(
        select(Draft)
        .where(Draft.season_id == season.id)
        .options(
            selectinload(Draft.player).selectinload(Player.position),
            selectinload(Draft.coach),
        )
    )
    draft_entries = list(drafts_result.scalars().all())

    # Load tournament winner for this season
    tc_result = await session.execute(
        select(TournamentConfig).where(TournamentConfig.season_id == season.id)
    )
    tc = tc_result.scalar_one_or_none()
    winner_team_id = tc.winner_team_id if tc else None

    # Build lookup structures
    player_to_users: dict[int, list[int]] = {}
    user_scores: dict[int, UserScore] = {}
    user_draft_player_ids: dict[int, set[int]] = {}
    user_coach_team_id: dict[int, int | None] = {}

    for user in users:
        is_active = participants.get(user.id, False)
        us = UserScore(user_id=user.id, username=user.username, is_active=is_active)
        user_scores[user.id] = us
        user_draft_player_ids[user.id] = set()
        user_coach_team_id[user.id] = None

    for entry in draft_entries:
        if entry.player_id:
            player_to_users.setdefault(entry.player_id, []).append(entry.user_id)
            user_draft_player_ids[entry.user_id].add(entry.player_id)
        if entry.coach_id and entry.coach and entry.coach.team_id:
            user_coach_team_id[entry.user_id] = entry.coach.team_id

    # Load events for fixtures of this season
    events_result = await session.execute(
        select(Event)
        .join(Fixture, Event.fixture_id == Fixture.id)
        .where(Fixture.season_id == season.id)
        .options(selectinload(Event.event_type))
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

        if dev_name in _GOAL_TYPES and event.related_player_id:
            for uid in player_to_users.get(event.related_player_id, []):
                user_scores[uid].assists += weights["assist"]

    # Clean sheet calculation
    await _apply_clean_sheets(session, season.id, user_scores, user_draft_player_ids, weights)

    # Coach winner bonus
    if winner_team_id is not None:
        for uid, team_id in user_coach_team_id.items():
            if team_id == winner_team_id:
                user_scores[uid].coach_winner += weights["coach_winner"]

    return list(user_scores.values()), season.name


async def _apply_clean_sheets(
    session: AsyncSession,
    season_id: int,
    user_scores: dict[int, "UserScore"],
    user_draft_player_ids: dict[int, set[int]],
    weights: dict[str, float],
) -> None:
    fixtures_result = await session.execute(
        select(Fixture)
        .where(Fixture.season_id == season_id)
        .options(
            selectinload(Fixture.participants),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    fixtures: list[Fixture] = list(fixtures_result.scalars().all())

    gk_result = await session.execute(
        select(Player.id)
        .join(Position)
        .where(Position.category == "GK")
        .where(Player.season_id == season_id)
    )
    gk_ids = set(gk_result.scalars().all())

    for fixture in fixtures:
        if fixture.state not in ACTIVE_STATES:
            continue

        is_live = fixture.state in LIVE_STATES
        goals_conceded, starter_ids, sub_on, sub_off = _parse_fixture_events(fixture)
        fixture_team_ids = {p.team_id for p in fixture.participants}

        for uid, player_ids in user_draft_player_ids.items():
            for pid in player_ids:
                if pid not in gk_ids:
                    continue
                keeper_team_id = _find_keeper_team(pid, fixture, starter_ids, sub_on)
                if keeper_team_id not in fixture_team_ids:
                    continue
                if not _keeper_played(pid, starter_ids, sub_on, sub_off):
                    continue
                if goals_conceded.get(keeper_team_id, 0) == 0:
                    if is_live:
                        user_scores[uid].volatile_clean_sheets += weights["clean_sheet"]
                    else:
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
        subbed_off_at = sub_off_events.get(player_id, 999)
        return subbed_off_at > 1

    if came_on:
        return sub_on_events[player_id] <= 120

    return False


async def _load_weights(session: AsyncSession, season_id: int) -> dict[str, float]:
    result = await session.execute(
        select(ScoringRule).where(ScoringRule.season_id == season_id)
    )
    rules = result.scalars().all()
    return {r.event_key: r.weight for r in rules}


# ---------------------------------------------------------------------------
# Score history (for line chart)
# ---------------------------------------------------------------------------


@dataclass
class ScoreHistorySeries:
    user_id: int
    username: str
    points: list[float]


@dataclass
class ScoreHistory:
    dates: list[str]
    series: list[ScoreHistorySeries]


async def compute_score_history(session: AsyncSession) -> ScoreHistory:
    season = await _get_active_season(session)
    if season is None:
        return ScoreHistory(dates=[], series=[])

    weights = await _load_weights(session, season.id)

    # Load season participants
    sp_result = await session.execute(
        select(SeasonParticipant).where(SeasonParticipant.season_id == season.id)
    )
    participants = {sp.user_id: sp.is_active for sp in sp_result.scalars().all()}

    # Load all users
    users_result = await session.execute(select(User))
    users: list[User] = list(users_result.scalars().all())

    # Load draft entries for this season
    drafts_result = await session.execute(
        select(Draft)
        .where(Draft.season_id == season.id)
        .options(
            selectinload(Draft.player).selectinload(Player.position),
            selectinload(Draft.coach),
        )
    )
    draft_entries = list(drafts_result.scalars().all())

    tc_result = await session.execute(
        select(TournamentConfig).where(TournamentConfig.season_id == season.id)
    )
    tc = tc_result.scalar_one_or_none()
    winner_team_id = tc.winner_team_id if tc else None

    player_to_users: dict[int, list[int]] = {}
    user_scores: dict[int, UserScore] = {}
    user_draft_player_ids: dict[int, set[int]] = {}
    user_coach_team_id: dict[int, int | None] = {}
    gk_ids: set[int] = set()

    for user in users:
        is_active = participants.get(user.id, False)
        us = UserScore(user_id=user.id, username=user.username, is_active=is_active)
        user_scores[user.id] = us
        user_draft_player_ids[user.id] = set()
        user_coach_team_id[user.id] = None

    for entry in draft_entries:
        if entry.player_id:
            player_to_users.setdefault(entry.player_id, []).append(entry.user_id)
            user_draft_player_ids[entry.user_id].add(entry.player_id)
            if (
                entry.player
                and entry.player.position
                and entry.player.position.category == "GK"
            ):
                gk_ids.add(entry.player_id)
        if entry.coach_id and entry.coach and entry.coach.team_id:
            user_coach_team_id[entry.user_id] = entry.coach.team_id

    fixtures_result = await session.execute(
        select(Fixture)
        .where(Fixture.season_id == season.id)
        .where(Fixture.state.in_(list(FINISHED_STATES)))
        .where(Fixture.starting_at.isnot(None))
        .options(
            selectinload(Fixture.participants),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    completed_fixtures: list[Fixture] = list(fixtures_result.scalars().all())

    fixtures_by_date: dict[date, list[Fixture]] = defaultdict(list)
    for fixture in completed_fixtures:
        fixtures_by_date[fixture.starting_at.date()].append(fixture)  # type: ignore[union-attr]

    sorted_dates = sorted(fixtures_by_date.keys())

    active_user_ids = [uid for uid, us in user_scores.items() if us.is_active]

    if not sorted_dates:
        return ScoreHistory(
            dates=[],
            series=[
                ScoreHistorySeries(
                    user_id=user_scores[uid].user_id,
                    username=user_scores[uid].username,
                    points=[],
                )
                for uid in active_user_ids
            ],
        )

    snapshots: list[dict[int, float]] = []

    for d in sorted_dates:
        for fixture in fixtures_by_date[d]:
            for event in fixture.events:
                if not event.player_id or not event.event_type:
                    continue
                dev = (event.event_type.developer_name or "").upper()
                for uid in player_to_users.get(event.player_id, []):
                    us = user_scores[uid]
                    if dev in _GOAL_TYPES:
                        us.goals += weights["goal"]
                    elif dev in _ASSIST_TYPES:
                        us.assists += weights["assist"]
                    elif dev in _YELLOW_TYPES:
                        us.yellow_cards += weights["yellow_card"]
                    elif dev in _RED_TYPES:
                        us.red_cards += weights["red_card"]
                if dev in _GOAL_TYPES and event.related_player_id:
                    for uid in player_to_users.get(event.related_player_id, []):
                        user_scores[uid].assists += weights["assist"]

            goals_conceded, starter_ids, sub_on, sub_off = _parse_fixture_events(fixture)
            fixture_team_ids = {p.team_id for p in fixture.participants}
            for uid, player_ids in user_draft_player_ids.items():
                for pid in player_ids:
                    if pid not in gk_ids:
                        continue
                    keeper_team_id = _find_keeper_team(pid, fixture, starter_ids, sub_on)
                    if keeper_team_id not in fixture_team_ids:
                        continue
                    if not _keeper_played(pid, starter_ids, sub_on, sub_off):
                        continue
                    if goals_conceded.get(keeper_team_id, 0) == 0:
                        user_scores[uid].clean_sheets += weights["clean_sheet"]

        snapshots.append({uid: user_scores[uid].total for uid in active_user_ids})

    if winner_team_id is not None and snapshots:
        for uid, team_id in user_coach_team_id.items():
            if uid in snapshots[-1] and team_id == winner_team_id:
                snapshots[-1][uid] += weights.get("coach_winner", 0.0)

    return ScoreHistory(
        dates=[d.isoformat() for d in sorted_dates],
        series=[
            ScoreHistorySeries(
                user_id=user_scores[uid].user_id,
                username=user_scores[uid].username,
                points=[snap[uid] for snap in snapshots],
            )
            for uid in active_user_ids
        ],
    )


# ---------------------------------------------------------------------------
# Per-player points (for draft badges)
# ---------------------------------------------------------------------------


async def compute_player_points(session: AsyncSession, user_id: int) -> dict[int, float]:
    """Returns player_id → total points for all players in a user's draft (active season)."""
    season = await _get_active_season(session)
    if season is None:
        return {}

    weights = await _load_weights(session, season.id)

    draft_result = await session.execute(
        select(Draft)
        .where(Draft.user_id == user_id, Draft.season_id == season.id)
        .options(selectinload(Draft.player).selectinload(Player.position))
    )
    draft_entries = list(draft_result.scalars().all())
    player_ids = {e.player_id for e in draft_entries if e.player_id}
    if not player_ids:
        return {}

    player_points: dict[int, float] = {pid: 0.0 for pid in player_ids}

    events_result = await session.execute(
        select(Event)
        .join(Fixture, Event.fixture_id == Fixture.id)
        .where(Fixture.season_id == season.id)
        .where((Event.player_id.in_(player_ids)) | (Event.related_player_id.in_(player_ids)))
        .options(selectinload(Event.event_type))
    )
    for event in events_result.scalars().all():
        if not event.event_type:
            continue
        dev = (event.event_type.developer_name or "").upper()
        pid = event.player_id
        if dev in _GOAL_TYPES and pid in player_ids:
            player_points[pid] += weights["goal"]
        elif dev in _ASSIST_TYPES and pid in player_ids:
            player_points[pid] += weights["assist"]
        elif dev in _YELLOW_TYPES and pid in player_ids:
            player_points[pid] += weights["yellow_card"]
        elif dev in _RED_TYPES and pid in player_ids:
            player_points[pid] += weights["red_card"]
        if dev in _GOAL_TYPES and event.related_player_id in player_ids:
            player_points[event.related_player_id] += weights["assist"]

    gk_ids = {
        e.player_id
        for e in draft_entries
        if e.player_id and e.player and e.player.position and e.player.position.category == "GK"
    }
    if gk_ids:
        cs = await _per_player_clean_sheets(session, season.id, gk_ids, weights)
        for pid, pts in cs.items():
            player_points[pid] = player_points.get(pid, 0.0) + pts

    return player_points


async def compute_all_player_points(session: AsyncSession) -> dict[int, float]:
    """Returns player_id → total points for ALL players in the active season (one pass)."""
    season = await _get_active_season(session)
    if season is None:
        return {}

    weights = await _load_weights(session, season.id)

    events_result = await session.execute(
        select(Event)
        .join(Fixture, Event.fixture_id == Fixture.id)
        .where(Fixture.season_id == season.id)
        .options(selectinload(Event.event_type))
    )

    player_points: dict[int, float] = defaultdict(float)

    for event in events_result.scalars().all():
        if not event.event_type:
            continue
        dev = (event.event_type.developer_name or "").upper()
        pid = event.player_id
        if pid is not None:
            if dev in _GOAL_TYPES:
                player_points[pid] += weights["goal"]
            elif dev in _ASSIST_TYPES:
                player_points[pid] += weights["assist"]
            elif dev in _YELLOW_TYPES:
                player_points[pid] += weights["yellow_card"]
            elif dev in _RED_TYPES:
                player_points[pid] += weights["red_card"]
        if dev in _GOAL_TYPES and event.related_player_id is not None:
            player_points[event.related_player_id] += weights["assist"]

    # Clean sheets for all GKs in the season
    gk_result = await session.execute(
        select(Player)
        .join(Position, Player.position_id == Position.id)
        .where(Player.season_id == season.id)
        .where(Position.category == "GK")
    )
    gk_ids = {p.id for p in gk_result.scalars().all()}
    if gk_ids:
        cs = await _per_player_clean_sheets(session, season.id, gk_ids, weights)
        for pid, pts in cs.items():
            player_points[pid] += pts

    return dict(player_points)


async def _per_player_clean_sheets(
    session: AsyncSession, season_id: int, gk_ids: set[int], weights: dict[str, float]
) -> dict[int, float]:
    fixtures_result = await session.execute(
        select(Fixture)
        .where(Fixture.season_id == season_id)
        .options(
            selectinload(Fixture.participants),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    cs: dict[int, float] = {}
    for fixture in fixtures_result.scalars().all():
        if fixture.state not in ACTIVE_STATES:
            continue
        goals_conceded, starter_ids, sub_on, sub_off = _parse_fixture_events(fixture)
        fixture_team_ids = {p.team_id for p in fixture.participants}
        for pid in gk_ids:
            keeper_team = _find_keeper_team(pid, fixture, starter_ids, sub_on)
            if keeper_team not in fixture_team_ids:
                continue
            if not _keeper_played(pid, starter_ids, sub_on, sub_off):
                continue
            if goals_conceded.get(keeper_team, 0) == 0:
                # Volatile (LIVE) clean sheets still count toward per-player points display
                cs[pid] = cs.get(pid, 0.0) + weights["clean_sheet"]
    return cs


def _parse_fixture_events(
    fixture: "Fixture",
) -> tuple[dict[int, int], dict[int, int], dict[int, int], dict[int, int]]:
    goals_conceded: dict[int, int] = {}
    starter_ids: dict[int, int] = {}
    sub_on: dict[int, int] = {}
    sub_off: dict[int, int] = {}

    # Build player→team lookup from lineups (fallback for events missing team_id)
    player_team: dict[int, int] = {}
    for lu in fixture.lineups:
        if lu.player_id:
            starter_ids[lu.player_id] = lu.type_id or 0
            if lu.team_id:
                player_team[lu.player_id] = lu.team_id

    for event in fixture.events:
        if not event.event_type:
            continue
        dev = (event.event_type.developer_name or "").upper()
        if dev in _GOAL_TYPES and event.period_id != PENALTY_SHOOTOUT_PERIOD:
            scoring_team = event.team_id or (player_team.get(event.player_id) if event.player_id else None)
            if scoring_team:
                for p in fixture.participants:
                    if p.team_id != scoring_team:
                        goals_conceded[p.team_id] = goals_conceded.get(p.team_id, 0) + 1
        elif dev == "OWNGOAL" and event.period_id != PENALTY_SHOOTOUT_PERIOD:
            # Own goal: the scorer's team concedes
            own_goal_team = event.team_id or (player_team.get(event.player_id) if event.player_id else None)
            if own_goal_team:
                goals_conceded[own_goal_team] = goals_conceded.get(own_goal_team, 0) + 1
        elif dev == "SUBSTITUTION":
            if event.player_id:
                sub_on[event.player_id] = event.minute or 0
            if event.related_player_id:
                sub_off[event.related_player_id] = event.minute or 0

    return goals_conceded, starter_ids, sub_on, sub_off


# ---------------------------------------------------------------------------
# Per-user score events (for scoreboard detail page)
# ---------------------------------------------------------------------------


@dataclass
class ScoreEvent:
    player_id: int | None
    player_name: str | None
    player_image_path: str | None
    team_name: str | None
    team_image_path: str | None
    opponent_name: str | None
    opponent_image_path: str | None
    event_type: str  # goal | assist | yellow_card | red_card | clean_sheet | coach_winner
    minute: int | None
    points: float
    fixture_name: str | None
    is_volatile: bool = False


async def compute_user_score_events(session: AsyncSession, user_id: int) -> list[ScoreEvent]:
    season = await _get_active_season(session)
    if season is None:
        return []

    weights = await _load_weights(session, season.id)

    draft_result = await session.execute(
        select(Draft)
        .where(Draft.user_id == user_id, Draft.season_id == season.id)
        .options(
            selectinload(Draft.player).selectinload(Player.team),
            selectinload(Draft.player).selectinload(Player.position),
            selectinload(Draft.coach).selectinload(Coach.team),
        )
    )
    draft_entries = list(draft_result.scalars().all())

    player_map: dict[int, "Player"] = {}
    gk_ids: set[int] = set()
    coach = None

    for entry in draft_entries:
        if entry.player:
            player_map[entry.player.id] = entry.player
            if entry.player.position and entry.player.position.category == "GK":
                gk_ids.add(entry.player.id)
        if entry.coach:
            coach = entry.coach

    player_ids = set(player_map.keys())

    events_result = await session.execute(
        select(Event)
        .join(Fixture, Event.fixture_id == Fixture.id)
        .where(Fixture.season_id == season.id)
        .where((Event.player_id.in_(player_ids)) | (Event.related_player_id.in_(player_ids)))
        .options(selectinload(Event.event_type))
    )
    events = list(events_result.scalars().all())

    fixture_ids = {e.fixture_id for e in events if e.fixture_id}
    fixture_map: dict[int, Fixture] = {}
    if fixture_ids:
        fx_result = await session.execute(
            select(Fixture)
            .where(Fixture.id.in_(fixture_ids))
            .options(selectinload(Fixture.participants).selectinload(FixtureParticipant.team))
        )
        fixture_map = {f.id: f for f in fx_result.scalars().all()}

    score_events: list[ScoreEvent] = []

    for event in events:
        if not event.event_type:
            continue
        dev = (event.event_type.developer_name or "").upper()

        pid: int | None = None
        event_type: str | None = None
        pts: float = 0.0

        if dev in _GOAL_TYPES and event.player_id in player_ids:
            pid, event_type, pts = event.player_id, "goal", weights["goal"]
        elif dev in _ASSIST_TYPES and event.player_id in player_ids:
            pid, event_type, pts = event.player_id, "assist", weights["assist"]
        elif dev in _YELLOW_TYPES and event.player_id in player_ids:
            pid, event_type, pts = event.player_id, "yellow_card", weights["yellow_card"]
        elif dev in _RED_TYPES and event.player_id in player_ids:
            pid, event_type, pts = event.player_id, "red_card", weights["red_card"]
        elif dev in _GOAL_TYPES and event.related_player_id in player_ids:
            pid, event_type, pts = event.related_player_id, "assist", weights["assist"]

        if pid is None or event_type is None:
            continue

        player = player_map[pid]
        fixture = fixture_map.get(event.fixture_id) if event.fixture_id else None
        player_team_id = player.team_id
        opponent = _get_opponent_team(fixture, player_team_id)

        score_events.append(
            ScoreEvent(
                player_id=pid,
                player_name=player.display_name,
                player_image_path=player.image_path,
                team_name=player.team.name if player.team else None,
                team_image_path=player.team.image_path if player.team else None,
                opponent_name=opponent.name if opponent else None,
                opponent_image_path=opponent.image_path if opponent else None,
                event_type=event_type,
                minute=event.minute,
                points=pts,
                fixture_name=fixture.name if fixture else None,
            )
        )

    if gk_ids:
        cs_events = await _clean_sheet_events(session, season.id, gk_ids, player_map, weights)
        score_events.extend(cs_events)

    tc_result = await session.execute(
        select(TournamentConfig).where(TournamentConfig.season_id == season.id)
    )
    tc = tc_result.scalar_one_or_none()
    if tc and tc.winner_team_id and coach and coach.team_id == tc.winner_team_id:
        score_events.append(
            ScoreEvent(
                player_id=None,
                player_name=coach.display_name,
                player_image_path=coach.image_path,
                team_name=coach.team.name if coach.team else None,
                team_image_path=coach.team.image_path if coach.team else None,
                opponent_name=None,
                opponent_image_path=None,
                event_type="coach_winner",
                minute=None,
                points=weights["coach_winner"],
                fixture_name=None,
            )
        )

    return sorted(score_events, key=lambda e: (e.minute is None, e.minute or 0))


async def compute_player_score_events(session: AsyncSession, player_id: int) -> list[ScoreEvent]:
    """Returns all scoring events for a single player (active season)."""
    season = await _get_active_season(session)
    if season is None:
        return []

    weights = await _load_weights(session, season.id)

    player_result = await session.execute(
        select(Player)
        .where(Player.id == player_id, Player.season_id == season.id)
        .options(selectinload(Player.team), selectinload(Player.position))
    )
    player = player_result.scalar_one_or_none()
    if not player:
        return []

    is_gk = player.position and player.position.category == "GK"

    events_result = await session.execute(
        select(Event)
        .join(Fixture, Event.fixture_id == Fixture.id)
        .where(Fixture.season_id == season.id)
        .where((Event.player_id == player_id) | (Event.related_player_id == player_id))
        .options(selectinload(Event.event_type))
    )
    events = list(events_result.scalars().all())

    fixture_ids = {e.fixture_id for e in events if e.fixture_id}
    fixture_map: dict[int, Fixture] = {}
    if fixture_ids:
        fx_result = await session.execute(
            select(Fixture)
            .where(Fixture.id.in_(fixture_ids))
            .options(selectinload(Fixture.participants).selectinload(FixtureParticipant.team))
        )
        fixture_map = {f.id: f for f in fx_result.scalars().all()}

    score_events: list[ScoreEvent] = []
    player_map = {player.id: player}

    for event in events:
        if not event.event_type:
            continue
        dev = (event.event_type.developer_name or "").upper()

        pid: int | None = None
        event_type: str | None = None
        pts: float = 0.0

        if dev in _GOAL_TYPES and event.player_id == player_id:
            pid, event_type, pts = player_id, "goal", weights["goal"]
        elif dev in _ASSIST_TYPES and event.player_id == player_id:
            pid, event_type, pts = player_id, "assist", weights["assist"]
        elif dev in _YELLOW_TYPES and event.player_id == player_id:
            pid, event_type, pts = player_id, "yellow_card", weights["yellow_card"]
        elif dev in _RED_TYPES and event.player_id == player_id:
            pid, event_type, pts = player_id, "red_card", weights["red_card"]
        elif dev in _GOAL_TYPES and event.related_player_id == player_id:
            pid, event_type, pts = player_id, "assist", weights["assist"]

        if pid is None or event_type is None:
            continue

        fixture = fixture_map.get(event.fixture_id) if event.fixture_id else None
        opponent = _get_opponent_team(fixture, player.team_id)

        score_events.append(
            ScoreEvent(
                player_id=pid,
                player_name=player.display_name,
                player_image_path=player.image_path,
                team_name=player.team.name if player.team else None,
                team_image_path=player.team.image_path if player.team else None,
                opponent_name=opponent.name if opponent else None,
                opponent_image_path=opponent.image_path if opponent else None,
                event_type=event_type,
                minute=event.minute,
                points=pts,
                fixture_name=fixture.name if fixture else None,
            )
        )

    if is_gk:
        cs_events = await _clean_sheet_events(session, season.id, {player_id}, player_map, weights)
        score_events.extend(cs_events)

    return sorted(score_events, key=lambda e: (e.minute is None, e.minute or 0))


def _get_opponent_team(fixture: "Fixture | None", team_id: int | None):
    if not fixture or not team_id:
        return None
    for p in fixture.participants:
        if p.team_id != team_id and p.team:
            return p.team
    return None


async def _clean_sheet_events(
    session: AsyncSession,
    season_id: int,
    gk_ids: set[int],
    player_map: dict[int, "Player"],
    weights: dict[str, float],
) -> list[ScoreEvent]:
    fixtures_result = await session.execute(
        select(Fixture)
        .where(Fixture.season_id == season_id)
        .options(
            selectinload(Fixture.participants).selectinload(FixtureParticipant.team),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    cs_events: list[ScoreEvent] = []
    for fixture in fixtures_result.scalars().all():
        if fixture.state not in ACTIVE_STATES:
            continue
        is_live = fixture.state in LIVE_STATES
        goals_conceded, starter_ids, sub_on, sub_off = _parse_fixture_events(fixture)
        fixture_team_ids = {p.team_id for p in fixture.participants}
        for pid in gk_ids:
            keeper_team = _find_keeper_team(pid, fixture, starter_ids, sub_on)
            if keeper_team not in fixture_team_ids:
                continue
            if not _keeper_played(pid, starter_ids, sub_on, sub_off):
                continue
            if goals_conceded.get(keeper_team, 0) == 0:
                player = player_map.get(pid)
                opponent = _get_opponent_team(fixture, keeper_team)
                cs_events.append(
                    ScoreEvent(
                        player_id=pid,
                        player_name=player.display_name if player else None,
                        player_image_path=player.image_path if player else None,
                        team_name=player.team.name if player and player.team else None,
                        team_image_path=player.team.image_path if player and player.team else None,
                        opponent_name=opponent.name if opponent else None,
                        opponent_image_path=opponent.image_path if opponent else None,
                        event_type="clean_sheet",
                        minute=None,
                        points=weights["clean_sheet"],
                        fixture_name=fixture.name,
                        is_volatile=is_live,
                    )
                )
    return cs_events


# ---------------------------------------------------------------------------
# Live view data
# ---------------------------------------------------------------------------


@dataclass
class LivePlayer:
    player_id: int
    display_name: str | None
    image_path: str | None
    team_image_path: str | None
    position_category: str | None
    drafted_by_username: str
    total_points: float
    live_points: float
    is_active: bool  # True if on pitch (starter not subbed off, or came on as sub)


@dataclass
class LiveScoreEvent:
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


@dataclass
class FixturePlayer:
    player_id: int
    display_name: str | None
    image_path: str | None
    team_image_path: str | None
    position_category: str | None
    drafted_by_username: str
    points: float


@dataclass
class LiveData:
    is_live: bool
    next_kickoff: datetime | None = None
    players: list[LivePlayer] = field(default_factory=list)
    events: list[LiveScoreEvent] = field(default_factory=list)


async def compute_live_data(session: AsyncSession) -> LiveData:
    season = await _get_active_season(session)
    if season is None:
        return LiveData(is_live=False)

    weights = await _load_weights(session, season.id)

    # Next scheduled (NS) fixture for active season
    next_kickoff_result = await session.execute(
        select(Fixture.starting_at)
        .where(Fixture.season_id == season.id)
        .where(Fixture.state == "NS")
        .where(Fixture.starting_at.isnot(None))
        .where(Fixture.starting_at > datetime.utcnow())
        .order_by(Fixture.starting_at)
        .limit(1)
    )
    next_kickoff: datetime | None = next_kickoff_result.scalar_one_or_none()

    # Load LIVE fixtures with all needed relations
    live_result = await session.execute(
        select(Fixture)
        .where(Fixture.season_id == season.id)
        .where(Fixture.state.in_(list(LIVE_STATES)))
        .options(
            selectinload(Fixture.participants),
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.lineups),
        )
    )
    live_fixtures = list(live_result.scalars().all())

    if not live_fixtures:
        return LiveData(is_live=False, next_kickoff=next_kickoff)

    # Collect team IDs participating in live fixtures
    live_team_ids: set[int] = set()
    for fx in live_fixtures:
        for p in fx.participants:
            live_team_ids.add(p.team_id)

    # Load all draft entries for this season, including player + team + user
    drafts_result = await session.execute(
        select(Draft)
        .where(Draft.season_id == season.id)
        .where(Draft.player_id.isnot(None))
        .options(
            selectinload(Draft.player).selectinload(Player.position),
            selectinload(Draft.player).selectinload(Player.team),
            selectinload(Draft.user),
        )
    )
    all_drafts = list(drafts_result.scalars().all())

    # Filter to players whose team is in a live fixture
    live_player_ids: set[int] = set()
    player_to_username: dict[int, str] = {}
    player_obj: dict[int, Player] = {}

    for entry in all_drafts:
        if not entry.player or not entry.player_id:
            continue
        if entry.player.team_id in live_team_ids:
            pid = entry.player_id
            live_player_ids.add(pid)
            player_to_username[pid] = entry.user.username if entry.user else "?"
            player_obj[pid] = entry.player

    if not live_player_ids:
        return LiveData(is_live=True, next_kickoff=next_kickoff)

    # Compute points from live fixtures only
    live_player_points: dict[int, float] = {pid: 0.0 for pid in live_player_ids}
    live_events: list[LiveScoreEvent] = []

    for fixture in live_fixtures:
        for event in fixture.events:
            if not event.event_type:
                continue
            dev = (event.event_type.developer_name or "").upper()

            pid: int | None = None
            event_type_str: str | None = None
            pts: float = 0.0

            if dev in _GOAL_TYPES and event.player_id in live_player_ids:
                pid, event_type_str, pts = event.player_id, "goal", weights["goal"]
            elif dev in _ASSIST_TYPES and event.player_id in live_player_ids:
                pid, event_type_str, pts = event.player_id, "assist", weights["assist"]
            elif dev in _YELLOW_TYPES and event.player_id in live_player_ids:
                pid, event_type_str, pts = event.player_id, "yellow_card", weights["yellow_card"]
            elif dev in _RED_TYPES and event.player_id in live_player_ids:
                pid, event_type_str, pts = event.player_id, "red_card", weights["red_card"]
            elif dev in _GOAL_TYPES and event.related_player_id in live_player_ids:
                pid, event_type_str, pts = event.related_player_id, "assist", weights["assist"]

            if pid is not None and event_type_str is not None:
                live_player_points[pid] = live_player_points.get(pid, 0.0) + pts
                player = player_obj.get(pid)
                live_events.append(
                    LiveScoreEvent(
                        player_id=pid,
                        player_name=player.display_name if player else None,
                        player_image_path=player.image_path if player else None,
                        team_name=player.team.name if player and player.team else None,
                        team_image_path=player.team.image_path if player and player.team else None,
                        drafted_by_username=player_to_username.get(pid),
                        event_type=event_type_str,
                        minute=event.minute,
                        points=pts,
                        fixture_name=fixture.name,
                    )
                )

    # Clean sheet (volatile) from live fixtures for GK players
    gk_ids_live = {
        pid for pid in live_player_ids
        if player_obj[pid].position and player_obj[pid].position.category == "GK"
    }
    for fixture in live_fixtures:
        goals_conceded, starter_ids_fx, sub_on_fx, sub_off_fx = _parse_fixture_events(fixture)
        fixture_team_ids = {p.team_id for p in fixture.participants}
        for pid in gk_ids_live:
            keeper_team = _find_keeper_team(pid, fixture, starter_ids_fx, sub_on_fx)
            if keeper_team not in fixture_team_ids:
                continue
            if not _keeper_played(pid, starter_ids_fx, sub_on_fx, sub_off_fx):
                continue
            if goals_conceded.get(keeper_team, 0) == 0:
                live_player_points[pid] = live_player_points.get(pid, 0.0) + weights["clean_sheet"]
                player = player_obj.get(pid)
                live_events.append(
                    LiveScoreEvent(
                        player_id=pid,
                        player_name=player.display_name if player else None,
                        player_image_path=player.image_path if player else None,
                        team_name=player.team.name if player and player.team else None,
                        team_image_path=player.team.image_path if player and player.team else None,
                        drafted_by_username=player_to_username.get(pid),
                        event_type="clean_sheet",
                        minute=None,
                        points=weights["clean_sheet"],
                        fixture_name=fixture.name,
                    )
                )

    # Compute total points from ALL completed+live fixtures for these players
    all_fixtures_result = await session.execute(
        select(Fixture)
        .where(Fixture.season_id == season.id)
        .where(Fixture.state.in_(list(ACTIVE_STATES)))
        .options(
            selectinload(Fixture.events).selectinload(Event.event_type),
            selectinload(Fixture.participants),
            selectinload(Fixture.lineups),
        )
    )
    all_fixtures = list(all_fixtures_result.scalars().all())

    total_player_points: dict[int, float] = {pid: 0.0 for pid in live_player_ids}

    for fixture in all_fixtures:
        for event in fixture.events:
            if not event.event_type:
                continue
            dev = (event.event_type.developer_name or "").upper()
            if dev in _GOAL_TYPES and event.player_id in live_player_ids:
                total_player_points[event.player_id] += weights["goal"]
            elif dev in _ASSIST_TYPES and event.player_id in live_player_ids:
                total_player_points[event.player_id] += weights["assist"]
            elif dev in _YELLOW_TYPES and event.player_id in live_player_ids:
                total_player_points[event.player_id] += weights["yellow_card"]
            elif dev in _RED_TYPES and event.player_id in live_player_ids:
                total_player_points[event.player_id] += weights["red_card"]
            if dev in _GOAL_TYPES and event.related_player_id in live_player_ids:
                total_player_points[event.related_player_id] += weights["assist"]

        # Clean sheets from all fixtures
        goals_conceded, starter_ids_fx, sub_on_fx, sub_off_fx = _parse_fixture_events(fixture)
        fixture_team_ids = {p.team_id for p in fixture.participants}
        for pid in gk_ids_live:
            keeper_team = _find_keeper_team(pid, fixture, starter_ids_fx, sub_on_fx)
            if keeper_team not in fixture_team_ids:
                continue
            if not _keeper_played(pid, starter_ids_fx, sub_on_fx, sub_off_fx):
                continue
            if goals_conceded.get(keeper_team, 0) == 0:
                total_player_points[pid] += weights["clean_sheet"]

    # Determine playing status from live fixture lineups
    player_is_active: dict[int, bool] = {pid: False for pid in live_player_ids}
    for fixture in live_fixtures:
        _, starter_ids_fx, sub_on_fx, sub_off_fx = _parse_fixture_events(fixture)
        fixture_team_ids = {p.team_id for p in fixture.participants}
        for pid in live_player_ids:
            player = player_obj[pid]
            if player.team_id not in fixture_team_ids:
                continue
            is_starter = starter_ids_fx.get(pid) == LINEUP_STARTER
            is_sub_on = pid in sub_on_fx
            is_sub_off = pid in sub_off_fx
            if (is_starter and not is_sub_off) or is_sub_on:
                player_is_active[pid] = True

    result_players = [
        LivePlayer(
            player_id=pid,
            display_name=player_obj[pid].display_name,
            image_path=player_obj[pid].image_path,
            team_image_path=player_obj[pid].team.image_path if player_obj[pid].team else None,
            position_category=player_obj[pid].position.category if player_obj[pid].position else None,
            drafted_by_username=player_to_username.get(pid, "?"),
            total_points=total_player_points.get(pid, 0.0),
            live_points=live_player_points.get(pid, 0.0),
            is_active=player_is_active.get(pid, False),
        )
        for pid in live_player_ids
    ]

    # Sort events: most recent minute first, None (clean sheets) last
    live_events.sort(key=lambda e: (e.minute is None, -(e.minute or 0)))

    return LiveData(is_live=True, next_kickoff=next_kickoff, players=result_players, events=live_events)


async def compute_fixture_data(
    session: AsyncSession, fixture: "Fixture"
) -> tuple[list[FixturePlayer], list[LiveScoreEvent]]:
    """Compute drafted player points and events for a specific fixture."""
    season = await _get_active_season(session)
    if season is None or fixture.state not in ACTIVE_STATES:
        return [], []

    weights = await _load_weights(session, season.id)

    fixture_team_ids = {p.team_id for p in fixture.participants}

    drafts_result = await session.execute(
        select(Draft)
        .where(Draft.season_id == season.id)
        .where(Draft.player_id.isnot(None))
        .options(
            selectinload(Draft.player).selectinload(Player.position),
            selectinload(Draft.player).selectinload(Player.team),
            selectinload(Draft.user),
        )
    )
    all_drafts = list(drafts_result.scalars().all())

    player_ids: set[int] = set()
    player_to_username: dict[int, str] = {}
    player_obj: dict[int, Player] = {}

    for entry in all_drafts:
        if not entry.player or not entry.player_id:
            continue
        if entry.player.team_id in fixture_team_ids:
            pid = entry.player_id
            player_ids.add(pid)
            player_to_username[pid] = entry.user.username if entry.user else "?"
            player_obj[pid] = entry.player

    player_points: dict[int, float] = {pid: 0.0 for pid in player_ids}
    events_out: list[LiveScoreEvent] = []

    for event in fixture.events:
        if not event.event_type:
            continue
        dev = (event.event_type.developer_name or "").upper()

        pid: int | None = None
        event_type_str: str | None = None
        pts: float = 0.0

        if dev in _GOAL_TYPES and event.player_id in player_ids:
            pid, event_type_str, pts = event.player_id, "goal", weights["goal"]
        elif dev in _ASSIST_TYPES and event.player_id in player_ids:
            pid, event_type_str, pts = event.player_id, "assist", weights["assist"]
        elif dev in _YELLOW_TYPES and event.player_id in player_ids:
            pid, event_type_str, pts = event.player_id, "yellow_card", weights["yellow_card"]
        elif dev in _RED_TYPES and event.player_id in player_ids:
            pid, event_type_str, pts = event.player_id, "red_card", weights["red_card"]
        elif dev in _GOAL_TYPES and event.related_player_id in player_ids:
            pid, event_type_str, pts = event.related_player_id, "assist", weights["assist"]

        if pid is not None and event_type_str is not None:
            player_points[pid] += pts
            player = player_obj.get(pid)
            events_out.append(
                LiveScoreEvent(
                    player_id=pid,
                    player_name=player.display_name if player else None,
                    player_image_path=player.image_path if player else None,
                    team_name=player.team.name if player and player.team else None,
                    team_image_path=player.team.image_path if player and player.team else None,
                    drafted_by_username=player_to_username.get(pid),
                    event_type=event_type_str,
                    minute=event.minute,
                    points=pts,
                    fixture_name=fixture.name,
                )
            )

    # Clean sheets
    gk_ids = {
        pid
        for pid in player_ids
        if player_obj[pid].position and player_obj[pid].position.category == "GK"
    }
    if gk_ids:
        goals_conceded, starter_ids, sub_on, sub_off = _parse_fixture_events(fixture)
        for pid in gk_ids:
            keeper_team = _find_keeper_team(pid, fixture, starter_ids, sub_on)
            if keeper_team not in fixture_team_ids:
                continue
            if not _keeper_played(pid, starter_ids, sub_on, sub_off):
                continue
            if goals_conceded.get(keeper_team, 0) == 0:
                player_points[pid] += weights["clean_sheet"]
                player = player_obj.get(pid)
                events_out.append(
                    LiveScoreEvent(
                        player_id=pid,
                        player_name=player.display_name if player else None,
                        player_image_path=player.image_path if player else None,
                        team_name=player.team.name if player and player.team else None,
                        team_image_path=player.team.image_path if player and player.team else None,
                        drafted_by_username=player_to_username.get(pid),
                        event_type="clean_sheet",
                        minute=None,
                        points=weights["clean_sheet"],
                        fixture_name=fixture.name,
                    )
                )

    events_out.sort(key=lambda e: (e.minute is None, -(e.minute or 0)))

    result_players = [
        FixturePlayer(
            player_id=pid,
            display_name=player_obj[pid].display_name,
            image_path=player_obj[pid].image_path,
            team_image_path=player_obj[pid].team.image_path if player_obj[pid].team else None,
            position_category=player_obj[pid].position.category if player_obj[pid].position else None,
            drafted_by_username=player_to_username.get(pid, "?"),
            points=player_points.get(pid, 0.0),
        )
        for pid in player_ids
    ]

    return result_players, events_out
