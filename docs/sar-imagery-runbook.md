# Sentinel-1 SAR pre/post imagery — export runbook

Cloud makes Sentinel-2/Landsat optical unusable around the 2026-01-28 storm in Marinha Grande. Sentinel-1 (SAR/radar) sees through clouds and gives true right-before / right-after acquisitions (~6-day revisit over Europe).

Output: two grayscale/colored radar rasters (pre and post) plus an optional coherence change map, imported into the app via **Settings → Import source / Add date** (image upload, so export as JPEG/PNG). Works with the "Sentinel-1 SAR" satellite provider option.

## 0. Prerequisites

- Google Earth Engine account (free, noncommercial/community tier). code.earthengine.google.com
- QGIS (optional) to clip/reproject the export to Web Mercator and export a JPEG/PNG.

## 1. AOI

Marinha Grande / Leiria bounding box (same as the app's `marinha-grande-storm` dataset):

```
var aoi = ee.Geometry.BBox(-9.051361, 39.717751, -8.76709, 39.783213);
```

## 2. Pre and post backscatter composites

Paste into the GEE Code Editor. This builds a median VV/VH backscatter composite per window and exports a "SAR RGB" (VV, VH, VV/VH ratio) that reads like a radar photo. Pick one consistent orbit pass (DESCENDING shown; check both passes for coherence between dates).

```javascript
var aoi = ee.Geometry.BBox(-9.051361, 39.717751, -8.76709, 39.783213);

var WINDOWS = {
  pre:  { label: "pre",  start: "2026-01-20", end: "2026-01-27" },
  post: { label: "post", start: "2026-01-29", end: "2026-02-05" }
};

function s1Composite(start, end) {
  var col = ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    .select(["VV", "VH"]);

  var med = col.median();
  var vv = med.select("VV"), vh = med.select("VH");
  return ee.Image.cat([
    vv,                          // R
    vh,                          // G
    vv.divide(vh).rename("ratio") // B
  ])
    .clip(aoi)
    .log10().multiply(10);       // dB-ish stretch for display
}

Object.keys(WINDOWS).forEach(function (k) {
  var w = WINDOWS[k];
  var img = s1Composite(w.start, w.end);
  Map.addLayer(img, { min: [-15, -22, -5], max: [0, -5, 15] }, w.label);
  Export.image.toDrive({
    image: img,
    description: "marinha_s1_" + w.label,
    folder: "gee_sar",
    region: aoi,
    scale: 10,
    crs: "EPSG:3857",
    maxPixels: 1e13
  });
});
```

Notes:
- `scale: 10` = 10 m (Sentinel-1 GRD IW resolution). Increase to 20 for a lighter export.
- If a window has zero scenes, widen it by a few days; revisit is ~6 days per orbit.
- Compare both passes (DESCENDING/ASCENDING) so pre/post use the same geometry.

## 3. Export → app import

1. In GEE **Tasks**, run both `marinha_s1_pre` / `marinha_s1_post` exports (Drive, GeoTIFF).
2. In QGIS: open each GeoTIFF → **Raster → Extract → Clip raster by extent** to the AOI (EPSG:3857) → **Export → Save As…** → JPEG or PNG.
3. In the app: **Settings** → "Add Date to Existing Source" (or "Create New Source") → upload the pre image with date 2026-01-24 and the post image with date 2026-01-30, bounds as in §1 → set **Satellite provider = Sentinel-1 SAR**.
4. Toggle the pre/post variants in the sidebar to compare.

## 4. Optional: coherence change-detection layer (damage proxy)

GRD intensity (above) shows *where* the surface changed. Interferometric **coherence** is a stronger damage proxy (a sudden coherence drop over built-up areas = roof/structure change), but it needs Sentinel-1 **SLC**, which GEE does not host. Pipeline:

1. Download the same-track pre/post SLC products (or the `sentinel1_sar_coherence` openEO process on Copernicus Data Space).
2. Process with ASF **HyP3** (`sentinel1-interferogram` job) or ESA **SNAP** (Interferogram → Coherence) for pre and post pairs.
3. Compute pre coherence − post coherence, clip to the AOI, export as a single-band raster.
4. Import as a variant or overlay; treat low-coherence pixels in urban areas as "likely changed — verify on the ground".

## 5. Caveats

- SAR is radar, not a photo: trees/lines/buildings appear as bright/dark returns, not their visual shape.
- Backscatter change is sensitive to surface roughness/moisture; weather between the two passes can cause false positives. Keep pre/post as close to the storm as possible and prefer coherence over open (vegetated) ground.
- Attribution: contains modified Copernicus Sentinel data (2026).