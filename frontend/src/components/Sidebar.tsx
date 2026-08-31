import { useMemo } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Globe2 } from "lucide-react";

import { BasemapMode, DatasetConfig, DamageClass, DamagePoint, IncidentNote, MapNote, TimelineStatus } from "../types/dataset";
import { CategoryColors } from "../config/categoryColors";
import { SOURCE_LABELS, CitySatelliteSource, isDemoSourceAvailable } from "../config/cities";

type IncidentAnnotation = {
  priority: boolean;
  notes: IncidentNote[];
};

type SidebarProps = {
  datasets: DatasetConfig[];
  activeDataset: DatasetConfig;
  basemapMode: BasemapMode;
  activeFilters: Record<DamageClass, boolean>;
  points: DamagePoint[];
  mapNotes: MapNote[];
  selectedPoint: DamagePoint | null;
  incidentAnnotations: Record<string, IncidentAnnotation>;
  collapsed: boolean;
  categoryColors: CategoryColors;
  timelineStatus: TimelineStatus;
  onToggleCollapse: () => void;
  onDatasetChange: (datasetId: string) => void;
  onBasemapChange: (mode: BasemapMode) => void;
  onToggleFilter: (damageClass: DamageClass) => void;
  onCategoryColorChange: (damageClass: DamageClass, color: string) => void;
  source: CitySatelliteSource;
  onSourceChange: (source: CitySatelliteSource) => void;
  demoMode: boolean;
  activeCityId: string;
  onCitySelect: (id: string) => void;
  segmentationEnabled: boolean;
  onSegmentationToggle: (enabled: boolean) => void;
};

const filterLabels: Array<{ key: DamageClass; label: string }> = [
  { key: "fallen_tree", label: "Fallen Trees" },
  { key: "damaged_house", label: "Damaged Houses" },
  { key: "broken_light", label: "Broken Street Lights" },
  { key: "wildfire_hazard", label: "Wildfire Hazards" },
  { key: "blocked_road", label: "Blocked Roads" },
];

const basemapLabels: Array<{ key: BasemapMode; label: string; description: string }> = [
  { key: "satellite", label: "Satellite", description: "Raw imagery" },
  { key: "map", label: "Map", description: "Street / vector map" },
  { key: "osm", label: "OSM Segmentation", description: "Semantic OSM mask" },
];

