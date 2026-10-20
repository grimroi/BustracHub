// src/services/syncManager.js
//
// Resilient, self-healing sync layer.
//
// It sits ON TOP of services/db.js (which keeps owning the actual PouchDB
// replication) and adds everything the offline-first workflow was missing:
//
//   * an accurate, persistent "pending changes" counter (how many local
//     documents still have to reach the server),
//   * exponential backoff for failed pushes,
//   * a "Sync Now" action that forces replication immediately,
//   * a `beforeunload` guard that warns the user before the tab goes away
//     with unsynced work,
//   * Background Sync registration so the browser can finish the push after
//     the tab is closed,
//   * a durable outbox (utils/syncOutbox.js) that the service worker can
//     drain if the tab never comes back,
//   * a device heartbeat so the admin can see which device still holds work.
//
// The module is a singleton: `startSyncManager()` is idempotent and returns
// the same controller until `stopSyncManager()` is called.

import {
  localDb,
  stopPouchDBSync,
  forceSyncToRemote,
  onSyncStatusChange,
  getPendingSyncCount,
  noteReplicableDoc,
  isDocSynced,
} from './db';
import { getToken } from '../utils/tokenStore';
import { resolveApiBaseUrl } from '../utils/apiBase';
import {
  enqueueDoc,
  listOutbox,
  removeFromOutbox,
  saveSwMeta,
} from '../utils/syncOutbox';
import {
  SYNC_TAG,
  supportsBackgroundSync,
  supportsServiceWorker,
  registerBackgroundSyncWorker,
  pushServiceWorkerMeta,
  requestBackgroundSync,
} from './backgroundSync';
import { recordHeartbeat, getDeviceId } from './deviceRegistry';
import { createStaffAlerts } from './staffAlerts';
import { logConflictResolution } from '../utils/auditLog';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const COUCH_DB_NAME = import.meta.env.VITE_COUCHDB_DB || 'bustrachub_db';

// Backoff schedule for failed manual pushes (milliseconds).
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 60000;
const BACKOFF_MAX_ATTEMPTS = 5;

// How often the pending counter is recomputed while the app is open.
const PENDING_REFRESH_DEBOUNCE_MS = 500;
// How often the device heartbeat is published.
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

const initialState = () => ({
  status: typeof navigator !== 'undefined' && navigator.onLine ? 'synced' : 'offline',
  pending: 0,
  detail: null,
  lastSyncedAt: (() => {
    try { return localStorage.getItem('bustrac_last_synced') || null; } catch { return null; }
  })(),
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  backoffMs: 0,
  nextRetryAt: null,
  deviceId: getDeviceId(),
  backgroundSyncSupported: supportsBackgroundSync(),
  serviceWorkerSupported: supportsServiceWorker(),
  syncing: false,
  lastError: null,
});

let state = initialState();
let listeners = [];
let started = false;
let changesFeed = null;
let pendingTimer = null;
let heartbeatTimer = null;
let syncInFlight = null;
let unsubscribers = [];

const log = (...args) => {
  try {
    console.log('[sync-manager]', ...args);
  } catch {
    /* logging must never break sync */
  }
};

const emit = () => {
  listeners.forEach((cb) => {
    try {
      cb({ ...state });
    } catch (err) {
      console.warn('[sync-manager] listener failed:', err?.message || err);
    }
  });
};

const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const backoffFor = (attempt) => {
  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1), BACKOFF_MAX_MS);
  // Jitter so many devices do not retry at the same instant.
  const jitter = Math.floor(Math.random() * Math.max(1, base * 0.25));
  return base + jitter;
};

// ─────────────────────────────────────────────
// PENDING COUNTER
// ─────────────────────────────────────────────

/** Recompute the number of local documents that still have to be pushed. */
export const refreshPendingCount = async () => {
  try {
    const pending = await getPendingSyncCount();
    if (pending !== state.pending) {
      setState({ pending });
    }
    return pending;
  } catch {
    return state.pending;
  }
};

const schedulePendingRefresh = () => {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    refreshPendingCount().catch(() => {});
  }, PENDING_REFRESH_DEBOUNCE_MS);
};

