import { FormEvent, useEffect, useState } from "react";

import { MapNote } from "../types/dataset";
import { randomId } from "../utils/damage";

type NoteModalProps = {
  coordinates: [number, number];
  onSave: (note: MapNote) => void;
  onCancel: () => void;
};

function NoteModal({ coordinates, onSave, onCancel }: NoteModalProps) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
  }, [coordinates]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    onSave({
      id: randomId(),
      coordinates,
      text: text.trim(),
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form className="modal-card" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <h2>New Map Note</h2>
        <p className="modal-meta">
          {coordinates[1].toFixed(5)}, {coordinates[0].toFixed(5)}
        </p>
        <label className="form-label" htmlFor="note-text">
          Note text
        </label>
        <textarea
          id="note-text"
          className="field modal-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a field observation or command note"
          autoFocus
        />
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Save Note
          </button>
        </div>
      </form>
    </div>
  );
}

export default NoteModal;
