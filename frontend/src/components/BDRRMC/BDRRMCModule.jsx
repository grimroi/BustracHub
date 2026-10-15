import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';

const EMPTY_FORM = {
  eventType: 'Typhoon',
  location: '',
  dateStarted: new Date().toISOString().split('T')[0],
  dateEnded: '',
  severity: 'Medium',
  affectedFamilies: 0,
  description: '',
  status: 'Active',
};

const BARANGAY_WIDE = 'Barangay-wide';

const purokNumber = (value) => {
  const m = String(value || '').match(/(?:zone|purok)\s*([1-9][0-9]?)/i);
  return m ? Number(m[1]) : null;
};

const isBarangayWide = (value) =>
  /(barangay\s*-?\s*wide|buong\s+barangay|^all$)/i.test(String(value || '').trim());

const buildAreaOptions = (registry) => {
  const nums = new Set([1, 2, 3, 4, 5]);
  [...(registry.households || []), ...(registry.residents || [])].forEach((doc) => {
    const n = purokNumber(doc.purok || doc.purokZoneAddress);
    if (n) nums.add(n);
  });
  const list = [...nums].sort((a, b) => a - b).map((n) => `Purok ${n}`);
  return [...list, BARANGAY_WIDE];
};

const countFamiliesForArea = (location, registry) => {
  const label = String(location || '').trim();
  if (!label) return null;

  const households = registry.households || [];
  const residents = registry.residents || [];

  if (isBarangayWide(label)) {
    return { families: households.length, residents: residents.length };
  }

  const area = purokNumber(label);
  if (area == null) return null;

  const areaResidents = residents.filter((r) => purokNumber(r.purok || r.purokZoneAddress) === area);

  if (registry.households.length > 0) {
    const areaHouseholds = registry.households.filter((h) => purokNumber(h.purok || h.purokZoneAddress) === area);
    return { families: areaHouseholds.length, residents: areaResidents.length };
  }

  const householdNos = new Set(
    areaResidents.map((r) => r.householdNo || r.household).filter(Boolean)
  );
  return {
    families: householdNos.size > 0 ? householdNos.size : areaResidents.length,
    residents: areaResidents.length,
  };
};

