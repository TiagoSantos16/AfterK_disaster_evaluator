"""Copernicus Data Space Ecosystem (CDSE) Sentinel-2 tile proxy.

No local raster processing: XYZ tile requests are translated into lightweight
Process API POSTs and the rendered PNG bytes are streamed straight back.
"""

from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Sequence

import httpx
from functools import lru_cache

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
PROCESS_URL = "https://sh.dataspace.copernicus.eu/api/v1/process"
STAC_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"

EVALSCRIPTS: dict[str, str] = {
    "truecolor": (
        "//VERSION=3\n"
        "function setup() { return { input: [\"B04\", \"B03\", \"B02\", \"dataMask\"], output: { bands: 4 } }; }\n"
        "function evaluatePixel(sample) { return [2.5 * sample.B04, 2.5 * sample.B03, 2.5 * sample.B02, sample.dataMask]; }"
    ),
    "swir": (
        "//VERSION=3\n"
        "function setup() { return { input: [\"B12\", \"B11\", \"B04\", \"dataMask\"], output: { bands: 4 } }; }\n"
        "function evaluatePixel(sample) { return [sample.B12, sample.B11, sample.B04, sample.dataMask]; }"
    ),
    "cire": (
        "//VERSION=3\n"
        "function setup() { return { input: [\"B08\", \"B04\", \"B03\", \"dataMask\"], output: { bands: 4 } }; }\n"
        "function evaluatePixel(sample) { return [sample.B08, sample.B04, sample.B03, sample.dataMask]; }"
    ),
    "ndvi": (
        "//VERSION=3\n"
        "function setup() { return { input: [\"B04\", \"B08\", \"dataMask\"], output: { bands: 4 } }; }\n"
        "function evaluatePixel(sample) {\n"
        "  let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 0.001);\n"
        "  let r, g, b;\n"
        "  if (ndvi < 0) { r = 0.1; g = 0.1; b = 0.6; }\n"
        "  else if (ndvi < 0.2) { r = 0.85; g = 0.85; b = 0.2; }\n"
        "  else if (ndvi < 0.5) { r = 0.2; g = 0.85; b = 0.15; }\n"
        "  else { r = 0.02; g = 0.35; b = 0.02; }\n"
        "  return [r, g, b, sample.dataMask];\n"
        "}"
    ),
}

ALLOWED_BANDS = frozenset(EVALSCRIPTS.keys())

TOKEN_REFRESH_MARGIN_S = 60.0
HTTP_TIMEOUT_S = 30.0

FIXED_CAPTURE_DATES: tuple[str, ...] = (
    "2026-01-18",
    "2026-01-26",
    "2026-01-28",
    "2026-02-20",
    "2026-03-17",
)


class CdseConfigMissing(Exception):
    """CDSE_CLIENT_ID / CDSE_CLIENT_SECRET not configured."""


class CdseNoData(Exception):
    """CDSE has no imagery for the requested date/bbox."""


class CdseUnavailable(Exception):
    """CDSE request failed (network/timeout/server)."""


_client = httpx.Client(timeout=HTTP_TIMEOUT_S)


def set_client(client: httpx.Client) -> None:
    global _client
    _client = client


_token_lock = threading.Lock()
_token_value: str | None = None
_token_expires_at: float = 0.0


def _credentials() -> tuple[str, str]:
    client_id = os.getenv("CDSE_CLIENT_ID", "")
    client_secret = os.getenv("CDSE_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        raise CdseConfigMissing("Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in .env")
    return client_id, client_secret


def get_token() -> str:
    """Return a cached OAuth token, refreshing it shortly before expiry."""
    global _token_value, _token_expires_at

    with _token_lock:
        if _token_value and time.monotonic() < _token_expires_at - TOKEN_REFRESH_MARGIN_S:
            return _token_value

        client_id, client_secret = _credentials()
        try:
            response = _client.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            )
            response.raise_for_status()
        except Exception as exc:
            raise CdseUnavailable(f"CDSE token request failed: {exc}") from exc

        payload = response.json()
        _token_value = payload["access_token"]
        expires_in = float(payload.get("expires_in", 600))
        _token_expires_at = time.monotonic() + expires_in
        return _token_value


def invalidate_token() -> None:
    global _token_value, _token_expires_at
    with _token_lock:
        _token_value = None
        _token_expires_at = 0.0


