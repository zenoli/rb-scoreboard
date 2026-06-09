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
    player: Mapped["Player | None"] = relationship(  # noqa: F821
        "Player",
        primaryjoin="and_(Draft.player_id == Player.id, Draft.season_id == Player.season_id)",
        foreign_keys="[Draft.player_id, Draft.season_id]",
        back_populates="draft_entries",
        overlaps="coach",
    )
    coach: Mapped["Coach | None"] = relationship(  # noqa: F821
        "Coach",
        primaryjoin="and_(Draft.coach_id == Coach.id, Draft.season_id == Coach.season_id)",
        foreign_keys="[Draft.coach_id, Draft.season_id]",
        back_populates="draft_entries",
        overlaps="player",
    )
