// src/components/layout/Topbar.jsx
import React from 'react';
import SyncStatusIndicator from '../SyncStatusIndicator';
import { ThemeToggle } from '../ThemeToggle';

const Topbar = React.memo(function Topbar({
  currentTitle,
  currentSubtitle,
  role,
  syncState,
  pendingCount,
  lastSynced,
  logout,
}) {
  return (
    <header
      className="topbar"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div className="tb-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
          {currentTitle}
        </div>
        <div className="tb-sub" style={{ fontSize: '12px', color: 'var(--muted)' }}>
          {currentSubtitle}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {role === 'admin' && (
          <div
            className="role-admin"
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--amber)',
              background: 'rgba(245, 158, 11, 0.1)',
              padding: '4px 10px',
              borderRadius: '6px',
            }}
          >
            🔑 Admin
          </div>
        )}
        <SyncStatusIndicator
          syncState={syncState || 'offline'}
          pendingCount={pendingCount}
          lastSynced={lastSynced}
        />
        <ThemeToggle />
        <button
          className="btn btn-g btn-sm"
          onClick={logout}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>
      </div>
    </header>
  );
});

export default Topbar;