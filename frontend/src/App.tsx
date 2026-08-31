import { useCallback, useEffect, useMemo, useState } from "react";

import { datasets as initialDatasets, getDefaultDataset } from "./config/datasets";
import { CategoryColors, loadCategoryColors, saveCategoryColors } from "./config/categoryColors";
import { collectRasterBlobUrls, filterVisiblePoints } from "./utils/damage";
import { cities, findCity, CityConfig, CitySatelliteSource, SOURCE_LABELS, isSentinelSource, isDemoSourceAvailable } from "./config/cities";
import { stopsFromScenes } from "./utils/timeline";
import { useTimeline } from "./hooks/useTimeline";
import TimelineBar from "./components/TimelineBar";
import MapView from "./components/MapView";
import NoteModal from "./components/NoteModal";
import IncidentNoteModal from "./components/IncidentNoteModal";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import "./styles.css";
import {
  BasemapMode,
  DamageClass,
  DamagePoint,
  DatasetConfig,
  DatasetVariant,
  IncidentNote,
  MapNote,
  TemporalState,
  TimelineStop,
} from "./types/dataset";

type DamageFilters = Record<DamageClass, boolean>;

type IncidentAnnotation = {
  priority: boolean;
  notes: IncidentNote[];
};

const ESRI_WORLD_IMAGERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

const initialFilters: DamageFilters = {
  fallen_tree: true,
  damaged_house: true,
  broken_light: true,
  wildfire_hazard: true,
  blocked_road: true,
};

const findDataset = (catalog: DatasetConfig[], datasetId: string): DatasetConfig => {
  return catalog.find((dataset) => dataset.id === datasetId) ?? getDefaultDataset();
};

const findVariant = (dataset: DatasetConfig, variantId: string): DatasetVariant => {
  return dataset.variants.find((variant) => variant.id === variantId) ?? dataset.variants[0];
};

