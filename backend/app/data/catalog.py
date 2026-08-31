from __future__ import annotations

from datetime import datetime, timezone

from app.schemas.damage import DatasetConfig, DamagePoint, TimelineConfig


def _damage_point(
    point_id: str,
    class_name: str,
    coordinates: tuple[float, float],
    severity: float,
    status: str,
    description: str,
    timestamp: str,
) -> DamagePoint:
    return DamagePoint.model_validate(
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": coordinates},
            "properties": {
                "id": point_id,
                "class": class_name,
                "severity": severity,
                "status": status,
                "description": description,
                "timestamp": timestamp,
            },
        }
    )


DATASETS: list[DatasetConfig] = [
    DatasetConfig(
        id="marinha-grande-storm",
        name="Target Region: Marinha Grande & Leiria",
        city="Leiria, Portugal",
        coordinates=(-8.9315, 39.7495),
        zoom=13.0,
        description="Windstorm aftermath with power and housing damage near industrial and residential blocks.",
        rawRasterUrl="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        bounds=(-9.051361, 39.717751, -8.76709, 39.783213),
        timeline=TimelineConfig(start="2026-01-18", eventDate="2026-01-27", end="2026-03-17"),
        defaultPoints=[
            _damage_point(
                "mg-001",
                "fallen_tree",
                (-8.9345, 39.7506),
                0.76,
                "active",
                "Large eucalyptus down across bike lane and shoulder.",
                "2026-07-22T22:17:00Z",
            ),
            _damage_point(
                "mg-002",
                "fallen_tree",
                (-8.9289, 39.7469),
                0.58,
                "resolved",
                "Branch debris removed, remaining stump hazard marked.",
                "2026-07-22T20:12:00Z",
            ),
            _damage_point(
                "mg-003",
                "damaged_house",
                (-8.9327, 39.7522),
                0.88,
                "active",
                "Roof tile uplift with partial rain ingress.",
                "2026-07-22T23:02:00Z",
            ),
            _damage_point(
                "mg-004",
                "damaged_house",
                (-8.9268, 39.7483),
                0.43,
                "resolved",
                "Temporary tarp and electrical inspection complete.",
                "2026-07-22T19:21:00Z",
            ),
            _damage_point(
                "mg-005",
                "broken_light",
                (-8.9297, 39.7449),
                0.62,
                "active",
                "Street light pole tilted after transformer surge.",
                "2026-07-22T21:05:00Z",
            ),
            _damage_point(
                "mg-006",
                "broken_light",
                (-8.9374, 39.7478),
                0.39,
                "resolved",
                "Lamp head replaced, line restored.",
                "2026-07-22T18:50:00Z",
            ),
        ],
    ),
    DatasetConfig(
        id="leiria-fuel-risk",
        name="Leiria District Wildfire Fuel Risk",
        city="Leiria District, Portugal",
        coordinates=(-8.8071, 39.7436),
        zoom=12.6,
        description="High-risk roadside vegetation and ignition corridors requiring preemptive clearing.",
        rawRasterUrl="https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        defaultPoints=[
            _damage_point(
                "lr-001",
                "wildfire_hazard",
                (-8.8032, 39.7462),
                0.93,
                "active",
                "Dense dry fuel accumulation near roadway edge.",
                "2026-07-22T16:14:00Z",
            ),
            _damage_point(
                "lr-002",
                "wildfire_hazard",
                (-8.8118, 39.7397),
                0.85,
                "active",
                "Wind-exposed brush corridor within utility right-of-way.",
                "2026-07-22T17:02:00Z",
            ),
            _damage_point(
                "lr-003",
                "blocked_road",
                (-8.7986, 39.7444),
                0.67,
                "active",
                "Emergency access road partially blocked by debris piles.",
                "2026-07-22T15:08:00Z",
            ),
            _damage_point(
                "lr-004",
                "fallen_tree",
                (-8.8151, 39.7473),
                0.53,
                "resolved",
                "Tree cleared from turnout lane adjacent to pine stand.",
                "2026-07-22T14:35:00Z",
            ),
        ],
    ),
]


def get_dataset_catalog() -> list[DatasetConfig]:
    return DATASETS


def get_dataset_or_none(dataset_id: str) -> DatasetConfig | None:
    for dataset in DATASETS:
        if dataset.id == dataset_id:
            return dataset
    return None


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
