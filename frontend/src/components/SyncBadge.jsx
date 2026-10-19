import { useEffect, useState } from 'react';
import { isDocSynced, onDocSyncChange } from '../services/db';

// Dynamic per-record sync badge driven by the PouchDB replication engine.
//
// A record is shown as LOCAL LOG while its current local revision has not been
// confirmed pushed to the remote CouchDB server, and it flips to SYNCED once
// the sync engine reports replication is caught up (see services/db.js). The
// transition is fully automatic and never performs a network round-trip per
// record — it reads only local `_rev` metadata, so offline behaviour is intact.
const SyncBadge = ({ doc, className = '' }) => {
  const [, setVersion] = useState(0);

  // Re-render whenever the per-document sync registry changes so the badge
  // transitions on its own after a successful replication.
  useEffect(() => {
    if (typeof onDocSyncChange !== 'function') return undefined;
    return onDocSyncChange(() => setVersion((v) => v + 1));
  }, []);

  const synced = typeof isDocSynced === 'function' ? Boolean(isDocSynced(doc)) : false;

  return (
    <span
      className={`badge ${synced ? 'badge-synced' : 'badge-local'} ${className}`.trim()}
      title={
        synced
          ? 'Saved to the cloud and confirmed by the sync engine.'
          : 'Saved on this device. It will sync automatically when online.'
      }
      style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        padding: '2px 6px',
        borderRadius: 4,
        whiteSpace: 'nowrap',
        background: synced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
        color: synced ? '#10b981' : '#f59e0b',
        border: `1px solid ${synced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
      }}
    >
      {synced ? '\u2601\uFE0E Synced' : '\u23F3 Local Log'}
    </span>
  );
};

export default SyncBadge;
