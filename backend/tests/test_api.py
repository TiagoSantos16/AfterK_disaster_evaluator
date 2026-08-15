from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

ALLOWED_CLASSES = {
    "fallen_tree",
    "damaged_house",
    "broken_light",
    "wildfire_hazard",
    "blocked_road",
}


def test_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_datasets():
    response = client.get("/api/v1/datasets")
    assert response.status_code == 200
    datasets = response.json()
    assert isinstance(datasets, list)
    assert len(datasets) > 0
    assert any(dataset["id"] == "marinha-grande-storm" for dataset in datasets)
    first = datasets[0]
    assert len(first["coordinates"]) == 2
    assert isinstance(first["zoom"], float)
    assert "defaultPoints" in first


def test_damages_existing_dataset():
    response = client.get("/api/v1/damages/marinha-grande-storm")
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_id"] == "marinha-grande-storm"
    assert len(payload["data"]) > 0

    properties = payload["data"][0]["properties"]
    assert "class" in properties
    assert "class_name" not in properties
    assert properties["class"] in ALLOWED_CLASSES


def test_damages_unknown_dataset():
    response = client.get("/api/v1/damages/does-not-exist")
    assert response.status_code == 404
    assert "detail" in response.json()
