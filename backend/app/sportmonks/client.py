from typing import Any

import httpx

from app.config import settings

BASE_URL = "https://api.sportmonks.com/v3"


async def get(
    *path_segments: str | int,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generic GET against the Sportmonks v3 API. Returns the full response dict."""
    url = BASE_URL + "/" + "/".join(str(s) for s in path_segments)
    default_params: dict[str, Any] = {"api_token": settings.sm_api_key}
    if params:
        default_params.update(params)
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url, params=default_params)
        resp.raise_for_status()
        return resp.json()


async def get_paginated(
    *path_segments: str | int,
    params: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Fetch all pages from a paginated Sportmonks endpoint."""
    collected: list[dict[str, Any]] = []
    page = 1
    while True:
        p = dict(params or {})
        p["page"] = page
        p.setdefault("per_page", 100)
        data = await get(*path_segments, params=p)
        items = data.get("data", [])
        collected.extend(items)
        pagination = data.get("pagination", {})
        if not pagination.get("has_more", False):
            break
        page += 1
    return collected
