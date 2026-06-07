from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.season import Season
from app.routers.deps import require_admin_key
from app.services.seeding import seed_scoring_rules_for_season

# Public router — mounted at /api
public_router = APIRouter()

# Admin router — mounted at /admin
admin_router = APIRouter(dependencies=[Depends(require_admin_key)])


class SeasonResponse(BaseModel):
    id: int
    name: str
    sm_season_id: int
    is_active: bool

    model_config = {"from_attributes": True}


class CreateSeasonRequest(BaseModel):
    name: str
    sm_season_id: int


@public_router.get("/seasons", response_model=list[SeasonResponse])
async def list_seasons(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Season).order_by(Season.id))
    return result.scalars().all()


@admin_router.post("/seasons", response_model=SeasonResponse, status_code=status.HTTP_201_CREATED)
async def create_season(body: CreateSeasonRequest, session: AsyncSession = Depends(get_db)):
    season = Season(name=body.name, sm_season_id=body.sm_season_id, is_active=False)
    session.add(season)
    await session.commit()
    await session.refresh(season)
    await seed_scoring_rules_for_season(session, season.id)
    return season


@admin_router.put("/seasons/{season_id}/activate", response_model=SeasonResponse)
async def activate_season(season_id: int, session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Season).where(Season.id == season_id))
    season = result.scalar_one_or_none()
    if season is None:
        raise HTTPException(status_code=404, detail="Season not found")

    # Deactivate all seasons, then activate the selected one
    all_result = await session.execute(select(Season))
    for s in all_result.scalars().all():
        s.is_active = False

    season.is_active = True
    await session.commit()
    await session.refresh(season)
    return season
