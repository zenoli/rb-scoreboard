from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    name: Mapped[str] = mapped_column(String, nullable=False)
    short_code: Mapped[str | None] = mapped_column(String)
    image_path: Mapped[str | None] = mapped_column(String)
    country_id: Mapped[int | None] = mapped_column(Integer)

    players: Mapped[list["Player"]] = relationship("Player", back_populates="team")  # noqa: F821
    coaches: Mapped[list["Coach"]] = relationship("Coach", back_populates="team")  # noqa: F821
