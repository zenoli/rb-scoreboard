from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    name: Mapped[str] = mapped_column(String, nullable=False)
    code: Mapped[str | None] = mapped_column(String)
    # Manually assigned: GK, DEF, MID, FWD
    category: Mapped[str | None] = mapped_column(String)

    players: Mapped[list["Player"]] = relationship("Player", back_populates="position")  # noqa: F821
