import { useEffect, useRef, useState } from "react";

import { BitmapLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TileLayer } from "@deck.gl/geo-layers";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import {
  BasemapMode,
  DamagePoint,
  DatasetConfig,
  IncidentNote,
  MapNote,
  TemporalState,
} from "../types/dataset";
import { CategoryColors } from "../config/categoryColors";
import { cities as cityConfigs, CityConfig } from "../config/cities";
import { hexToRgba, escapeHtml } from "../utils/damage";
import { getOSMClass, getSemanticColor, isSemanticLayer, semanticColors, StyleLayerLike } from "../utils/osm";

const ESRI_WORLD_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

type IncidentAnnotation = {
  priority: boolean;
  notes: IncidentNote[];
};

type MapViewProps = {
  dataset: DatasetConfig;
  points: DamagePoint[];
  basemapMode: BasemapMode;
  segmentationEnabled: boolean;
  mapNotes: MapNote[];
  selectedPoint: DamagePoint | null;
  rawRasterUrl?: string;
  segmentationVectorUrl?: string;
  temporalState: TemporalState;
  categoryColors: CategoryColors;
  incidentAnnotations: Record<string, IncidentAnnotation>;
  onTogglePriority: (pointId: string) => void;
  onRequestAddIncidentNote: (point: DamagePoint) => void;
  onRemoveIncident: (pointId: string) => void;
  onRequestAddNote: (coordinates: [number, number]) => void;
  onSelectPoint: (point: DamagePoint | null) => void;
  cities: CityConfig[];
  activeCityId: string;
  onCitySelect: (id: string) => void;
  dataLoading: boolean;
};

const OSM_ATTRIBUTION = "© OpenStreetMap contributors © CARTO";
const VOYAGER_STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

maplibregl.setWorkerUrl(workerUrl);
const DEFAULT_SATELLITE_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const CITY_OUTLINE_SOURCE_ID = "city-outlines-source";
const CITY_OUTLINE_CASING_LAYER_ID = "city-outlines-casing-layer";
const CITY_OUTLINE_LAYER_ID = "city-outlines-layer";
const INACTIVE_OUTLINE_COLOR = "rgba(255, 255, 255, 0.85)";
const OUTLINE_CASING_COLOR = "rgba(4, 11, 19, 0.6)";
const LOAD_SAFETY_TIMEOUT_MS = 15000;

const cityOutlineCollection = (activeCityId: string) => ({
  type: "FeatureCollection" as const,
  features: cityConfigs.map((city) => ({
    type: "Feature" as const,
    properties: {
      cityId: city.id,
      color: city.id === activeCityId ? city.accent : INACTIVE_OUTLINE_COLOR,
      width: city.id === activeCityId ? 2 : 1,
      casingColor: OUTLINE_CASING_COLOR,
      casingWidth: (city.id === activeCityId ? 2 : 1) + 1,
    },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [city.bbox[0], city.bbox[1]],
          [city.bbox[2], city.bbox[1]],
          [city.bbox[2], city.bbox[3]],
          [city.bbox[0], city.bbox[3]],
          [city.bbox[0], city.bbox[1]],
        ],
      ],
    },
  })),
});

const legendItems: Array<{ label: string; color: string }> = [
  { label: "Buildings", color: semanticColors.building },
  { label: "Water", color: semanticColors.water },
  { label: "Vegetation", color: semanticColors.landcover },
  { label: "Roads", color: semanticColors.road },
  { label: "Facilities", color: semanticColors.facility },
  { label: "Urban / land use", color: semanticColors.urban },
  // { label: "Airports", color: semanticColors.airport },   // not use for now
];

const RESET_VIEW_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>';

class ResetViewControl implements maplibregl.IControl {
  constructor(
    private readonly center: [number, number],
    private readonly zoom: number,
  ) {}

  onAdd(map: maplibregl.Map): HTMLElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "reset-view-button";
    button.setAttribute("aria-label", "Reset map view to origin");
    button.title = "Reset view to origin";
    button.innerHTML = RESET_VIEW_ICON_SVG;
    button.addEventListener("click", () => {
      map.easeTo({ center: this.center, zoom: this.zoom, duration: 800, essential: true });
    });

    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    container.appendChild(button);
    return container;
  }

  onRemove(): void {}
}

const toNoteLabel = (note: MapNote) => {
  return note.text.trim().slice(0, 1).toUpperCase() || "N";
};

