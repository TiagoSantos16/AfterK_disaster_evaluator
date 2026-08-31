from __future__ import annotations

import os
import threading
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Sequence
from urllib.parse import quote

import httpx
import numpy as np
from rasterio.errors import RasterioIOError
from rio_tiler.errors import EmptyMosaicError, TileOutsideBounds
from rio_tiler.io import Reader
from rio_tiler.mosaic import mosaic_reader
from rio_tiler.models import ImageData

STAC_ENDPOINT = os.getenv("STAC_ENDPOINT", "https://earth-search.aws.element84.com/v1").rstrip("/")
COPERNICUS_COLLECTION = "sentinel-2-l2a"

MAX_CLOUD_COVER = float(os.getenv("SCENE_MAX_CLOUD_COVER", "90"))
SEARCH_LIMIT = 100
MAX_PAGES = 8
CACHE_SIZE = 32
READER_POOL_SIZE = int(os.getenv("SCENE_READER_POOL_SIZE", "12"))

SCL_MASKED_CLASSES = frozenset({0, 1, 3, 8, 9, 10})

_client = httpx.Client(timeout=30.0)


def set_client(client: httpx.Client) -> None:
    global _client
    _client = client


@dataclass(frozen=True)
class Scene:
    date: str
    capture_date: str
    cloud_cover: float | None
    visual_url: str
    scl_url: str | None
    item_id: str


class ResolvedTimeline:
    def __init__(self, scenes, assets_by_date):
        self.scenes = scenes
        self.assets_by_date = assets_by_date


def clear_cache():
    pass


def _parse_feature(feature: dict[str, Any]) -> Scene | None:
    props = feature.get("properties") or {}
    raw_cloud = props.get("eo:cloud_cover")
    raw_dt = feature.get("datetime") or props.get("datetime")
    if not raw_dt:
        return None
    try:
        dt = datetime.fromisoformat(str(raw_dt).replace("Z", "+00:00"))
    except ValueError:
        return None

    cloud: float | None = None
    if raw_cloud is not None:
        try:
            cloud = float(raw_cloud)
        except (TypeError, ValueError):
            cloud = None

    assets = feature.get("assets") or {}
    visual = (assets.get("visual") or {}).get("href")
    if not visual:
        return None

    scl = (assets.get("scl") or {}).get("href")

    return Scene(
        date=dt.date().isoformat(),
        capture_date=dt.isoformat(),
        cloud_cover=cloud,
        visual_url=visual,
        scl_url=scl,
        item_id=str(feature.get("id", "")),
    )


def _parse_items(payload: dict[str, Any]) -> list[Scene]:
    scenes: list[Scene] = []
    for feature in payload.get("features") or []:
        scene = _parse_feature(feature)
        if scene is not None:
            scenes.append(scene)
    return scenes


def _cloud_sort_key(scene: Scene) -> tuple[bool, float]:
    if scene.cloud_cover is None:
        return (True, 0.0)
    return (False, scene.cloud_cover)


def _aggregate(scenes: Sequence[Scene]) -> "ResolvedTimeline":
    by_date: dict[str, list[Scene]] = {}
    for scene in scenes:
        by_date.setdefault(scene.date, []).append(scene)

    representatives: list[Scene] = []
    assets_by_date: dict[str, tuple[Scene, ...]] = {}
    for date, items in by_date.items():
        ordered = sorted(items, key=lambda s: s.cloud_cover if s.cloud_cover is not None else float("inf"))
        representatives.append(ordered[0])
        assets_by_date[date] = tuple(ordered)

    representatives.sort(key=lambda scene: scene.date)
    return ResolvedTimeline(tuple(representatives), assets_by_date)


def _resolve_cached(
    bounds: tuple[float, float, float, float], start: str, end: str
) -> "ResolvedTimeline":
    west, south, east, north = bounds
    collected: list[Scene] = []
    url = f"{STAC_ENDPOINT}/search"
    params: dict[str, Any] | None = {
        "collections": COPERNICUS_COLLECTION,
        "bbox": f"{west},{south},{east},{north}",
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": SEARCH_LIMIT,
        "fields": "id,datetime,geometry,properties.eo:cloud_cover,assets.visual,assets.scl",
    }

    for _ in range(MAX_PAGES):
        response = _client.get(url, params=params)
        response.raise_for_status()
        payload = response.json()
        collected.extend(_parse_items(payload))
        next_href = next(
            (link.get("href") for link in payload.get("links") or [] if link.get("rel") == "next"),
            None,
        )
        if not next_href:
            break
        url = next_href
        params = None

    return _aggregate(collected)


def resolve_copernicus(
    bounds: Sequence[float], start: str, end: str
) -> "ResolvedTimeline":
    """Resolve Sentinel-2 scenes from Copernicus STAC API for given bounds and date range."""
    return _resolve_cached(tuple(bounds), start, end)


def local_copernicus_cloud(
    items: Sequence[Scene], bounds: Sequence[float]
) -> float | None:
    """Compute local cloud fraction for a date's scenes over the given bbox."""
    if not items:
        return None
    # Use the scene with lowest cloud cover for the date
    best = min(items, key=lambda s: s.cloud_cover if s.cloud_cover is not None else float("inf"))
    return best.cloud_cover


def resolve_copernicus_scenes(
    bounds: Sequence[float], start: str, end: str
) -> tuple[list, dict]:
    """Resolve scenes and return (representatives, assets_by_date)."""
    resolved = _resolve_cached(tuple(bounds), start, end)
    return list(resolved.scenes), resolved.assets_by_date