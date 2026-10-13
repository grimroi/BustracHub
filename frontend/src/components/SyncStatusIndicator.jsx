import React, { useState, useEffect } from 'react';
import '../styles/SyncStatusIndicator.css';

const SyncStatusIndicator = ({ syncState, pendingCount = 0, lastSynced, detail, onRetry }) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

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

  const queued = Number(pendingCount) || 0;

  const getStatus = () => {
    if (!isOnline) return 'offline';
    if (syncState === 'syncing' || syncState === 'active') return 'syncing';
    if (syncState === 'error') return 'error';
    return 'synced';
  };

  const status = getStatus();

  const isRetryable = status === 'error' && typeof onRetry === 'function';
  const isOfflineWithPending = status === 'offline' && queued > 0;

  const statusConfig = {
    offline: {
      label: queued > 0 ? `Offline • ${queued} pending` : 'Offline',
      short: 'Offline',
      icon: '🟠',
      title: 'You are offline. Changes are saved locally and will sync automatically when you reconnect.',
      action: isOfflineWithPending ? 'Auto-syncs when online' : null,
    },
    syncing: {
      label: 'Syncing…',
      short: 'Syncing',
      icon: '🟡',
      title: 'Syncing local changes with the cloud automatically…',
      action: null,
    },
    error: {
      label: detail === 'forbidden'
        ? 'Waiting for permission'
        : 'Sync failed — click to retry',
      short: detail === 'forbidden' ? 'Pending' : 'Error',
      icon: '🔴',
      title: detail === 'forbidden'
        ? 'Some changes are waiting for permission. Retrying automatically.'
        : 'Sync failed — click to retry now.',
      action: isRetryable ? 'Click to retry' : null,
    },
    synced: {
      label: queued > 0 ? `Online • ${queued} pending` : 'Synced',
      short: queued > 0 ? 'Pending' : 'Synced',
      icon: '🟢',
      title: lastSynced
        ? `All changes synced. Last sync: ${new Date(lastSynced).toLocaleString()}`
        : 'All changes saved to the cloud.',
      action: null,
    },
  };

  const current = statusConfig[status];

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isRetryable) {
      onRetry();
    }
  };

  return (
    <div
      className={`sync-indicator ${isRetryable ? 'sync-indicator--clickable' : ''} ${isOfflineWithPending ? 'sync-indicator--offline-pending' : ''}`}
      data-status={status}
      role="status"
      title={current.title}
      onClick={handleClick}
      style={{ cursor: isRetryable ? 'pointer' : 'default' }}
    >
      <span className={`sync-indicator__icon ${status === 'syncing' ? 'sync-icon-spin' : ''}`}>
        {current.icon}
      </span>
      <span className="sync-indicator__label sync-indicator__label--full">{current.label}</span>
      <span className="sync-indicator__label sync-indicator__label--short" aria-hidden="true">{current.short}</span>
      {queued > 0 && <span className="sync-indicator__pill">{queued}</span>}
      {current.action && <span className="sync-indicator__action">{current.action}</span>}
    </div>
  );
};

export default SyncStatusIndicator;