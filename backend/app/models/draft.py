from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Draft(Base):
    __tablename__ = "drafts"
    __table_args__ = (UniqueConstraint("user_id", "player_id", "season_id", name="uq_draft_user_player_season"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))
    # Exactly one of player_id or coach_id is set per row
    player_id: Mapped[int | None] = mapped_column(ForeignKey("players.id"))
    coach_id: Mapped[int | None] = mapped_column(ForeignKey("coaches.id"))

    user: Mapped["User"] = relationship("User", back_populates="draft_entries")  # noqa: F821
    player: Mapped["Player | None"] = relationship("Player", back_populates="draft_entries")  # noqa: F821
    coach: Mapped["Coach | None"] = relationship("Coach", back_populates="draft_entries")  # noqa: F821
