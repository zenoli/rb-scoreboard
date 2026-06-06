from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventType(Base):
    __tablename__ = "event_types"

    id: Mapped[int] = mapped_column(primary_key=True)  # Sportmonks ID
    name: Mapped[str | None] = mapped_column(String)
    code: Mapped[str | None] = mapped_column(String)
    developer_name: Mapped[str | None] = mapped_column(String)

    events: Mapped[list["Event"]] = relationship("Event", back_populates="event_type")  # noqa: F821
