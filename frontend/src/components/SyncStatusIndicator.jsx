import React, { useState, useEffect } from 'react';
import '../styles/SyncStatusIndicator.css';

const SyncStatusIndicator = ({ syncState }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

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

  // Auto-hide success badge pagkalipas ng 3 seconds
  useEffect(() => {
    if (syncState === 'synced' || syncState === 'success') {
      setShowSuccessMessage(true);
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000); // 3 seconds timeout

      return () => clearTimeout(timer);
    }
  }, [syncState]);

  const getStatus = () => {
    if (!isOnline) return 'offline';
    if (syncState === 'syncing') return 'active';
    if (syncState === 'error') return 'error';
    return 'success';
  };

  const status = getStatus();

  if (status === 'success' && !showSuccessMessage) {
    return null;
  }

  const statusConfig = {
    offline: {
      label: 'Offline (Saved Locally)',
      icon: '☁️',
      className: 'sync-offline',
    },
    active: {
      label: 'Syncing to Cloud...',
      icon: '⟳',
      className: 'sync-active',
    },
    error: {
      label: 'Sync Error',
      icon: '⚠️',
      className: 'sync-error',
    },
    success: {
      label: 'All changes saved',
      icon: '✓',
      className: 'sync-success',
    },
  };

  const current = statusConfig[status];

  return (
    <div className={`sync-badge ${current.className}`} role="status" title={current.label}>
      <span className={`status-icon ${status === 'active' ? 'spinning' : ''}`}>
        {current.icon}
      </span>
      <span className="status-text">{current.label}</span>
    </div>
  );
};

export default SyncStatusIndicator;