// src/components/Layout/Topbar.jsx
import React from 'react';
import SyncStatusIndicator from '../SyncStatusIndicator';
import { ThemeToggle } from '../ThemeToggle';
import './Topbar.css';

const Topbar = React.memo(function Topbar({
  currentTitle,
  currentSubtitle,
  role,
  syncState,
  pendingCount,
  lastSynced,
  syncDetail,
  logout,
  forceSync,
  notifUnread = 0,
  notifItems = [],
  notifPanelOpen = false,
  onToggleNotif,
  onNotifNavigate,
}) {
  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="tb-title">{currentTitle}</div>
        <div className="tb-sub">{currentSubtitle}</div>
      </div>

      <div className="tb-right">
        {role === 'admin' && (
          <div className="role-admin">
            🔑 Admin
          </div>
        )}
        <SyncStatusIndicator
          syncState={syncState || 'offline'}
          pendingCount={pendingCount}
          lastSynced={lastSynced}
          detail={syncDetail}
          onRetry={forceSync}
        />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn btn-g btn-sm"
            onClick={onToggleNotif}
            aria-label={`Notifications${notifUnread > 0 ? ` (${notifUnread} unread)` : ''}`}
            aria-expanded={notifPanelOpen}
            style={{ position: 'relative', padding: '8px 10px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notifUnread > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '2px solid var(--surface, #fff)' }}>
                {notifUnread > 9 ? '9+' : notifUnread}
              </span>
            )}
          </button>

          {notifPanelOpen && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 420, overflowY: 'auto', background: 'var(--surface, #fff)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', zIndex: 300, padding: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 8px', borderBottom: '1px solid var(--border, #e2e8f0)', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text, #0f172a)' }}>Notifications</span>
                <button onClick={onToggleNotif} style={{ background: 'none', border: 'none', color: 'var(--muted, #64748b)', fontSize: 16, cursor: 'pointer' }} aria-label="Close notifications">&#x2715;</button>
              </div>
              {notifItems.length === 0 ? (
                <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--muted, #64748b)', fontSize: 12 }}>No notifications yet.</div>
              ) : (
                notifItems.map((n) => (
                  <button
                    key={n._id}
                    onClick={() => { if (onNotifNavigate) onNotifNavigate(n.link); if (onToggleNotif) onToggleNotif(); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 8px', border: 'none', borderRadius: 8, background: n.read ? 'transparent' : 'rgba(59,130,246,0.08)', cursor: 'pointer' }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text, #0f172a)', marginBottom: 2 }}>{n.title}</div>
                    {n.body ? <div style={{ fontSize: 11, color: 'var(--muted, #64748b)', lineHeight: 1.4 }}>{n.body}</div> : null}
                    <div style={{ fontSize: 10, color: 'var(--muted, #64748b)', marginTop: 4, opacity: 0.8 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString() : ''}</div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <ThemeToggle />
        <button className="btn btn-g btn-sm" onClick={logout} aria-label="Sign out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    </header>
  );
});

export default Topbar;
