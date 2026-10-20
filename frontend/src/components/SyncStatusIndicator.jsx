import { useState, useEffect } from 'react';
import '../styles/SyncStatusIndicator.css';

const SyncStatusIndicator = ({
  syncState,
  pendingCount = 0,
  lastSynced,
  detail,
  onRetry,
  onSyncNow,
  isSyncing = false,
}) => {
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
    if (isSyncing || syncState === 'syncing' || syncState === 'active') return 'syncing';
    if (syncState === 'error') return 'error';
    return 'synced';
  };

  const status = getStatus();

  const isRetryable = status === 'error' && typeof onRetry === 'function';
  const isOfflineWithPending = status === 'offline' && queued > 0;
  const canSyncNow = typeof onSyncNow === 'function';

  const statusConfig = {
    offline: {
      label: queued > 0 ? `Offline — ${queued} change${queued === 1 ? '' : 's'} queued` : 'Offline',
      short: 'Offline',
      icon: '🔌',
      title: queued > 0
        ? `You are offline. ${queued} change${queued === 1 ? '' : 's'} are saved locally and will be pushed automatically when the connection returns. Do not shut down this device yet.`
        : 'You are offline. Changes are saved locally and will sync automatically when you reconnect.',
      action: isOfflineWithPending ? 'Auto-syncs when online' : null,
    },
    syncing: {
      label: 'Syncing…',
      short: 'Syncing',
      icon: '🔄',
      title: 'Syncing local changes with the cloud automatically…',
      action: null,
    },
    error: {
      label: detail === 'forbidden'
        ? 'Waiting for permission'
        : 'Sync failed — click to retry',
      short: detail === 'forbidden' ? 'Pending' : 'Error',
      icon: '⚠️',
      title: detail === 'forbidden'
        ? 'Some changes are waiting for permission. Retrying automatically.'
        : 'Sync failed — click to retry now.',
      action: isRetryable ? 'Click to retry' : null,
    },
    synced: {
      label: queued > 0 ? `Syncing — ${queued} pending` : 'All changes saved',
      short: queued > 0 ? 'Pending' : 'Saved',
      icon: '✅',
      title: lastSynced
        ? `All changes saved. Last sync: ${new Date(lastSynced).toLocaleString()}`
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
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
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

      {canSyncNow && (
        <button
          type="button"
          className="btn btn-g btn-sm"
          onClick={onSyncNow}
          disabled={isSyncing || !isOnline}
          title={
            isOnline
              ? 'Push all pending changes to the server right now'
              : 'You are offline — changes will be pushed when the connection returns'
          }
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: isSyncing || !isOnline ? 0.6 : 1 }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={isSyncing ? 'sync-icon-spin' : undefined}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          <span className="topbar__sync-label-full">{isSyncing ? 'Syncing…' : 'Sync Now'}</span>
          <span className="topbar__sync-label-short">Sync</span>
        </button>
      )}
    </div>
  );
};

export default SyncStatusIndicator;
