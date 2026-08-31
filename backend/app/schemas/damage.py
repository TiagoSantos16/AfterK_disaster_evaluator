from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DamageClass = Literal[
    "fallen_tree",
    "damaged_house",
    "broken_light",
    "wildfire_hazard",
    "blocked_road",
]

LayerMode = Literal["raw", "segmentation", "split"]


class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]


class DamageProperties(BaseModel):
    id: str
    class_name: DamageClass = Field(alias="class")
    severity: float = Field(ge=0.0, le=1.0)
    status: Literal["active", "resolved"]
    description: str
    timestamp: datetime

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class DamagePoint(BaseModel):
    type: Literal["Feature"] = "Feature"
    geometry: PointGeometry
    properties: DamageProperties


class TimelineConfig(BaseModel):
    start: str
    eventDate: str
    end: str


class DatasetConfig(BaseModel):
    id: str
    name: str
    city: str
    coordinates: tuple[float, float]
    zoom: float
    description: str
    rawRasterUrl: str | None = None
    segmentationVectorUrl: str | None = None
    bounds: tuple[float, float, float, float] | None = None
    timeline: TimelineConfig | None = None
    defaultPoints: list[DamagePoint]


class TimelineScene(BaseModel):
    date: str
    captureDate: str
    cloudCover: float | None = None
    tileUrlTemplate: str
    itemId: str


class TimelineResponse(BaseModel):
    dataset_id: str
    window: TimelineConfig | None = None
    scenes: list[TimelineScene]


class DamageListResponse(BaseModel):
    dataset_id: str
    data: list[DamagePoint]
