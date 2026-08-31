import { FormEvent, useEffect, useRef, useState } from "react";

import { DatasetConfig, DatasetVariant } from "../types/dataset";

type SettingsModalProps = {
  datasets: DatasetConfig[];
  onClose: () => void;
  onSaveDataset: (dataset: DatasetConfig) => void;
};

const today = () => new Date().toISOString().slice(0, 10);

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
  const [selectedSourceId, setSelectedSourceId] = useState(datasets[0]?.id ?? "");
  const [datasetDate, setDatasetDate] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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

  const selectedSource = datasets.find((dataset) => dataset.id === selectedSourceId) ?? datasets[0];

  useEffect(() => {
    if (!datasetDate) {
      setDatasetDate(today());
    }
  }, [datasetDate]);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedSource || !imageFile) {
      return;
    }

    const parsedDate = datasetDate || today();
    const inheritedBounds = selectedSource.bounds ?? selectedSource.variants[0]?.bounds ?? [0, 0, 0, 0];
    const variantId = makeUniqueId(
      `${selectedSource.id}-${parsedDate}`,
      selectedSource.variants.map((variant) => variant.id)
    );
    const objectUrl = URL.createObjectURL(imageFile);
    createdObjectUrlRef.current = objectUrl;
    const variant: DatasetVariant = {
      id: variantId,
      label: `Imported ${parsedDate}`,
      date: parsedDate,
      rawRasterUrl: objectUrl,
      bounds: inheritedBounds as [number, number, number, number],
    };

    onSaveDataset({
      ...selectedSource,
      variants: [...selectedSource.variants, variant],
      rawRasterUrl: selectedSource.rawRasterUrl ?? variant.rawRasterUrl,
      bounds: selectedSource.bounds ?? variant.bounds,
    });

    didSaveRef.current = true;
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form className="modal-card settings-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <h2>Add your own imagery</h2>
        <p className="modal-meta">
          Satellite captures are fetched automatically. Use this only to append your own dated image
          (drone shot, orthophoto, export) to an existing source.
        </p>

        <label className="form-label" htmlFor="existing-source">
          Source
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
          Image
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

        {imageFile && previewUrl && (
          <div className="image-preview">
            <img src={previewUrl} alt="Selected imagery preview" />
            <button type="button" className="secondary-button" onClick={handleRemoveImage}>
              Remove image
            </button>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="primary-button">
            Add imagery
          </button>
        </div>
      </form>
    </div>
  );
}

export default SettingsModal;
