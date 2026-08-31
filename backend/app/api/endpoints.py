from __future__ import annotations

import math
import re

from fastapi import APIRouter, HTTPException, Query, Response

from app.data.catalog import get_dataset_catalog, get_dataset_or_none
from app.schemas.damage import DamageListResponse, DatasetConfig, TimelineResponse, TimelineScene
from app.services import cdse as cdse_service
from app.services.cdse import (
    ALLOWED_BANDS,
    FIXED_CAPTURE_DATES,
    CdseConfigMissing,
    CdseNoData,
    CdseUnavailable,
)

import mercantile

router = APIRouter(prefix="/api/v1", tags=["datasets"])

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _resolve_bounds(bbox: str | None, dataset: DatasetConfig) -> tuple[float, float, float, float] | None:
    """Use the caller-supplied bbox when valid; otherwise fall back to the dataset AOI."""
    if bbox:
        parts = bbox.split(",")
        if len(parts) != 4:
            raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")
        try:
            return tuple(float(p) for p in parts)  # type: ignore[return-value]
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="bbox values must be numeric") from exc
    return dataset.bounds


@router.get("/health")
def health_check():
    return {"status": "ok"}


@router.get("/datasets", response_model=list[DatasetConfig])
def list_datasets():
    return get_dataset_catalog()


@router.get("/damages/{dataset_id}", response_model=DamageListResponse)
def list_dataset_damages(dataset_id: str):
    dataset = get_dataset_or_none(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return DamageListResponse(dataset_id=dataset_id, data=dataset.defaultPoints)


@router.get("/datasets/{dataset_id}/timeline", response_model=TimelineResponse)
def get_dataset_timeline(
    dataset_id: str,
    source: str = Query("sentinel-2", description="Data source: sentinel-2 or esri"),
    bbox: str | None = Query(None, description="Optional west,south,east,north override"),
):
    dataset = get_dataset_or_none(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if source == "esri" or dataset.timeline is None:
        return TimelineResponse(dataset_id=dataset_id, window=dataset.timeline, scenes=[])

    bounds = _resolve_bounds(bbox, dataset)
    if bounds is None:
        return TimelineResponse(dataset_id=dataset_id, window=dataset.timeline, scenes=[])

    cloud_by_date = cdse_service.cloud_cover_by_dates(bounds)

    scenes = [
        TimelineScene(
            date=date,
            captureDate=f"{date}T00:00:00Z",
            cloudCover=cloud_by_date.get(date),
            tileUrlTemplate="",
            itemId=f"s2-{date}",
        )
        for date in FIXED_CAPTURE_DATES
    ]
    return TimelineResponse(dataset_id=dataset_id, window=dataset.timeline, scenes=scenes)


@router.get("/tiles/sentinel2/{date}/{z}/{x}/{y}.png")
def get_sentinel2_tile(date: str, z: int, x: int, y: int, bands: str = Query("truecolor")):
    """Proxy an XYZ tile request to the CDSE Process API for the given date."""
    if not _DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if bands not in ALLOWED_BANDS:
        raise HTTPException(status_code=400, detail=f"bands must be one of: {', '.join(sorted(ALLOWED_BANDS))}")

    tile = mercantile.Tile(x=x, y=y, z=z)
    mb_bounds = mercantile.bounds(tile)
    bbox = (mb_bounds.west, mb_bounds.south, mb_bounds.east, mb_bounds.north)

    try:
        png_bytes = cdse_service.fetch_tile(bbox, date, bands=bands)
    except CdseNoData:
        # Nothing acquired that day over this tile — let the basemap show through.
        return Response(status_code=204)
    except CdseConfigMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except CdseUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(content=png_bytes, media_type="image/png")


@router.get("/imagery/sentinel2/{date}.png")
def get_sentinel2_zone_image(
    date: str,
    bbox: str = Query(..., description="west,south,east,north"),
    bands: str = Query("truecolor"),
    width: int = Query(1536, ge=64, le=4096),
):
    """Render the full zone as a single PNG via the CDSE Process API."""
    if not _DATE_RE.match(date):
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    if bands not in ALLOWED_BANDS:
        raise HTTPException(status_code=400, detail=f"bands must be one of: {', '.join(sorted(ALLOWED_BANDS))}")

    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(status_code=400, detail="bbox must be west,south,east,north")
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="bbox values must be numeric") from exc

    lon_span = east - west
    lat_span = north - south
    if lon_span <= 0 or lat_span <= 0:
        raise HTTPException(status_code=400, detail="bbox must have positive lon/lat span")

    mid_lat = (south + north) / 2.0
    lon_m = lon_span * 111320.0 * math.cos(math.radians(mid_lat))
    lat_m = lat_span * 110540.0
    height = max(64, min(4096, round(width * lat_m / lon_m)))

    try:
        png_bytes = cdse_service.fetch_tile((west, south, east, north), date, bands=bands, width=width, height=height)
    except CdseNoData:
        return Response(status_code=204)
    except CdseConfigMissing as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except CdseUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return Response(content=png_bytes, media_type="image/png")