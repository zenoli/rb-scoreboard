from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    player_id: Mapped[int | None] = mapped_column(ForeignKey("players.id"))
    related_player_id: Mapped[int | None] = mapped_column(Integer)  # assister; no FK to allow nulls cleanly
    type_id: Mapped[int | None] = mapped_column(ForeignKey("event_types.id"))
    period_id: Mapped[int | None] = mapped_column(Integer)
    minute: Mapped[int | None] = mapped_column(Integer)
    extra_minute: Mapped[int | None] = mapped_column(Integer)

    fixture: Mapped["Fixture"] = relationship("Fixture", back_populates="events")  # noqa: F821
    team: Mapped["Team | None"] = relationship("Team")  # noqa: F821
    player: Mapped["Player | None"] = relationship("Player")  # noqa: F821
    event_type: Mapped["EventType | None"] = relationship("EventType", back_populates="events")  # noqa: F821