function Sidebar({
  datasets,
  activeDataset,
  basemapMode,
  activeFilters,
  points,
  mapNotes,
  selectedPoint,
  incidentAnnotations,
  collapsed,
  categoryColors,
  timelineStatus,
  onToggleCollapse,
  onDatasetChange,
  onBasemapChange,
  onToggleFilter,
  onCategoryColorChange,
  source,
  onSourceChange,
  demoMode,
  activeCityId,
  onCitySelect,
  segmentationEnabled,
  onSegmentationToggle,
}: SidebarProps) {
  const metrics = useMemo(() => {
    const total = points.length;
    const highSeverity = points.filter((point) => point.properties.severity >= 0.7).length;
    const resolved = points.filter((point) => point.properties.status === "resolved").length;
    const active = total - resolved;

    return { total, highSeverity, resolved, active, notes: mapNotes.length };
  }, [points, mapNotes]);

  return (
    <aside className={`control-panel ${collapsed ? "is-collapsed" : ""}`} aria-label="Disaster dashboard controls">
      <div className="panel-scroll">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Municipal damage assessment</p>
            <h1>Disaster Impact Dashboard</h1>
            <p className="subtitle">{activeDataset.city}</p>
          </div>
          <button type="button" className="icon-button" onClick={onToggleCollapse} aria-label="Collapse sidebar">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <p className="subtitle panel-source">Data source: {SOURCE_LABELS[source]}</p>
        <p className="subtitle panel-source">
          {timelineStatus === "live"
            ? "Timeline: live satellite captures"
            : timelineStatus === "loading"
              ? "Timeline: loading…"
              : "Timeline: offline fallback"}
        </p>

<section className="control-group">
          <h2>
            <Globe2 size={14} /> Source
          </h2>
          <select
            className="field"
            value={source}
            onChange={(e) => onSourceChange(e.target.value as CitySatelliteSource)}
          >
            <option value="sentinel-2-rgb">Copernicus Sentinel-2 RGB</option>
            <option value="sentinel-2-swir">Copernicus Sentinel-2 SWIR</option>
            <option value="sentinel-2-cir">Copernicus Sentinel-2 CIR</option>
            <option value="sentinel-2-ndvi">Copernicus Sentinel-2 NDVI</option>
            <option value="esri">Esri World Imagery</option>
          </select>
          {demoMode && !isDemoSourceAvailable(source) && (
            <p className="field-hint">
              {SOURCE_LABELS[source]} is not included in this hosted demo. Clone the repo and run it locally to see it.
            </p>
          )}
        </section>

        <section className="control-group">
          <h2>
            <Globe2 size={14} /> Basemap
          </h2>
          <div className="mode-switcher" role="group" aria-label="Basemap switcher">
            {basemapLabels.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={`mode-button ${basemapMode === mode.key ? "is-active" : ""}`}
                onClick={() => onBasemapChange(mode.key)}
              >
                <span>{mode.label}</span>
                <small>{mode.description}</small>
              </button>
))}
          </div>
        </section>

        <section className="control-group">
          <h2>
            <Globe2 size={14} /> Overlays
          </h2>
          <button
            type="button"
            className={`toggle-button ${segmentationEnabled ? "is-on" : "is-off"}`}
            onClick={() => onSegmentationToggle(!segmentationEnabled)}
            aria-pressed={segmentationEnabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px",
              marginTop: "12px",
              width: "100%",
              justifyContent: "center",
              border: "1px solid var(--hairline)",
              backgroundColor: "var(--panel-bg)",
              cursor: "pointer",
            }}
          >
            <span className={`toggle-dot ${segmentationEnabled ? "is-on" : "is-off"}`} />
            Damage points: {segmentationEnabled ? "ON" : "OFF"}
          </button>
        </section>

        <section className="control-group">
          <h2>Category Filters</h2>
          {filterLabels.map((item) => (
            <div className="filter-item" key={item.key}>
              <label className="filter-label">
                <input
                  type="checkbox"
                  checked={activeFilters[item.key]}
                  onChange={() => onToggleFilter(item.key)}
                />
                <span>{item.label}</span>
              </label>
              <input
                type="color"
                className="filter-swatch"
                value={categoryColors[item.key]}
                title={`${item.label} color`}
                aria-label={`${item.label} color`}
                onChange={(event) => onCategoryColorChange(item.key, event.target.value)}
              />
            </div>
          ))}
        </section>

        <section className="kpi-grid kpi-grid--compact" aria-label="Key metrics">
          <article className="kpi-card">
            <span>Total Incidents</span>
            <strong>{metrics.total}</strong>
          </article>
          <article className="kpi-card">
            <span>High Severity</span>
            <strong>{metrics.highSeverity}</strong>
          </article>
          <article className="kpi-card">
            <span>Resolved / Active</span>
            <strong>
              {metrics.resolved} / {metrics.active}
            </strong>
          </article>
          <article className="kpi-card">
            <span>Notes</span>
            <strong>{metrics.notes}</strong>
          </article>
        </section>

        {selectedPoint && (
          <section className="selection-card" aria-label="Selected incident">
            <h2>
              <CheckCircle2 size={14} /> Selected Incident
            </h2>
            <p>ID: {selectedPoint.properties.id}</p>
            <p>Class: {selectedPoint.properties.class}</p>
            <p>Severity: {selectedPoint.properties.severity.toFixed(2)}</p>
            <p>Status: {selectedPoint.properties.status}</p>
            {incidentAnnotations[selectedPoint.properties.id]?.priority && (
              <p className="priority-badge">Priority</p>
            )}
            {incidentAnnotations[selectedPoint.properties.id]?.notes.length ? (
              <div className="incident-notes">
                <h3>Notes</h3>
                <ul>
                  {incidentAnnotations[selectedPoint.properties.id].notes.map((note) => (
                    <li key={note.id}>
                      <p>{note.text}</p>
                      <small>{note.timestamp}</small>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;