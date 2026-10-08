// src/components/ResidentCombobox.jsx
import React, { useState, useEffect, useRef } from 'react';

export const formatPurok = (purok) => {
  if (!purok) return 'Purok 1';
  const p = String(purok);
  return p.toLowerCase().startsWith('purok') ? p : `Purok ${p}`;
};

export default function ResidentCombobox({
  db,
  residents = [],
  value,
  onChange,
  placeholder = 'Search by name, resident ID, or purok...',
  maxVisible = 10,
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedResident, setSelectedResident] = useState(null);
  const wrapRef = useRef(null);

  // Hanapin ang selected resident sa local array kung walang async lookup
  useEffect(() => {
    if (value && Array.isArray(residents) && residents.length > 0) {
      const found = residents.find((r) => r.id === value || r._id === value);
      if (found) setSelectedResident(found);
    } else if (!value) {
      setSelectedResident(null);
    }
  }, [value, residents]);

  // Close dropdown sa click-outside
  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Debounced Search Query (PouchDB async search if DB is provided)
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (db && typeof db.find === 'function') {
          // Server/DB-side querying with index limit
          const res = await db.find({
            selector: {
              type: 'resident',
              $or: [
                { name: { $regex: `(?i)${q}` } },
                { full_name: { $regex: `(?i)${q}` } },
                { purok: { $regex: `(?i)${q}` } },
                { id: { $regex: `(?i)${q}` } }
              ]
            },
            limit: maxVisible
          });
          setOptions(res.docs || []);
        } else if (Array.isArray(residents)) {
          // Fallback sa local array filter kapag hindi naipasa ang db prop
          const filtered = residents.filter((r) =>
            (r.name || r.full_name || '').toLowerCase().includes(q.toLowerCase()) ||
            (r.id || '').toLowerCase().includes(q.toLowerCase()) ||
            String(r.purok || '').toLowerCase().includes(q.toLowerCase())
          ).slice(0, maxVisible);
          setOptions(filtered);
        }
      } catch (err) {
        console.error('Resident Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, db, residents, maxVisible]);

  const handlePick = (res) => {
    setSelectedResident(res);
    onChange(res);
    setQuery('');
    setOpen(false);
  };

  const handleClear = () => {
    setSelectedResident(null);
    onChange(null);
  };

  if (selectedResident) {
    return (
      <div className="res-combo" ref={wrapRef}>
        <div className="res-combo-selected" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface2)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div>
            <strong>{selectedResident.name || selectedResident.full_name}</strong>
            <span className="res-combo-meta" style={{ fontSize: '11px', color: 'var(--muted)', marginLeft: '8px' }}>
              {selectedResident.id || selectedResident._id} • {formatPurok(selectedResident.purok)}
            </span>
          </div>
          <button type="button" className="btn-sm" onClick={handleClear} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 'bold' }}>
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="res-combo" ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        className="fc"
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
      />

      {open && query.trim().length >= 2 && (
        <div className="res-combo-panel" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', zIndex: 1000, maxHeight: '220px', overflowY: 'auto', boxShadow: '0 8px 16px rgba(0,0,0,0.4)', marginTop: '4px' }}>
          {loading ? (
            <div style={{ padding: '10px', fontSize: '12px', color: 'var(--muted)' }}>🔍 Searching residents database...</div>
          ) : options.length > 0 ? (
            options.map((res) => (
              <div
                key={res._id || res.id}
                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: '13px' }}
                onClick={() => handlePick(res)}
              >
                <div style={{ fontWeight: 'bold', color: 'var(--text)' }}>{res.name || res.full_name}</div>
                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  ID: {res.id || res._id} | {formatPurok(res.purok)} | Email: {res.email || 'None'}
                </div>
              </div>
            ))
          ) : (
            <div style={{ padding: '10px', fontSize: '12px', color: 'var(--muted)' }}>No resident found.</div>
          )}
        </div>
      )}
    </div>
  );
}