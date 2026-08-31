"""Fast, fully-mocked tests for the CDSE tile proxy (no network)."""

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import cdse

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_token():
    cdse.invalidate_token()
    yield
    cdse.invalidate_token()


def _mock_client(handler):
    import httpx

    transport = httpx.MockTransport(handler)
    return httpx.Client(transport=transport)


def test_get_token_caches_single_request(monkeypatch):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(200, json={"access_token": "tok-1", "expires_in": 600})

    monkeypatch.setattr(cdse, "_client", _mock_client(handler))
    monkeypatch.setenv("CDSE_CLIENT_ID", "id")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "secret")

    assert cdse.get_token() == "tok-1"
    assert cdse.get_token() == "tok-1"
    assert calls["n"] == 1


def test_get_token_missing_config(monkeypatch):
    monkeypatch.delenv("CDSE_CLIENT_ID", raising=False)
    monkeypatch.delenv("CDSE_CLIENT_SECRET", raising=False)
    with pytest.raises(cdse.CdseConfigMissing):
        cdse.get_token()


def test_process_payload_shape():
    payload = cdse.build_process_payload((-9.0, 39.7, -8.8, 39.8), "2026-01-27")
    assert payload["input"]["bounds"]["bbox"] == [-9.0, 39.7, -8.8, 39.8]
    data = payload["input"]["data"][0]
    assert data["type"] == "sentinel-2-l2a"
    assert data["dataFilter"]["timeRange"]["from"] == "2026-01-27T00:00:00Z"
    assert payload["output"]["width"] == 256
    assert "VERSION=3" in payload["evalscript"]


def test_tile_endpoint_passthrough(monkeypatch):
    monkeypatch.setattr(cdse, "fetch_tile", lambda bbox, date, bands="truecolor": b"\x89PNG-bytes")
    response = client.get("/api/v1/tiles/sentinel2/2026-01-28/4/8/5.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG-bytes"


def test_tile_endpoint_no_data_returns_204(monkeypatch):
    def boom(bbox, date, bands="truecolor"):
        raise cdse.CdseNoData("no imagery")

    monkeypatch.setattr(cdse, "fetch_tile", boom)
    response = client.get("/api/v1/tiles/sentinel2/2026-01-28/4/8/5.png")
    assert response.status_code == 204


def test_tile_endpoint_bad_date_400():
    response = client.get("/api/v1/tiles/sentinel2/not-a-date/4/8/5.png")
    assert response.status_code == 400


def test_tile_endpoint_missing_config_503(monkeypatch):
    def no_cfg(bbox, date, bands="truecolor"):
        raise cdse.CdseConfigMissing("Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in .env")

    monkeypatch.setattr(cdse, "fetch_tile", no_cfg)
    response = client.get("/api/v1/tiles/sentinel2/2026-01-28/4/8/5.png")
    assert response.status_code == 503


def test_search_capture_days_min_cloud_per_day(monkeypatch):
    features = [
        {"properties": {"datetime": "2026-01-20T11:30:00Z", "eo:cloud_cover": 60}},
        {"properties": {"datetime": "2026-01-20T06:30:00Z", "eo:cloud_cover": 25}},
        {"properties": {"datetime": "2026-01-26T11:30:00Z"}},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"features": features, "links": []},
        )

    monkeypatch.setattr(cdse, "_client", _mock_client(handler))
    days = cdse.search_capture_days((-9, 39, -8, 40), "2026-01-01", "2026-02-01")

    assert days == [("2026-01-20", 25.0), ("2026-01-26", None)]


def test_imagery_endpoint_passthrough(monkeypatch):
    monkeypatch.setattr(cdse, "fetch_tile", lambda bbox, date, bands="truecolor", width=256, height=256: b"\x89PNG-zone")
    response = client.get("/api/v1/imagery/sentinel2/2026-01-28.png?bbox=-9.0,39.7,-8.8,39.8")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG-zone"


def test_imagery_endpoint_no_data_returns_204(monkeypatch):
    def boom(bbox, date, bands="truecolor", width=256, height=256):
        raise cdse.CdseNoData("no imagery")

    monkeypatch.setattr(cdse, "fetch_tile", boom)
    response = client.get("/api/v1/imagery/sentinel2/2026-01-28.png?bbox=-9.0,39.7,-8.8,39.8")
    assert response.status_code == 204


def test_imagery_endpoint_bad_date_400():
    response = client.get("/api/v1/imagery/sentinel2/not-a-date.png?bbox=-9.0,39.7,-8.8,39.8")
    assert response.status_code == 400


def test_imagery_endpoint_missing_config_503(monkeypatch):
    def no_cfg(bbox, date, bands="truecolor", width=256, height=256):
        raise cdse.CdseConfigMissing("Set CDSE_CLIENT_ID and CDSE_CLIENT_SECRET in .env")

    monkeypatch.setattr(cdse, "fetch_tile", no_cfg)
    response = client.get("/api/v1/imagery/sentinel2/2026-01-28.png?bbox=-9.0,39.7,-8.8,39.8")
    assert response.status_code == 503


def test_imagery_endpoint_bad_bbox_400():
    response = client.get("/api/v1/imagery/sentinel2/2026-01-28.png?bbox=bad")
    assert response.status_code == 400
