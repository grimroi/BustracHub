import { useState } from 'react';

const categoryIcons = {
  All: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/>
    </svg>
  ),
  Health: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
    </svg>
  ),
  Governance: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 21V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v16"/>
    </svg>
  ),
  Events: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  ),
  Security: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
};

export default function ResidentAnnouncements({ announcements }) {
  const [announcementFilter, setAnnouncementFilter] = useState('All');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);

  const filteredAnnouncements = announcements.filter(
    (a) => announcementFilter === 'All' || a.category === announcementFilter
  );

  return (
    <div
      className="screen active"
      style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: 0 }}
    >
      {/* Page Header */}
      <div className="page-hdr" style={{ marginBottom: 16 }}>
        <div className="page-title">Announcements</div>
        <div className="page-sub">Official notices and community advisories from Barangay Bustrac</div>
      </div>

      {/* Category Filter Chips */}
      <div className="type-select" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {['All', 'Health', 'Governance', 'Events', 'Security'].map((label) => {
          const isActive = announcementFilter === label;
          return (
            <button
              key={label}
              type="button"
              className={`type-btn${isActive ? ' active' : ''}`}
              onClick={() => setAnnouncementFilter(label)}
              style={{
                whiteSpace: 'nowrap', flexShrink: 0, borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                background: isActive ? 'var(--primary, #3b82f6)' : 'var(--surface)',
                color: isActive ? '#ffffff' : 'var(--muted)',
                border: isActive ? '1px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
              }}
            >
              {categoryIcons[label]}
              {label}
            </button>
          );
        })}
      </div>

      {/* Announcement Cards */}
      {!filteredAnnouncements || filteredAnnouncements.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>No announcements found</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>There are currently no announcements under this category.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredAnnouncements.map((ann) => (
            <div
              key={ann._id || ann.id}
              className="card"
              style={{ padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden' }}
            >
              {/* Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                {ann.pinned && (
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 6,
                    color: 'var(--primary, #3b82f6)', background: 'var(--primary-light)', border: '1px solid var(--primary-light)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    Pinned
                  </span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: 6,
                  color: 'var(--muted)', background: 'var(--surface2, rgba(255, 255, 255, 0.05))', border: '1px solid var(--border)',
                }}>
                  {ann.category || 'General'}
                </span>
              </div>

              {/* Title & Body */}
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 6, lineHeight: 1.3 }}>
                {ann.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)', opacity: 0.9, lineHeight: 1.5, marginBottom: 12 }}>
                {ann.content || ann.body || ann.description}
              </div>

              {/* Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span>
                  Posted:{" "}
                  <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {ann.date || (ann.timestamp ? new Date(ann.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently')}
                  </strong>
                </span>
                <span>
                  By:{" "}
                  <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{ann.author || 'Barangay Admin'}</strong>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Selected Announcement Modal */}
      {selectedAnnouncement && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px',
          }}
          onClick={() => setSelectedAnnouncement(null)}
        >
          <div
            style={{
              background: 'var(--surface, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: '16px',
              width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto', padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4)', position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{
                  fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6,
                  color: 'var(--primary, #3b82f6)', background: 'var(--primary-light)', border: '1px solid var(--primary-light)',
                }}>
                  {selectedAnnouncement.category || 'General'}
                </span>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text, #f8fafc)', marginTop: 8, marginBottom: 0, lineHeight: 1.3 }}>
                  {selectedAnnouncement.title}
                </h3>
              </div>
              <button onClick={() => setSelectedAnnouncement(null)} style={{ background: 'transparent', border: 'none', color: 'var(--muted, #94a3b8)', cursor: 'pointer', fontSize: 20, padding: 4 }}>
                ✕
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted, #94a3b8)', marginBottom: 16, borderBottom: '1px solid var(--border, #334155)', paddingBottom: 12 }}>
              Posted by <strong style={{ color: 'var(--text, #f8fafc)' }}>{selectedAnnouncement.author || 'Barangay Office'}</strong> ·{" "}
              {selectedAnnouncement.date || 'Recently posted'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text, #f8fafc)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {selectedAnnouncement.body}
            </div>
            <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setSelectedAnnouncement(null)} style={{ padding: '8px 18px', borderRadius: 8, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
