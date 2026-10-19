import { useEffect, useState } from "react";
import { FaBullhorn, FaCalendarAlt } from "react-icons/fa";
import Swal from "sweetalert2";
import { localDb as db } from "../../services/db";

const EMERGENCY_HOTLINES = [
  { name: 'MDRRMO Nabua (Rescue)', sub: 'Disaster & Emergency Response', tel: '09175060294' },
  { name: 'PNP Nabua (Police Station)', sub: 'Law Enforcement & Safety Concerns', tel: '09985986014' },
  { name: 'BFP Nabua (Fire Station)', sub: 'Fire Control & Incidents', tel: '0542884676' },
  { name: 'Barangay Bustrac Hall', sub: 'Local Desk Command Center', tel: '09123456789' },
];

export default function ResidentHome({
  isOffline,
  greetingText,
  loggedInUser,
  myRequests = [],
  pendingRequestCount = 0,
  announcements = [],
  myFeedbacks = [],
  myBlotters = [],
  myAssistance = [],
  goToTab,
}) {
  // Emergency hotlines start collapsed so a stray tap on the Home view can never
  // dial out; every call additionally requires an explicit confirmation.
  const [hotlinesOpen, setHotlinesOpen] = useState(false);

  // Disaster alert banner state (checked against localDb on mount).
  const [activeDisaster, setActiveDisaster] = useState(null);
  const [disasterChecked, setDisasterChecked] = useState(false);

  // Upcoming barangay events (type: 'barangay_event', date >= today).
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await db.find({ selector: { type: 'disaster_event' }, limit: 200 });
        const active = (res.docs || []).filter(
          (d) => d.isArchived !== true && d.status === 'Active'
        );
        if (!cancelled) setActiveDisaster(active[0] || null);
      } catch (err) {
        console.warn('[ResidentHome] Failed to load disaster alerts:', err?.message || err);
        if (!cancelled) setActiveDisaster(null);
      } finally {
        if (!cancelled) setDisasterChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await db.find({ selector: { type: 'barangay_event' }, limit: 500 });
        const upcoming = (res.docs || [])
          .filter((e) => !e.archived && e.date && e.date >= today)
          .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
        if (!cancelled) setUpcomingEvents(upcoming);
      } catch (err) {
        console.warn('[ResidentHome] Failed to load upcoming events:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatEventDate = (value) => {
    const [y, m, d] = String(value || '').split('-').map(Number);
    if (!y || !m || !d) return value || '';
    return new Date(y, m - 1, d).toLocaleDateString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  const confirmEmergencyCall = (hotline) => {
    // Move focus off the tapped button before SweetAlert2 opens: it marks the
    // app background aria-hidden, and a still-focused descendant logs a
    // "Blocked aria-hidden" browser violation.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && typeof active.blur === 'function') active.blur();

    Swal.fire({
      title: 'Place emergency call?',
      html: `<div style="font-size:14px;line-height:1.5">Call <strong>${hotline.name}</strong>?<br/><span style="font-size:12px;color:#6b7280">${hotline.sub}</span></div>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Call now',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#6b7280',
      reverseButtons: true,
      focusCancel: true,
    }).then((result) => {
      if (result.isConfirmed) {
        window.location.href = `tel:${hotline.tel}`;
      }
    });
  };

  // Safe lengths para sa Stats Grid
  const stats = [
    { label: 'Certificates', value: myRequests.length, target: 's-certificates' },
    { label: 'Pending Requests', value: pendingRequestCount, target: 's-certificates' },
    { label: 'Announcements', value: announcements.length, target: 's-announcements' },
    { label: 'My Feedback', value: myFeedbacks.length, target: 's-feedback' },
    { label: 'Blotter Reports', value: myBlotters.length, target: 's-blotter' },
    { label: 'Assistance', value: myAssistance.length, target: 's-assistance' },
  ];

  const formatAnnDate = (ann) => {
    const raw = ann.timestamp || ann.createdAt;
    if (!raw) return 'recently';
    const d = new Date(raw);
    if (isNaN(d)) return 'recently';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  // Helper: check if announcement is less than 24 hours old
  const isNewAnnouncement = (ann) => {
    const raw = ann.timestamp || ann.createdAt;
    if (!raw) return false;
    const hoursDiff = (new Date() - new Date(raw)) / (1000 * 60 * 60);
    return hoursDiff < 24; // True kung less than 24 hours ang age
  };

  return (
    <div
      className="screen active"
      style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
    >
      {/* Offline Banner */}
      {isOffline && (
        <div className="notice notice-offline" role="status" aria-live="polite" style={{ marginBottom: 16 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span><strong>Offline:</strong> Changes will sync once you are back online.</span>
        </div>
      )}

      {/* Disaster Alert Banner */}
      {disasterChecked && activeDisaster && (
        <button
          type="button"
          onClick={() => goToTab?.('s-bdrrmc')}
          aria-label={`Active disaster: ${activeDisaster.eventType}. View evacuation centers.`}
          style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
            marginBottom: 16, padding: '12px 14px', borderRadius: 12,
            background: 'var(--red-bg, rgba(239, 68, 68, 0.1))',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: 'var(--red)', fontSize: 13, fontWeight: 700, lineHeight: 1.4,
          }}
        >
          ⚠️ Active Disaster: {activeDisaster.eventType || 'Disaster Event'} - Tap to view evacuation centers
        </button>
      )}
      {disasterChecked && !activeDisaster && (
        <div
          role="status"
          style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 12,
            background: 'var(--green-bg, rgba(34, 197, 94, 0.08))',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: 'var(--green)', fontSize: 12.5, fontWeight: 700,
          }}
        >
          ✅ No active disaster alerts
        </div>
      )}

      {/* Header */}
      <div className="page-hdr" style={{ marginBottom: 16 }}>
        <div className="page-title">{greetingText}, {loggedInUser?.fullName}!</div>
        <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span>Barangay Bustrac</span>
          <span>•</span>
          <span style={{ color: isOffline ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>
            {isOffline ? 'Offline Mode' : 'Connected & Synced'}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
        {stats.map((stat) => (
          <div
            key={stat.label}
            role="button"
            tabIndex={0}
            onClick={() => goToTab?.(stat.target)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToTab?.(stat.target);
              }
            }}
            style={{
              cursor: 'pointer', padding: '14px 16px', borderRadius: 14,
              background: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 700, color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 8,
            }}>
              {stat.label}
            </span>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Latest Announcements */}
      <div className="card" style={{ padding: 18, marginBottom: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="card-title" style={{ marginBottom: 12, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
          Latest Announcements
        </div>
        {announcements.length ? (
          announcements.slice(0, 3).map((ann) => (
            <div
              key={ann._id}
              className="list-item"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', minWidth: 0 }}
            >
              <div className="list-icon" style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: ann.category === 'Health' ? 'var(--amber-bg)' : ann.category === 'Governance' ? 'var(--primary-light)' : 'var(--surface2)',
                color: ann.category === 'Health' ? 'var(--amber)' : ann.category === 'Governance' ? 'var(--primary)' : 'var(--muted)',
              }}>
                <FaBullhorn size={16} />
              </div>
              <div className="list-body" style={{ flex: 1, minWidth: 0 }}>
                <div className="list-title" style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text)',
                  display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
                }}>
                  <span style={{
                    flex: '1 1 auto', minWidth: 0, overflow: 'hidden',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    whiteSpace: 'normal', wordBreak: 'break-word',
                  }}>
                    {ann.title}
                  </span>
                  {/* NEW BADGE */}
                  {isNewAnnouncement(ann) && (
                    <span style={{
                      flexShrink: 0,
                      fontSize: '9px',
                      fontWeight: 800,
                      background: '#ef4444',
                      color: '#fff',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                    }}>
                      NEW
                    </span>
                  )}
                </div>
                <div className="list-sub" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {ann.category || 'General'} · {formatAnnDate(ann)}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => goToTab?.('s-announcements')} style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
                View →
              </button>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--muted)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>No announcements yet.</div>
            <div style={{ fontSize: 12 }}>Check back later for new updates.</div>
          </div>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="card" style={{ padding: 18, marginBottom: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <span className="card-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
            Upcoming Events
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => goToTab?.('s-events')} style={{ fontSize: 11, flexShrink: 0, whiteSpace: 'nowrap' }}>
            View →
          </button>
        </div>
        {upcomingEvents.length ? (
          upcomingEvents.slice(0, 2).map((ev) => (
            <div
              key={ev._id}
              className="list-item"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', minWidth: 0 }}
            >
              <div className="list-icon" style={{
                width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: 'var(--surface2)', color: 'var(--primary)',
              }}>
                <FaCalendarAlt size={16} />
              </div>
              <div className="list-body" style={{ flex: 1, minWidth: 0 }}>
                <div className="list-title" style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text)',
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word',
                }}>
                  {ev.title}
                </div>
                <div className="list-sub" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {formatEventDate(ev.date)}{ev.location ? ` · ${ev.location}` : ''}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--muted)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>No upcoming events.</div>
            <div style={{ fontSize: 12 }}>Check back later for community activities.</div>
          </div>
        )}
      </div>

      {/* Emergency Hotlines — collapsible so a stray tap can never dial out */}
      <div className="card" style={{ padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setHotlinesOpen((open) => !open)}
          aria-expanded={hotlinesOpen}
          aria-controls="resident-emergency-hotlines"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', gap: 12, padding: 0, background: 'none', border: 'none',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span className="card-title" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
            Emergency Hotlines (Nabua)
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
            {hotlinesOpen ? 'Hide' : 'Show'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: hotlinesOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {hotlinesOpen && (
          <div id="resident-emergency-hotlines" style={{ marginTop: 12 }}>
            {EMERGENCY_HOTLINES.map((h, idx, arr) => (
              <div
                key={h.name}
                className="list-item"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 12, padding: '10px 0',
                  borderBottom: idx < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div className="list-body" style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-title" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{h.name}</div>
                  <div className="list-sub" style={{ fontSize: 11, color: 'var(--muted)' }}>{h.sub}</div>
                </div>
                <button
                  type="button"
                  onClick={() => confirmEmergencyCall(h)}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--green)', borderColor: 'var(--green-border)', padding: '7px 16px', fontSize: 12, fontWeight: 700, minWidth: 64, justifyContent: 'center', flexShrink: 0 }}
                  aria-label={`Call ${h.name} at ${h.tel}`}
                >
                  Call
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
