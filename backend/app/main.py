from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import AsyncSessionLocal, engine
from app.models import *  # noqa: F401,F403 — ensures all models are registered with Base
from app.routers import admin, auth, drafts, fixtures, players, scores
from app.scheduler import start_scheduler, stop_scheduler
from app.services.seeding import seed_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as session:
        await seed_all(session)
    start_scheduler()
    yield
    stop_scheduler()
    await engine.dispose()


app = FastAPI(title="RB Scoreboard", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(scores.router, prefix="/api", tags=["api"])
app.include_router(drafts.router, prefix="/api", tags=["api"])
app.include_router(players.router, prefix="/api", tags=["api"])
app.include_router(fixtures.router, prefix="/api", tags=["api"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/")
async def health():
    return {"status": "ok", "service": "RB Scoreboard Backend"}
