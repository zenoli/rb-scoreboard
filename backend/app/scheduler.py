import asyncio
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings

logger = logging.getLogger(__name__)
_scheduler = BackgroundScheduler()


def _run_async(coro_fn, *args):
    """Run an async function from a sync APScheduler job."""
    try:
        asyncio.run(coro_fn(*args))
    except Exception:
        logger.exception("Sync job failed: %s", coro_fn.__name__)


def _hourly_sync():
    from app.services.sync import run_sync
    for target in ("event_types", "teams", "fixtures"):
        _run_async(run_sync, target)


def _event_sync():
    from app.services.sync import run_sync
    _run_async(run_sync, "events")
    _run_async(run_sync, "lineups")


def start_scheduler() -> None:
    _scheduler.add_job(_hourly_sync, "interval", hours=1, id="hourly_sync")
    _scheduler.add_job(
        _event_sync,
        "interval",
        seconds=settings.sync_event_interval_seconds,
        id="event_sync",
    )
    _scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    _scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
