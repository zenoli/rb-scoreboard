from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Lineup(Base):
    __tablename__ = "lineups"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    fixture_id: Mapped[int] = mapped_column(ForeignKey("fixtures.id"))
    player_id: Mapped[int | None] = mapped_column(ForeignKey("players.id"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    # Sportmonks type_id: 11 = starter, 12 = bench/substitute
    type_id: Mapped[int | None] = mapped_column(Integer)
    position: Mapped[str | None] = mapped_column(String)

    fixture: Mapped["Fixture"] = relationship("Fixture", back_populates="lineups")  # noqa: F821
    player: Mapped["Player | None"] = relationship("Player")  # noqa: F821
    team: Mapped["Team | None"] = relationship("Team")  # noqa: F821
