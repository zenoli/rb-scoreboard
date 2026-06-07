from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Fixture(Base):
    __tablename__ = "fixtures"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))
    name: Mapped[str | None] = mapped_column(String)
    starting_at: Mapped[datetime | None] = mapped_column(DateTime)
    state: Mapped[str | None] = mapped_column(String)  # NS, LIVE, FT, AET, PEN, etc.
    stage_id: Mapped[int | None] = mapped_column(Integer)
    round_id: Mapped[int | None] = mapped_column(Integer)

    participants: Mapped[list["FixtureParticipant"]] = relationship(
        "FixtureParticipant", back_populates="fixture", cascade="all, delete-orphan"
    )
    events: Mapped[list["Event"]] = relationship(  # noqa: F821
        "Event", back_populates="fixture", cascade="all, delete-orphan"
    )
    lineups: Mapped[list["Lineup"]] = relationship(  # noqa: F821
        "Lineup", back_populates="fixture", cascade="all, delete-orphan"
    )


class FixtureParticipant(Base):
    __tablename__ = "fixture_participants"

    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"), primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), primary_key=True)
    location: Mapped[str | None] = mapped_column(String)  # home / away

    fixture: Mapped["Fixture"] = relationship("Fixture", back_populates="participants")
    team: Mapped["Team"] = relationship("Team")  # noqa: F821
