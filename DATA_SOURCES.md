# Geospatial Data Sources for Municipal Disaster Response
**State-of-the-Art Evaluation: August 2026**

## Executive Summary
Modern municipal disaster management requires high-frequency, multi-modal geospatial data to provide actionable intelligence to emergency responders. Relying solely on optical imagery is no longer viable due to cloud cover during severe weather events. Today's state-of-the-art architectures leverage a combination of Synthetic Aperture Radar (SAR) for all-weather visibility, high-resolution optical data for visual verification, and AI-derived predictive datasets. Through modern SpatioTemporal Asset Catalogs (STAC) and Cloud Optimized GeoTIFFs (COG), municipalities can automate the ingestion of this data at near-zero cost using open-source and humanitarian commercial tiers.

---

## Ranked Summary Table of Primary Data Sources

| Dataset Name | Sensor Type | Spatial Resolution | Revisit Frequency | Cost / Access Tier | Best For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Umbra Open Data Catalog** | X-Band SAR | 0.16m - 1.0m | Sub-daily (Mid-latitudes) | Free (CC BY 4.0) via AWS S3 / STAC | High-resolution, cloud-penetrating change detection; granular infrastructure damage assessment. |
| **Copernicus Sentinel-1 (C & D)** | C-Band SAR | Down to 5m (IW / EW modes) | 6-day exact repeat (C/D pair) | 100% Free / Open Source (CDSE) | Consistent, wide-area baseline monitoring; regional flood extent mapping. |
| **Maxar Open Data Program** | Optical (Pan / Multispectral) | 0.30m - 0.50m (WorldView) | Up to 15 revisits/day (Legion) | Free for humanitarian events via STAC | High-resolution true-color visual verification of post-disaster structural environments. |
| **ICEYE Open Data Initiative** | X-Band SAR | 0.16m (Gen4) - 0.25m (Dwell) | Daily to Sub-daily | Free via AWS / STAC | Persistent monitoring; automated flood and hurricane building-level impact analytics. |
| **Planet Disaster Data (Charter)** | Optical (Multispectral) | Sub-meter to 3m | Daily (Global) | Free via International Charter | Rapid event-activated monitoring; wide-area optical situational awareness. |
| **Capella Space Open Data** | X-Band SAR | 0.25m - 1.2m | Mixed-orbit rapid revisit | Free via Open Data Gallery | Rapid-tasking structural anomaly detection; maritime and terrestrial moving asset tracking. |
| **Copernicus Sentinel-2 (A & B)** | Optical (Multispectral/SWIR) | 10m - 20m | 5-day | 100% Free / Open Source (CDSE) | Wildfire burn severity indices (NBR/dNBR); vegetative health tracking; soil moisture modeling. |
| **Google Dynamic World** | AI-Derived LULC | 10m | 2-5 days (tied to Sentinel-2) | Free via Google Earth Engine | Near real-time automated land cover classification; tracking rapid surface changes and inundation. |
| **NASA Black Marble (VIIRS)** | Nighttime Lights (Optical) | 500m | Daily | 100% Free / Open Source | Tracking power grid failures, blackout cascades, and post-disaster electrification recovery. |

---

## 1. Cloud-Penetrating SAR (Highest Priority for Storms)
Synthetic Aperture Radar (SAR) is the most critical asset for immediate disaster response because it penetrates heavy clouds, smoke, and rain, operating perfectly day or night. 

*   **Commercial X-Band (Umbra, ICEYE, Capella):** These provide the ultra-high resolution (0.16m to 1.2m) needed to spot individual collapsed roofs or blocked roads. Umbra and ICEYE host their data via STAC on AWS, making them entirely free and easy to query during designated humanitarian events.
*   **Public C-Band (Sentinel-1):** With Sentinel-1C and 1D now fully operational in their 6-day repeat orbit, this is the ultimate free tool for continuous macro-level baseline monitoring and mapping broad flood extents.
*   *Implementation Note:* SAR requires Amplitude Change Detection (ACD) to compare pre- and post-storm images, revealing new debris (often rendered blue) or missing buildings (often rendered red).

## 2. High-Resolution Optical & Multispectral
While SAR cuts through the storm, optical imagery is essential for human visual verification and vegetative analysis once the skies clear.

*   **Maxar & Planet:** The new Maxar WorldView Legion constellation offers up to 15 revisits a day at ~30cm resolution. During major disasters, Maxar and Planet open their archives for free via STAC APIs and the International Charter.
*   **Sentinel-2:** Sentinel-2's 5-day revisit cycle and Shortwave Infrared (SWIR) bands are vital for calculating the Delta Normalized Burn Ratio (dNBR) to map wildfire fuel risk and assess post-fire burn severity.
*   **Copernicus EMS (CEMS):** For platforms that want to skip processing raw pixels, CEMS provides a Rapid Mapping REST API that serves pre-calculated, ready-to-use vector shapefiles of flood and damage extents.

## 3. Emerging Tech & Environmental Analytics
*   **NASA Black Marble:** Uses VIIRS nighttime lights data at 500m resolution to map neighborhood-level power outages and track grid recovery post-storm.
*   **Google Dynamic World:** An AI model that processes Sentinel-2 data to output near real-time, 10m-resolution land cover probability maps every 2-5 days. It is perfect for automatically triggering alerts for sudden inundation or vegetation loss.

---

## Conclusion & Project Implementation Strategy

For the **Marinha Grande Disaster Dashboard**, a tiered data strategy will be implemented to balance cost, cloud interference, and analytical depth.

**Data Sources Selected for This Project:**
1.  **Copernicus Sentinel-2:** Will be used as the primary baseline for optical imagery and calculating localized wildfire fuel risks using SWIR/NIR indices.
2.  **NASA Black Marble:** Will be integrated to satisfy the specific requirement of tracking broken city lights and power grid failures on specific streets before and after storms.
3.  **Umbra Space Open Data (SAR):** Because optical imagery is severely limited by Portugal's cloudy storm systems, the dashboard will utilize Umbra's CC-BY 4.0 STAC API to pull sub-meter X-Band SAR data. This will allow the software to instantly detect fallen trees and collapsed houses within hours of a storm, regardless of weather conditions.
4.  **OpenStreetMap (OSM) / Carto Voyager:** Used as the semantic vector basemap to identify specific building and vegetation footprints.

**Workflow:** The application will maintain a passive optical baseline (Sentinel-2) and nighttime baseline (Black Marble). Upon a storm event, it will bypass optical limitations by querying Umbra SAR data to perform structural damage assessments, rendering the layers directly via the MapLibre/Deck.gl frontend.