// src/components/screens/EventsManagerScreen.jsx
import React, { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import Swal from 'sweetalert2';

const EMPTY_EVENT = {
  title: '',
  category: 'Community Service',
  description: '',
  date: '',
  time: '',
  endTime: '',
  location: '',
  maxParticipants: 50,
  registrationDeadline: '',
  status: 'Open',
  requirements: [],
  contactPerson: '',
  contactNumber: '',
};

const EventsManagerScreen = React.memo(function EventsManagerScreen({
  db,
  role,
  currentUser,
  showToast,
  createAuditLog,
  notifyDesktop,
  residentsList,
}) {
  const [events, setEvents] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState(EMPTY_EVENT);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewingEvent, setViewingEvent] = useState(null);
  const [requirementInput, setRequirementInput] = useState('');

  // Load events + registrations
  const loadData = useCallback(async () => {
    if (!db) return;
    setIsLoading(true);
    try {
      const [eventsRes, regsRes] = await Promise.all([
        db.find({ selector: { type: 'barangay_event' }, limit: 500 }),
        db.find({ selector: { type: 'event_registration' }, limit: 5000 }),
      ]);
      startTransition(() => {
        setEvents(eventsRes.docs || []);
        setRegistrations(regsRes.docs || []);
      });
    } catch (err) {
      console.error('Failed to load events:', err);
      showToast?.('Failed to load events', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [db, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events
      .filter((ev) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          (ev.title || '').toLowerCase().includes(q) ||
          (ev.location || '').toLowerCase().includes(q) ||
          (ev.category || '').toLowerCase().includes(q);
        const matchesStatus = statusFilter === 'All' || ev.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [events, searchQuery, statusFilter]);

  // Registration count per event
  const regCountByEvent = useMemo(() => {
    const map = new Map();
    registrations.forEach((r) => {
      if (!map.has(r.eventId)) map.set(r.eventId, []);
      map.get(r.eventId).push(r);
    });
    return map;
  }, [registrations]);

  // Handlers
  const handleOpenNew = () => {
    setEditingEvent(null);
    setForm(EMPTY_EVENT);
    setShowForm(true);
  };

  const handleOpenEdit = (ev) => {
    setEditingEvent(ev);
    setForm({ ...EMPTY_EVENT, ...ev });
    setShowForm(true);
  };

  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.date) {
      showToast?.('Title and Date are required', 'error');
      return;
    }

    try {
      const isEdit = Boolean(editingEvent?._id);
      const now = new Date().toISOString();
      const docId = isEdit ? editingEvent._id : `event_${Date.now()}`;

      let payload;
      if (isEdit) {
        const existing = await db.get(docId);
        payload = { ...existing, ...form, updatedAt: now };
      } else {
        payload = {
          _id: docId,
          type: 'barangay_event',
          ...form,
          createdAt: now,
          updatedAt: now,
          createdBy: currentUser?.username || 'admin',
        };
      }

      await db.put(payload);

      // Audit log
      try {
        await createAuditLog?.({
          action: isEdit ? 'UPDATE' : 'CREATE',
          module: 'EVENTS',
          recordId: docId,
          user: `${currentUser?.username || 'admin'} (${role})`,
          details: `${isEdit ? 'Updated' : 'Created'} event: "${form.title}"`,
        });
      } catch (auditErr) {
        console.warn('Audit log failed:', auditErr);
      }

      // Notify all residents (optional — only for new events)
      if (!isEdit && notifyDesktop) {
        notifyDesktop(
          ' New Barangay Event',
          `${form.title} on ${form.date}`,
          { tag: `event-${docId}`, requireInteraction: false }
        );
      }

      showToast?.(`Event ${isEdit ? 'updated' : 'created'} successfully!`, 'success');
      setShowForm(false);
      setForm(EMPTY_EVENT);
      setEditingEvent(null);
      await loadData();
    } catch (err) {
      console.error('Failed to save event:', err);
      showToast?.('Failed to save event', 'error');
    }
  };

  const handleDeleteEvent = async (ev) => {
    const result = await Swal.fire({
      title: 'Delete Event?',
      html: `Delete "<strong>${ev.title}</strong>"?<br/>This will also remove all registrations.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;

    try {
      // Delete event
      const existing = await db.get(ev._id);
      await db.remove(existing);

      // Delete all registrations for this event
      const eventRegs = registrations.filter((r) => r.eventId === ev._id);
      for (const reg of eventRegs) {
        try {
          const regDoc = await db.get(reg._id);
          await db.remove(regDoc);
        } catch (e) {
          console.warn('Failed to delete registration:', e);
        }
      }

      showToast?.('Event deleted successfully', 'success');
      await loadData();
    } catch (err) {
      console.error('Failed to delete event:', err);
      showToast?.('Failed to delete event', 'error');
    }
  };

  const handleApproveRegistration = async (reg) => {
    try {
      const existing = await db.get(reg._id);
      await db.put({
        ...existing,
        status: 'Approved',
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser?.username || 'admin',
        updatedAt: new Date().toISOString(),
      });
      showToast?.('Registration approved', 'success');
      await loadData();
    } catch (err) {
      console.error('Failed to approve:', err);
      showToast?.('Failed to approve', 'error');
    }
  };

  const handleRejectRegistration = async (reg) => {
    try {
      const existing = await db.get(reg._id);
      await db.put({
        ...existing,
        status: 'Rejected',
        updatedAt: new Date().toISOString(),
      });
      showToast?.('Registration rejected', 'success');
      await loadData();
    } catch (err) {
      console.error('Failed to reject:', err);
      showToast?.('Failed to reject', 'error');
    }
  };

  const handleMarkAttended = async (reg) => {
    try {
      const existing = await db.get(reg._id);
      await db.put({
        ...existing,
        status: 'Attended',
        attendedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showToast?.('Marked as attended', 'success');
      await loadData();
    } catch (err) {
      console.error('Failed to mark attended:', err);
      showToast?.('Failed to mark attended', 'error');
    }
  };

  const handleAddRequirement = () => {
    if (!requirementInput.trim()) return;
    setForm((prev) => ({
      ...prev,
      requirements: [...(prev.requirements || []), requirementInput.trim()],
    }));
    setRequirementInput('');
  };

  const handleRemoveRequirement = (idx) => {
    setForm((prev) => ({
      ...prev,
      requirements: (prev.requirements || []).filter((_, i) => i !== idx),
    }));
  };

  const handleExportParticipants = async (ev) => {
    const eventRegs = regCountByEvent.get(ev._id) || [];
    if (eventRegs.length === 0) {
      showToast?.('No registrations to export', 'warning');
      return;
    }

    const rows = eventRegs.map((r) => ({
      'Registration ID': r._id,
      'Resident Name': r.residentName,
      'Resident ID': r.residentId,
      'Contact': r.contact,
      'Purok': r.purok,
      'Status': r.status,
      'Registered At': r.registeredAt,
      'Approved At': r.approvedAt || '—',
    }));

    // CSV export (para walang dependency sa excelExporter)
    const headers = Object.keys(rows[0]).join(',');
    const csv = [headers, ...rows.map((r) => Object.values(r).map((v) => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${ev.title.replace(/\s+/g, '_')}_Participants_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast?.(`Exported ${rows.length} participants`, 'success');
  };

  return (
    <div className="screen active" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div className="sb-box" style={{ flex: '1 1 280px' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="fc" style={{ width: '160px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All Statuses</option>
          <option value="Open">Open</option>
          <option value="Closed">Closed</option>
          <option value="Ongoing">Ongoing</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Loading events...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.6 }}>📅</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No events yet</div>
          <div style={{ fontSize: '13px' }}>Click "Create Event" to add your first event.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
          {filteredEvents.map((ev) => {
            const regs = regCountByEvent.get(ev._id) || [];
            const approvedCount = regs.filter((r) => r.status === 'Approved' || r.status === 'Attended').length;
            const pendingCount = regs.filter((r) => r.status === 'Pending').length;

            return (
              <div key={ev._id} className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>{ev.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{ev.category}</div>
                  </div>
                  <span className={`badge ${
                    ev.status === 'Open' ? 'g' :
                    ev.status === 'Ongoing' ? 'a' :
                    ev.status === 'Completed' ? 't' :
                    ev.status === 'Cancelled' ? 'r' : 'gr'
                  }`}>
                    {ev.status}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div> {ev.date} {ev.time && `at ${ev.time}`} {ev.endTime && `- ${ev.endTime}`}</div>
                  <div> {ev.location || 'No location'}</div>
                  {ev.registrationDeadline && (
                    <div> Registration deadline: {ev.registrationDeadline}</div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                  <span className="badge g">✓ {approvedCount} Approved</span>
                  {pendingCount > 0 && <span className="badge a">⏳ {pendingCount} Pending</span>}
                  <span className="badge gr">👥 {regs.length} / {ev.maxParticipants}</span>
                </div>

                <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <button className="btn btn-p btn-sm" onClick={() => setViewingEvent(ev)} style={{ flex: 1 }}>
                    View Registrations
                  </button>
                  <button className="btn btn-g btn-sm" onClick={() => handleOpenEdit(ev)}>Edit</button>
                  <button className="btn btn-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={() => handleDeleteEvent(ev)}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}
          onClick={() => setShowForm(false)}
        >
          <div
            className="card"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                {editingEvent ? 'Edit Event' : 'Create New Event'}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleSaveEvent}>
              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">Event Title *</label>
                <input className="fc" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g., Coastal Cleanup Drive" />
              </div>

              <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Category</label>
                  <select className="fc" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option>Community Service</option>
                    <option>Health</option>
                    <option>Sports</option>
                    <option>Education</option>
                    <option>Festival</option>
                    <option>Others</option>
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Status</label>
                  <select className="fc" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option>Open</option>
                    <option>Closed</option>
                    <option>Ongoing</option>
                    <option>Completed</option>
                    <option>Cancelled</option>
                  </select>
                </div>
              </div>

              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">Description</label>
                <textarea className="fc" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Event details..." />
              </div>

              <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Date *</label>
                <input
  type="date"
  value={form.date}
  min={new Date().toISOString().split('T')[0]}      // ← hindi pwede past
  max={`${new Date().getFullYear() + 5}-12-31`}     // ← max 5 years ahead
  onChange={(e) => setForm({ ...form, date: e.target.value })}
  required
/>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Registration Deadline</label>
                  <input
  type="date"
  value={form.registrationDeadline || ''}
  min={new Date().toISOString().split('T')[0]}      // ← hindi pwede past
  max={form.date || `${new Date().getFullYear() + 5}-12-31`}  // ← hindi lalagpas sa event date
  onChange={(e) => setForm({ ...form, registrationDeadline: e.target.value })}
/>
                </div>
              </div>

              <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Start Time</label>
                  <input type="time" className="fc" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">End Time</label>
                  <input type="time" className="fc" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>

              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">Location</label>
                <input className="fc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g., Barangay Hall Grounds" />
              </div>

              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">Max Participants</label>
                <input type="number" min="1" className="fc" value={form.maxParticipants} onChange={(e) => setForm({ ...form, maxParticipants: Number(e.target.value) })} />
              </div>

              <div className="fg" style={{ marginBottom: '12px' }}>
                <label className="fl">Requirements (Optional)</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input className="fc" value={requirementInput} onChange={(e) => setRequirementInput(e.target.value)} placeholder="e.g., Bring gloves" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddRequirement(); } }} />
                  <button type="button" className="btn btn-g" onClick={handleAddRequirement}>Add</button>
                </div>
                {(form.requirements || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {form.requirements.map((req, idx) => (
                      <span key={idx} style={{ padding: '4px 8px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {req}
                        <button type="button" onClick={() => handleRemoveRequirement(idx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="fg2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Contact Person</label>
                  <input className="fc" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Contact Number</label>
                  <input className="fc" value={form.contactNumber} onChange={(e) => setForm({ ...form, contactNumber: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn btn-g" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-p">{editingEvent ? 'Save Changes' : 'Create Event'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Registrations Modal */}
      {viewingEvent && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '20px' }}
          onClick={() => setViewingEvent(null)}
        >
          <div
            className="card"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{viewingEvent.title}</h3>
                <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
                  {viewingEvent.date} • {viewingEvent.location}
                </div>
              </div>
              <button onClick={() => setViewingEvent(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                {(regCountByEvent.get(viewingEvent._id) || []).length} registrations
              </span>
              <button className="btn btn-g btn-sm" onClick={() => handleExportParticipants(viewingEvent)}>
                Export Participants (CSV)
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface2)', zIndex: 5 }}>
                  <tr>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Resident</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Contact</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Purok</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(regCountByEvent.get(viewingEvent._id) || []).length === 0 ? (
                    <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No registrations yet.</td></tr>
                  ) : (
                    (regCountByEvent.get(viewingEvent._id) || []).map((reg) => (
                      <tr key={reg._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 600 }}>{reg.residentName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{reg.residentId}</div>
                        </td>
                        <td style={{ padding: '10px 16px', fontFamily: 'var(--mono)', fontSize: '12px' }}>{reg.contact || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>{reg.purok || '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className={`badge ${
                            reg.status === 'Approved' ? 'g' :
                            reg.status === 'Attended' ? 't' :
                            reg.status === 'Rejected' ? 'r' :
                            reg.status === 'Cancelled' ? 'gr' : 'a'
                          }`}>
                            {reg.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          {reg.status === 'Pending' && (
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                              <button className="btn btn-p btn-sm" onClick={() => handleApproveRegistration(reg)}>Approve</button>
                              <button className="btn btn-sm" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }} onClick={() => handleRejectRegistration(reg)}>Reject</button>
                            </div>
                          )}
                          {reg.status === 'Approved' && (
                            <button className="btn btn-p btn-sm" onClick={() => handleMarkAttended(reg)}>Mark Attended</button>
                          )}
                          {(reg.status === 'Attended' || reg.status === 'Rejected' || reg.status === 'Cancelled') && (
                            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default EventsManagerScreen;