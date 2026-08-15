import pytest
from pydantic import ValidationError

from app.schemas.damage import DamagePoint

VALID_POINT = {
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": (1.0, 2.0)},
    "properties": {
        "id": "p1",
        "class": "fallen_tree",
        "severity": 0.5,
        "status": "active",
        "description": "desc",
        "timestamp": "2026-01-01T00:00:00Z",
    },
}


def test_class_alias_roundtrip():
    point = DamagePoint.model_validate(VALID_POINT)
    assert point.properties.class_name == "fallen_tree"

    dumped = point.model_dump(by_alias=True)
    assert dumped["properties"]["class"] == "fallen_tree"
    assert "class_name" not in dumped["properties"]


def test_severity_out_of_range_is_rejected():
    invalid = {
        **VALID_POINT,
        "properties": {**VALID_POINT["properties"], "severity": 1.5},
    }
    with pytest.raises(ValidationError):
        DamagePoint.model_validate(invalid)


def test_unknown_class_is_rejected():
    invalid = {
        **VALID_POINT,
        "properties": {**VALID_POINT["properties"], "class": "mystery"},
    }
    with pytest.raises(ValidationError):
        DamagePoint.model_validate(invalid)


def test_non_point_geometry_is_rejected():
    invalid = {
        **VALID_POINT,
        "geometry": {"type": "Polygon", "coordinates": [[0, 0]]},
    }
    with pytest.raises(ValidationError):
        DamagePoint.model_validate(invalid)
