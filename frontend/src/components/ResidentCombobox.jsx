// src/components/ResidentCombobox.jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';

export const formatPurok = (purok) => {
  if (!purok) return 'Purok 1';
  const p = String(purok);
  return p.toLowerCase().startsWith('purok') ? p : `Purok ${p}`;
};

export default function ResidentCombobox({
  residents = [],
  value,
  onChange,
  placeholder = 'Search by name, resident ID, or purok...',
  maxVisible = 30,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  // Ligtas na pag-check kung array ang residents
  const safeResidents = Array.isArray(residents) ? residents : [];

  const selected = useMemo(
    () => safeResidents.find((r) => r.id === value) || null,
    [safeResidents, value]
  );

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return safeResidents;
    return safeResidents.filter(
      (r) =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q) ||
        String(r.purok || '').toLowerCase().includes(q)
    );
  }, [safeResidents, query]);

  const filtered = useMemo(() => matches.slice(0, maxVisible), [matches, maxVisible]);

  // Close kapag nag-click outside
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (res) => {
    onChange(res);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (filtered[highlight]) pick(filtered[highlight]);
    } else if (e.key === 'Escape') setOpen(false);
  };

  if (selected) {
    return (
      <div className="res-combo" ref={wrapRef}>
        <div className="res-combo-selected">
          <div>
            <strong>{selected.name}</strong>
            <span className="res-combo-meta">
              {selected.id} • {formatPurok(selected.purok)}
            </span>
          </div>
          <button
            type="button"
            className="res-combo-clear"
            onClick={() => onChange(null)}
            aria-label="Clear selected resident"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="res-combo" ref={wrapRef}>
      <div className="res-combo-inputwrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          className="fc"
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>

      {open && (
        <div className="res-combo-panel" role="listbox">
          {filtered.length === 0 ? (
            <div className="res-combo-empty">No matching resident found.</div>
          ) : (
            <>
              <ul>
                {filtered.map((res, i) => (
                  <li key={res.id} role="option" aria-selected={i === highlight}>
                    <button
                      type="button"
                      className={`res-combo-option${i === highlight ? ' active' : ''}`}
                      onMouseEnter={() => setHighlight(i)}
                      onClick={() => pick(res)}
                    >
                      <span className="res-combo-name">{res.name}</span>
                      <span className="res-combo-sub">
                        {res.id} • {formatPurok(res.purok)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {matches.length > maxVisible && (
                <div className="res-combo-more">
                  Showing {maxVisible} of {matches.length.toLocaleString()} matches — type more to narrow down
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}