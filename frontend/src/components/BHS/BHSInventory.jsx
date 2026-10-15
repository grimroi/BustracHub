import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Swal from 'sweetalert2';
import { localDb as db, forceSyncToRemote } from '../../services/db';
import { createAuditLog } from '../../utils/auditLog';
import { generateUUID } from '../../utils/helpers';

const EMPTY_FORM = {
  name: '',
  category: 'Medicine',
  quantity: 0,
  unit: 'pcs',
  lowStockThreshold: 10,
  expiryDate: '',
  notes: '',
};

export default function BHSInventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadItems = async () => {
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
  };

  useEffect(() => { loadItems(); }, []);

  const openAdd = () => { setEditItem(null); setForm(EMPTY_FORM); setFormOpen(true); };

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
      setFormOpen(false);
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

  const badgeStyle = (color) => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700, background: `var(--${color}-bg)`, color: `var(--${color})` });
  const daysUntil = (date) => date ? Math.ceil((new Date(date).getTime() - Date.now()) / 86400000) : null;

  const renderExpiry = (date) => {
    const d = daysUntil(date);
    if (d === null) return <span style={{ color: 'var(--muted)' }}>—</span>;
    if (d < 0) return <span style={badgeStyle('red')}>Expired</span>;
    if (d < 30) return <span style={badgeStyle('amber')}>{d}d left</span>;
    return <span style={{ color: 'var(--muted)', fontSize: 12 }}>{date}</span>;
  };

  const inputStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 };

  return (
    <div className="screen active">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>Barangay Health Station</h2>
        </div>
        <button className="btn btn-p" onClick={openAdd}>+ Add Item</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', background: 'var(--surface2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
          <p style={{ margin: 0, fontSize: 13 }}>No inventory items yet.</p>
          <p style={{ margin: '4px 0 0', fontSize: 11 }}>Click "+ Add Item" to start tracking stock.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                {['Name', 'Category', 'Quantity', 'Unit', 'Low Stock', 'Expiry', 'Actions'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isLow = item.quantity <= (item.lowStockThreshold ?? 10);
                return (
                  <tr key={item._id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)', fontWeight: 600 }}>{item.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{item.category}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{item.unit}</td>
                    <td style={{ padding: '10px 12px' }}>{isLow ? <span style={badgeStyle('red')}>Low</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td style={{ padding: '10px 12px' }}>{renderExpiry(item.expiryDate)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <button className="btn btn-g btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 6 }}>Edit</button>
                      <button className="btn btn-g btn-sm" onClick={() => handleDelete(item)} style={{ color: 'var(--red)' }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }} onClick={() => !saving && setFormOpen(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 22, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{editItem ? 'Edit Item' : 'Add Inventory Item'}</h3>
            <label style={labelStyle}>NAME *</label>
            <input style={{ ...inputStyle, marginBottom: 12 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} required />
            <label style={labelStyle}>CATEGORY</label>
            <select style={{ ...inputStyle, marginBottom: 12 }} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} disabled={saving}>
              <option>Vaccine</option><option>Medicine</option><option>Supply</option>
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>QUANTITY</label><input type="number" style={inputStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} disabled={saving} /></div>
              <div><label style={labelStyle}>UNIT</label><input style={inputStyle} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} disabled={saving} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={labelStyle}>LOW STOCK THRESHOLD</label><input type="number" style={inputStyle} value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: Number(e.target.value) || 0 })} disabled={saving} /></div>
              <div><label style={labelStyle}>EXPIRY DATE</label><input type="date" style={inputStyle} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} disabled={saving} /></div>
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