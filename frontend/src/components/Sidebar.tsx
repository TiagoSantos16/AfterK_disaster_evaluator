import { useMemo } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Globe2, MapPinned } from "lucide-react";

import { BasemapMode, DatasetConfig, DamageClass, DamagePoint, DatasetVariant, IncidentNote, MapNote, TemporalState } from "../types/dataset";
import { CategoryColors } from "../config/categoryColors";

type IncidentAnnotation = {
  priority: boolean;
  notes: IncidentNote[];
};

type SidebarProps = {
  datasets: DatasetConfig[];
  activeDataset: DatasetConfig;
  activeVariantId: string;
  basemapMode: BasemapMode;
  activeFilters: Record<DamageClass, boolean>;
  points: DamagePoint[];
  mapNotes: MapNote[];
  selectedPoint: DamagePoint | null;
  incidentAnnotations: Record<string, IncidentAnnotation>;
  dataSourceLabel: string;
  collapsed: boolean;
  temporalState: TemporalState;
  categoryColors: CategoryColors;
  onTemporalStateChange: (state: TemporalState) => void;
  onToggleCollapse: () => void;
  onDatasetChange: (datasetId: string) => void;
  onVariantChange: (variantId: string) => void;
  onBasemapChange: (mode: BasemapMode) => void;
  onToggleFilter: (damageClass: DamageClass) => void;
  onCategoryColorChange: (damageClass: DamageClass, color: string) => void;
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
  activeVariantId,
  basemapMode,
  activeFilters,
  points,
  mapNotes,
  selectedPoint,
  incidentAnnotations,
  dataSourceLabel,
  collapsed,
  temporalState,
  categoryColors,
  onTemporalStateChange,
  onToggleCollapse,
  onDatasetChange,
  onVariantChange,
  onBasemapChange,
  onToggleFilter,
  onCategoryColorChange,
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
            <p className="eyebrow">GeoAI Municipal Damage Assessment</p>
            <h1>Disaster Impact Dashboard</h1>
            <p className="subtitle">{activeDataset.name}</p>
          </div>
          <button type="button" className="icon-button" onClick={onToggleCollapse} aria-label="Collapse sidebar">
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <p className="subtitle panel-source">Data source: {dataSourceLabel}</p>

        <section className="control-group">
          <h2>
            <MapPinned size={14} /> Source & Date
          </h2>
          <label className="form-label" htmlFor="dataset-select">
            Source
          </label>
          <select
            id="dataset-select"
            className="field"
            value={activeDataset.id}
            onChange={(event) => onDatasetChange(event.target.value)}
          >
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name} - {dataset.city}
              </option>
            ))}
          </select>

          <label className="form-label" htmlFor="date-select">
            Date
          </label>
          <select
            id="date-select"
            className="field"
            value={activeVariantId}
            onChange={(event) => onVariantChange(event.target.value)}
          >
            {activeDataset.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.date} - {variant.label}
              </option>
            ))}
          </select>
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

          <button
            type="button"
            className="toggle-button is-off"
            disabled
            aria-disabled="true"
            title="Segmentation overlay requires a trained model; will enable after model training."
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px",
              marginTop: "12px",
              width: "100%",
              justifyContent: "center",
              border: "1px solid #ccc",
              backgroundColor: "#f9fafb",
              cursor: "not-allowed",
            }}
          >
            <span className="toggle-dot is-off" />
            Segmentation Overlay: OFF - model pending
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