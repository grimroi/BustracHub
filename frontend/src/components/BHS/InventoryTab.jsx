// src/components/BHS/InventoryTab.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';
import { exportToExcel } from '../../utils/excelExporter';
import './HealthStation.css';

const EMPTY_INV_FORM = {
  name: '',
  category: 'Medicine',
  quantity: 0,
  unit: 'pcs',
  lowStockThreshold: 10,
  expiryDate: '',
  notes: '',
};

const PER_PAGE = 10;

export default function InventoryTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_INV_FORM });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await db.allDocs({ include_docs: true });
      const list = res.rows
        .map((r) => r.doc)
        .filter((d) => d && d.type === 'bhs_inventory' && !d._deleted)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setItems(list);
    } catch (err) {
      console.error('Failed to load BHS inventory:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const openAdd = () => { setEditItem(null); setForm({ ...EMPTY_INV_FORM }); setFormOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name || '',
      category: item.category || 'Medicine',
      quantity: item.quantity ?? 0,
      unit: item.unit || 'pcs',
      lowStockThreshold: item.lowStockThreshold ?? 10,
      expiryDate: item.expiryDate || '',
      notes: item.notes || '',
    });
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditItem(null); setForm({ ...EMPTY_INV_FORM }); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { Swal.fire('Missing name', 'Please enter an item name.', 'warning'); return; }
    setSaving(true);
    try {
      let doc = editItem
        ? { ...editItem, ...form, updatedAt: new Date().toISOString() }
        : { _id: generateUUID(), type: 'bhs_inventory', ...form, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      let saved = false, attempts = 0;
      while (attempts < 3 && !saved) {
        try { await db.put(doc); saved = true; }
        catch (err) {
          if (err?.status === 409 || err?.name === 'conflict') {
            attempts++;
            const fresh = await db.get(doc._id);
            doc = { ...fresh, ...form, updatedAt: new Date().toISOString() };
          } else throw err;
        }
      }
      if (!saved) throw new Error('Conflict: please retry.');
      try { await forceSyncToRemote(); } catch { /* best-effort sync */ }
      try { await createAuditLog({ action: 'BHS_INVENTORY_SAVE', module: 'BHS', recordId: doc._id, details: `Saved inventory item: ${form.name}` }); } catch { /* best-effort audit */ }
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
      closeForm();
      await loadItems();
    } catch (err) {
      Swal.fire('Save failed', err.message || 'Unknown error', 'error');
    } finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    const res = await Swal.fire({ icon: 'warning', title: 'Delete this item?', text: item.name, showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc2626' });
    if (!res.isConfirmed) return;
    try {
      const fresh = await db.get(item._id);
      await db.remove(fresh);
      try { await forceSyncToRemote(); } catch { /* best-effort sync */ }
      await loadItems();
    } catch (err) { Swal.fire('Delete failed', err.message || 'Unknown error', 'error'); }
  };

  const daysUntil = (date) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null;

  const stockStatus = (item) => {
    const qty = item.quantity ?? 0;
    const thr = item.lowStockThreshold ?? 10;
    if (qty <= 0) return { label: 'Out of Stock', color: 'red' };
    if (qty <= thr) return { label: 'Low Stock', color: 'red' };
    const d = daysUntil(item.expiryDate);
    if (d !== null && d <= 90) return { label: 'Expiring Soon', color: 'amber' };
    return { label: 'OK', color: 'green' };
  };

  const badgeFor = (color, label) => {
    const classMap = {
      green: 'bhs-badge--ok',
      red: 'bhs-badge--low',
      amber: 'bhs-badge--expiring',
    };
    const cls = classMap[color] || '';
    return (<span className={`bhs-badge ${cls}`}>{label}</span>);
  };

  const [exportOpen, setExportOpen] = useState(false);

  const invStockLabel = (item) => {
    const qty = item.quantity ?? 0;
    const thr = item.lowStockThreshold ?? 10;
    if (qty <= 0) return 'Out of Stock';
    if (qty <= thr) return 'Low Stock';
    const d = daysUntil(item.expiryDate);
    if (d !== null && d <= 90) return 'Expiring Soon';
    return 'OK';
  };

  const exportInventoryCsv = () => {
    const rows = filteredItems.map((it) => ({
      Name: it.name || '',
      Category: it.category || '',
      Quantity: it.quantity ?? 0,
      Unit: it.unit || '',
      Expiry: it.expiryDate || '',
      'Stock Status': invStockLabel(it),
    }));
    exportToExcel(rows, 'Inventory.csv', 'Inventory');
    setExportOpen(false);
  };

  const exportInventoryPdf = () => {
    const rows = filteredItems;
    const win = window.open('', '_blank');
    if (!win) { Swal.fire('Export failed', 'Could not open print window.', 'error'); setExportOpen(false); return; }
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Inventory Report</title>
      <style>body{font-family:Arial,sans-serif;margin:24px;color:#111}
      h1{font-size:18px;margin-bottom:4px} .sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f2f2f2}</style></head><body>
      <h1>Barangay Health Station — Inventory Report</h1>
      <div class="sub">Generated: ${new Date().toLocaleString()} · ${rows.length} item(s)</div>
      <table><thead><tr><th>Name</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Expiry</th><th>Stock Status</th></tr></thead>
      <tbody>${rows.map((it) => `<tr><td>${(it.name||'').replace(/</g,'&lt;')}</td><td>${it.category||''}</td><td>${it.quantity??0}</td><td>${it.unit||''}</td><td>${it.expiryDate||''}</td><td>${invStockLabel(it)}</td></tr>`).join('')}</tbody></table>
      <script>window.onload=function(){setTimeout(function(){window.print();},250)}</script></body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setExportOpen(false);
  };

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((it) => {
      const matchesSearch = !q || (it.name || '').toLowerCase().includes(q) || (it.category || '').toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [items, search]);

  useEffect(() => { setPage(1); }, [search]);

  const sortValue = (it) => {
    if (sortKey === 'quantity') return Number(it.quantity) || 0;
    if (sortKey === 'expiry') return it.expiryDate || '';
    if (sortKey === 'stockStatus') return stockStatus(it).label;
    if (sortKey === 'category') return it.category || '';
    if (sortKey === 'unit') return it.unit || '';
    return it.name || '';
  };
  const sortDirSign = sortDir === 'asc' ? 1 : -1;
  const sortedItems = [...filteredItems].sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDirSign;
    return String(va).localeCompare(String(vb)) * sortDirSign;
  });

  const totalItems = sortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const startIndex = (safePage - 1) * PER_PAGE;
  const pageItems = sortedItems.slice(startIndex, startIndex + PER_PAGE);
  const pageFrom = totalItems === 0 ? 0 : startIndex + 1;
  const pageTo = Math.min(startIndex + PER_PAGE, totalItems);

  const invStats = useMemo(() => {
    const total = items.length;
    const lowStock = items.filter((it) => (it.quantity ?? 0) <= (it.lowStockThreshold ?? 10)).length;
    const outOfStock = items.filter((it) => (it.quantity ?? 0) <= 0).length;
    const expiringSoon = items.filter((it) => {
      const qty = it.quantity ?? 0;
      if (qty <= 0) return false;
      const d = daysUntil(it.expiryDate);
      return d !== null && d <= 90 && d >= 0;
    }).length;
    return [total, lowStock, expiringSoon, outOfStock];
  }, [items]);

  const renderExpiry = (date) => {
    const d = daysUntil(date);
    if (d === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
    if (d < 0) return badgeFor('red', 'Expired');
    if (d <= 90) return badgeFor('amber', `${d}d left`);
    return <span style={{ color: 'var(--muted)', fontSize: 12 }}>{date}</span>;
  };

  const statCard = (value, label, icon, tone) => (
    <div className={`bhs-stat-card bhs-stat-card--${tone}`}>
      <div className="bhs-stat-icon" aria-hidden="true">{icon}</div>
      <div className="bhs-stat-body">
        <div className="bhs-stat-value">{value}</div>
        <div className="bhs-stat-label">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="cert-section-card bhs-section">
      <div className="cert-section-header" style={{ padding: '14px 20px', justifyContent: 'space-between' }}>
        <div className="cert-section-title" style={{ fontSize: '15px' }}>Inventory List</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="text" className="fc" placeholder="Search item name or category..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '260px', height: '34px', fontSize: '12px', padding: '6px 12px' }} />
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setExportOpen((o) => !o)} style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>Export ▾</button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100, minWidth: 140, overflow: 'hidden' }}>
                <button type="button" className="btn btn-g btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }} onClick={exportInventoryCsv}>Export CSV</button>
                <button type="button" className="btn btn-g btn-sm" style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, borderTop: '1px solid var(--border)' }} onClick={exportInventoryPdf}>Export PDF</button>
              </div>
            )}
          </div>
          <button className="btn btn-p" onClick={openAdd} style={{ height: '34px', padding: '0 14px', fontSize: '12px' }}>+ Add Item</button>
        </div>
      </div>

      <div className="bhs-stats">
        {statCard(invStats[0] ?? 0, 'Total Items', '📦', 'blue')}
        {statCard(invStats[1] ?? 0, 'Low Stock', '⚠️', 'red')}
        {statCard(invStats[2] ?? 0, 'Expiring Soon', '⏳', 'amber')}
        {statCard(invStats[3] ?? 0, 'Out of Stock', '🚫', 'purple')}
      </div>

      <div className="cert-table-wrapper">
        <table className="cert-report-table bhs-table-fixed">
          <thead>
            <tr>
              <th style={{ width: '25%', padding: '12px 16px', textAlign: 'left' }}>
                <span className={`bhs-sort-header ${sortKey === 'name' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('name')}>
                  Name {sortKey === 'name' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '15%', padding: '12px 16px', textAlign: 'left' }}>
                <span className={`bhs-sort-header ${sortKey === 'category' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('category')}>
                  Category {sortKey === 'category' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '10%', padding: '12px 16px', textAlign: 'center' }}>
                <span className={`bhs-sort-header ${sortKey === 'quantity' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('quantity')} style={{ justifyContent: 'center' }}>
                  Quantity {sortKey === 'quantity' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '10%', padding: '12px 16px', textAlign: 'center' }}>
                <span className={`bhs-sort-header ${sortKey === 'unit' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('unit')} style={{ justifyContent: 'center' }}>
                  Unit {sortKey === 'unit' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '15%', padding: '12px 16px', textAlign: 'center' }}>
                <span className={`bhs-sort-header ${sortKey === 'expiry' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('expiry')} style={{ justifyContent: 'center' }}>
                  Expiry {sortKey === 'expiry' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '15%', padding: '12px 16px', textAlign: 'center' }}>
                <span className={`bhs-sort-header ${sortKey === 'stockStatus' ? 'bhs-sort-active' : ''}`} onClick={() => handleSort('stockStatus')} style={{ justifyContent: 'center' }}>
                  Stock Status {sortKey === 'stockStatus' && <span className="bhs-sort-icon">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                </span>
              </th>
              <th style={{ width: '10%', padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)' }}>Loading inventory...</td></tr>
            ) : pageItems.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ padding: 0 }}>
                  <div className="bhs-empty">
                    <div className="bhs-empty-icon">📦</div>
                    <div className="bhs-empty-title">No inventory items found</div>
                    <div className="bhs-empty-hint">Click "+ Add Item" to start tracking stock.</div>
                  </div>
                </td>
              </tr>
            ) : (
              pageItems.map((item) => {
                const { label, color } = stockStatus(item);
                return (
                  <tr key={item._id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text)', textAlign: 'left', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', textAlign: 'left' }}>{item.category}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text)', textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', textAlign: 'center' }}>{item.unit}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>{renderExpiry(item.expiryDate)}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>{badgeFor(color, label)}</td>
                    <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', display: 'flex', gap: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button className="btn btn-g btn-sm" onClick={() => openEdit(item)}>Edit</button>
                      <button className="btn btn-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={() => handleDelete(item)}>Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalItems > 0 && (
        <div className="bhs-pagination">
          <div className="bhs-pagination-info">
            Showing {pageFrom} to {pageTo} of {totalItems} record{totalItems === 1 ? '' : 's'}
          </div>
          <div className="bhs-pagination-controls">
            <button type="button" className="btn btn-g btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} aria-label="Previous page">Previous</button>
            <span className="bhs-pagination-page">Page {safePage} of {totalPages}</span>
            <button type="button" className="btn btn-g btn-sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} aria-label="Next page">Next</button>
          </div>
        </div>
      )}

      {/* Add/Edit Inventory Form Modal */}
      {formOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => !saving && closeForm()}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{editItem ? 'Edit Inventory Item' : 'New Inventory Item'}</h3>

            <div className="bhs-form-grid">
              <div className="bhs-form-group bhs-form-group--full">
                <label className="bhs-form-label">NAME *</label>
                <input type="text" className="bhs-form-input" placeholder="Item name..." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} required />
              </div>

              <div className="bhs-form-group">
                <label className="bhs-form-label">CATEGORY</label>
                <select className="bhs-form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} disabled={saving}>
                  <option value="Medicine">Medicine</option>
                  <option value="Supply">Supply</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="bhs-form-group">
                <label className="bhs-form-label">UNIT</label>
                <input type="text" className="bhs-form-input" placeholder="e.g. pcs, bottles" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={saving} />
              </div>

              <div className="bhs-form-group">
                <label className="bhs-form-label">QUANTITY</label>
                <input type="number" min="0" className="bhs-form-input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} disabled={saving} />
              </div>

              <div className="bhs-form-group">
                <label className="bhs-form-label">LOW STOCK THRESHOLD</label>
                <input type="number" min="0" className="bhs-form-input" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) || 0 })} disabled={saving} />
              </div>

              <div className="bhs-form-group bhs-form-group--full">
                <label className="bhs-form-label">EXPIRY DATE</label>
                <input type="date" className="bhs-form-input" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} disabled={saving} />
              </div>
            </div>

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
