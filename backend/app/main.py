from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.models import *  # noqa: F401,F403 — ensures all models are registered with Base
from app.routers import admin, auth, drafts, fixtures, players, scores
from app.routers.seasons import admin_router as seasons_admin_router
from app.routers.seasons import bootstrap_seasons_if_empty
from app.routers.seasons import public_router as seasons_public_router
from app.scheduler import start_scheduler, stop_scheduler
from app.services.seeding import seed_all


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with AsyncSessionLocal() as session:
        await seed_all(session)
    await bootstrap_seasons_if_empty()
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
app.include_router(seasons_public_router, prefix="/api", tags=["api"])
app.include_router(seasons_admin_router, prefix="/admin", tags=["admin"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "RB Scoreboard Backend"}


if settings.static_dir:
    _static_root = Path(settings.static_dir)

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = _static_root / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        html_path = _static_root / (full_path + ".html")
        if html_path.is_file():
            return FileResponse(html_path)
        return FileResponse(_static_root / "index.html")
