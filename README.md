# AfterK Disaster Evaluator

A map-based dashboard for post-storm damage assessment. After a windstorm hit the Marinha Grande area, the damage took too long to repair and there was no quick way to see it as a whole. This project answers that: where the damage is, how severe, and what is still outstanding, so the people responding can decide where to act first. It is built to be reused for future storms and for the current situation.

## What it does

Damage reports appear as points on a map with a category (fallen tree, damaged house, broken street light, wildfire hazard, blocked road), a severity score, and an active or resolved status. You can filter and recolor categories, switch between pre and post storm imagery, and change the basemap from satellite imagery to a street map or a semantic OSM mask (buildings, water, roads, land use). Right-clicking drops a note, and new imagery can be imported through the settings panel.

The map works without the backend and falls back to embedded demo data if the API is unreachable.

## Try it

The dashboard is hosted on GitHub Pages: [AfterK Disaster Evaluator]( https://tiagosantos16.github.io/AfterK_disaster_evaluator/)

Run locally:

```
cd frontend
npm install
npm run dev
```

## Project snapshot

- React 18, TypeScript, Vite, deck.gl, MapLibre GL
- FastAPI backend with a static dataset catalog under /api/v1
- 5 damage categories, pre/post comparison, 3 basemap modes
- 19 frontend unit tests (vitest) and 8 backend tests (pytest)
- Deployed to GitHub Pages by CI on every push to main
- Supabase (PostGIS + REST) planned as the data layer once real data is wired in

## Status and next steps

The project is in Phase 0: a working prototype on demo data. Real data is the current focus: evaluating satellite sources (Sentinel-1 SAR, Landsat 8/9, Maxar Open Data, Copernicus EMS, national orthophotos) and building a small pipeline to pull pre and post imagery for an event automatically.

A change-detection model is planned. Once real imagery is available, it will compare pre and post scenes to flag damaged areas automatically, helping the app user decide which places need more help and when.

## Deployment

CI builds the static frontend and deploys it to GitHub Pages on every push to main. The dashboard is fully static; the backend runs locally only.
