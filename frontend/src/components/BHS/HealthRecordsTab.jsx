// src/components/BHS/HealthRecordsTab.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';
import { calculateGestationalAge, getEstimatedDueDate } from '../../services/bhsHelpers';
import { exportToExcel } from '../../utils/excelExporter';
import './HealthStation.css';

const TODAY = new Date().toISOString().split('T')[0];
const PER_PAGE = 10;

const EMPTY_HEALTH_FORM = {
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

export default function HealthRecordsTab() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_HEALTH_FORM });
  const [saving, setSaving] = useState(false);
  const [residents, setResidents] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewingRecord, setViewingRecord] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('patientName');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const loadRecords = useCallback(async () => {
    setLoading(true);
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
  }, []);

  const loadResidents = useCallback(async () => {
    try {
      const res = await db.allDocs({ include_docs: true });
      const list = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === 'resident' && !d.isArchived && !d._deleted)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setResidents(list);
    } catch (err) {
      console.warn('[BHS] Failed to load residents:', err);
    }
  }, []);

  useEffect(() => {
    loadResidents();
    loadRecords();
  }, [loadResidents, loadRecords]);

  const readUser = () => {
    try { return localStorage.getItem('bustrac_user') ? JSON.parse(localStorage.getItem('bustrac_user')) : null; } catch { return null; }
  };

  const openAdd = () => { setForm({ ...EMPTY_HEALTH_FORM }); setFormOpen(true); };
  const closeForm = () => { setFormOpen(false); setForm({ ...EMPTY_HEALTH_FORM }); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.residentId.trim() || !form.residentName.trim()) {
      Swal.fire('Missing fields', 'Resident ID and Name are required.', 'warning');
      return;
    }
    if (form.lmp && new Date(form.lmp).getTime() > new Date().setHours(23,59,59,999)) {
      Swal.fire('LMP cannot be a future date.', '', 'warning');
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
      closeForm();
      await loadRecords();
      forceSyncToRemote().catch(() => {});
      createAuditLog({ action: 'BHS_HEALTH_RECORD_SAVE', module: 'BHS', recordId: doc._id, details: `Saved health record: ${form.residentName}` }).catch(() => {});
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
    } catch (err) {
      Swal.fire('Save failed', err.message || 'Unknown error', 'error');
    } finally { setSaving(false); }
  };

  const filteredRecords = useMemo(() => {
    const q = search.toLowerCase().trim();
    return records.filter((r) => {
      const matchesSearch = !q || (r.residentName || '').toLowerCase().includes(q);
      const matchesCat = categoryFilter === 'all' || (r.recordType || r.type) === categoryFilter;
      return matchesSearch && matchesCat;
    });
  }, [records, search, categoryFilter]);

  useEffect(() => { setPage(1); }, [search, categoryFilter]);

  const renderDetails = (r) => {
    const rt = r.recordType || r.type;
    if (rt === 'child') return `${r.vaccineType} · Dose ${r.doseNo}`;
    if (rt === 'mother') return `LMP ${r.lmp || '—'} · EDD ${r.edd || '—'} · ${r.gestationalWeeks || 0}w`;
    if (rt === 'senior') return `${r.medicineName} · ${r.quantity} · ${r.dateGiven || '—'}`;
    return '—';
  };

  const categoryLabel = (rt) => (rt || '').charAt(0).toUpperCase() + (rt || '').slice(1);

  const sortValue = (r) => {
    if (sortKey === 'category') return categoryLabel(r.recordType || r.type);
    if (sortKey === 'details') return renderDetails(r);
    if (sortKey === 'date') return r.dateAdministered || r.dateGiven || r.lmp || '';
    return r.residentName || '';
  };
  const sortDirSign = sortDir === 'asc' ? 1 : -1;
  const sortedRecords = [...filteredRecords].sort(
    (a, b) => String(sortValue(a)).localeCompare(String(sortValue(b))) * sortDirSign
  );

  const totalRecords = sortedRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PER_PAGE;
  const pageRecords = sortedRecords.slice(startIndex, startIndex + PER_PAGE);
  const pageFrom = totalRecords === 0 ? 0 : startIndex + 1;
  const pageTo = Math.min(startIndex + PER_PAGE, totalRecords);

  const healthStats = useMemo(() => {
    const children = records.filter((r) => (r.recordType || r.type) === 'child').length;
    const mothers = records.filter((r) => (r.recordType || r.type) === 'mother').length;
    const seniors = records.filter((r) => (r.recordType || r.type) === 'senior').length;
    return [records.length, children, mothers, seniors];
  }, [records]);

  const renderDetailModal = (r) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000, padding: '20px' }} onClick={() => setViewingRecord(null)}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '22px', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{r.residentName}</h3>
          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: 20, cursor: 'pointer' }} onClick={() => setViewingRecord(null)}>✕</button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: '14px' }}>Category: {categoryLabel(r.recordType || r.type)}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {Object.entries({
              'Resident ID': r.residentId || '—',
              'Details': renderDetails(r),
              'Date': r.dateAdministered || r.dateGiven || r.lmp || '—',
              'Created By': r.createdBy || '—',
            }).map(([k, v]) => (
              <tr key={k} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 0', width: '40%', color: 'var(--muted)', fontSize: 12 }}>{k}</td>
                <td style={{ padding: '8px 0', color: 'var(--text)', fontWeight: 600 }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const statCard = (value, label, icon, tone) => (
    <div className={`bhs-stat-card bhs-stat-card--${tone}`}>
      <div className="bhs-stat-icon" aria-hidden="true">{icon}</div>
      <div className="bhs-stat-body">
        <div className="bhs-stat-value">{value}</div>
        <div className="bhs-stat-label">{label}</div>
      </div>
    </div>
  );

  const exportHealthRecordsCsv = () => {
    const rows = filteredRecords.map((r) => ({
      'Patient Name': r.residentName || '',
      Category: categoryLabel(r.recordType || r.type),
      Details: renderDetails(r),
      Date: r.dateAdministered || r.dateGiven || r.lmp || '',
      'Created By': r.createdBy || '',
    }));
    exportToExcel(rows, 'Health_Records.csv', 'Health Records');
    setExportOpen(false);
  };

  const exportHealthRecordsPdf = () => {
    const rows = filteredRecords;
    const win = window.open('', '_blank');
    if (!win) { Swal.fire('Export failed', 'Could not open print window.', 'error'); setExportOpen(false); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Health Records Report</title>
      <style>body{font-family:Arial,sans-serif;margin:24px;color:#111}
      h1{font-size:18px;margin-bottom:4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f2f2f2}</style></head>
<body>
      <h1>Barangay Health Station — Health Records Report</h1>
      <div class="sub">Generated: ${new Date().toLocaleString()} · ${rows.length} record(s)</div>
      <table><thead><tr><th>Patient Name</th><th>Category</th><th>Details</th><th>Date</th><th>Created By</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${(r.residentName||'').replace(/</g,'&lt;')}</td><td>${categoryLabel(r.recordType||r.type)}</td><td>${renderDetails(r).replace(/</g,'&lt;')}</td><td>${r.dateAdministered||r.dateGiven||r.lmp||''}</td><td>${(r.createdBy||'').replace(/</g,'&lt;')}</td></tr>`).join('')}</tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},250)}</script></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setExportOpen(false);
  };

  return (
    <div className="cert-section-card bhs-section">
      <div className="cert-section-header" style={{ padding: '14px 20px', justifyContent: 'space-between' }}>
        <div className="cert-section-title" style={{ fontSize: '15px' }}>Patient Directory</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" className="fc" placeholder="Search patient name..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '220px', height: '34px', fontSize: '12px', padding: '6px 12px' }} />
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setExportOpen((o) => !o)} style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>Export ▾</button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100, minWidth: 140, overflow: 'hidden' }}>
                <button type="button" className="btn btn-g btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }} onClick={exportHealthRecordsCsv}>Export CSV</button>
                <button type="button" className="btn btn-g btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, borderTop: '1px solid var(--border)' }} onClick={exportHealthRecordsPdf}>Export PDF</button>
              </div>
            )}
          </div>
          <button className="btn btn-p" onClick={openAdd} style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>+ Add Record</button>
        </div>
      </div>

      <div className="bhs-stats">
        {statCard(healthStats[0] ?? 0, 'Total Records', '🩺', 'blue')}
        {statCard(healthStats[1] ?? 0, 'Children', '🧒', 'purple')}
        {statCard(healthStats[2] ?? 0, 'Mothers', '🤰', 'teal')}
        {statCard(healthStats[3] ?? 0, 'Seniors', '👵', 'green')}
      </div>

      <div className="bhs-filters">
        {[
          { k: 'all', label: 'All' },
          { k: 'child', label: 'Children' },
          { k: 'mother', label: 'Mothers' },
          { k: 'senior', label: 'Seniors' },
        ].map((t) => (
          <button key={t.k} type="button" onClick={() => setCategoryFilter(t.k)} className={`bhs-filter-btn ${categoryFilter === t.k ? 'bhs-filter-btn--active' : ''}`}>{t.label}</button>
        ))}
      </div>

      <div className="cert-table-wrapper">
        <table className="cert-report-table bhs-table-fixed">
          <thead>
            <tr>
              <th style={{ width: '35%', padding: '12px 16px', textAlign: 'left' }}>
                <span className={`bhs-sort-header ${sortKey === 'patientName' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('patientName')}>
                  Patient {sortKey === 'patientName' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '20%', padding: '12px 16px', textAlign: 'center' }}>
                <span className={`bhs-sort-header ${sortKey === 'category' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('category')} style={{ justifyContent: 'center' }}>
                  Category {sortKey === 'category' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '45%', padding: '12px 16px', textAlign: 'left' }}>
                <span className={`bhs-sort-header ${sortKey === 'details' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('details')}>
                  Details {sortKey === 'details' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Loading health records...</td></tr>
            ) : pageRecords.length === 0 ? (
              <tr>
                <td colSpan="3" style={{ padding: 0 }}>
                  <div className="bhs-empty">
                    <div className="bhs-empty-icon">🩺</div>
                    <div className="bhs-empty-title">No health records found</div>
                    <div className="bhs-empty-hint">Click "+ Add Record" to log a new immunization, prenatal, or senior medicine record.</div>
                  </div>
                </td>
              </tr>
            ) : (
              pageRecords.map((r) => (
                <tr
                  key={r._id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setViewingRecord(r)}
                >
                  <td className="bhs-cell-patient" style={{ padding: '12px 16px', color: 'var(--text)' }}>{r.residentName}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--muted)', textAlign: 'center', textTransform: 'capitalize' }}>{categoryLabel(r.recordType || r.type)}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text)' }}>{renderDetails(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalRecords > 0 && (
        <div className="bhs-pagination">
          <div className="bhs-pagination-info">
            Showing {pageFrom} to {pageTo} of {totalRecords} record{totalRecords === 1 ? '' : 's'}
          </div>
          <div className="bhs-pagination-controls">
            <button type="button" className="btn btn-g btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">Previous</button>
            <span className="bhs-pagination-page">Page {safePage} of {totalPages}</span>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">Next</button>
          </div>
        </div>
      )}

      {/* Record Detail Modal */}
      {viewingRecord && renderDetailModal(viewingRecord)}

      {/* Add/Edit Form Modal */}
      {formOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => !saving && setFormOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>New Health Record</h3>

            <div className="bhs-form-grid">
              <div className="bhs-form-group">
                <label className="bhs-form-label">RECORD TYPE</label>
                <select className="bhs-form-input" value={form.type} onChange={(e) => setForm({ ...EMPTY_HEALTH_FORM, type: e.target.value, residentId: form.residentId, residentName: form.residentName })} disabled={saving}>
                  <option value="child">Child (Immunization)</option>
                  <option value="mother">Mother (Prenatal)</option>
                  <option value="senior">Senior (Medicine)</option>
                </select>
              </div>

              <div className="bhs-form-group">
                <label className="bhs-form-label">RESIDENT * (search by name)</label>
                <input
                  list="bhs-resident-list"
                  className="bhs-form-input"
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
                  <div className="bhs-form-hint">
                    ✓ Linked to {form.residentId}
                  </div>
                )}
              </div>
            </div>

            {form.type === 'child' && (
              <div className="bhs-form-grid">
                <div className="bhs-form-group">
                  <label className="bhs-form-label">VACCINE TYPE</label>
                  <select className="bhs-form-input" value={form.vaccineType} onChange={(e) => setForm({ ...form, vaccineType: e.target.value })} disabled={saving}>
                    {['BCG', 'Hepatitis B', 'DPT', 'OPV', 'Measles', 'MMR'].map((v) => <option key={v}>{v}</option>)}
                  </select>
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">DOSE NO.</label>
                  <input type="number" min="1" className="bhs-form-input" value={form.doseNo} onChange={(e) => setForm({ ...form, doseNo: Number(e.target.value) || 1 })} disabled={saving} />
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">DATE ADMINISTERED</label>
                  <input type="date" className="bhs-form-input" value={form.dateAdministered} onChange={(e) => setForm({ ...form, dateAdministered: e.target.value })} disabled={saving} />
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">NEXT DUE DATE</label>
                  <input type="date" className="bhs-form-input" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} disabled={saving} />
                </div>
              </div>
            )}

            {form.type === 'mother' && (
              <div className="bhs-form-grid">
                <div className="bhs-form-group">
                  <label className="bhs-form-label">LMP (Last Menstrual Period)</label>
                  <input type="date" max={TODAY} className="bhs-form-input" value={form.lmp} onChange={(e) => setForm({ ...form, lmp: e.target.value })} disabled={saving} />
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">BLOOD PRESSURE</label>
                  <input className="bhs-form-input" placeholder="e.g. 120/80" value={form.bp} onChange={(e) => setForm({ ...form, bp: e.target.value })} disabled={saving} />
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">WEIGHT (kg)</label>
                  <input type="number" step="0.1" className="bhs-form-input" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) || 0 })} disabled={saving} />
                </div>
                <div className="bhs-form-group bhs-form-note bhs-form-group--full">
                  {form.lmp ? `EDD: ${getEstimatedDueDate(form.lmp)} · ${calculateGestationalAge(form.lmp)} weeks` : 'Enter LMP to auto-compute EDD'}
                </div>
              </div>
            )}

            {form.type === 'senior' && (
              <div className="bhs-form-grid">
                <div className="bhs-form-group bhs-form-group--full">
                  <label className="bhs-form-label">MEDICINE NAME</label>
                  <input className="bhs-form-input" value={form.medicineName} onChange={(e) => setForm({ ...form, medicineName: e.target.value })} disabled={saving} />
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">QUANTITY</label>
                  <input type="number" min="1" className="bhs-form-input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })} disabled={saving} />
                </div>
                <div className="bhs-form-group">
                  <label className="bhs-form-label">DATE GIVEN</label>
                  <input type="date" className="bhs-form-input" value={form.dateGiven} onChange={(e) => setForm({ ...form, dateGiven: e.target.value })} disabled={saving} />
                </div>
                <div className="bhs-form-group bhs-form-group--full">
                  <label className="bhs-form-label">CONDITION</label>
                  <input className="bhs-form-input" placeholder="e.g. Hypertension, Diabetes" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} disabled={saving} />
                </div>
              </div>
            )}

            <div className="bhs-form-group">
              <label className="bhs-form-label">NOTES</label>
              <textarea rows={3} className="bhs-form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} disabled={saving} />
            </div>

            <div className="bhs-form-footer">
              <button type="button" className="btn btn-g" onClick={closeForm} disabled={saving}>Cancel</button>
              <button type="submit" className="btn btn-p" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>,
        document.body
      )}
    </div>
  );
}
