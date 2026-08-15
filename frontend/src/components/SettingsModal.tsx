import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { DatasetConfig, DatasetVariant, SatelliteProvider, SegmentationSource } from "../types/dataset";

type SettingsModalProps = {
  datasets: DatasetConfig[];
  onClose: () => void;
  onSaveDataset: (dataset: DatasetConfig) => void;
};

type ImportMode = "new" | "existing";

const today = () => new Date().toISOString().slice(0, 10);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const makeUniqueId = (baseId: string, takenIds: string[]) => {
  if (!takenIds.includes(baseId)) {
    return baseId;
  }

  let suffix = 1;
  while (takenIds.includes(`${baseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}-${suffix}`;
};

function SettingsModal({ datasets, onClose, onSaveDataset }: SettingsModalProps) {
  const [mode, setMode] = useState<ImportMode>("new");
  const [sourceName, setSourceName] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState(datasets[0]?.id ?? "");
  const [datasetDate, setDatasetDate] = useState("");
  const [boundsWest, setBoundsWest] = useState("-9.051361");
  const [boundsSouth, setBoundsSouth] = useState("39.717751");
  const [boundsEast, setBoundsEast] = useState("-8.76709");
  const [boundsNorth, setBoundsNorth] = useState("39.783213");

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [boundsError, setBoundsError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const createdObjectUrlRef = useRef<string | null>(null);
  const didSaveRef = useRef(false);

  useEffect(() => {
    return () => {
      if (createdObjectUrlRef.current && !didSaveRef.current) {
        URL.revokeObjectURL(createdObjectUrlRef.current);
      }
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const [satelliteProvider, setSatelliteProvider] = useState<SatelliteProvider>("esri");
  const [customRasterUrl, setCustomRasterUrl] = useState("");
  const [segmentationSource, setSegmentationSource] = useState<SegmentationSource>("osm-vector");

  const selectedSource = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedSourceId) ?? datasets[0],
    [datasets, selectedSourceId]
  );

  useEffect(() => {
    if (!datasetDate) {
      setDatasetDate(today());
    }
  }, [datasetDate]);

  useEffect(() => {
    if (!selectedSource && datasets[0]) {
      setSelectedSourceId(datasets[0].id);
    }
  }, [datasets, selectedSource]);

  useEffect(() => {
    if (!selectedSource) {
      return;
    }
    setSatelliteProvider(selectedSource.satelliteProvider ?? "esri");
    setCustomRasterUrl(selectedSource.customRasterUrl ?? "");
    setSegmentationSource(selectedSource.segmentationSource ?? "osm-vector");

    if (mode === "existing") {
      const sourceBounds = selectedSource.bounds ?? selectedSource.variants[0]?.bounds;
      if (sourceBounds) {
        const [west, south, east, north] = sourceBounds;
        setBoundsWest(String(west));
        setBoundsSouth(String(south));
        setBoundsEast(String(east));
        setBoundsNorth(String(north));
      }
    }
  }, [selectedSource, mode]);

  const handleModeChange = (nextMode: ImportMode) => {
    setMode(nextMode);
    setImageFile(null);
    setPreviewUrl(null);
    setBoundsError(null);

    if (nextMode === "existing" && selectedSource?.bounds) {
      const [west, south, east, north] = selectedSource.bounds;
      setBoundsWest(String(west));
      setBoundsSouth(String(south));
      setBoundsEast(String(east));
      setBoundsNorth(String(north));
    }
  };

  const handleImageChange = (file: File | null) => {
    setImageFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleRemoveImage = () => {
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    setImageFile(null);
    setPreviewUrl(null);
  };

  const validateBounds = (west: number, south: number, east: number, north: number): string | null => {
    if ([west, south, east, north].some((value) => !Number.isFinite(value))) {
      return "Bounding box values must be numbers.";
    }
    if (west < -180 || east > 180 || south < -90 || north > 90) {
      return "Coordinates must be WGS84 decimal degrees (longitude -180..180, latitude -90..90).";
    }
    if (west >= east) {
      return "West must be smaller than East.";
    }
    if (south >= north) {
      return "South must be smaller than North.";
    }
    return null;
  };

  const buildVariant = (variantId: string, bounds?: [number, number, number, number]): DatasetVariant => {
    const objectUrl = imageFile ? URL.createObjectURL(imageFile) : null;
    createdObjectUrlRef.current = objectUrl;
    return {
      id: variantId,
      label: mode === "new" ? "Primary import" : "Imported date",
      date: datasetDate,
      rawRasterUrl: objectUrl ?? undefined,
      bounds,
    };
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const parsedDate = datasetDate || today();

    if (mode === "new") {
      const parsedBounds: [number, number, number, number] = [
        Number(boundsWest),
        Number(boundsSouth),
        Number(boundsEast),
        Number(boundsNorth),
      ];

      const boundsErrorMessage = validateBounds(...parsedBounds);
      if (boundsErrorMessage) {
        setBoundsError(boundsErrorMessage);
        return;
      }
      setBoundsError(null);

      const datasetId = makeUniqueId(slugify(sourceName) || "custom-source", datasets.map((dataset) => dataset.id));
      const variantId = makeUniqueId(
        `${datasetId}-${parsedDate}`,
        datasets.flatMap((dataset) => dataset.variants.map((variant) => variant.id))
      );
      const variant = buildVariant(variantId, parsedBounds);
      const [west, south, east, north] = parsedBounds;

      onSaveDataset({
        id: datasetId,
        name: sourceName.trim() || "Imported Source",
        city: sourceName.trim() || "Imported",
        coordinates: [(west + east) / 2, (south + north) / 2],
        zoom: 13,
        description: "Imported dataset source",
        rawRasterUrl: variant.rawRasterUrl,
        satelliteProvider,
        customRasterUrl: satelliteProvider === "custom" ? customRasterUrl : undefined,
        segmentationSource,
        bounds: parsedBounds,
        variants: [variant],
        defaultVariantId: variant.id,
        defaultPoints: [],
      });

      didSaveRef.current = true;
      onClose();
      return;
    }

    if (!selectedSource) {
      return;
    }

    const inheritedBounds = selectedSource.bounds ?? selectedSource.variants[0]?.bounds ?? [0, 0, 0, 0];
    const variantId = makeUniqueId(
      `${selectedSource.id}-${parsedDate}`,
      selectedSource.variants.map((variant) => variant.id)
    );
    const variant = buildVariant(variantId, inheritedBounds as [number, number, number, number]);

    onSaveDataset({
      ...selectedSource,
      variants: [...selectedSource.variants, variant],
      rawRasterUrl: selectedSource.rawRasterUrl ?? variant.rawRasterUrl,
      satelliteProvider,
      customRasterUrl: satelliteProvider === "custom" ? customRasterUrl : undefined,
      segmentationSource,
      bounds: selectedSource.bounds ?? variant.bounds,
    });

    didSaveRef.current = true;
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form className="modal-card settings-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <h2>Settings</h2>
        <p className="modal-meta">Import a new source or append a dated image to an existing source.</p>

        <div className="mode-switcher" role="group" aria-label="Import mode" style={{ marginBottom: "16px" }}>
          <button
            type="button"
            className={`mode-button ${mode === "new" ? "is-active" : ""}`}
            onClick={() => handleModeChange("new")}
          >
            <span
              className="mode-info"
              tabIndex={0}
              aria-label="About creating a new source"
              onClick={(event) => event.stopPropagation()}
            >
              i
              <span className="mode-tooltip">
                Defines a brand-new source: name, date, bounding box, and a first image. Use this to start
                tracking a new city or event.
              </span>
            </span>
            <span>Create New Source</span>
            <small>New dataset plus first image</small>
          </button>
          <button
            type="button"
            className={`mode-button ${mode === "existing" ? "is-active" : ""}`}
            onClick={() => handleModeChange("existing")}
          >
            <span
              className="mode-info"
              tabIndex={0}
              aria-label="About adding a date to an existing source"
              onClick={(event) => event.stopPropagation()}
            >
              i
              <span className="mode-tooltip">
                Appends a new dated image (e.g. a pre/post capture) to an existing source so you can compare
                time steps.
              </span>
            </span>
            <span>Add Date to Existing Source</span>
            <small>Append a new variant</small>
          </button>
        </div>

        {mode === "new" ? (
          <>
            <label className="form-label" htmlFor="source-name">
              Source Name
            </label>
            <input id="source-name" className="field" value={sourceName} onChange={(event) => setSourceName(event.target.value)} />

            <label className="form-label" htmlFor="new-source-date">
              Date
            </label>
            <input id="new-source-date" className="field" type="date" value={datasetDate} onChange={(event) => setDatasetDate(event.target.value)} />

            <label className="form-label">Bounding Box</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", marginBottom: "16px" }}>
              <input className="field" value={boundsWest} onChange={(event) => { setBoundsWest(event.target.value); setBoundsError(null); }} placeholder="West" />
              <input className="field" value={boundsSouth} onChange={(event) => { setBoundsSouth(event.target.value); setBoundsError(null); }} placeholder="South" />
              <input className="field" value={boundsEast} onChange={(event) => { setBoundsEast(event.target.value); setBoundsError(null); }} placeholder="East" />
              <input className="field" value={boundsNorth} onChange={(event) => { setBoundsNorth(event.target.value); setBoundsError(null); }} placeholder="North" />
            </div>
            {boundsError && (
              <p className="form-error" role="alert">
                {boundsError}
              </p>
            )}
            <p className="form-note">Coordinates are WGS84 decimal degrees (longitude, latitude).</p>

            <label className="form-label" htmlFor="source-image">
              Image Upload
            </label>
            <input
              id="source-image"
              type="file"
              accept="image/png, image/jpeg, image/webp"
              className="field"
              required
              ref={imageInputRef}
              onChange={(event) => handleImageChange(event.target.files?.[0] || null)}
            />
          </>
        ) : (
          <>
            <label className="form-label" htmlFor="existing-source">
              Select Source
            </label>
            <select id="existing-source" className="field" value={selectedSourceId} onChange={(event) => setSelectedSourceId(event.target.value)}>
              {datasets.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.name}
                </option>
              ))}
            </select>

            <label className="form-label" htmlFor="existing-date">
              Date
            </label>
            <input id="existing-date" className="field" type="date" value={datasetDate} onChange={(event) => setDatasetDate(event.target.value)} />

            <label className="form-label" htmlFor="existing-image">
              Image Upload
            </label>
            <input
              id="existing-image"
              type="file"
              accept="image/png, image/jpeg, image/webp"
              className="field"
              required
              ref={imageInputRef}
              onChange={(event) => handleImageChange(event.target.files?.[0] || null)}
            />
          </>
        )}

        {imageFile && previewUrl && (
          <div className="image-preview">
            <img src={previewUrl} alt="Selected imagery preview" />
            <button type="button" className="secondary-button" onClick={handleRemoveImage}>
              Remove image
            </button>
          </div>
        )}

        <div className="data-source-section" style={{ marginBottom: "16px" }}>
          <label className="form-label" htmlFor="satellite-provider">
            Satellite provider
          </label>
          <select
            id="satellite-provider"
            className="field"
            value={satelliteProvider}
            onChange={(event) => setSatelliteProvider(event.target.value as SatelliteProvider)}
          >
            <option value="esri">Esri World Imagery</option>
            <option value="sar">Local image (any source)</option>
            <option value="custom">Custom tile URL</option>
          </select>

          {satelliteProvider === "custom" && (
            <>
              <label className="form-label" htmlFor="custom-raster-url">
                Custom tile URL
              </label>
              <input
                id="custom-raster-url"
                className="field"
                value={customRasterUrl}
                onChange={(event) => setCustomRasterUrl(event.target.value)}
                placeholder="https://example.com/tiles/{z}/{x}/{y}.png"
              />
            </>
          )}

          <p className="form-note">
            Segmentation overlay is not available yet; it will be enabled when the change-detection model is integrated.
          </p>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="primary-button">
            Save / Load
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsModal;