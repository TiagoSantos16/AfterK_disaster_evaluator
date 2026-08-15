import { FormEvent, useState } from "react";

import { DamagePoint, IncidentNote } from "../types/dataset";
import { randomId } from "../utils/damage";

type IncidentNoteModalProps = {
  point: DamagePoint;
  onSave: (point: DamagePoint, note: IncidentNote) => void;
  onCancel: () => void;
};

function IncidentNoteModal({ point, onSave, onCancel }: IncidentNoteModalProps) {
  const [text, setText] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) {
      return;
    }

    onSave(point, {
      id: randomId(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <form className="modal-card" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
        <h2>Add Note to Incident</h2>
        <p className="modal-meta">
          {point.properties.class} · {point.properties.id}
        </p>
        <label className="form-label" htmlFor="incident-note-text">
          Note text
        </label>
        <textarea
          id="incident-note-text"
          className="field modal-textarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Add a field observation to this incident"
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

export default IncidentNoteModal;