import React, { useState, useEffect } from 'react';
import '../styles/SyncStatusIndicator.css';

const SyncStatusIndicator = ({ syncState }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const getStatus = () => {
    if (!isOnline) return 'offline';
    if (syncState === 'syncing') return 'active';
    if (syncState === 'error') return 'error';
    return 'success'; // synced
  };

  const status = getStatus();

  const labels = {
    offline: '☁️ Working Offline (Saved to Local Device)',
    active: '🔄 Connecting & Syncing changes to Central Cloud...',
    error: '⚠️ Sync error detected',
    success: '🗲 All changes synced to Cloud',
  };

  return (
    <div className={`sync-status-badge sync-${status}`} role="status" aria-live="polite">
      <span className="status-icon" aria-hidden="true">
        {status === 'success' && '✓'}
        {status === 'active' && '⟳'}
        {status === 'offline' && '☁️'}
        {status === 'error' && '!'}
      </span>
      <span className="status-text">{labels[status]}</span>
    </div>
  );
};

export default SyncStatusIndicator;