def build_process_payload(
    bbox: Sequence[float], date: str, width: int = 256, height: int = 256, bands: str = "truecolor"
) -> dict[str, Any]:
    return {
        "input": {
            "bounds": {
                "bbox": [bbox[0], bbox[1], bbox[2], bbox[3]],
                "properties": {"crs": "http://www.opengis.net/def/crs/OGC/1.3/CRS84"},
            },
            "data": [
                {
                    "type": "sentinel-2-l2a",
                    "dataFilter": {
                        "timeRange": {
                            "from": f"{date}T00:00:00Z",
                            "to": f"{date}T23:59:59Z",
                        }
                    },
                }
            ],
        },
        "output": {
            "width": width,
            "height": height,
            "responses": [
                {"identifier": "default", "format": {"type": "image/png"}}
            ],
        },
        "evalscript": EVALSCRIPTS.get(bands, EVALSCRIPTS["truecolor"]),
    }


def fetch_tile(
    bbox: Sequence[float], date: str, bands: str = "truecolor",
    width: int = 256, height: int = 256,
) -> bytes:
    """Render one raster image for the given date via the CDSE Process API."""
    return _fetch_tile_cached(tuple(bbox), date, bands, width, height)


@lru_cache(maxsize=512)
def _fetch_tile_cached(
    bbox_tuple: tuple[float, ...], date: str, bands: str = "truecolor",
    width: int = 256, height: int = 256,
) -> bytes:
    token = get_token()
    payload = build_process_payload(list(bbox_tuple), date, width=width, height=height, bands=bands)

    for attempt in range(2):
        try:
            response = _client.post(
                PROCESS_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "image/png",
                },
            )
        except Exception as exc:
            raise CdseUnavailable(f"CDSE process request failed: {exc}") from exc

        content_type = response.headers.get("content-type", "")

        if response.status_code == 401 and attempt == 0:
            invalidate_token()
            token = get_token()
            continue

        if response.status_code >= 400:
            # CDSE signals "no data available" for the date/bbox as a 4xx with JSON body.
            raise CdseNoData(f"CDSE returned {response.status_code}: {response.text[:200]}")

        if "image/png" not in content_type:
            raise CdseNoData(f"CDSE returned non-image content-type: {content_type}")

        return response.content

    raise CdseUnavailable("CDSE request failed after token retry")


def search_capture_days(
    bbox: Sequence[float], start: str, end: str, limit: int = 200
) -> list[tuple[str, float | None]]:
    """Metadata-only STAC query (pure JSON): distinct capture days with min cloud cover.

    No raster processing — just Earth Search catalog lookups so the timeline can
    snap its stops to real acquisition dates.
    """
    west, south, east, north = bbox
    collected: dict[str, float | None] = {}

    body: dict[str, Any] | None = {
        "collections": ["sentinel-2-l2a"],
        "bbox": [west, south, east, north],
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z",
        "limit": 100,
        "fields": "properties.datetime,properties.eo:cloud_cover",
    }

    url = STAC_SEARCH_URL
    for _ in range(8):
        response = _client.post(url, json=body)
        response.raise_for_status()
        payload = response.json()

        for feature in payload.get("features") or []:
            props = feature.get("properties") or {}
            raw_dt = feature.get("datetime") or props.get("datetime")
            if not raw_dt:
                continue
            try:
                day = (
                    datetime.fromisoformat(str(raw_dt).replace("Z", "+00:00"))
                    .astimezone(timezone.utc)
                    .date()
                    .isoformat()
                )
            except ValueError:
                continue

            raw_cloud = props.get("eo:cloud_cover")
            cloud: float | None = None
            if raw_cloud is not None:
                try:
                    cloud = float(raw_cloud)
                except (TypeError, ValueError):
                    cloud = None

            existing = collected.get(day)
            if existing is None or (cloud is not None and cloud < existing):
                collected[day] = cloud

        next_href = next(
            (
                link.get("href")
                for link in payload.get("links") or []
                if link.get("rel") == "next"
            ),
            None,
        )
        if not next_href or len(collected) >= limit:
            break
        url = next_href
        body = None

    return sorted(collected.items())


def cloud_cover_by_dates(bbox: Sequence[float]) -> dict[str, float | None]:
    """Best-effort cloud-cover lookup for the fixed capture dates (STAC metadata only).

    Never raises: on any failure the dates simply come back without cloud values.
    """
    try:
        days = search_capture_days(bbox, FIXED_CAPTURE_DATES[0], FIXED_CAPTURE_DATES[-1])
    except Exception:
        return {}
    return dict(days)
