// src/components/ConflictFieldMergeModal.jsx
//
// Field-level conflict resolution.
//
// The admin sees a side-by-side table of every field that differs between
// the two revisions and picks, per field, which version to keep. The result
// is a merged document: no valid edit is thrown away just because it lived
// in the "losing" revision.
import { useEffect, useMemo, useState } from 'react';
import { buildDefaultChoices, describeMergeChoices } from '../utils/conflictMerge';
import '../styles/ConflictManagement.css';

const ConflictFieldMergeModal = ({
  open,
  conflict,
  onClose,
  onApply,
  onKeepVersionA,
  onKeepVersionB,
  isApplying = false,
}) => {
  const [choices, setChoices] = useState({});

  const diff = useMemo(() => conflict?.diff || [], [conflict]);

  useEffect(() => {
    if (open && conflict) {
      setChoices(buildDefaultChoices(conflict.diff || []));
    }
  }, [open, conflict]);

  if (!open || !conflict) return null;

  const setChoice = (field, side) => {
    setChoices((prev) => ({ ...prev, [field]: side }));
  };

  const setAll = (side) => {
    const next = {};
    diff.forEach((entry) => {
      next[entry.field] = side;
    });
    setChoices(next);
  };

  const summary = describeMergeChoices(diff, choices);

  return (
    <div
      className="conflict-merge-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Field level conflict resolution"
    >
      <div className="conflict-merge-modal">
        <div className="conflict-merge-header">
          <div>
            <h3 className="conflict-merge-title">Resolve conflict — {conflict.residentName || 'Record'}</h3>
            <p className="conflict-merge-subtitle">
              Choose which version to keep for each field. Fields only present in one version are
              pre-selected from that version.
            </p>
          </div>
          <button type="button" className="btn btn-g btn-sm" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="conflict-merge-toolbar">
          <div className="conflict-merge-legend">
            <span className="conflict-merge-legend-item conflict-merge-legend-item--a">
              Version A — {conflict.timeA ? new Date(conflict.timeA).toLocaleString() : 'local'}
            </span>
            <span className="conflict-merge-legend-item conflict-merge-legend-item--b">
              Version B — {conflict.timeB ? new Date(conflict.timeB).toLocaleString() : 'server'}
            </span>
          </div>
          <div className="conflict-merge-bulk">
            <button type="button" className="btn btn-g btn-sm" onClick={() => setAll('A')}>
              All → A
            </button>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setAll('B')}>
              All → B
            </button>
          </div>
        </div>

        {diff.length === 0 ? (
          <p className="conflict-merge-empty">
            The two revisions hold the same values — there is nothing to merge. Keeping either side
            produces the same result.
          </p>
        ) : (
          <div className="conflict-merge-table-wrap">
            <table className="conflict-merge-table">
              <thead>
                <tr>
                  <th scope="col" className="conflict-merge-th conflict-merge-th--field">Field</th>
                  <th scope="col" className="conflict-merge-th">Version A</th>
                  <th scope="col" className="conflict-merge-th">Version B</th>
                  <th scope="col" className="conflict-merge-th conflict-merge-th--keep">Keep</th>
                </tr>
              </thead>
              <tbody>
                {diff.map((entry) => {
                  const selected = choices[entry.field] || entry.defaultChoice || 'A';
                  return (
                    <tr key={entry.field} className="conflict-merge-row">
                      <th scope="row" className="conflict-merge-th conflict-merge-th--field">
                        <span className="conflict-merge-field-label">{entry.label}</span>
                        {entry.presentA !== entry.presentB && (
                          <span className="conflict-merge-only-tag">
                            only in Version {entry.presentA ? 'A' : 'B'}
                          </span>
                        )}
                        {(entry.editorA || entry.editorB) && (
                          <span className="conflict-merge-authors">
                            {entry.editorA ? `A: ${entry.editorA}` : ''}
                            {entry.editorA && entry.editorB ? ' · ' : ''}
                            {entry.editorB ? `B: ${entry.editorB}` : ''}
                          </span>
                        )}
                      </th>
                      <td
                        className={`conflict-merge-cell ${selected === 'A' ? 'conflict-merge-cell--selected' : ''}`}
                      >
                        <label className="conflict-merge-radio">
                          <input
                            type="radio"
                            name={`merge-${conflict.id || conflict.docId}`}
                            checked={selected === 'A'}
                            onChange={() => setChoice(entry.field, 'A')}
                          />
                          <span>{entry.valueA}</span>
                        </label>
                      </td>
                      <td
                        className={`conflict-merge-cell ${selected === 'B' ? 'conflict-merge-cell--selected' : ''}`}
                      >
                        <label className="conflict-merge-radio">
                          <input
                            type="radio"
                            name={`merge-${conflict.id || conflict.docId}`}
                            checked={selected === 'B'}
                            onChange={() => setChoice(entry.field, 'B')}
                          />
                          <span>{entry.valueB}</span>
                        </label>
                      </td>
                      <td className="conflict-merge-keep">
                        <span
                          className={`conflict-merge-keep-badge conflict-merge-keep-badge--${selected.toLowerCase()}`}
                        >
                          Version {selected}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="conflict-merge-footer">
          <div className="conflict-merge-summary">
            <strong>Will keep:</strong> {summary || 'nothing to merge'}
          </div>
          <div className="conflict-merge-actions">
            <button type="button" className="btn btn-g btn-sm" onClick={onClose} disabled={isApplying}>
              Cancel
            </button>
            {onKeepVersionA && (
              <button
                type="button"
                className="btn btn-g btn-sm"
                onClick={() => {
                  onKeepVersionA(conflict);
                  onClose();
                }}
                disabled={isApplying}
                title="Keep the whole of Version A and discard Version B"
              >
                Keep all A
              </button>
            )}
            {onKeepVersionB && (
              <button
                type="button"
                className="btn btn-g btn-sm"
                onClick={() => {
                  onKeepVersionB(conflict);
                  onClose();
                }}
                disabled={isApplying}
                title="Keep the whole of Version B and discard Version A"
              >
                Keep all B
              </button>
            )}
            <button
              type="button"
              className="btn btn-p btn-sm"
              onClick={() => onApply && onApply(conflict, choices)}
              disabled={isApplying}
              title="Write the merged document and remove the conflict"
            >
              {isApplying ? 'Merging…' : 'Apply merged version'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConflictFieldMergeModal;
