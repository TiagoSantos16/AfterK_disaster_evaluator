# AfterK Disaster Evaluator

A map-based dashboard for post-storm damage assessment. After a windstorm hit the Marinha Grande area, the damage took too long to repair and there was no quick way to see it as a whole. This project answers that: where the damage is, how severe, and what is still outstanding, so the people responding can decide where to act first. It is built to be reused for future storms and for the current situation.

## What it does

Damage reports appear as points on a map with a category (fallen tree, damaged house, broken street light, wildfire hazard, blocked road), a severity score, and an active or resolved status. You can filter and recolor categories, switch between pre and post storm imagery, and change the basemap from satellite imagery to a street map or a semantic OSM mask (buildings, water, roads, land use). Right-clicking drops a note, and new imagery can be imported through the settings panel.

The map works without the backend and falls back to embedded demo data if the API is unreachable.

## Try it

The dashboard is hosted on GitHub Pages: [AfterK Disaster Evaluator](https://tiagosantos16.github.io/AfterK_disaster_evaluator/)

The live demo runs without a backend — the map, damage points, timeline, and satellite imagery all work from static files committed to the repo.

The demo ships with satellite images downloaded ahead of time, so every zone and date is covered. To keep the page light it includes only a couple of the band views; for the full set of data sources, clone the repo and run it locally.

### Run locally

You need Python 3.11+ and Node 20+.

**Frontend** (no backend required — falls back to demo data):

```
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

**Backend** (optional — needed for live Sentinel-2 imagery from Copernicus):

```
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and fill in your Copernicus CDSE credentials (free at https://dataspace.copernicus.eu/). Then:

```
uvicorn app.main:app --reload --port 8000
```

The frontend will connect to the backend automatically when `VITE_API_BASE_URL=http://localhost:8000` is set in `.env`.

**Tests:**

```
cd frontend && npm test        # 22 vitest tests
cd backend && python -m pytest -q   # 21 pytest tests
```

## Project snapshot

- React 18, TypeScript, Vite, deck.gl, MapLibre GL
- FastAPI backend with a static dataset catalog under /api/v1
- 5 damage categories, pre/post comparison, 3 basemap modes
- 22 frontend unit tests (vitest) and 21 backend tests (pytest)
- Deployed to GitHub Pages by CI on every push to main
- Supabase (PostGIS + REST) planned as the data layer once real data is wired in

## Status and next steps

The project is in Phase 0: a working prototype on demo data. Real data is the current focus: evaluating satellite sources (Sentinel-1 SAR, Landsat 8/9, Maxar Open Data, Copernicus EMS, national orthophotos) and building a small pipeline to pull pre and post imagery for an event automatically.

I'm training a change-detection model now. Once it is ready it will compare pre and post scenes and flag damaged areas automatically, replacing the placeholder points that currently stand in for the affected zones.

## Deployment

CI builds the static frontend and deploys it to GitHub Pages on every push to main. The dashboard is fully static; the backend runs locally only.
