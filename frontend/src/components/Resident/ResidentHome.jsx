import { FaBullhorn } from "react-icons/fa";

export default function ResidentHome({
  isOffline,
  greetingText,
  loggedInUser,
  myRequests,
  pendingRequestCount,
  announcements,
  myFeedbacks,
  myBlotters,
  myAssistance,
  goToTab,
}) {
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
        {[
          { label: 'Certificates', value: myRequests.length, target: 's-certificates' },
          { label: 'Pending Requests', value: pendingRequestCount, target: 's-certificates' },
          { label: 'Announcements', value: announcements.length, target: 's-announcements' },
          { label: 'My Feedback', value: myFeedbacks.length, target: 's-feedback' },
          { label: 'Blotter Reports', value: myBlotters.length, target: 's-blotter' },
          { label: 'Assistance', value: myAssistance.length, target: 's-assistance' },
        ].map((stat) => (
          <div
            key={stat.label}
            onClick={() => goToTab(stat.target)}
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
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}
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
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {ann.title}
                </div>
                <div className="list-sub" style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {ann.category || 'General'} · Posted {ann.author ? `by ${ann.author}` : 'recently'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => goToTab('s-announcements')} style={{ fontSize: 11 }}>
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

      {/* Emergency Hotlines */}
      <div className="card" style={{ padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="card-title" style={{ marginBottom: 12, fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
          Emergency Hotlines (Nabua)
        </div>
        {[
          { name: 'MDRRMO Nabua (Rescue)', sub: 'Disaster & Emergency Response', tel: '09175060294' },
          { name: 'PNP Nabua (Police Station)', sub: 'Law Enforcement & Safety Concerns', tel: '09985986014' },
          { name: 'BFP Nabua (Fire Station)', sub: 'Fire Control & Incidents', tel: '0542884676' },
          { name: 'Barangay Bustrac Hall', sub: 'Local Desk Command Center', tel: '09123456789' },
        ].map((h, idx, arr) => (
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
            <a
              href={`tel:${h.tel}`}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--green)', borderColor: 'var(--green-border)', padding: '4px 12px', fontSize: 11 }}
            >
              Call
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