/**
 * Remove outbox entries whose revision is already confirmed as pushed.
 * Called after a successful replication so the outbox never grows stale.
 */
const pruneOutbox = async () => {
  try {
    const items = await listOutbox();
    if (!items.length) return 0;
    const stale = items.filter((entry) => entry?.doc && isDocSynced(entry.doc));
    if (!stale.length) return 0;
    await removeFromOutbox(stale.map((entry) => entry.key));
    return stale.length;
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────
// OUTBOX (durable queue for the service worker)
// ─────────────────────────────────────────────

const startOutboxFeed = () => {
  if (changesFeed) return;
  try {
    changesFeed = localDb
      .changes({ live: true, since: 'now', include_docs: true })
      .on('change', (change) => {
        const doc = change?.doc;
        if (!doc?._id) return;
        // Local documents never replicate and must never be queued.
        if (String(doc._id).startsWith('_local/')) return;
        // Keep the replicable-id set (used by the pending counter) current.
        noteReplicableDoc(doc);
        enqueueDoc(doc).catch(() => {});
        schedulePendingRefresh();
      })
      .on('error', (err) => {
        log('outbox feed error:', err?.message || err);
      });
  } catch (err) {
    log('outbox feed could not start:', err?.message || err);
    changesFeed = null;
  }
};

const stopOutboxFeed = () => {
  if (!changesFeed) return;
  try {
    changesFeed.cancel();
  } catch {
    /* ignore */
  }
  changesFeed = null;
};

// ─────────────────────────────────────────────
// SYNC ACTIONS
// ─────────────────────────────────────────────

/**
 * Force a replication right now, retrying with exponential backoff.
 *
 * @param {object} [options]
 * @param {boolean} [options.silent] do not change the visible status
 * @returns {Promise<{ok:boolean, attempts?:number, error?:string}>}
 */
export const syncNow = async ({ silent = false } = {}) => {
  if (syncInFlight) return syncInFlight;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState({ status: 'offline', detail: 'browser-offline' });
    requestBackgroundSync();
    return { ok: false, error: 'offline' };
  }

  if (!getToken()) {
    setState({ status: 'offline', detail: 'no-session' });
    return { ok: false, error: 'no-session' };
  }

  syncInFlight = (async () => {
    if (!silent) setState({ syncing: true, status: 'syncing', lastError: null });

    let attempt = 0;
    let lastError = null;

    while (attempt < BACKOFF_MAX_ATTEMPTS) {
      attempt += 1;
      try {
        const result = await forceSyncToRemote();
        if (result) {
          setState({
            syncing: false,
            status: 'synced',
            detail: null,
            backoffMs: 0,
            nextRetryAt: null,
            lastError: null,
            lastSyncedAt: new Date().toISOString(),
          });
          await refreshPendingCount();
          await pruneOutbox();
          try { localStorage.setItem('bustrac_last_synced', state.lastSyncedAt); } catch { /* ignore */ }
          recordHeartbeat({ pendingCount: state.pending, lastSyncedAt: state.lastSyncedAt }).catch(() => {});
          return { ok: true, attempts: attempt };
        }
        lastError = 'replication did not complete';
      } catch (err) {
        lastError = err?.message || 'replication failed';
      }

      if (attempt >= BACKOFF_MAX_ATTEMPTS) break;

      const wait = backoffFor(attempt);
      setState({
        syncing: false,
        status: 'error',
        detail: 'retrying',
        backoffMs: wait,
        nextRetryAt: new Date(Date.now() + wait).toISOString(),
        lastError,
      });
      await delay(wait);
    }

    setState({ syncing: false, status: 'error', detail: 'failed', lastError });
    // The browser may be able to finish the job for us.
    requestBackgroundSync();
    return { ok: false, attempts: attempt, error: lastError };
  })().finally(() => {
    syncInFlight = null;
  });

  return syncInFlight;
};

/**
 * Ask the browser to push the remaining changes the next time the device is
 * online. Silently does nothing where Background Sync is unavailable.
 */
export const scheduleBackgroundSync = async () => {
  if (!state.backgroundSyncSupported) return false;
  try {
    const registered = await requestBackgroundSync(SYNC_TAG);
    if (registered) log('background sync tag registered');
    return registered;
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────
// EVENT HANDLERS
// ─────────────────────────────────────────────

const handleOnline = () => {
  // services/db.js already owns the live replication and restarts it on the
  // browser's "online" event — this handler only adds the resilient layer on
  // top: background-sync registration, an immediate push attempt, and a
  // forced device heartbeat so the server learns we are back.
  setState({ isOnline: true, status: 'syncing' });
  scheduleBackgroundSync();
  syncNow({ silent: true }).catch(() => {});
  recordHeartbeat({
    pendingCount: state.pending,
    lastSyncedAt: state.lastSyncedAt,
    force: true,
  }).catch(() => {});
};

const handleOffline = () => {
  setState({ isOnline: false, status: 'offline', detail: 'browser-offline' });
  scheduleBackgroundSync();
};

// Warn before the tab goes away with unsynced work and try to push it.
const handleBeforeUnload = (event) => {
  if (state.pending <= 0) return undefined;

  // Best effort: many browsers ignore asynchronous work here, which is
  // exactly why the Background Sync + outbox exist.
  try {
    forceSyncToRemote();
  } catch {
    /* ignore */
  }

  const message =
    `You have ${state.pending} unsynced change${state.pending === 1 ? '' : 's'}. ` +
    'Do not close or shut down until they are synced.';
  event.preventDefault();
  event.returnValue = message;
  return message;
};

const handleVisibilityChange = () => {
  if (typeof document === 'undefined') return;
  if (document.visibilityState === 'visible') {
    refreshPendingCount().catch(() => {});
    if (state.pending > 0 && state.isOnline) {
      scheduleBackgroundSync();
    }
  }
};

const handleServiceWorkerMessage = (event) => {
  const data = event?.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'BUSTRAC_RUN_SYNC') {
    syncNow({ silent: true })
      .then((result) => {
        try {
          navigator.serviceWorker.controller?.postMessage({
            type: 'BUSTRAC_SYNC_DONE',
            ok: !!result?.ok,
          });
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        try {
          navigator.serviceWorker.controller?.postMessage({ type: 'BUSTRAC_SYNC_DONE', ok: false });
        } catch {
          /* ignore */
        }
      });
    return;
  }

  if (data.type === 'BUSTRAC_SYNC_COMPLETE') {
    refreshPendingCount().catch(() => {});
  }
};

const handleTokenChanged = (event) => {
  const token = event?.detail?.token || null;
  pushServiceWorkerMeta({
    token,
    apiBase: API_BASE,
    dbName: COUCH_DB_NAME,
    deviceId: getDeviceId(),
  }).catch(() => {});
  if (token) {
    // services/db.js restarts replication on the token change; here we only
    // refresh the pending counter for the new session.
    refreshPendingCount().catch(() => {});
  }
};

// Automatic conflict resolution (services/db.js) merged two revisions away.
// Record it in the audit log and tell the staff member whose edit was
// overwritten.
const handleAutoResolvedConflicts = (event) => {
  const conflicts = event?.detail?.conflicts;
  if (!Array.isArray(conflicts) || conflicts.length === 0) return;
  (async () => {
    for (const conflict of conflicts) {
      try {
        await logConflictResolution({
          docId: conflict.docId,
          recordId: conflict.docId,
          module: 'SYNC_ENGINE',
          strategy: conflict.strategy || 'field-merge',
          winnerRev: conflict.docA?._rev || null,
          loserRevs: conflict.docB?._rev ? [conflict.docB._rev] : [],
          mergedFields: conflict.mergedFields || [],
          fieldChoices: conflict.fieldChoices || null,
          resolvedBy: 'auto-sync',
          details:
            'Automatically resolved during background replication using a field-level ' +
            'keep-latest merge (no differing field was discarded).',
        });
      } catch {
        /* auditing must never break sync */
      }
      try {
        await createStaffAlerts({
          docId: conflict.docId,
          recordName: 'a record',
          docA: conflict.docA,
          docB: conflict.docB,
          strategy: conflict.strategy || 'field-merge',
          winnerSide: conflict.winnerSide || 'A',
          fieldChoices: conflict.fieldChoices,
          mergedFields: conflict.mergedFields,
          resolvedBy: 'auto-sync',
        });
      } catch {
        /* alerting must never break sync */
      }
    }
  })();
};

// ─────────────────────────────────────────────
// LIFECYCLE
// ─────────────────────────────────────────────

/**
 * Start the sync manager. Idempotent.
 * @returns {{stop: () => void}}
 */
export const startSyncManager = () => {
  if (started) return { stop: stopSyncManager };
  started = true;

  state = { ...initialState(), pending: state.pending, lastSyncedAt: state.lastSyncedAt };

  // Replication status coming from the low-level layer.
  unsubscribers.push(
    onSyncStatusChange(({ status, detail }) => {
      if (status === 'synced') {
        setState({
          status: 'synced',
          detail: null,
          lastSyncedAt: new Date().toISOString(),
          syncing: false,
        });
        try { localStorage.setItem('bustrac_last_synced', state.lastSyncedAt); } catch { /* ignore */ }
        refreshPendingCount().catch(() => {});
        pruneOutbox().catch(() => {});
        recordHeartbeat({ pendingCount: state.pending, lastSyncedAt: state.lastSyncedAt }).catch(() => {});
        return;
      }
      if (status === 'offline') {
        setState({ status: 'offline', detail: detail || 'browser-offline', syncing: false });
        scheduleBackgroundSync();
        return;
      }
      if (status === 'syncing' || status === 'active') {
        setState({ status: 'syncing', syncing: true });
        return;
      }
      if (status === 'error') {
        setState({ status: 'error', detail: detail || 'error', syncing: false });
        scheduleBackgroundSync();
      }
    })
  );

  // Durable outbox for the service worker.
  startOutboxFeed();

  // Browser events.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('bustrac:token-changed', handleTokenChanged);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);
    window.addEventListener('bustrac:conflict-auto-resolved', handleAutoResolvedConflicts);
  }

  // Service worker + background sync.
  registerBackgroundSyncWorker()
    .then(() => {
      pushServiceWorkerMeta({
        token: getToken(),
        apiBase: API_BASE,
        dbName: COUCH_DB_NAME,
        deviceId: getDeviceId(),
      }).catch(() => {});
      if (state.isOnline) scheduleBackgroundSync();
    })
    .catch(() => {});

  // Keep the stored SW credentials in sync with the session token.
  saveSwMeta({
    token: getToken(),
    apiBase: API_BASE,
    dbName: COUCH_DB_NAME,
    deviceId: getDeviceId(),
  }).catch(() => {});

  // Heartbeat.
  heartbeatTimer = setInterval(() => {
    recordHeartbeat({ pendingCount: state.pending, lastSyncedAt: state.lastSyncedAt }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  // Initial state.
  // (services/db.js owns the live replication; the manager only adds the
  // resilient layer on top of it.)
  refreshPendingCount().catch(() => {});
  recordHeartbeat({ pendingCount: state.pending, lastSyncedAt: state.lastSyncedAt }).catch(() => {});

  log('sync manager started');
  emit();

  return { stop: stopSyncManager };
};

/** Stop the sync manager and release every listener. */
export const stopSyncManager = () => {
  if (!started) return;
  started = false;

  unsubscribers.forEach((fn) => {
    try { fn(); } catch { /* ignore */ }
  });
  unsubscribers = [];

  stopOutboxFeed();

  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    window.removeEventListener('bustrac:token-changed', handleTokenChanged);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    window.removeEventListener('bustrac:conflict-auto-resolved', handleAutoResolvedConflicts);
  }

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }

  stopPouchDBSync();
  log('sync manager stopped');};

/** Subscribe to sync state changes. Returns an unsubscribe function. */
export const onSyncManagerChange = (cb) => {
  listeners.push(cb);
  try {
    cb({ ...state });
  } catch {
    /* ignore */
  }
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
};

/** Current sync state snapshot. */
export const getSyncState = () => ({ ...state });

/**
 * Human readable label used by the status indicator.
 * @returns {'syncing'|'synced'|'offline'|'error'}
 */
export const getSyncLabel = () => {
  if (!state.isOnline) return 'offline';
  if (state.syncing || state.status === 'syncing') return 'syncing';
  if (state.status === 'error') return 'error';
  return 'synced';
};