export default function BDRRMCModule() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('All');
  const [registry, setRegistry] = useState({ households: [], residents: [] });

  const loadEvents = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const list = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === 'disaster_event' && !d._deleted)
        .sort((a, b) => new Date(b.dateStarted || 0) - new Date(a.dateStarted || 0));
      setEvents(list);
    } catch (err) {
      console.error('Failed to load disaster events:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRegistry = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const docs = res.rows.map((r) => r.doc).filter(Boolean);
      setRegistry({
        households: docs.filter((d) => d.type === 'household' && !d._deleted),
        residents: docs.filter(
          (d) => ['resident', 'residents', 'profile'].includes(d.type) && !d._deleted && d.isArchived !== true
        ),
      });
    } catch (err) {
      console.error('Failed to load household/resident registry:', err);
    }
  };

  useEffect(() => { loadEvents(); loadRegistry(); }, []);

  const areaOptions = useMemo(() => buildAreaOptions(registry), [registry]);

  const suggestion = useMemo(() => countFamiliesForArea(form.location, registry), [form.location, registry]);
  const areaSelectValue = areaOptions.includes(form.location)
    ? form.location
    : (String(form.location || '').trim() ? '__other__' : '');

  const openAdd = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
    loadRegistry();
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...EMPTY_FORM, ...item });
    setFormOpen(true);
    loadRegistry();
  };

  const handleAreaSelect = (value) => {
    if (value === '__other__') {
      setForm((prev) => ({ ...prev, location: '' }));
      return;
    }
    const info = countFamiliesForArea(value, registry);
    setForm((prev) => ({ ...prev, location: value, affectedFamilies: info ? info.families : 0 }));
  };

  const handleLocationText = (value) => {
    setForm((prev) => ({ ...prev, location: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.eventType || !form.location.trim()) {
      Swal.fire('Required', 'Event type and location are required.', 'warning'); return;
    }
    setSaving(true);
    try {
      let doc = editItem
        ? { ...editItem, ...form, updatedAt: new Date().toISOString() }
        : { _id: generateUUID(), type: 'disaster_event', ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      let saved = false, attempts = 0;
      while (attempts < 3 && !saved) {
        try { await db.put(doc); saved = true; }
        catch (err) {
          if (err && (err.status === 409 || err.name === 'conflict')) {
            attempts++;
            const fresh = await db.get(doc._id);
            doc = { ...fresh, ...form, updatedAt: new Date().toISOString() };
          } else throw err;
        }
      }
      if (!saved) throw new Error('Conflict saving disaster event.');
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try { await createAuditLog({ action: editItem ? 'DISASTER_EVENT_UPDATE' : 'DISASTER_EVENT_CREATE', module: 'BDRRMC', recordId: doc._id, details: form.eventType + ' at ' + form.location }); } catch { /* best-effort */ }
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
      setFormOpen(false);
      await loadEvents();
    } catch (err) {
      Swal.fire('Save failed', err.message || 'Unknown error', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    const res = await Swal.fire({ icon: 'warning', title: 'Delete event?', text: item.eventType + ' - ' + item.location, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc2626' });
    if (!res.isConfirmed) return;
    try {
      const fresh = await db.get(item._id);
      await db.remove(fresh);
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      await loadEvents();
    } catch (err) {
      Swal.fire('Delete failed', err.message || 'Unknown error', 'error');
    }
  };

  const badgeStyle = (c) => {
    const map = {
      red: { bg: 'rgba(220, 38, 38, 0.16)', fg: 'var(--red, #dc2626)' },
      amber: { bg: 'rgba(245, 158, 11, 0.16)', fg: 'var(--amber, #b45309)' },
      green: { bg: 'rgba(16, 185, 129, 0.16)', fg: 'var(--green, #059669)' },
      accent: { bg: 'rgba(59, 130, 246, 0.16)', fg: 'var(--accent, #3b6fd9)' },
    };
    const v = map[c] || map.accent;
    return { display: 'inline-block', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: v.bg, color: v.fg };
  };
  const filtered = events.filter((e) => filter === 'All' || e.eventType === filter);

  const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 };

  return (
    <div className="screen active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>BDRRMC / Disaster Response</h2>
        <button className="btn btn-p" onClick={openAdd}>+ Add Disaster Event</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All','Typhoon','Flood','Fire','Earthquake','Others'].map((t) => (
            <button key={t} className="btn btn-g btn-sm" style={{ borderColor: filter === t ? 'var(--accent)' : 'var(--border)' }} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10 }}>No disaster events found.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                {['Event Type','Location','Date Started','Severity','Status','Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => (
                <tr key={ev._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{ev.eventType}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{ev.location}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{ev.dateStarted || '—'}</td>
                  <td style={{ padding: '10px 12px' }}><span style={badgeStyle(ev.severity === 'Critical' ? 'red' : ev.severity === 'High' ? 'amber' : ev.severity === 'Medium' ? 'accent' : 'green')}>{ev.severity}</span></td>
                  <td style={{ padding: '10px 12px' }}><span style={badgeStyle(ev.status === 'Active' ? 'red' : ev.status === 'Monitoring' ? 'amber' : 'green')}>{ev.status}</span></td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-g btn-sm" onClick={() => openEdit(ev)} style={{ marginRight: 6 }}>Edit</button>
                    <button className="btn btn-g btn-sm" onClick={() => handleDelete(ev)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => !saving && setFormOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{editItem ? 'Edit Disaster Event' : 'Add Disaster Event'}</h3>
            <label style={labelStyle}>EVENT TYPE</label>
            <select style={{ ...inputStyle, marginBottom: 12 }} value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} disabled={saving}>
              {['Typhoon','Flood','Fire','Earthquake','Others'].map((t) => <option key={t}>{t}</option>)}
            </select>
            <label style={labelStyle}>AFFECTED AREA (PUROK / ZONE) *</label>
            <select style={{ ...inputStyle, marginBottom: areaSelectValue === '__other__' ? 8 : 12 }} value={areaSelectValue} onChange={(e) => handleAreaSelect(e.target.value)} disabled={saving}>
              <option value="" disabled>Select affected area</option>
              {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
              <option value="__other__">Others (specify)</option>
            </select>
            {areaSelectValue === '__other__' && (
              <input style={{ ...inputStyle, marginBottom: 12 }} value={form.location} onChange={(e) => handleLocationText(e.target.value)} placeholder="e.g. Bustrac Elementary School" disabled={saving} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>DATE STARTED</label><input type="date" style={inputStyle} value={form.dateStarted} onChange={(e) => setForm({ ...form, dateStarted: e.target.value })} disabled={saving} /></div>
              <div><label style={labelStyle}>DATE ENDED</label><input type="date" style={inputStyle} value={form.dateEnded} onChange={(e) => setForm({ ...form, dateEnded: e.target.value })} disabled={saving} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>SEVERITY</label><select style={inputStyle} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} disabled={saving}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
              <div>
                <label style={labelStyle}>AFFECTED FAMILIES</label>
                <input type="number" min="0" style={inputStyle} value={form.affectedFamilies} onChange={(e) => setForm({ ...form, affectedFamilies: Number(e.target.value)||0 })} disabled={saving} />
                {suggestion && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, lineHeight: 1.4 }}>
                    Registry: {suggestion.families} {suggestion.families === 1 ? 'household' : 'households'}{suggestion.residents > 0 ? ` · ${suggestion.residents} ${suggestion.residents === 1 ? 'resident' : 'residents'}` : ''} in {form.location}.
                    {form.affectedFamilies !== suggestion.families && (
                      <button type="button" onClick={() => setForm({ ...form, affectedFamilies: suggestion.families })} style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, fontWeight: 700, padding: 0 }}>Use {suggestion.families}</button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <label style={labelStyle}>STATUS</label>
            <select style={{ ...inputStyle, marginBottom: 12 }} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={saving}><option>Active</option><option>Monitoring</option><option>Resolved</option></select>
            <label style={labelStyle}>DESCRIPTION</label>
            <textarea rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={saving} />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-g" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
