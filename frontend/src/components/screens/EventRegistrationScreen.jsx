// src/components/screens/EventRegistrationScreen.jsx
import React, { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import Swal from 'sweetalert2';

const EventRegistrationScreen = React.memo(function EventRegistrationScreen({
  db,
  loggedInUser,
  showToast,
  createAuditLog,
}) {
  const [events, setEvents] = useState([]);
  const [myRegistrations, setMyRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState('available'); // 'available' | 'my'

  const loadData = useCallback(async () => {
  if (!db) {
    setIsLoading(false);
    return;
  }
  setIsLoading(true);
  try {
    // ✅ LOAD EVENTS — hindi kailangan ng residentId
    const eventsRes = await db.find({
      selector: { type: 'barangay_event' },
      limit: 500,
    });

    // ✅ LOAD REGISTRATIONS — kailangan ng residentId
    let regs = [];
    if (loggedInUser?.residentId) {
      try {
        const regsRes = await db.find({
          selector: {
            type: 'event_registration',
            residentId: loggedInUser.residentId,
          },
          limit: 500,
        });
        regs = regsRes.docs || [];
      } catch (regErr) {
        console.warn('Failed to load registrations:', regErr);
      }
    }

    startTransition(() => {
      setEvents(eventsRes.docs || []);
      setMyRegistrations(regs);
    });
  } catch (err) {
    console.error('Failed to load events:', err);
    showToast?.('Failed to load events', 'error');
  } finally {
    setIsLoading(false);
  }
}, [db, loggedInUser?.residentId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const registrationByEvent = useMemo(() => {
    const map = new Map();
    myRegistrations.forEach((r) => map.set(r.eventId, r));
    return map;
  }, [myRegistrations]);

  const availableEvents = useMemo(() => {
  const now = new Date();
  const MIN_VALID_YEAR = 2000; // anything older = invalid/typo data

  return events
    .filter((ev) => {
      if (ev.status !== 'Open') return false;

      const eventDate = new Date(ev.date);
      if (isNaN(eventDate.getTime())) return false;   // invalid date
      if (eventDate < now) return false;              // past event

      if (ev.registrationDeadline) {
        const deadline = new Date(ev.registrationDeadline);
        const isInvalidDeadline =
          isNaN(deadline.getTime()) ||
          deadline.getFullYear() < MIN_VALID_YEAR;

        // ✅ I-ignore ang invalid deadline — hindi ito mag-fail sa filter
        if (!isInvalidDeadline && deadline < now) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}, [events]);

  const handleRegister = async (ev) => {
    if (!loggedInUser?.residentId) {
      showToast?.('Resident ID not found. Please log in again.', 'error');
      return;
    }

    const confirm = await Swal.fire({
      title: 'Register for Event?',
      html: `Register for <strong>${ev.title}</strong> on ${ev.date}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3b82f6',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Register',
      cancelButtonText: 'Cancel',
    });
    if (!confirm.isConfirmed) return;

    try {
      const now = new Date().toISOString();
      const regId = `event_reg_${Date.now()}`;
      const payload = {
        _id: regId,
        type: 'event_registration',
        eventId: ev._id,
        residentId: loggedInUser.residentId,
        residentName:
          loggedInUser.fullName ||
          `${loggedInUser.firstName || ''} ${loggedInUser.lastName || ''}`.trim() ||
          'Resident',
        contact: loggedInUser.contact || loggedInUser.contactNo || '',
        purok: loggedInUser.purok || '',
        status: 'Pending',
        registeredAt: now,
        updatedAt: now,
      };

      await db.put(payload);

      try {
        await createAuditLog?.({
          action: 'REGISTER_EVENT',
          module: 'EVENTS',
          recordId: regId,
          user: `${loggedInUser.username || 'resident'} (resident)`,
          details: `Registered for event: "${ev.title}"`,
        });
      } catch (e) {
        console.warn('Audit log failed:', e);
      }

      showToast?.('Registered successfully! Waiting for approval.', 'success');
      await loadData();
    } catch (err) {
      console.error('Registration failed:', err);
      showToast?.('Registration failed: ' + err.message, 'error');
    }
  };

  const handleCancelRegistration = async (reg) => {
    const confirm = await Swal.fire({
      title: 'Cancel Registration?',
      text: 'Are you sure you want to cancel?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Cancel',
    });
    if (!confirm.isConfirmed) return;

    try {
      const existing = await db.get(reg._id);
      await db.put({
        ...existing,
        status: 'Cancelled',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      showToast?.('Registration cancelled', 'success');
      await loadData();
    } catch (err) {
      console.error('Cancel failed:', err);
      showToast?.('Failed to cancel', 'error');
    }
  };

  // Real-time updates
  useEffect(() => {
    const handleUpdate = () => loadData();
    window.addEventListener('bustrac-events-updated', handleUpdate);
    return () => window.removeEventListener('bustrac-events-updated', handleUpdate);
  }, [loadData]);

  return (
    <div className="screen active" style={{ padding: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}> Barangay Events</div>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '2px' }}>
          Join activities and programs in your barangay
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '2px solid var(--border)' }}>
        <button
          className={`btn ${tab === 'available' ? 'btn-p' : 'btn-g'}`}
          onClick={() => setTab('available')}
          style={{ borderRadius: '8px 8px 0 0' }}
        >
          Available Events ({availableEvents.length})
        </button>
        <button
          className={`btn ${tab === 'my' ? 'btn-p' : 'btn-g'}`}
          onClick={() => setTab('my')}
          style={{ borderRadius: '8px 8px 0 0' }}
        >
          My Registrations ({myRegistrations.length})
        </button>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--muted)' }}>Loading...</div>
      ) : tab === 'available' ? (
        availableEvents.length === 0 ? (
          <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: '64px', marginBottom: '16px', opacity: 0.4 }}>📅</div>
            <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                No Upcoming Events
            </div>
            <div style={{ fontSize: '13px', maxWidth: '280px', margin: '0 auto', lineHeight: 1.6 }}>
                Wala pang mga naka-schedule na events sa inyong barangay.
                I-check ang <strong>Announcements</strong> para sa mga update!
            </div>
            <button
                className="btn btn-p"
                onClick={() => window.location.reload()}
                style={{ marginTop: '20px' }}
            >
                🔄 Refresh
            </button>
            </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {availableEvents.map((ev) => {
              const myReg = registrationByEvent.get(ev._id);
              return (
                <div key={ev._id} className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px' }}>
                        {ev.title}
                      </div>
                      <span className="badge g" style={{ fontSize: '11px' }}>{ev.category}</span>
                    </div>
                    {myReg && (
                      <span className={`badge ${
                        myReg.status === 'Approved' ? 'g' :
                        myReg.status === 'Attended' ? 't' :
                        myReg.status === 'Rejected' ? 'r' : 'a'
                      }`}>
                        {myReg.status}
                      </span>
                    )}
                  </div>

                  {ev.description && (
                    <div style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '10px', lineHeight: 1.6 }}>
                      {ev.description}
                    </div>
                  )}

                  <div style={{ fontSize: '12px', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--surface2)', padding: '10px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                    <div>📅 <strong>{ev.date}</strong> {ev.time && `• ${ev.time}`} {ev.endTime && `- ${ev.endTime}`}</div>
                    <div>📍 {ev.location}</div>
                    {ev.requirements?.length > 0 && (
                      <div>📋 Requirements: {ev.requirements.join(', ')}</div>
                    )}
                    {ev.contactPerson && (
                      <div>📞 {ev.contactPerson} {ev.contactNumber && `• ${ev.contactNumber}`}</div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!myReg && (
                      <button className="btn btn-p" onClick={() => handleRegister(ev)} style={{ flex: 1 }}>
                        Register Now
                      </button>
                    )}
                    {myReg && (myReg.status === 'Pending' || myReg.status === 'Approved') && (
                      <button className="btn btn-g" onClick={() => handleCancelRegistration(myReg)} style={{ flex: 1 }}>
                        Cancel Registration
                      </button>
                    )}
                    {myReg && myReg.status === 'Attended' && (
                      <div style={{ flex: 1, textAlign: 'center', padding: '10px', color: '#10b981', fontWeight: 600 }}>
                        ✓ You attended this event
                      </div>
                    )}
                    {myReg && myReg.status === 'Rejected' && (
                      <div style={{ flex: 1, textAlign: 'center', padding: '10px', color: '#ef4444', fontWeight: 600 }}>
                        ✕ Registration rejected
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        myRegistrations.length === 0 ? (
          <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>📋</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '6px' }}>No registrations yet</div>
            <div style={{ fontSize: '13px' }}>Browse available events and register!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {myRegistrations.map((reg) => {
              const ev = events.find((e) => e._id === reg.eventId);
              if (!ev) return null;
              return (
                <div key={reg._id} className="card" style={{ padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>{ev.title}</div>
                    <span className={`badge ${
                      reg.status === 'Approved' ? 'g' :
                      reg.status === 'Attended' ? 't' :
                      reg.status === 'Rejected' ? 'r' :
                      reg.status === 'Cancelled' ? 'gr' : 'a'
                    }`}>
                      {reg.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    📅 {ev.date} • 📍 {ev.location}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '6px', fontFamily: 'var(--mono)' }}>
                    Registered: {new Date(reg.registeredAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
});

export default EventRegistrationScreen;