function MapView({
  dataset,
  points,
  basemapMode,
  segmentationEnabled,
  mapNotes,
  selectedPoint,
  rawRasterUrl,
  segmentationVectorUrl,
  temporalState,
  categoryColors,
  incidentAnnotations,
  onTogglePriority,
  onRequestAddIncidentNote,
  onRemoveIncident,
  onRequestAddNote,
  onSelectPoint,
  cities,
  activeCityId,
  onCitySelect,
  dataLoading,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const originalLayerVisibilityRef = useRef<Record<string, maplibregl.VisibilitySpecification | undefined>>({});
  const originalLayerPaintRef = useRef<Record<string, Record<string, unknown>>>({});
  const [mapReady, setMapReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; point: DamagePoint } | null>(null);

  const [cursorCoord, setCursorCoord] = useState<[number, number] | null>(null);
  const activeCity = cities.find((c) => c.id === activeCityId);
  const activeBounds: [number, number, number, number] = activeCity?.bbox ?? dataset.bounds ?? [-180, -85, 180, 85];

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: VOYAGER_STYLE_URL,
      center: dataset.coordinates,
      zoom: dataset.zoom,
      minZoom: 4,
      maxZoom: 19,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showZoom: true, showCompass: true }), "top-right");
    map.addControl(new ResetViewControl(dataset.coordinates, dataset.zoom), "top-right");

    map.on("contextmenu", (event) => {
      event.originalEvent.preventDefault();
      setContextMenu(null);

      const container = mapContainerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = event.originalEvent.clientX - rect.left;
      const y = event.originalEvent.clientY - rect.top;
      const hit = overlayRef.current?.pickObject({ x, y });
      if (hit && hit.layer?.id === "damage-point-layer" && hit.object) {
        setContextMenu({ x, y, point: hit.object as DamagePoint });
        return;
      }
      onRequestAddNote([event.lngLat.lng, event.lngLat.lat]);
    });

    map.on("click", (event) => {
      setContextMenu(null);

      const container = mapContainerRef.current;
      if (!container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = event.originalEvent.clientX - rect.left;
      const y = event.originalEvent.clientY - rect.top;
      const hit = overlayRef.current?.pickObject({ x, y });
      if (hit && hit.layer?.id === "damage-point-layer") {
        return;
      }

      const outlineHits = map.queryRenderedFeatures(event.point, {
        layers: [CITY_OUTLINE_CASING_LAYER_ID, CITY_OUTLINE_LAYER_ID],
      });
      const outlineCityId = outlineHits[0]?.properties?.cityId;
      if (typeof outlineCityId === "string") {
        onCitySelect(outlineCityId);
        return;
      }

      onSelectPoint(null);
    });

    map.on("zoomstart", () => setContextMenu(null));

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay);

    const hideWhenReady = () => setBusy(false);
    map.once("idle", hideWhenReady);
    const loadSafetyTimer = window.setTimeout(hideWhenReady, LOAD_SAFETY_TIMEOUT_MS);

    map.once("load", () => {
      if (!map.getSource(CITY_OUTLINE_SOURCE_ID)) {
        map.addSource(CITY_OUTLINE_SOURCE_ID, {
          type: "geojson",
          data: cityOutlineCollection(activeCityId),
        });
      }
      if (!map.getLayer(CITY_OUTLINE_CASING_LAYER_ID)) {
        map.addLayer({
          id: CITY_OUTLINE_CASING_LAYER_ID,
          type: "line",
          source: CITY_OUTLINE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "casingColor"],
            "line-width": ["get", "casingWidth"],
          } as maplibregl.LineLayerSpecification["paint"],
        });
      }
      if (!map.getLayer(CITY_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id: CITY_OUTLINE_LAYER_ID,
          type: "line",
          source: CITY_OUTLINE_SOURCE_ID,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["get", "width"],
          } as maplibregl.LineLayerSpecification["paint"],
        });
      }

      const style = map.getStyle();
      style.layers?.forEach((layer) => {
        const styleLayer = layer as StyleLayerLike;
        if (!(layer.id in originalLayerVisibilityRef.current)) {
          originalLayerVisibilityRef.current[layer.id] = styleLayer.layout?.visibility;
        }
        if (!(layer.id in originalLayerPaintRef.current)) {
          originalLayerPaintRef.current[layer.id] = styleLayer.paint ? { ...styleLayer.paint } : {};
        }
      });
      setMapReady(true);
    });

    map.on("styledata", () => {
      if (map.isStyleLoaded()) {
        setMapReady(true);
      }
    });

    return () => {
      window.clearTimeout(loadSafetyTimer);
      popupRef.current?.remove();
      map.remove();
      popupRef.current = null;
      overlayRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [dataset.coordinates, dataset.zoom, onRequestAddNote]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    map.flyTo({ center: dataset.coordinates, zoom: dataset.zoom, essential: true });
  }, [dataset.coordinates, dataset.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    const city = cities.find((c) => c.id === activeCityId);
    if (city) {
      map.easeTo({ center: city.center, zoom: city.zoom, duration: 800, essential: true });
    }
  }, [activeCityId, mapReady, cities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    const source = map.getSource(CITY_OUTLINE_SOURCE_ID);
    if (source && "setData" in source) {
      (source as maplibregl.GeoJSONSource).setData(cityOutlineCollection(activeCityId));
    }
  }, [activeCityId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }
    const handleMove = (event: maplibregl.MapMouseEvent) => {
      if (!map.getLayer(CITY_OUTLINE_LAYER_ID)) {
        return;
      }
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [CITY_OUTLINE_CASING_LAYER_ID, CITY_OUTLINE_LAYER_ID],
      });
      map.getCanvas().style.cursor = hits.length > 0 ? "pointer" : "";
    };
    map.on("mousemove", handleMove);
    return () => {
      map.off("mousemove", handleMove);
    };
  }, [mapReady]);

  useEffect(() => {
    setContextMenu(null);
  }, [activeCityId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    let cancelled = false;
    let hideTimer: number | null = null;
    const hideWhenIdle = () => {
      if (!cancelled) {
        setBusy(false);
      }
    };

    setBusy(true);

    const raf = requestAnimationFrame(() => {
    const style = map.getStyle();
    style.layers?.forEach((layer) => {
      const styleLayer = layer as StyleLayerLike;
      if (layer.id === "background") {
        return;
      }

      if (basemapMode === "osm") {
        if (layer.id === CITY_OUTLINE_CASING_LAYER_ID ||
          layer.id === CITY_OUTLINE_LAYER_ID) {
          return;
        }
        if (!isSemanticLayer(styleLayer)) {
          map.setLayoutProperty(layer.id, "visibility", "none");
          return;
        }

        map.setLayoutProperty(layer.id, "visibility", "visible");
        const color = getSemanticColor(styleLayer);

        if (styleLayer.type === "fill") {
          map.setPaintProperty(layer.id, "fill-color", color);
          map.setPaintProperty(layer.id, "fill-opacity", 1);
          if (styleLayer.paint && "fill-outline-color" in styleLayer.paint) {
            map.setPaintProperty(layer.id, "fill-outline-color", color);
          }
        } else if (styleLayer.type === "line") {
          map.setPaintProperty(layer.id, "line-color", color);
          map.setPaintProperty(layer.id, "line-opacity", 1);
        } else if (styleLayer.type === "fill-extrusion") {
          map.setPaintProperty(layer.id, "fill-extrusion-color", color);
          map.setPaintProperty(layer.id, "fill-extrusion-opacity", 1);
        } else if (styleLayer.type === "symbol" && getOSMClass(styleLayer) === "facility") {
          map.setPaintProperty(layer.id, "text-color", color);
          map.setPaintProperty(layer.id, "icon-color", color);
        }
        return;
      }

      const originalVisibility = originalLayerVisibilityRef.current[layer.id];
      map.setLayoutProperty(layer.id, "visibility", originalVisibility ?? "visible");

      const originalPaint = originalLayerPaintRef.current[layer.id];
      if (originalPaint) {
        Object.entries(originalPaint).forEach(([paintKey, paintValue]) => {
          map.setPaintProperty(layer.id, paintKey as keyof maplibregl.AllPaintProperties, paintValue as never);
        });
      }
    });

    if (map.loaded() && map.areTilesLoaded()) {
      hideWhenIdle();
    } else {
      map.once("idle", hideWhenIdle);
      hideTimer = window.setTimeout(() => {
        map.off("idle", hideWhenIdle);
        hideWhenIdle();
      }, LOAD_SAFETY_TIMEOUT_MS);
    }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (hideTimer !== null) {
        window.clearTimeout(hideTimer);
      }
      map.off("idle", hideWhenIdle);
    };
  }, [basemapMode, mapReady, activeCityId]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const map = mapRef.current;
    if (!overlay || !map || !mapReady) {
      return;
    }

    const layers = [];

    const satelliteTileUrl = rawRasterUrl && rawRasterUrl.includes("{z}") ? rawRasterUrl : null;
    if (basemapMode === "satellite" && satelliteTileUrl) {
      layers.push(
        new TileLayer({
          id: "satellite-tile-layer",
          data: satelliteTileUrl,
          minZoom: 8,
          maxZoom: 18,
          renderSubLayers: (props) => {
            const image = props.data as HTMLImageElement | null;
            const tile = props.tile;
            if (!image || !tile?.bbox) return null;
            const b = tile.bbox as { west: number; south: number; east: number; north: number };
            return new BitmapLayer({
              id: `${props.id}-img`,
              image,
              bounds: [b.west, b.south, b.east, b.north],
              opacity: 1,
              pickable: false,
            });
          },
        }),
      );
    }

    const nonTemplatedUrl = rawRasterUrl && !rawRasterUrl.includes("{z}") ? rawRasterUrl : null;
    if (basemapMode === "satellite" && nonTemplatedUrl) {
      layers.push(
        new BitmapLayer({
          id: `satellite-bitmap-layer-${temporalState}`,
          image: nonTemplatedUrl,
          bounds: activeBounds,
          opacity: 1,
          pickable: false,
        }),
      );
    }

    const pointLayer = new ScatterplotLayer<DamagePoint>({
      id: "damage-point-layer",
      data: points,
      getPosition: (item) => item.geometry.coordinates,
      getFillColor: (item) => hexToRgba(categoryColors[item.properties.class], 220),
      getRadius: 5,
      radiusUnits: "pixels",
      radiusMinPixels: 3,
      radiusMaxPixels: 10,
      stroked: true,
      getLineColor: [255, 255, 255, 220],
      lineWidthUnits: "pixels",
      getLineWidth: 1.5,
      updateTriggers: {
        getFillColor: categoryColors,
      },
      pickable: true,
      onHover: (info) => {
        map.getCanvas().style.cursor = info.object ? "pointer" : "";
      },
      onClick: (info) => {
        if (!info.object) {
          return;
        }
        onSelectPoint(info.object);
      },
    });

    const priorityLayer = new ScatterplotLayer<DamagePoint>({
      id: "priority-ring-layer",
      data: points.filter((point) => incidentAnnotations[point.properties.id]?.priority),
      getPosition: (item) => item.geometry.coordinates,
      getRadius: 8,
      radiusUnits: "pixels",
      radiusMinPixels: 4,
      radiusMaxPixels: 14,
      filled: false,
      stroked: true,
      getLineColor: [242, 169, 59, 230],
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 3,
    });

    if (segmentationEnabled) {
      layers.push(pointLayer, priorityLayer);
    }

    const notesLayer = new TextLayer<MapNote>({
      id: "map-note-layer",
      data: mapNotes,
      getPosition: (note) => note.coordinates,
      getText: (note) => toNoteLabel(note),
      getSize: 20,
      sizeUnits: "pixels",
      getColor: [255, 255, 255, 255],
      getBackgroundColor: [37, 99, 235, 230],
      background: true,
      backgroundPadding: [6, 6, 6, 6],
      fontWeight: 700,
      pickable: true,
      onHover: (info) => {
        map.getCanvas().style.cursor = info.object ? "pointer" : "";
      },
      onClick: (info) => {
        if (!info.object) {
          return;
        }
        const note = info.object as MapNote;
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(note.coordinates)
          .setHTML(
            `<strong>Map note</strong><br/>${escapeHtml(note.text)}<br/><em>${escapeHtml(note.timestamp)}</em>`
          )
          .addTo(map);
      },
    });

    const cityLabelLayer = new TextLayer<CityConfig>({
      id: "city-label-layer",
      data: cities,
      getPosition: (city) => [
        city.bbox[0],
        city.bbox[1],
      ],
      getText: (city) => city.name,
      getColor: [233, 242, 248, 160],
      background: true,
      getBackgroundColor: [9, 22, 35, 160],
      getSize: 10,
      sizeUnits: "pixels",
      backgroundPadding: [3, 2, 3, 2],
      pickable: false,
      characterSet: "auto",
      getTextAnchor: "start" as const,
      getAlignmentBaseline: "bottom" as const,
    });

    const selectedLayer = new ScatterplotLayer<DamagePoint>({
      id: "selected-point-ring-layer",
      data: selectedPoint ? [selectedPoint] : [],
      getPosition: (item) => item.geometry.coordinates,
      getRadius: 8,
      radiusUnits: "pixels",
      radiusMinPixels: 4,
      radiusMaxPixels: 14,
      filled: false,
      stroked: true,
      getLineColor: [86, 200, 216, 245],
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 2,
    });

    overlay.setProps({
      layers: [
        ...layers,
        cityLabelLayer,
      ],
      getTooltip: ({ object }) => {
        if (!object) {
          return null;
        }

        if ("text" in object && "coordinates" in object && !("geometry" in object)) {
          const note = object as MapNote;
          return {
            text: `${note.text} | ${note.timestamp}`,
          };
        }

        const point = object as DamagePoint;
        return {
          text: `${point.properties.class} | Severity ${point.properties.severity.toFixed(2)}`,
        };
      },
    });
  }, [
    segmentationEnabled,
    points,
    mapNotes,
    selectedPoint,
    onSelectPoint,
    mapReady,
    rawRasterUrl,
    activeBounds,
    basemapMode,
    temporalState,
    categoryColors,
    incidentAnnotations,
    cities,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const point = map.unproject(event.point);
      setCursorCoord([Math.round(point.lng * 1e6) / 1e6, Math.round(point.lat * 1e6) / 1e6]);
    };

    map.on("mousemove", handleMouseMove);
    return () => {
      map.off("mousemove", handleMouseMove);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    popupRef.current?.remove();
    if (!selectedPoint) {
      popupRef.current = null;
      return;
    }

    const [lon, lat] = selectedPoint.geometry.coordinates;
    const segmentationHint = segmentationVectorUrl ? `<br/>Segmentation: ${escapeHtml(segmentationVectorUrl)}` : "";
    const annotation = incidentAnnotations[selectedPoint.properties.id];
    const priorityHint = annotation?.priority ? "<br/><strong>PRIORITY</strong>" : "";
    const notesHtml = (annotation?.notes ?? [])
      .map((note) => `<li>${escapeHtml(note.text)} <em>(${escapeHtml(note.timestamp)})</em></li>`)
      .join("");
    const notesSection = notesHtml ? `<br/><ul class="point-notes-list">${notesHtml}</ul>` : "";

    popupRef.current = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
      .setLngLat([lon, lat])
      .setHTML(
        `<strong>${escapeHtml(selectedPoint.properties.class)}</strong>${priorityHint}<br/>` +
          `Severity: ${selectedPoint.properties.severity.toFixed(2)}<br/>` +
          `Status: ${escapeHtml(selectedPoint.properties.status)}<br/>` +
          `Updated: ${escapeHtml(selectedPoint.properties.timestamp)}${notesSection}${segmentationHint}`
      )
      .addTo(map);
  }, [selectedPoint, segmentationVectorUrl, incidentAnnotations]);

  return (
    <div className="map-wrapper">
      <div ref={mapContainerRef} className="map-canvas" />
      {(busy || dataLoading) && (
        <div className="map-loading-overlay" role="status" aria-live="polite">
          <div className="loading-scan" aria-hidden="true">
            <div className="loading-sweep" />
          </div>
          <p className="loading-caption">loading imagery</p>
        </div>
      )}
      {basemapMode === "osm" && mapReady && (
        <div className="osm-legend" aria-label="OSM segmentation legend">
          <h3>OSM Segmentation</h3>
          {legendItems.map((item) => (
            <div className="osm-legend-item" key={item.label}>
              <span className="osm-legend-swatch" style={{ background: item.color }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {contextMenu && (
        <div
          className="point-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="point-context-menu-title">
            {contextMenu.point.properties.class} · {contextMenu.point.properties.id}
          </div>
          <button
            type="button"
            onClick={() => {
              onTogglePriority(contextMenu.point.properties.id);
              setContextMenu(null);
            }}
          >
            {incidentAnnotations[contextMenu.point.properties.id]?.priority ? "Unmark priority" : "Mark as priority"}
          </button>
          <button
            type="button"
            onClick={() => {
              onRequestAddIncidentNote(contextMenu.point);
              setContextMenu(null);
            }}
          >
            Add note
          </button>
          <button
            type="button"
            className="is-danger"
            onClick={() => {
              onRemoveIncident(contextMenu.point.properties.id);
              setContextMenu(null);
            }}
          >
            Remove
          </button>
        </div>
      )}

      <div className="map-hud">
        <span className="map-hud-coord">
          {cursorCoord ? `${cursorCoord[0].toFixed(5)}°, ${cursorCoord[1].toFixed(5)}°` : "hover map"}
        </span>
      </div>

      <div className="map-city-chips" role="region" aria-label="Cities">
        {cities.map((city) => (
          <button
            key={city.id}
            type="button"
            className={`city-chip ${city.id === activeCityId ? "is-active" : ""}`}
            style={city.id === activeCityId ? { background: city.accent, borderColor: city.accent } : undefined}
            onClick={() => onCitySelect(city.id)}
          >
            <span
              className="city-chip-dot"
              style={{ borderColor: city.accent, background: city.id === activeCityId ? "rgba(255,255,255,0.9)" : city.accent }}
            />
            {city.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default MapView;