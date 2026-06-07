from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TournamentConfig(Base):
    __tablename__ = "tournament_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))
    winner_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))

    winner_team: Mapped["Team | None"] = relationship("Team")  # noqa: F821
