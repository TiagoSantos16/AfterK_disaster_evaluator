import { useEffect, useMemo, useRef, useState } from "react";

import { BitmapLayer, PolygonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

import {
  BasemapMode,
  DamageClass,
  DamagePoint,
  DatasetConfig,
  IncidentNote,
  MapNote,
  TemporalState,
} from "../types/dataset";
import { CategoryColors } from "../config/categoryColors";
import { hexToRgba, escapeHtml } from "../utils/damage";
import { getOSMClass, getSemanticColor, isSemanticLayer, semanticColors, StyleLayerLike } from "../utils/osm";

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
};

type SegmentationPolygon = {
  id: string;
  class: DamageClass;
  severity: number;
  status: "active" | "resolved";
  description: string;
  timestamp: string;
  polygon: [number, number][];
  sourcePoint: DamagePoint;
};

const OSM_ATTRIBUTION = "© OpenStreetMap contributors © CARTO";
const VOYAGER_STYLE_URL = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";

maplibregl.setWorkerUrl(workerUrl);
const SATELLITE_SOURCE_ID = "satellite-basemap-source";
const SATELLITE_LAYER_ID = "satellite-basemap-layer";
const DEFAULT_SATELLITE_URL = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

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

const toSegmentationPolygon = (point: DamagePoint, index: number): SegmentationPolygon => {
  const [lon, lat] = point.geometry.coordinates;
  const spread = 0.00085 + point.properties.severity * 0.0022;

  return {
    id: `${point.properties.id}-${index}`,
    class: point.properties.class,
    severity: point.properties.severity,
    status: point.properties.status,
    description: point.properties.description,
    timestamp: point.properties.timestamp,
    sourcePoint: point,
    polygon: [
      [lon - spread, lat - spread],
      [lon + spread, lat - spread],
      [lon + spread, lat + spread],
      [lon - spread, lat + spread],
    ],
  };
};

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
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const satelliteUrlRef = useRef<string>(DEFAULT_SATELLITE_URL);
  const busyHideTimerRef = useRef<number | null>(null);
  const originalLayerVisibilityRef = useRef<Record<string, maplibregl.VisibilitySpecification | undefined>>({});
  const originalLayerPaintRef = useRef<Record<string, Record<string, unknown>>>({});
  const [mapReady, setMapReady] = useState(false);
  const [busy, setBusy] = useState(true);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; point: DamagePoint } | null>(null);

  const segmentationPolygons = useMemo(() => {
    return points.map(toSegmentationPolygon);
  }, [points]);

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
      if (!hit || hit.layer?.id !== "damage-point-layer") {
        onSelectPoint(null);
      }
    });

    map.on("zoomstart", () => setContextMenu(null));

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay);

    const loadSafetyTimer = window.setTimeout(() => setBusy(false), 6000);

    map.once("load", () => {
      window.clearTimeout(loadSafetyTimer);
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
      setBusy(false);
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
    if (!map) {
      return;
    }

    if (!map.isStyleLoaded()) {
      return;
    }

    setBusy(true);

    const raf = requestAnimationFrame(() => {
    const satelliteUrl = rawRasterUrl && rawRasterUrl.includes("{z}") ? rawRasterUrl : DEFAULT_SATELLITE_URL;
    const useSatelliteTileLayer = basemapMode === "satellite" && (!rawRasterUrl || rawRasterUrl.includes("{z}"));

    if (satelliteUrlRef.current !== satelliteUrl) {
      satelliteUrlRef.current = satelliteUrl;
      if (map.getLayer(SATELLITE_LAYER_ID)) {
        map.removeLayer(SATELLITE_LAYER_ID);
      }
      if (map.getSource(SATELLITE_SOURCE_ID)) {
        map.removeSource(SATELLITE_SOURCE_ID);
      }
    }

    if (useSatelliteTileLayer) {
      if (!map.getSource(SATELLITE_SOURCE_ID)) {
        map.addSource(SATELLITE_SOURCE_ID, {
          type: "raster",
          tiles: [satelliteUrlRef.current],
          tileSize: 256,
          attribution: OSM_ATTRIBUTION,
        });
      }

      if (!map.getLayer(SATELLITE_LAYER_ID)) {
        map.addLayer({
          id: SATELLITE_LAYER_ID,
          type: "raster",
          source: SATELLITE_SOURCE_ID,
          paint: {
            "raster-opacity": 0.92,
          },
        });
      }

      map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", "visible");
    } else if (map.getLayer(SATELLITE_LAYER_ID)) {
      map.setLayoutProperty(SATELLITE_LAYER_ID, "visibility", "none");
    }

    const style = map.getStyle();
    style.layers?.forEach((layer) => {
      const styleLayer = layer as StyleLayerLike;
      if (layer.id === SATELLITE_LAYER_ID || layer.id === "background") {
        return;
      }

      if (basemapMode === "osm") {
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

    const hideSpinner = () => {
      if (busyHideTimerRef.current !== null) {
        window.clearTimeout(busyHideTimerRef.current);
        busyHideTimerRef.current = null;
      }
      setBusy(false);
    };
    if (map.loaded() && map.areTilesLoaded()) {
      hideSpinner();
    } else {
      busyHideTimerRef.current = window.setTimeout(hideSpinner, 2000);
      map.once("idle", hideSpinner);
    }
    });

    return () => {
      cancelAnimationFrame(raf);
      if (busyHideTimerRef.current !== null) {
        window.clearTimeout(busyHideTimerRef.current);
        busyHideTimerRef.current = null;
      }
    };
  }, [rawRasterUrl, basemapMode, mapReady]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const map = mapRef.current;
    if (!overlay || !map || !mapReady) {
      return;
    }

    const pointLayer = new ScatterplotLayer<DamagePoint>({
      id: "damage-point-layer",
      data: points,
      getPosition: (item) => item.geometry.coordinates,
      getFillColor: (item) => hexToRgba(categoryColors[item.properties.class], 220),
      getRadius: 10,
      radiusUnits: "pixels",
      radiusMinPixels: 10,
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
      getRadius: 14,
      radiusUnits: "pixels",
      radiusMinPixels: 14,
      radiusMaxPixels: 14,
      filled: false,
      stroked: true,
      getLineColor: [245, 158, 11, 230],
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 3,
    });

    const segmentationLayer = new PolygonLayer<SegmentationPolygon>({
      id: "segmentation-polygon-layer",
      data: segmentationEnabled ? segmentationPolygons : [],
      getPolygon: (item) => item.polygon,
      getFillColor: (item) => hexToRgba(categoryColors[item.class], 115),
      getLineColor: [255, 255, 255, 180],
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 1,
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
        onSelectPoint(info.object.sourcePoint);
      },
    });

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

    const selectedLayer = new ScatterplotLayer<DamagePoint>({
      id: "selected-point-ring-layer",
      data: selectedPoint ? [selectedPoint] : [],
      getPosition: (item) => item.geometry.coordinates,
      getRadius: 14,
      radiusUnits: "pixels",
      radiusMinPixels: 14,
      radiusMaxPixels: 14,
      filled: false,
      stroked: true,
      getLineColor: [255, 255, 255, 245],
      lineWidthUnits: "pixels",
      lineWidthMinPixels: 2,
    });

    overlay.setProps({
      layers: [
        ...(rawRasterUrl && dataset.bounds && basemapMode === "satellite" && !rawRasterUrl.includes("{z}")
          ? [
              new BitmapLayer({
                id: `satellite-bitmap-layer-${temporalState}`,
                image: rawRasterUrl,
                bounds: dataset.bounds,
                opacity: 1,
                pickable: false,
              }),
            ]
          : []),
        segmentationLayer,
        notesLayer,
        pointLayer,
        priorityLayer,
        selectedLayer,
      ],
      getTooltip: ({ object }) => {
        if (!object) {
          return null;
        }

        if ("sourcePoint" in object) {
          const sourcePoint = (object as SegmentationPolygon).sourcePoint;
          return {
            text: `${sourcePoint.properties.class} | Severity ${sourcePoint.properties.severity.toFixed(2)}`,
          };
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
    segmentationPolygons,
    onSelectPoint,
    mapReady,
    rawRasterUrl,
    dataset.bounds,
    basemapMode,
    temporalState,
    categoryColors,
    incidentAnnotations,
  ]);

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
      {busy && (
        <div className="map-loading-overlay" aria-hidden="true">
          <div className="map-spinner" />
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
    </div>
  );
}

export default MapView;