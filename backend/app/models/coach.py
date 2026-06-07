from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Coach(Base):
    __tablename__ = "coaches"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))
    name: Mapped[str | None] = mapped_column(String)
    display_name: Mapped[str | None] = mapped_column(String)
    image_path: Mapped[str | None] = mapped_column(String)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    country_id: Mapped[int | None] = mapped_column(Integer)

    team: Mapped["Team | None"] = relationship("Team", back_populates="coaches")  # noqa: F821
    draft_entries: Mapped[list["Draft"]] = relationship("Draft", back_populates="coach")  # noqa: F821
