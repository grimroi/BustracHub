import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';
import { calculateGestationalAge, getEstimatedDueDate } from '../../services/bhsHelpers';

const EMPTY_FORM = {
  type: 'child',
  residentId: '',
  residentName: '',
  vaccineType: 'BCG',
  doseNo: 1,
  dateAdministered: '',
  nextDueDate: '',
  lmp: '',
  edd: '',
  gestationalWeeks: 0,
  bp: '',
  weight: 0,
  medicineName: '',
  quantity: 1,
  dateGiven: '',
  condition: '',
  notes: '',
};

const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 };

export default function BHSHealthRecords() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [residents, setResidents] = useState([]);
  const [filter, setFilter] = useState("all");

  const loadRecords = async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const list = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === 'health_record' && !d._deleted)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setRecords(list);
    } catch (err) {
      console.error('Failed to load health records:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const loadResidents = async () => {
  try {
    const res = await db.allDocs({ include_docs: true });
    const list = res.rows
      .map((r) => r.doc)
      .filter((d) => d && d.type === 'resident' && !d.isArchived && !d._deleted)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    console.log('[BHS] Loaded residents:', list.length);
    setResidents(list);
  } catch (err) {
    console.warn('[BHS] Failed to load residents:', err);
  }
};

  useEffect(() => {
  loadResidents();
  loadRecords();
}, []);

  const openAdd = () => { setForm(EMPTY_FORM); setFormOpen(true); };

  const readUser = () => {
    try {
      const raw = localStorage.getItem('bustrac_user');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.residentId.trim() || !form.residentName.trim()) {
      Swal.fire('Missing fields', 'Resident ID and Name are required.', 'warning');
      return;
    }
    setSaving(true);
    try {
      const user = readUser();
      const payload = { ...form };
const recordType = payload.type || 'child';
if (recordType === 'mother') {
  payload.gestationalWeeks = calculateGestationalAge(payload.lmp);
  payload.edd = getEstimatedDueDate(payload.lmp);
}
const doc = {
  ...payload,
  _id: generateUUID(),
  type: 'health_record',
  recordType: recordType,
  createdBy: user?.username || 'unknown',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
      let saved = false, attempts = 0;
      while (attempts < 3 && !saved) {
        try { await db.put(doc); saved = true; }
        catch (err) {
          if (err?.status === 409 || err?.name === 'conflict') {
            attempts++;
            doc._id = generateUUID();
          } else throw err;
        }
      }
if (!saved) throw new Error('Could not save after retries.');

// 1. Close modal + refresh UI FIRST (para agad lumabas yung bagong record)
setFormOpen(false);
await loadRecords();

// 2. Fire-and-forget: sync + audit (hindi na kailangan hintayin)
forceSyncToRemote().catch(() => {});
createAuditLog({
  action: 'BHS_HEALTH_RECORD_SAVE',
  module: 'BHS',
  recordId: doc._id,
  details: `Saved health record: ${form.residentName}`,
}).catch(() => {});

// 3. Success toast
Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
    } catch (err) {
      Swal.fire('Save failed', err.message || 'Unknown error', 'error');
    } finally { setSaving(false); }
  };

const filtered = records.filter((r) => {
  if (filter === 'all') return true;
  const rt = r.recordType || r.type;
  if (filter === 'child') return rt === 'child';
  if (filter === 'mother') return rt === 'mother';
  if (filter === 'senior') return rt === 'senior';
  return true;
});

  const isOverdue = (r) => {
  const rt = r.recordType || r.type;
  if (rt !== 'child' || !r.nextDueDate) return false;
  return new Date(r.nextDueDate).getTime() < Date.now();
};

  const renderDetails = (r) => {
  const rt = r.recordType || r.type;
  if (rt === 'child') return `${r.vaccineType} · Dose ${r.doseNo}`;
  if (rt === 'mother') return `LMP ${r.lmp || '—'} · EDD ${r.edd || '—'} · ${r.gestationalWeeks || 0}w`;
  if (rt === 'senior') return `${r.medicineName} · ${r.quantity} · ${r.dateGiven || '—'}`;
  return '—';
};

  return (
    <div className="screen active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>BHS Health Records</h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>Immunizations, prenatal care, senior medicines</p>
        </div>
        <button className="btn btn-p" onClick={openAdd}>+ Add Record</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { k: 'all', label: 'All' },
          { k: 'child', label: 'Children' },
          { k: 'mother', label: 'Mothers' },
          { k: 'senior', label: 'Seniors' },
        ].map((t) => (
          <button key={t.k} type="button" onClick={() => setFilter(t.k)} className={filter === t.k ? 'btn btn-p' : 'btn btn-g'} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700 }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 13 }}>No health records yet.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                {['Patient', 'Type', 'Details', 'Date', 'Status'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{r.residentName}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)', textTransform: 'capitalize' }}>{r.recordType || r.type}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{renderDetails(r)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{r.dateAdministered || r.dateGiven || r.lmp || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {isOverdue(r) ? (
                      <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)' }}>OVERDUE</span>
                    ) : (
                      <span style={{ color: 'var(--muted)', fontSize: 11 }}>—</span>
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
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>New Health Record</h3>

            <label style={labelStyle}>RECORD TYPE</label>
            <select style={{ ...inputStyle, marginBottom: 12 }} value={form.type} onChange={(e) => setForm({ ...EMPTY_FORM, type: e.target.value, residentId: form.residentId, residentName: form.residentName })} disabled={saving}>
              <option value="child">Child (Immunization)</option>
              <option value="mother">Mother (Prenatal)</option>
              <option value="senior">Senior (Medicine)</option>
            </select>

            <div style={{ marginBottom: 12 }}>
  <label style={labelStyle}>RESIDENT * (search by name)</label>
  <input
    list="bhs-resident-list"
    style={inputStyle}
    placeholder="Type resident name..."
    value={form.residentName}
    onChange={(e) => {
      const typed = e.target.value;
      const match = residents.find((r) =>
        (r.name || '').toLowerCase() === typed.toLowerCase() ||
        (r.residentId || '') === typed
      );
      setForm({
        ...form,
        residentName: typed,
        residentId: match ? (match.residentId || match._id) : form.residentId,
      });
    }}
    disabled={saving}
    required
  />
  <datalist id="bhs-resident-list">
    {residents.map((r) => (
      <option key={r._id} value={r.name}>{r.residentId}</option>
    ))}
  </datalist>
  {form.residentId && (
    <div style={{ marginTop: 4, fontSize: 11, color: 'var(--green)' }}>
      ✓ Linked to {form.residentId}
    </div>
  )}
</div>

            {form.type === 'child' && (
              <>
                <label style={labelStyle}>VACCINE TYPE</label>
                <select style={{ ...inputStyle, marginBottom: 12 }} value={form.vaccineType} onChange={(e) => setForm({ ...form, vaccineType: e.target.value })} disabled={saving}>
                  {['BCG', 'Hepatitis B', 'DPT', 'OPV', 'Measles', 'MMR'].map((v) => <option key={v}>{v}</option>)}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>DOSE NO.</label>
                    <input type="number" min="1" style={inputStyle} value={form.doseNo} onChange={(e) => setForm({ ...form, doseNo: Number(e.target.value) || 1 })} disabled={saving} />
                  </div>
                  <div>
                    <label style={labelStyle}>DATE ADMINISTERED</label>
                    <input type="date" style={inputStyle} value={form.dateAdministered} onChange={(e) => setForm({ ...form, dateAdministered: e.target.value })} disabled={saving} />
                  </div>
                </div>
                <label style={labelStyle}>NEXT DUE DATE</label>
                <input type="date" style={{ ...inputStyle, marginBottom: 12 }} value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} disabled={saving} />
              </>
            )}

            {form.type === 'mother' && (
              <>
                <label style={labelStyle}>LMP (Last Menstrual Period)</label>
                <input type="date" style={{ ...inputStyle, marginBottom: 12 }} value={form.lmp} onChange={(e) => setForm({ ...form, lmp: e.target.value })} disabled={saving} />
                <div style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--muted)' }}>
                  {form.lmp ? `EDD: ${getEstimatedDueDate(form.lmp)} · ${calculateGestationalAge(form.lmp)} weeks` : 'Enter LMP to auto-compute EDD'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>BLOOD PRESSURE</label>
                    <input style={inputStyle} placeholder="e.g. 120/80" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} disabled={saving} />
                  </div>
                  <div>
                    <label style={labelStyle}>WEIGHT (kg)</label>
                    <input type="number" step="0.1" style={inputStyle} value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 0 })} disabled={saving} />
                  </div>
                </div>
              </>
            )}

            {form.type === 'senior' && (
              <>
                <label style={labelStyle}>MEDICINE NAME</label>
                <input style={{ ...inputStyle, marginBottom: 12 }} value={form.medicineName} onChange={(e) => setForm({ ...form, medicineName: e.target.value })} disabled={saving} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>QUANTITY</label>
                    <input type="number" min="1" style={inputStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })} disabled={saving} />
                  </div>
                  <div>
                    <label style={labelStyle}>DATE GIVEN</label>
                    <input type="date" style={inputStyle} value={form.dateGiven} onChange={(e) => setForm({ ...form, dateGiven: e.target.value })} disabled={saving} />
                  </div>
                </div>
                <label style={labelStyle}>CONDITION</label>
                <input style={{ ...inputStyle, marginBottom: 12 }} placeholder="e.g. Hypertension, Diabetes" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} disabled={saving} />
              </>
            )}

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