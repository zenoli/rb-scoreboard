"""Pydantic models for Sportmonks v3 API response shapes."""

from pydantic import BaseModel, Field


class SMPosition(BaseModel):
    id: int
    name: str
    code: str | None = None


class SMPlayer(BaseModel):
    id: int
    common_name: str | None = None
    display_name: str | None = None
    image_path: str | None = None
    position_id: int | None = None
    detailed_position_id: int | None = None
    jersey_number: int | None = None


class SMTeamPlayer(BaseModel):
    """Represents the team_player join record with nested player."""
    player_id: int
    team_id: int
    jersey_number: int | None = None
    player: SMPlayer | None = None


class SMCoach(BaseModel):
    id: int
    name: str | None = None
    display_name: str | None = None
    image_path: str | None = None
    country_id: int | None = None
    # team_id resolved from the teams include
    team_id: int | None = None


class SMTeam(BaseModel):
    id: int
    name: str
    short_code: str | None = None
    image_path: str | None = None
    country_id: int | None = None
    players: list[SMTeamPlayer] = Field(default_factory=list)
    coaches: list[SMCoach] = Field(default_factory=list)


class SMEventType(BaseModel):
    id: int
    name: str | None = None
    code: str | None = None
    developer_name: str | None = None


class SMParticipant(BaseModel):
    id: int
    meta: dict | None = None  # contains "location": "home"/"away"


class SMEvent(BaseModel):
    id: int
    fixture_id: int
    team_id: int | None = None
    player_id: int | None = None
    related_player_id: int | None = None
    type_id: int | None = None
    period_id: int | None = None
    minute: int | None = None
    extra_minute: int | None = None


class SMLineup(BaseModel):
    id: int
    fixture_id: int
    player_id: int | None = None
    team_id: int | None = None
    type_id: int | None = None  # 11 = starter, 12 = bench
    position: str | None = None


class SMFixture(BaseModel):
    id: int
    name: str | None = None
    starting_at: str | None = None
    state: str | None = None
    stage_id: int | None = None
    round_id: int | None = None
    participants: list[SMParticipant] = Field(default_factory=list)
    events: list[SMEvent] = Field(default_factory=list)
    lineups: list[SMLineup] = Field(default_factory=list)
