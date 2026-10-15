import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';

const EMPTY_FORM = {
  name: '',
  location: '',
  purok: '',
  capacity: 0,
  currentOccupants: 0,
  status: 'Open',
  linkedEventId: '',
  contactPerson: '',
  contactNumber: '',
  notes: '',
};

const STATUSES = ['Open', 'Full', 'Closed', 'Standby'];

// Offline-first save with 409 conflict retry (up to 3 attempts), matching BDRRMCModule.
const putWithRetry = async (initialDoc, merge) => {
  let doc = initialDoc;
  let saved = false;
  let attempts = 0;
  while (attempts < 3 && !saved) {
    try {
      await db.put(doc);
      saved = true;
    } catch (err) {
      if (err && err.status === 409) {
        const fresh = await db.get(doc._id);
        doc = { ...fresh, ...merge, updatedAt: new Date().toISOString() };
        attempts += 1;
      } else {
        throw err;
      }
    }
  }
  if (!saved) throw new Error('Conflicting edit detected. Please try again.');
  return doc;
};

export default function BDRRMCEvacuation() {
  const [centers, setCenters] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Active');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const docs = res.rows.map((r) => r.doc).filter(Boolean);
      setCenters(
        docs
          .filter((d) => d.type === 'evacuation_center' && !d._deleted)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      );
      setEvents(
        docs.filter((d) => d.type === 'disaster_event' && !d._deleted && d.status === 'Active')
      );
    } catch (err) {
      console.error('Failed to load evacuation centers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = centers.filter((c) => {
    if (filter === 'Archived') return c.isArchived === true;
    if (filter === 'Active') return c.isArchived !== true;
    return true;
  });

  const eventLabel = (id) => {
    if (!id) return '—';
    const ev = events.find((e) => e._id === id);
    return ev ? `${ev.eventType} — ${ev.location}` : id;
  };

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setFormOpen(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ ...EMPTY_FORM, ...item }); setFormOpen(true); };

  const handleNumber = (field, value) => {
    const n = Math.max(0, Number(value) || 0);
    setForm((prev) => {
      const next = { ...prev, [field]: n };
      const cap = field === 'capacity' ? n : Number(prev.capacity) || 0;
      const occ = field === 'currentOccupants' ? n : Number(prev.currentOccupants) || 0;
      if (cap > 0 && occ >= cap) next.status = 'Full';
      return next;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { Swal.fire('Required', 'Center name is required.', 'warning'); return; }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const capacity = Math.max(0, Number(form.capacity) || 0);
      const currentOccupants = Math.max(0, Number(form.currentOccupants) || 0);
      let status = form.status;
      if (capacity > 0 && currentOccupants >= capacity) status = 'Full';
      const payload = { ...form, capacity, currentOccupants, status };
      const doc = editItem
        ? { ...editItem, ...payload, updatedAt: now }
        : { _id: generateUUID(), type: 'evacuation_center', isArchived: false, ...payload, createdAt: now, updatedAt: now };
      await putWithRetry(doc, payload);
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try {
        await createAuditLog({
          action: editItem ? 'EVACUATION_CENTER_UPDATE' : 'EVACUATION_CENTER_CREATE',
          module: 'BDRRMC',
          recordId: doc._id,
          details: (editItem ? 'Updated ' : 'Created ') + doc.name,
        });
      } catch { /* best-effort */ }
      Swal.fire({ icon: 'success', title: editItem ? 'Updated' : 'Saved', timer: 1200, showConfirmButton: false });
      setFormOpen(false);
      setEditItem(null);
      await load();
    } catch (err) {
      Swal.fire('Save failed', err.message || 'Unknown error', 'error');
    } finally { setSaving(false); }
  };

  const adjustOccupancy = async (item, delta) => {
    try {
      const fresh = await db.get(item._id);
      if (fresh.isArchived) return;
      const cap = Math.max(0, Number(fresh.capacity) || 0);
      const next = Math.max(0, (Number(fresh.currentOccupants) || 0) + delta);
      let status = fresh.status;
      if (cap > 0 && next >= cap) status = 'Full';
      else if (fresh.status !== 'Closed' && fresh.status !== 'Standby') status = 'Open';
      const doc = { ...fresh, currentOccupants: next, status, updatedAt: new Date().toISOString() };
      await putWithRetry(doc, { currentOccupants: next, status });
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try {
        await createAuditLog({
          action: 'EVACUATION_OCCUPANCY_UPDATE',
          module: 'BDRRMC',
          recordId: doc._id,
          details: `Occupancy ${next}/${cap} at ${doc.name}`,
        });
      } catch { /* best-effort */ }
      await load();
    } catch (err) {
      Swal.fire('Update failed', err.message || 'Unknown error', 'error');
    }
  };

  const handleArchive = async (item) => {
    const res = await Swal.fire({
      icon: 'warning',
      title: 'Archive center?',
      text: 'Archived centers are hidden from the active list but kept for history.',
      showCancelButton: true,
      confirmButtonText: 'Archive',
      confirmButtonColor: '#dc2626',
    });
    if (!res.isConfirmed) return;
    try {
      const fresh = await db.get(item._id);
      const doc = { ...fresh, isArchived: true, updatedAt: new Date().toISOString() };
      await putWithRetry(doc, { isArchived: true });
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try {
        await createAuditLog({ action: 'EVACUATION_CENTER_ARCHIVE', module: 'BDRRMC', recordId: doc._id, details: 'Archived evacuation center: ' + doc.name });
      } catch { /* best-effort */ }
      Swal.fire({ icon: 'success', title: 'Archived', timer: 1200, showConfirmButton: false });
      await load();
    } catch (err) {
      Swal.fire('Archive failed', err.message || 'Unknown error', 'error');
    }
  };

  const handleRestore = async (item) => {
    const res = await Swal.fire({
      icon: 'question',
      title: 'Restore center?',
      text: 'This center will return to the active list.',
      showCancelButton: true,
      confirmButtonText: 'Restore',
    });
    if (!res.isConfirmed) return;
    try {
      const fresh = await db.get(item._id);
      const doc = { ...fresh, isArchived: false, updatedAt: new Date().toISOString() };
      await putWithRetry(doc, { isArchived: false });
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try {
        await createAuditLog({ action: 'EVACUATION_CENTER_RESTORE', module: 'BDRRMC', recordId: doc._id, details: 'Restored evacuation center: ' + doc.name });
      } catch { /* best-effort */ }
      Swal.fire({ icon: 'success', title: 'Restored', timer: 1200, showConfirmButton: false });
      await load();
    } catch (err) {
      Swal.fire('Restore failed', err.message || 'Unknown error', 'error');
    }
  };

  const statusBadge = (status, archived) => {
    if (archived) return { bg: 'rgba(100, 116, 139, 0.16)', fg: 'var(--muted)' };
    if (status === 'Full') return { bg: 'rgba(220, 38, 38, 0.16)', fg: 'var(--red, #dc2626)' };
    if (status === 'Open') return { bg: 'rgba(16, 185, 129, 0.16)', fg: 'var(--green, #059669)' };
    if (status === 'Standby') return { bg: 'rgba(245, 158, 11, 0.16)', fg: 'var(--amber, #b45309)' };
    return { bg: 'rgba(100, 116, 139, 0.16)', fg: 'var(--muted)' };
  };

  const badgeStyle = (status, archived) => {
    const v = statusBadge(status, archived);
    return { display: 'inline-block', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: v.bg, color: v.fg };
  };

  const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 };
  const occupancyFull = Number(form.capacity) > 0 && Number(form.currentOccupants) >= Number(form.capacity);

  return (
    <div className="screen active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Evacuation Centers</h2>
        <button className="btn btn-p" onClick={openAdd} aria-label="Add evacuation center">+ Add Evacuation Center</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6, textTransform: 'uppercase' }}>Archive</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All', 'Active', 'Archived'].map((t) => (
            <button key={t} className="btn btn-g btn-sm" style={{ borderColor: filter === t ? 'var(--accent)' : 'var(--border)' }} onClick={() => setFilter(t)} aria-label={`Show ${t.toLowerCase()} centers`}>{t}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
          {filter === 'Archived' ? 'No archived centers.' : 'No evacuation centers found.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                {['Center', 'Location', 'Capacity', 'Current Occupants', 'Status', 'Linked Event', 'Actions'].map((h) => (
                  <th key={h} scope="col" style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c._id} style={{ borderTop: '1px solid var(--border)', opacity: c.isArchived ? 0.6 : 1 }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{c.location || '—'}{c.purok ? ` (${c.purok})` : ''}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{c.capacity ?? 0}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-g btn-sm" style={{ padding: '2px 8px', marginRight: 6 }} onClick={() => adjustOccupancy(c, -1)} disabled={c.isArchived || (Number(c.currentOccupants) || 0) <= 0} aria-label={`Remove one occupant from ${c.name}`}>−</button>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>{Number(c.currentOccupants) || 0}</span>
                    <button className="btn btn-g btn-sm" style={{ padding: '2px 8px', marginLeft: 6 }} onClick={() => adjustOccupancy(c, 1)} disabled={c.isArchived} aria-label={`Add one occupant to ${c.name}`}>+</button>
                  </td>
                  <td style={{ padding: '10px 12px' }}><span style={badgeStyle(c.status, c.isArchived)}>{c.isArchived ? 'Archived' : c.status}</span></td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{eventLabel(c.linkedEventId)}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-g btn-sm" onClick={() => openEdit(c)} style={{ marginRight: 6 }} aria-label={`Edit ${c.name}`}>Edit</button>
                    {c.isArchived ? (
                      <button className="btn btn-g btn-sm" onClick={() => handleRestore(c)} aria-label={`Restore ${c.name}`}>Restore</button>
                    ) : (
                      <button className="btn btn-g btn-sm" onClick={() => handleArchive(c)} aria-label={`Archive ${c.name}`}>Archive</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => !saving && setFormOpen(false)}>
          <form role="dialog" aria-modal="true" aria-labelledby="bdrrmc-evac-title" onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 id="bdrrmc-evac-title" style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{editItem ? 'Edit Evacuation Center' : 'Add Evacuation Center'}</h3>
            <label style={labelStyle}>CENTER NAME *</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} required aria-label="Center name" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>LOCATION</label><input style={inputStyle} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} disabled={saving} aria-label="Location" /></div>
              <div><label style={labelStyle}>PUROK / ZONE</label><input style={inputStyle} value={form.purok} onChange={(e) => setForm({ ...form, purok: e.target.value })} disabled={saving} aria-label="Purok or zone" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>CAPACITY</label><input type="number" min="0" style={inputStyle} value={form.capacity} onChange={(e) => handleNumber('capacity', e.target.value)} disabled={saving} aria-label="Capacity" /></div>
              <div><label style={labelStyle}>CURRENT OCCUPANTS</label><input type="number" min="0" style={inputStyle} value={form.currentOccupants} onChange={(e) => handleNumber('currentOccupants', e.target.value)} disabled={saving} aria-label="Current occupants" /></div>
            </div>
            <div style={{ fontSize: 12, color: occupancyFull ? 'var(--red, #dc2626)' : 'var(--muted)', fontWeight: occupancyFull ? 700 : 400, marginTop: -4, marginBottom: 12 }}>
              Occupancy: {Number(form.currentOccupants) || 0} / {Number(form.capacity) || 0}{occupancyFull ? ' — at capacity' : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>STATUS</label>
                <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} disabled={saving} aria-label="Status">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>LINKED EVENT</label>
                <select style={inputStyle} value={form.linkedEventId} onChange={(e) => setForm({ ...form, linkedEventId: e.target.value })} disabled={saving} aria-label="Linked disaster event">
                  <option value="">None</option>
                  {events.map((ev) => <option key={ev._id} value={ev._id}>{ev.eventType} — {ev.location}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>CONTACT PERSON</label><input style={inputStyle} value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} disabled={saving} aria-label="Contact person" /></div>
              <div><label style={labelStyle}>CONTACT NUMBER</label><input style={inputStyle} value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} disabled={saving} aria-label="Contact number" /></div>
            </div>
            <label style={labelStyle}>NOTES</label>
            <textarea rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={saving} aria-label="Notes" />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-g" onClick={() => { setFormOpen(false); setEditItem(null); }} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
