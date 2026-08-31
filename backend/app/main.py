from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints import router as api_router

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

raw_origins = os.getenv(
    "BACKEND_CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://tneto.github.io",
)
allow_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app = FastAPI(title="GeoAI Disaster API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_origin_regex=r"https://.*\.github\.io",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)