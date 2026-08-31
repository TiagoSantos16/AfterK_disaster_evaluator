from __future__ import annotations

import os
import threading
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
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
SCENE_COLLECTION = os.getenv("SCENE_COLLECTION", "sentinel-2-l2a")

SOURCE_COLLECTIONS = {
    "sentinel-2": "sentinel-2-l2a",
    "sentinel-1": "sentinel-1-grd",
}

MAX_CLOUD_COVER = float(os.getenv("SCENE_MAX_CLOUD_COVER", "90"))
SEARCH_LIMIT = 100
MAX_PAGES = 8
CACHE_SIZE = 32
READER_POOL_SIZE = int(os.getenv("SCENE_READER_POOL_SIZE", "12"))

SAR_VV_DB_RANGE = (-25.0, 0.0)
SAR_VH_DB_RANGE = (-30.0, -5.0)
SAR_RATIO_DB_RANGE = (-20.0, 0.0)

SCL_MASKED_CLASSES = frozenset({0, 1, 3, 8, 9, 10})


@dataclass(frozen=True)
class Scene:
    date: str
    capture_date: str
    cloud_cover: float | None
    visual_url: str
    item_id: str
    scl_url: str | None = None
    vh_url: str | None = None


class ResolvedTimeline:
    def __init__(self, scenes, assets_by_date):
        self.scenes = scenes
        self.assets_by_date = assets_by_date


_client = httpx.Client(timeout=30.0)


def set_client(client: httpx.Client) -> None:
    global _client
    _client = client


