from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Valid event keys
SCORE_KEYS = ("goal", "assist", "yellow_card", "red_card", "clean_sheet", "coach_winner")


class ScoringRule(Base):
    __tablename__ = "scoring_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
