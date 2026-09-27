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

  // Determinado ang aktwal na status state: 'offline', 'syncing', o 'synced'
  const currentStatus = !isOnline 
    ? 'offline' 
    : syncState === 'syncing' 
      ? 'syncing' 
      : 'synced';

  return (
    <div className={`sync-status-container sync-${currentStatus}`} role="status" aria-live="polite">
      <span className="sync-status-dot" aria-hidden="true" />
      <span className="sync-status-text">
        {currentStatus === 'offline' && "☁️ Working Offline (Saved to Local Device)"}
        {currentStatus === 'syncing' && "🔄 Connecting & Syncing changes to Central Cloud..."}
        {currentStatus === 'synced' && "🗲 All changes synced to Cloud"}
      </span>
    </div>
  );
};

export default SyncStatusIndicator;