def clear_cache():
    _resolve_cached.cache_clear()
    _local_fraction_cached.cache_clear()
    close_all_readers()


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
    if cloud is not None and cloud > MAX_CLOUD_COVER:
        return None

    assets = feature.get("assets") or {}
    visual = (assets.get("visual") or {}).get("href") or (assets.get("vv") or {}).get("href")
    if not visual:
        return None

    scl = (assets.get("scl") or {}).get("href")
    vh = (assets.get("vh") or {}).get("href")

    return Scene(
        date=dt.date().isoformat(),
        capture_date=dt.isoformat(),
        cloud_cover=cloud,
        visual_url=visual,
        item_id=str(feature.get("id", "")),
        scl_url=scl,
        vh_url=vh,
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
        ordered = sorted(items, key=_cloud_sort_key)
        representatives.append(ordered[0])
        assets_by_date[date] = tuple(ordered)

    representatives.sort(key=lambda scene: scene.date)
    return ResolvedTimeline(tuple(representatives), assets_by_date)


@lru_cache(maxsize=CACHE_SIZE)
def _resolve_cached(
    collection: str,
    bounds: tuple[float, float, float, float],
    start: str,
    end: str,
) -> ResolvedTimeline:
    west, south, east, north = bounds
    collected: list[Scene] = []
    url = f"{STAC_ENDPOINT}/search"
    params: dict[str, Any] | None = {
        "collections": collection,
        "bbox": f"{west},{south},{east},{north}",
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": SEARCH_LIMIT,
        "fields": "id,datetime,geometry,properties.eo:cloud_cover,assets.visual,assets.scl,assets.vv,assets.vh",
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


def resolve_scenes(
    bounds: Sequence[float],
    start: str,
    end: str,
    source: str = "sentinel-2",
) -> ResolvedTimeline:
    if source == "umbra-open-data":
        from app.services import umbra_source

        scenes_list, _, _ = umbra_source.resolve_umbra_scenes(bounds, start, end)
        return _aggregate(scenes_list)
    collection = SOURCE_COLLECTIONS.get(source) or SCENE_COLLECTION
    return _resolve_cached(collection, tuple(bounds), start, end)


def nearest_scene_date(scenes: Sequence[Scene], target: str) -> str | None:
    if not scenes:
        return None
    try:
        target_dt = datetime.fromisoformat(target).date()
    except ValueError:
        return None

    best_date: str | None = None
    best_distance: int | None = None
    for scene in scenes:
        scene_dt = datetime.fromisoformat(scene.date).date()
        distance = abs((scene_dt - target_dt).days)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_date = scene.date
    return best_date


def date_tile_path(dataset_id: str, date: str, bbox: tuple[float, float, float, float] | None = None) -> str:
    qs = f"?date={quote(date)}"
    if bbox is not None:
        qs += f"&bbox={','.join(map(_format_coord, bbox))}"
    return f"/api/v1/datasets/{dataset_id}/scene-tiles/{{z}}/{{x}}/{{y}}{qs}"


def _format_coord(value: float) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return text if text else "0"


def _local_fraction_cached(scl_url: str, bounds: tuple[float, float, float, float]) -> float | None:
    try:
        reader = _pool.get(scl_url)
        with _pool.lock_for(scl_url):
            overview = reader.part(bounds, max_size=64)
    except Exception:
        return None

    band = overview.data[0]
    valid = overview.mask == 255
    total = int(valid.sum())
    if total == 0:
        return None
    cloudy = np.isin(band, list(SCL_MASKED_CLASSES)) & valid
    return float(cloudy.sum() / total)


def local_scene_cloud(scene: Scene, bounds: Sequence[float]) -> float | None:
    if scene.scl_url is None:
        return None
    return _local_fraction_cached(scene.scl_url, tuple(bounds))


def local_date_cloud(items: Sequence[Scene], bounds: Sequence[float]) -> float | None:
    fractions = [
        fraction
        for scene in items
        if (fraction := local_scene_cloud(scene, bounds)) is not None
    ]
    return min(fractions) if fractions else None


def order_assets_by_local_clarity(items: Sequence[Scene], bounds: Sequence[float]) -> list[Scene]:
    def sort_key(scene: Scene) -> tuple[bool, float]:
        fraction = local_scene_cloud(scene, bounds)
        if fraction is None:
            return (True, 1.0)
        return (False, fraction)

    return sorted(items, key=sort_key)


_pool = None
_READER_POOL_SIZE = int(os.getenv("SCENE_READER_POOL_SIZE", "12"))


class _ReaderPool:
    def __init__(self, maxsize: int) -> None:
        self._maxsize = maxsize
        self._lock = threading.Lock()
        self._items: OrderedDict[str, Reader] = OrderedDict()
        self._url_locks: dict[str, threading.Lock] = {}

    def lock_for(self, url: str) -> threading.Lock:
        with self._lock:
            url_lock = self._url_locks.get(url)
            if url_lock is None:
                url_lock = threading.Lock()
                self._url_locks[url] = url_lock
            return url_lock

    def get(self, url: str) -> Reader:
        with self._lock:
            reader = self._items.get(url)
            if reader is not None:
                self._items.move_to_end(url)
                return reader

        opened = Reader(url)

        with self._lock:
            self._items[url] = opened
            self._items.move_to_end(url)
            while len(self._items) > self._maxsize:
                _, evicted = self._items.popitem(last=False)
                _close_reader_quietly(evicted)
            return opened

    def close_all(self) -> None:
        with self._lock:
            while self._items:
                _, reader = self._items.popitem()
                _close_reader_quietly(reader)


_pool = _ReaderPool(_READER_POOL_SIZE)


def _close_reader_quietly(reader: Reader) -> None:
    try:
        reader.close()
    except Exception:
        pass


def close_all_readers() -> None:
    _pool.close_all()


def _pooled_tile(url: str, x: int, y: int, z: int) -> ImageData:
    reader = _pool.get(url)
    url_lock = _pool.lock_for(url)
    for attempt in range(2):
        try:
            with url_lock:
                return reader.tile(x, y, z)
        except RasterioIOError:
            if attempt == 0:
                continue
            raise


def _to_db(linear: np.ndarray) -> np.ndarray:
    return np.log10(np.clip(linear, 1e-6, None)) * 10.0


def _stretch(db: np.ndarray, value_range: tuple[float, float]) -> np.ndarray:
    lo, hi = value_range
    return np.clip((db - lo) / (hi - lo), 0.0, 1.0)


def _merge_alpha(vv_mask: np.ndarray, vh_mask: np.ndarray) -> np.ndarray:
    if vv_mask.shape == vh_mask.shape:
        return np.where((vv_mask != 0) & (vh_mask != 0), 255, 0).astype("uint8")
    return vv_mask


def sar_composite(scene, image: ImageData, x: int, y: int, z: int) -> ImageData:
    if scene.vh_url is None:
        return image

    try:
        vh_image = _pooled_tile(scene.vh_url, x, y, z)
    except Exception:
        return image

    vv = _stretch(_to_db(image.data[0]), SAR_VV_DB_RANGE)
    vh = _stretch(_to_db(vh_image.data[0]), SAR_VH_DB_RANGE)
    ratio = _stretch(_to_db(vh_image.data[0]) - _to_db(image.data[0]), SAR_RATIO_DB_RANGE)

    rgb = (np.stack([vv, vh, ratio]) * 255.0).round().clip(0, 255).astype("uint8")
    alpha = _merge_alpha(image.mask, vh_image.mask)
    return ImageData(rgb, alpha_mask=alpha)


def _render_scene(scene: Scene, x: int, y: int, z: int, mask_scl: bool = True) -> ImageData:
    from app.services import umbra_source

    image = _pooled_tile(scene.visual_url, x, y, z)

    if scene.vh_url is not None:
        return sar_composite(scene, image, x, y, z)
    if mask_scl and scene.scl_url is not None:
        masked = apply_scl_mask(scene, image, x, y, z)
        return masked if masked is not None else image
    # Single-band (e.g. Umbra GEC amplitude) → grayscale stretch.
    if image.data.shape[0] == 1:
        return umbra_source.grayscale_composite(scene, image, x, y, z)
    return image


def render_tile(items: Sequence[Scene], x: int, y: int, z: int, mask_scl: bool = True) -> ImageData:
    image, _mask = mosaic_reader(
        list(items),
        lambda scene: _render_scene(scene, x, y, z, mask_scl),
        allowed_exceptions=(TileOutsideBounds, RasterioIOError),
    )
    return image


def mask_from_scl(scl_band: np.ndarray, base_mask: np.ndarray | None = None) -> np.ndarray:
    cloudy = np.isin(scl_band, list(SCL_MASKED_CLASSES))
    mask = np.where(cloudy, 0, 255).astype("uint8")
    if base_mask is not None and base_mask.shape == mask.shape:
        mask[base_mask != 255] = 0
    return mask


def apply_scl_mask(scene: Scene, image: ImageData, x: int, y: int, z: int) -> ImageData | None:
    if scene.scl_url is None:
        return None
    try:
        scl_image = _pooled_tile(scene.scl_url, x, y, z)
    except Exception:
        return None

    scl_band = scl_image.data[0]
    if scl_band.shape != image.mask.shape:
        return None
    return ImageData(image.data, alpha_mask=mask_from_scl(scl_band, image.mask))


_TILE_CACHE_LOCK = threading.Lock()
_tile_cache: OrderedDict[str, bytes] = OrderedDict()
TILE_CACHE_SIZE = int(os.getenv("SCENE_TILE_CACHE_SIZE", "500"))


def tile_cache_get(key: str) -> bytes | None:
    with _TILE_CACHE_LOCK:
        data = _tile_cache.get(key)
        if data is not None:
            _tile_cache.move_to_end(key)
        return data


def tile_cache_put(key: str, data: bytes) -> None:
    with _TILE_CACHE_LOCK:
        _tile_cache[key] = data
        _tile_cache.move_to_end(key)
        while len(_tile_cache) > TILE_CACHE_SIZE:
            _tile_cache.popitem(last=False)


def clear_cache() -> None:
    _resolve_cached.cache_clear()
    _local_fraction_cached.cache_clear()
    close_all_readers()