function App() {
  const defaultDataset = getDefaultDataset();
  const [availableDatasets, setAvailableDatasets] = useState<DatasetConfig[]>(initialDatasets);
  const [activeDatasetId, setActiveDatasetId] = useState<string>(defaultDataset.id);
  const [activeVariantId, setActiveVariantId] = useState<string>(defaultDataset.defaultVariantId);
  const [activeSceneDate, setActiveSceneDate] = useState<string | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("map");
  const [activeCityId, setActiveCityId] = useState<string>("marinha-grande");
  const [source, setSource] = useState<CitySatelliteSource>("sentinel-2-rgb");
  const [temporalState, setTemporalState] = useState<TemporalState>("post");
  const [activeFilters, setActiveFilters] = useState<DamageFilters>(initialFilters);
  const [categoryColors, setCategoryColors] = useState<CategoryColors>(() => loadCategoryColors());
  const [selectedPoint, setSelectedPoint] = useState<DamagePoint | null>(null);
  const [mapNotes, setMapNotes] = useState<MapNote[]>([]);
  const [newNoteForm, setNewNoteForm] = useState<{ coordinates: [number, number] } | null>(null);
  const [incidentAnnotations, setIncidentAnnotations] = useState<Record<string, IncidentAnnotation>>({});
  const [removedIncidentIds, setRemovedIncidentIds] = useState<ReadonlySet<string>>(new Set());
  const [incidentNoteForm, setIncidentNoteForm] = useState<{ point: DamagePoint } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [segmentationEnabled, setSegmentationEnabled] = useState<boolean>(false);

  const activeDataset = useMemo(
    () => findDataset(availableDatasets, activeDatasetId),
    [availableDatasets, activeDatasetId]
  );
  const activeVariant = useMemo(() => findVariant(activeDataset, activeVariantId), [activeDataset, activeVariantId]);

  const activeCity = useMemo(() => findCity(activeCityId), [activeCityId]);

  const timeline = useTimeline(
    activeDataset.id,
    import.meta.env.VITE_API_BASE_URL,
    true,
    activeCity?.bbox ? [...activeCity.bbox] : null,
    source
  );
  const timelineStops: TimelineStop[] = useMemo(
    () => stopsFromScenes(timeline.scenes),
    [timeline.scenes]
  );
  const selectedScene = useMemo(
    () => timeline.scenes.find((scene) => scene.date === activeSceneDate) ?? null,
    [timeline.scenes, activeSceneDate]
  );

  useEffect(() => {
    const variantExists = activeDataset.variants.some((variant) => variant.id === activeVariantId);
    if (!variantExists) {
      setActiveVariantId(activeDataset.defaultVariantId);
    }
  }, [activeDataset, activeVariantId]);

  useEffect(() => {
    setSelectedPoint(null);
    setRemovedIncidentIds(new Set());
  }, [activeCityId]);

  useEffect(() => {
    if (timeline.status !== "live" || activeSceneDate || timeline.scenes.length === 0) {
      return;
    }
    const eventDate = timeline.window?.eventDate;
    const targetMs = eventDate ? Date.parse(`${eventDate}T00:00:00Z`) : Number.NaN;
    const best = timeline.scenes.reduce(
      (bestScene, scene) => {
        if (!bestScene) {
          return scene;
        }
        const distance = Math.abs(Date.parse(`${scene.date}T00:00:00Z`) - targetMs);
        const bestDistance = Math.abs(Date.parse(`${bestScene.date}T00:00:00Z`) - targetMs);
        if (distance < bestDistance) {
          return scene;
        }
        if (distance === bestDistance && scene.date > bestScene.date) {
          return scene;
        }
        return bestScene;
      },
      timeline.scenes[0]
    );
    setActiveSceneDate(best.date);
  }, [timeline.status, timeline.scenes, timeline.window?.eventDate, activeSceneDate]);

  const handleSourceChange = useCallback((next: CitySatelliteSource) => {
    setSource(next);
    setBasemapMode("satellite");
  }, []);

  const visiblePoints = useMemo(() => {
    return filterVisiblePoints(activeCity?.defaultPoints ?? [], activeFilters, removedIncidentIds);
  }, [activeCity?.defaultPoints, activeFilters, removedIncidentIds]);

  const sentinelBand = source === "sentinel-2-swir" ? "swir" : source === "sentinel-2-cir" ? "cire" : source === "sentinel-2-ndvi" ? "ndvi" : "truecolor";

  const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
  const isDemo = !API_BASE;

  const activeRasterUrl =
    isSentinelSource(source) && selectedScene && activeSceneDate && activeCity?.bbox
      ? API_BASE
        ? `${API_BASE}/api/v1/imagery/sentinel2/${activeSceneDate}.png?bbox=${activeCity.bbox.join(",")}&bands=${sentinelBand}`
        : isDemoSourceAvailable(source)
          ? `imagery/${activeCity.id}_${sentinelBand}_${activeSceneDate}.png`
          : ESRI_WORLD_IMAGERY_URL
      : ESRI_WORLD_IMAGERY_URL;

  const handleToggleFilter = (damageClass: DamageClass) => {
    setActiveFilters((previous) => ({
      ...previous,
      [damageClass]: !previous[damageClass],
    }));
  };

  const handleCategoryColorChange = (damageClass: DamageClass, color: string) => {
    setCategoryColors((previous) => {
      const next = { ...previous, [damageClass]: color };
      saveCategoryColors(next);
      return next;
    });
  };

  const handleDatasetChange = (datasetId: string) => {
    const nextDataset = findDataset(availableDatasets, datasetId);
    setActiveDatasetId(nextDataset.id);
    setActiveVariantId(nextDataset.defaultVariantId);
    setSelectedPoint(null);
  };

  const handleSceneChange = (date: string) => {
    setActiveSceneDate(date);
    const variant = activeDataset.variants.find((item) => item.id === date);
    if (variant) {
      setActiveVariantId(variant.id);
    }
  };

  const handleRequestAddNote = useCallback((coordinates: [number, number]) => {
    setNewNoteForm({ coordinates });
  }, []);

  const handleSaveDataset = (dataset: DatasetConfig) => {
    setAvailableDatasets((current) => {
      const previous = current.find((existing) => existing.id === dataset.id);
      if (previous) {
        const kept = new Set(collectRasterBlobUrls(dataset));
        for (const url of collectRasterBlobUrls(previous)) {
          if (!kept.has(url)) {
            URL.revokeObjectURL(url);
          }
        }
      }
      const filtered = current.filter((existing) => existing.id !== dataset.id);
      return [...filtered, dataset];
    });
    setActiveDatasetId(dataset.id);
    setActiveVariantId(dataset.defaultVariantId);
  };

  const handleSaveNote = (note: MapNote) => {
    setMapNotes((current) => [...current, note]);
    setNewNoteForm(null);
  };

  const handleRequestIncidentNote = (point: DamagePoint) => {
    setIncidentNoteForm({ point });
  };

  const handleSaveIncidentNote = (point: DamagePoint, note: IncidentNote) => {
    setIncidentAnnotations((previous) => {
      const current = previous[point.properties.id] ?? { priority: false, notes: [] };
      return { ...previous, [point.properties.id]: { ...current, notes: [...current.notes, note] } };
    });
    setIncidentNoteForm(null);
  };

  const handleTogglePriority = (pointId: string) => {
    setIncidentAnnotations((previous) => {
      const current = previous[pointId] ?? { priority: false, notes: [] };
      return { ...previous, [pointId]: { ...current, priority: !current.priority } };
    });
  };

  const handleRemoveIncident = (pointId: string) => {
    setRemovedIncidentIds((previous) => new Set(previous).add(pointId));
    setSelectedPoint((current) => (current && current.properties.id === pointId ? null : current));
  };

  return (
    <div className="app-shell">
      <MapView
        dataset={activeDataset}
        points={visiblePoints}
        basemapMode={basemapMode}
        segmentationEnabled={segmentationEnabled}
        selectedPoint={selectedPoint}
        mapNotes={mapNotes}
        rawRasterUrl={activeRasterUrl}
        segmentationVectorUrl={undefined}
        temporalState={temporalState}
        categoryColors={categoryColors}
        incidentAnnotations={incidentAnnotations}
        onTogglePriority={handleTogglePriority}
        onRequestAddIncidentNote={handleRequestIncidentNote}
        onRemoveIncident={handleRemoveIncident}
        onRequestAddNote={handleRequestAddNote}
        onSelectPoint={setSelectedPoint}
        cities={cities}
        activeCityId={activeCityId}
        onCitySelect={setActiveCityId}
        dataLoading={timeline.status === "loading"}
      />

<Sidebar
        datasets={availableDatasets}
        activeDataset={activeDataset}
        basemapMode={basemapMode}
        activeFilters={activeFilters}
        points={visiblePoints}
        mapNotes={mapNotes}
        selectedPoint={selectedPoint}
        incidentAnnotations={incidentAnnotations}
        collapsed={sidebarCollapsed}
        categoryColors={categoryColors}
        timelineStatus={timeline.status}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onDatasetChange={handleDatasetChange}
        onBasemapChange={setBasemapMode}
        onToggleFilter={handleToggleFilter}
        onCategoryColorChange={handleCategoryColorChange}
        source={source}
        onSourceChange={handleSourceChange}
        demoMode={isDemo}
        activeCityId={activeCityId}
        onCitySelect={setActiveCityId}
        segmentationEnabled={segmentationEnabled}
        onSegmentationToggle={setSegmentationEnabled}
      />

      <TimelineBar
        scenes={timeline.scenes}
        stops={timelineStops}
        activeSceneDate={activeSceneDate}
        eventDate={timeline.window?.eventDate ?? undefined}
        source={source}
        sidebarCollapsed={sidebarCollapsed}
        onSceneChange={handleSceneChange}
      />

      <button
        type="button"
        className="gear-button"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
      >
        ⚙
      </button>

      {settingsOpen && (
        <SettingsModal
          datasets={availableDatasets}
          onClose={() => setSettingsOpen(false)}
          onSaveDataset={handleSaveDataset}
        />
      )}

      {newNoteForm && (
        <NoteModal
          coordinates={newNoteForm.coordinates}
          onSave={handleSaveNote}
          onCancel={() => setNewNoteForm(null)}
        />
      )}

      {incidentNoteForm && (
        <IncidentNoteModal
          point={incidentNoteForm.point}
          onSave={handleSaveIncidentNote}
          onCancel={() => setIncidentNoteForm(null)}
        />
      )}
    </div>
  );
}

export default App;