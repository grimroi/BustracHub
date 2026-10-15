import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';

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

export default function BDRRMCRelief() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
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

  const openAdd = () => { setForm(EMPTY_FORM); setFormOpen(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.residentName.trim()) { Swal.fire('Required', 'Beneficiary name is required.', 'warning'); return; }
    setSaving(true);
    try {
      const doc = { _id: generateUUID(), type: 'relief_distribution', ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      await db.put(doc);
      try { await forceSyncToRemote(); } catch { /* best-effort */ }
      try { await createAuditLog({ action: 'RELIEF_DISTRIBUTION_CREATE', module: 'BDRRMC', recordId: doc._id, details: 'Distributed ' + form.reliefItem + ' to ' + form.residentName }); } catch { /* best-effort */ }
      Swal.fire({ icon: 'success', title: 'Recorded', timer: 1200, showConfirmButton: false });
      setFormOpen(false);
      await load();
    } catch (err) {
      Swal.fire('Save failed', err.message || 'Unknown error', 'error');
    } finally { setSaving(false); }
  };

  const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 };

  return (
    <div className="screen active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Relief Distribution</h2>
        <button className="btn btn-p" onClick={openAdd}>+ Record Distribution</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10 }}>No relief distributions found.</div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                {['Beneficiary','Item','Quantity','Date Given','Notes'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{it.residentName || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.reliefItem}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.quantity} {it.unit}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.dateGiven || '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{it.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => !saving && setFormOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Record Relief Distribution</h3>
            <label style={labelStyle}>EVENT ID</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} value={form.eventId} onChange={(e) => setForm({ ...form, eventId: e.target.value })} disabled={saving} />
            <label style={labelStyle}>BENEFICIARY NAME *</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} value={form.residentName} onChange={(e) => setForm({ ...form, residentName: e.target.value })} disabled={saving} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>ITEM</label><select style={inputStyle} value={form.reliefItem} onChange={(e) => setForm({ ...form, reliefItem: e.target.value })} disabled={saving}><option>Food Pack</option><option>Water</option><option>Blanket</option><option>Medicine</option><option>Cash</option><option>Others</option></select></div>
              <div><label style={labelStyle}>QUANTITY</label><input type="number" style={inputStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value)||0 })} disabled={saving} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>UNIT</label><input style={inputStyle} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={saving} /></div>
              <div><label style={labelStyle}>DATE GIVEN</label><input type="date" style={inputStyle} value={form.dateGiven} onChange={(e) => setForm({ ...form, dateGiven: e.target.value })} disabled={saving} /></div>
            </div>
            <label style={labelStyle}>NOTES</label>
            <textarea rows={3} style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={saving} />
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
