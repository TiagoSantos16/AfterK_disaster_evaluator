import { useCallback, useEffect, useMemo, useState } from "react";

import { datasets as initialDatasets, getDefaultDataset } from "./config/datasets";
import { CategoryColors, loadCategoryColors, saveCategoryColors } from "./config/categoryColors";
import { normalizeDamagePoint, collectRasterBlobUrls, filterVisiblePoints } from "./utils/damage";
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
} from "./types/dataset";

type DamageFilters = Record<DamageClass, boolean>;

type IncidentAnnotation = {
  priority: boolean;
  notes: IncidentNote[];
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

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
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("satellite");
  const [temporalState, setTemporalState] = useState<TemporalState>("post");
  const [activeFilters, setActiveFilters] = useState<DamageFilters>(initialFilters);
  const [categoryColors, setCategoryColors] = useState<CategoryColors>(() => loadCategoryColors());
  const [selectedPoint, setSelectedPoint] = useState<DamagePoint | null>(null);
  const [remotePoints, setRemotePoints] = useState<DamagePoint[]>(defaultDataset.defaultPoints);
  const [uploadedPoints, setUploadedPoints] = useState<DamagePoint[] | null>(null);
  const [mapNotes, setMapNotes] = useState<MapNote[]>([]);
  const [newNoteForm, setNewNoteForm] = useState<{ coordinates: [number, number] } | null>(null);
  const [incidentAnnotations, setIncidentAnnotations] = useState<Record<string, IncidentAnnotation>>({});
  const [removedIncidentIds, setRemovedIncidentIds] = useState<ReadonlySet<string>>(new Set());
  const [incidentNoteForm, setIncidentNoteForm] = useState<{ point: DamagePoint } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [dataSourceLabel, setDataSourceLabel] = useState<string>("Local dataset fallback");

  const activeDataset = useMemo(
    () => findDataset(availableDatasets, activeDatasetId),
    [availableDatasets, activeDatasetId]
  );
  const activeVariant = useMemo(() => findVariant(activeDataset, activeVariantId), [activeDataset, activeVariantId]);

  useEffect(() => {
    const variantExists = activeDataset.variants.some((variant) => variant.id === activeVariantId);
    if (!variantExists) {
      setActiveVariantId(activeDataset.defaultVariantId);
    }
  }, [activeDataset, activeVariantId]);

  useEffect(() => {
    setUploadedPoints(null);
    setSelectedPoint(null);

    const controller = new AbortController();

    const fetchDatasetPoints = async () => {
      if (!apiBaseUrl) {
        setRemotePoints(activeDataset.defaultPoints);
        setDataSourceLabel("Local dataset fallback");
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/v1/damages/${activeDataset.id}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API returned status ${response.status}`);
        }

        const payload = (await response.json()) as { data?: unknown[] };
        const normalized = (payload.data ?? []).map(normalizeDamagePoint).filter(Boolean) as DamagePoint[];

        if (normalized.length > 0) {
          setRemotePoints(normalized);
          setDataSourceLabel("Backend API /api/v1");
          return;
        }

        throw new Error("API returned empty dataset payload.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRemotePoints(activeDataset.defaultPoints);
        setDataSourceLabel("Local dataset fallback");
      }
    };

    void fetchDatasetPoints();

    return () => {
      controller.abort();
    };
  }, [activeDataset.id]);

  const effectivePoints = uploadedPoints ?? remotePoints;

  const visiblePoints = useMemo(() => {
    return filterVisiblePoints(effectivePoints, activeFilters, removedIncidentIds);
  }, [effectivePoints, activeFilters, removedIncidentIds]);

  const variantRasterUrl = activeVariant.rawRasterUrl ?? activeDataset.imageUrls?.[temporalState] ?? activeDataset.rawRasterUrl;
  const activeRasterUrl =
    (activeDataset.satelliteProvider ?? "esri") === "esri"
      ? ESRI_WORLD_IMAGERY_URL
      : (activeDataset.satelliteProvider ?? "esri") === "custom"
        ? activeDataset.customRasterUrl ?? variantRasterUrl
        : variantRasterUrl;
  const activeSegmentationUrl = activeVariant.segmentationVectorUrl ?? activeDataset.segmentationVectorUrl;
  const segmentationEnabled = false;

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

  const handleVariantChange = (variantId: string) => {
    setActiveVariantId(variantId);
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
    setDataSourceLabel("Imported dataset");
    setRemotePoints(dataset.defaultPoints);
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
        segmentationVectorUrl={activeSegmentationUrl}
        temporalState={temporalState}
        categoryColors={categoryColors}
        incidentAnnotations={incidentAnnotations}
        onTogglePriority={handleTogglePriority}
        onRequestAddIncidentNote={handleRequestIncidentNote}
        onRemoveIncident={handleRemoveIncident}
        onRequestAddNote={handleRequestAddNote}
        onSelectPoint={setSelectedPoint}
      />

      <Sidebar
        datasets={availableDatasets}
        activeDataset={activeDataset}
        activeVariantId={activeVariant.id}
        basemapMode={basemapMode}
        activeFilters={activeFilters}
        points={visiblePoints}
        mapNotes={mapNotes}
        selectedPoint={selectedPoint}
        incidentAnnotations={incidentAnnotations}
        dataSourceLabel={dataSourceLabel}
        collapsed={sidebarCollapsed}
        temporalState={temporalState}
        onTemporalStateChange={setTemporalState}
        onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        onDatasetChange={handleDatasetChange}
        onVariantChange={handleVariantChange}
        onBasemapChange={setBasemapMode}
        onToggleFilter={handleToggleFilter}
        categoryColors={categoryColors}
        onCategoryColorChange={handleCategoryColorChange}
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