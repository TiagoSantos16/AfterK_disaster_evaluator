from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.data.catalog import get_dataset_catalog, get_dataset_or_none
from app.schemas.damage import DamageListResponse, DatasetConfig

router = APIRouter(prefix="/api/v1", tags=["datasets"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/datasets", response_model=list[DatasetConfig])
def list_datasets() -> list[DatasetConfig]:
    return get_dataset_catalog()


@router.get("/damages/{dataset_id}", response_model=DamageListResponse)
def list_dataset_damages(dataset_id: str) -> DamageListResponse:
    dataset = get_dataset_or_none(dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return DamageListResponse(dataset_id=dataset_id, data=dataset.defaultPoints)
