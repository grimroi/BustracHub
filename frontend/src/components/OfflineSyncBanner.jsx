// src/components/OfflineSyncBanner.jsx
//
// A persistent, unmissable warning shown while the device still holds
// unsynced work. It sits above the dashboard content so nobody closes the
// tablet thinking everything was saved.
import '../styles/OfflineSyncBanner.css';

const OfflineSyncBanner = ({
  pendingCount = 0,
  isOnline = true,
  isSyncing = false,
  onSyncNow = null,
  onDismiss = null,
}) => {
  const pending = Number(pendingCount) || 0;
  if (pending <= 0) return null;

  const plural = pending === 1 ? 'change' : 'changes';

  return (
    <div
      className={`offline-sync-banner ${isOnline ? 'offline-sync-banner--online' : 'offline-sync-banner--offline'}`}
      role="alert"
      aria-live="assertive"
    >
      <span className="offline-sync-banner__icon" aria-hidden="true">⚠️</span>

      <div className="offline-sync-banner__text">
        <strong className="offline-sync-banner__title">
          You have {pending} unsaved offline {plural}.
        </strong>
        <span className="offline-sync-banner__subtitle">
          Do not close or shut down until synced. {isOnline ? 'Syncing now…' : 'The device is offline — the changes are safe locally and will be pushed automatically when the connection returns.'}
        </span>
      </div>

      <div className="offline-sync-banner__actions">
        {onSyncNow && (
          <button
            type="button"
            className="offline-sync-banner__btn"
            onClick={onSyncNow}
            disabled={isSyncing || !isOnline}
            title={isOnline ? 'Push now' : 'Waiting for the connection to return'}
          >
            {isSyncing ? 'Syncing…' : 'Sync Now'}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="offline-sync-banner__btn offline-sync-banner__btn--ghost"
            onClick={onDismiss}
            aria-label="Dismiss the unsynced changes warning"
            title="Hide this banner (the changes are still queued)"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default OfflineSyncBanner;
