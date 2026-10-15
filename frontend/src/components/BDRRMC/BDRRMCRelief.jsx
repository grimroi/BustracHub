import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';

// SweetAlert mixin that renders ABOVE the portal modals (zIndex 10000).
const BdrrmcSwal = Swal.mixin({ zIndex: 10001 });

const EMPTY_FORM = {
  eventId: '',
  residentId: '',
  residentName: '',
  reliefItem: 'Food Pack',
  quantity: 1,
  unit: 'pcs',
  dateGiven: new Date().toISOString().split('T')[0],
  notes: '',
  claimStatus: 'Claimed',
};

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

export default function BDRRMCRelief() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Active');
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const list = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === 'relief_distribution' && !d._deleted)
        .sort((a, b) => new Date(b.dateGiven || 0) - new Date(a.dateGiven || 0));
      setItems(list);
    } catch (err) {
      console.error('Failed to load relief distributions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const visible = items.filter((it) => {
    if (filter === 'Archived') return it.isArchived === true;
    if (filter === 'Active') return it.isArchived !== true;
    return true;
  });

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setFormOpen(true); };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...EMPTY_FORM, ...item });
    setFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.residentName.trim()) {
      BdrrmcSwal.fire({ icon: 'warning', title: 'Required', text: 'Beneficiary name is required.' });
      return;
    }
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const doc = editItem
        ? { ...editItem, ...form, updatedAt: now }
        : { _id: generateUUID(), type: 'relief_distribution', isArchived: false, ...form, createdAt: now, updatedAt: now };
      await putWithRetry(doc, form);
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try {
        await createAuditLog({
          action: editItem ? 'RELIEF_DISTRIBUTION_UPDATE' : 'RELIEF_DISTRIBUTION_CREATE',
          module: 'BDRRMC',
          recordId: doc._id,
          details: (editItem ? 'Updated ' : 'Distributed ') + form.reliefItem + ' for ' + form.residentName,
        });
      } catch { /* best-effort */ }
      BdrrmcSwal.fire({ icon: 'success', title: editItem ? 'Updated' : 'Recorded', timer: 1200, showConfirmButton: false });
      setFormOpen(false);
      setEditItem(null);
      await load();
    } catch (err) {
      BdrrmcSwal.fire({ icon: 'error', title: 'Save failed', text: err.message || 'Unknown error' });
    } finally { setSaving(false); }
  };

  const handleArchive = async (item) => {
    const res = await BdrrmcSwal.fire({
      icon: 'warning',
      title: 'Archive record?',
      text: 'Archived records are hidden from the active list but kept for history.',
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
        await createAuditLog({
          action: 'RELIEF_DISTRIBUTION_ARCHIVE',
          module: 'BDRRMC',
          recordId: doc._id,
          details: 'Archived relief distribution for ' + (doc.residentName || 'unknown'),
        });
      } catch { /* best-effort */ }
      BdrrmcSwal.fire({ icon: 'success', title: 'Archived', timer: 1200, showConfirmButton: false });
      await load();
    } catch (err) {
      BdrrmcSwal.fire({ icon: 'error', title: 'Archive failed', text: err.message || 'Unknown error' });
    }
  };

  const handleRestore = async (item) => {
    const res = await BdrrmcSwal.fire({
      icon: 'question',
      title: 'Restore record?',
      text: 'This record will return to the active list.',
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
        await createAuditLog({
          action: 'RELIEF_DISTRIBUTION_RESTORE',
          module: 'BDRRMC',
          recordId: doc._id,
          details: 'Restored relief distribution for ' + (doc.residentName || 'unknown'),
        });
      } catch { /* best-effort */ }
      BdrrmcSwal.fire({ icon: 'success', title: 'Restored', timer: 1200, showConfirmButton: false });
      await load();
    } catch (err) {
      BdrrmcSwal.fire({ icon: 'error', title: 'Restore failed', text: err.message || 'Unknown error' });
    }
  };

  const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 };

  return (
    <div className="screen active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Relief Distribution</h2>
        <button className="btn btn-p" onClick={openAdd} aria-label="Record new relief distribution">+ Record Distribution</button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['All', 'Active', 'Archived'].map((t) => (
            <button key={t} className="btn btn-g btn-sm" style={{ borderColor: filter === t ? 'var(--accent)' : 'var(--border)' }} onClick={() => setFilter(t)} aria-label={`Show ${t.toLowerCase()} records`}>{t}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
          {filter === 'Archived' ? 'No archived records.' : 'No relief distributions found.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                {['Beneficiary','Item','Quantity','Date Given','Notes','Actions'].map((h) => (
                  <th key={h} scope="col" style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((it) => (
                <tr key={it._id} style={{ borderTop: '1px solid var(--border)', opacity: it.isArchived ? 0.6 : 1 }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{it.residentName || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.reliefItem}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.quantity} {it.unit}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.dateGiven || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.notes || '—'}</td>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-g btn-sm" onClick={() => openEdit(it)} style={{ marginRight: 6 }} aria-label={`Edit relief record for ${it.residentName || 'record'}`}>Edit</button>
                    {it.isArchived ? (
                      <>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginRight: 6 }}>Archived</span>
                        <button className="btn btn-g btn-sm" onClick={() => handleRestore(it)} aria-label={`Restore relief record for ${it.residentName || 'record'}`}>Restore</button>
                      </>
                    ) : (
                      <button className="btn btn-g btn-sm" onClick={() => handleArchive(it)} aria-label={`Archive relief record for ${it.residentName || 'record'}`}>Archive</button>
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
          <form role="dialog" aria-modal="true" aria-labelledby="bdrrmc-relief-title" onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 id="bdrrmc-relief-title" style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{editItem ? 'Edit Relief Record' : 'Record Relief Distribution'}</h3>
            <label style={labelStyle}>EVENT ID</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })} disabled={saving} aria-label="Related disaster event ID" />
            <label style={labelStyle}>BENEFICIARY NAME *</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} value={form.residentName} onChange={(e) => setForm({ ...form, residentName: e.target.value })} disabled={saving} required aria-label="Beneficiary name" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>ITEM</label><select style={inputStyle} value={form.reliefItem} onChange={(e) => setForm({ ...form, reliefItem: e.target.value })} disabled={saving} aria-label="Relief item"><option>Food Pack</option><option>Water</option><option>Blanket</option><option>Medicine</option><option>Cash</option><option>Others</option></select></div>
              <div><label style={labelStyle}>QUANTITY</label><input type="number" style={inputStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value)||0 })} disabled={saving} aria-label="Quantity" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>UNIT</label><input style={inputStyle} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={saving} aria-label="Unit of measure" /></div>
              <div><label style={labelStyle}>DATE GIVEN</label><input type="date" style={inputStyle} value={form.dateGiven} onChange={(e) => setForm({ ...form, dateGiven: e.target.value })} disabled={saving} aria-label="Date given" /></div>
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
