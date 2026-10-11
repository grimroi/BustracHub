import PouchDB from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';
import { resolveApiBaseUrl } from '../utils/apiBase';
import { getToken, clearToken } from '../utils/tokenStore';

PouchDB.plugin(PouchDBFind);

export const localDb = new PouchDB('bustrachub_db');
if (typeof localDb.setMaxListeners === 'function') {
  localDb.setMaxListeners(500);
}

// Remote replication runs exclusively through the authenticated backend
// proxy at /api/sync/:dbId. CouchDB admin credentials live only in
// server/.env and are never shipped to the browser bundle, so direct
// browser→CouchDB CORS/401 failures no longer apply.
//
// The endpoint is built with an explicit trailing slash:
//   `${API_BASE}/api/sync/${COUCH_DB_NAME}/`
// PouchDB derives the database name from the last non-empty path segment
// (see getHost() in pouchdb-browser) and normalizes the slash, so the
// resolved DB URL is stable. Keeping the slash makes the intended hierarchy
// explicit and guarantees relative sub-paths such as `_local/<checkpoint>`
// and `_changes` are resolved UNDER the db name rather than being appended
// to the bare `/api/sync` prefix (which would otherwise hit the server's
// fallback route and 404).
const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
// Direktang ilagay ang 'bustrachub_db' para sigurado at hindi kailanman maging blangko
const COUCH_DB_NAME = 'bustrachub_db';
const SYNC_ENDPOINT = `${API_BASE}/api/sync/${COUCH_DB_NAME}/`;

// sessionStorage key owned by tokenStore.js. Read directly as a secondary
// source so authFetch still resolves the token if the store module is
// momentarily out of sync during the first render.
const TOKEN_STORAGE_KEY = 'bustrac_session_token';

const readStoredToken = () => {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

// Resolve the token on EVERY request: `getToken()` (sessionStorage-backed)
// first, then a direct sessionStorage read as a fallback.
const resolveToken = () => getToken() || readStoredToken();

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wraps the browser fetch so every proxied CouchDB request carries the
// current server-issued session token. The token is resolved live on each
// request, so a login that happens after module load is picked up
// immediately. If the token is temporarily unavailable during initial page
// load (sync bootstrap can fire before the login flow persists it), wait a
// short bounded time and re-check before sending an unauthenticated request.
const authFetch = async (url, opts = {}) => {
  const headers = new Headers((opts && opts.headers) || {});
  let token = resolveToken();

  for (let attempt = 0; !token && attempt < 3; attempt += 1) {
    await delay(200 * (attempt + 1));
    token = resolveToken();
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...opts, headers });
};

export const remoteDb = new PouchDB(SYNC_ENDPOINT, {
  skip_setup: true,
  timeout: 20000,
  fetch: authFetch,
});

let activeSyncHandler = null;
let syncStatusListeners = [];
let retryTimer = null;
let retryDelay = 5000;
const MAX_RETRY_DELAY = 60000;

export const onSyncStatusChange = (cb) => {
  syncStatusListeners.push(cb);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== cb);
  };
};

const emitSync = (status, pending = 0, detail = null) => {
  syncStatusListeners.forEach((cb) => {
    try {
      cb({ status, pending, detail });
    } catch {
      /* listener errors must not break sync */
    }
  });
};

const log = (level, ...args) => {
  const fn = typeof console[level] === 'function' ? console[level] : console.log;
  fn('[sync]', ...args);
};

const hasSession = () => !!getToken();

// PouchDB errors are inconsistent (number, string, or object), so derive the
// HTTP status defensively to distinguish auth problems from network problems.
const getErrorStatus = (err) => {
  if (!err) return 0;
  if (typeof err.status === 'number') return err.status;
  if (typeof err.status === 'string') return Number(err.status) || 0;
  const message = String(err.message || err.name || err.error || '');
  const match = message.match(/(\d{3})/);
  return match ? Number(match[1]) : 0;
};

// 401 = the session token itself is invalid/expired → force re-login.
const isUnauthorized = (err) => getErrorStatus(err) === 401;

// 403 = a valid session that is not allowed to do the requested write
// (e.g. a resident doc that fails the server's ownership check). Never
// clear the token for this; just stop retrying so we do not loop.
const isForbidden = (err) => getErrorStatus(err) === 403;

const clearRetryTimer = () => {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
};

// Exponential backoff re-establishment after a transient failure. This is
// separate from PouchDB's internal `retry: true` (which handles network
// blips while the handler is alive); this covers full reconnection after a
// fatal/auth error and after going back online.
const scheduleRetry = () => {
  if (retryTimer) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!hasSession()) return;

  const delay = retryDelay;
  log('warn', `Replication failed. Retrying in ${Math.round(delay / 1000)}s...`);
  emitSync('offline', 0, 'retry-scheduled');
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
    setupPouchDBSync();
  }, delay);
};

const resetRetry = () => {
  retryDelay = 5000;
  clearRetryTimer();
};

export const stopPouchDBSync = () => {
  clearRetryTimer();
  if (activeSyncHandler) {
    try {
      activeSyncHandler.cancel();
    } catch {
      /* ignore */
    }
    activeSyncHandler = null;
  }
};

export const setupPouchDBSync = () => {
  stopPouchDBSync();

  if (!hasSession()) {
    log('warn', 'No active session token. Remote sync paused until login.');
    emitSync('offline', 0, 'no-session');
    return null;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    log('warn', 'Browser is offline. Sync deferred until reconnect.');
    emitSync('offline', 0, 'browser-offline');
    return null;
  }

  log('info', `Starting live replication with ${SYNC_ENDPOINT}`);
  activeSyncHandler = localDb.sync(remoteDb, {
    live: true,
    retry: true,
    heartbeat: 10000,
  });

  activeSyncHandler.on('change', (info) => {
    const pushPending = info.push?.pending || 0;
    const pullPending = info.pull?.pending || 0;
    log('log', 'Change detected', { pushPending, pullPending });
    emitSync('syncing', pushPending + pullPending);
  });

  activeSyncHandler.on('active', () => {
    log('log', 'Replication active — pushing/pulling changes...');
    emitSync('syncing', 0);
  });

  activeSyncHandler.on('paused', (err) => {
    if (err) {
      if (isUnauthorized(err)) {
        log('error', 'Replication rejected (401). Session expired — clearing token.');
        clearToken();
        emitSync('error', 0, 'unauthorized');
        return;
      }
      if (isForbidden(err)) {
        log('error', 'Replication rejected (403) — server denied a write for this role. Sync stopped.');
        stopPouchDBSync();
        emitSync('error', 0, 'forbidden');
        return;
      }
      log('warn', 'Replication paused with error:', err?.message || err);
      emitSync('offline', 0, getErrorStatus(err) || 'network');
    } else {
      log('log', 'Replication paused — local changes saved to CouchDB.');
      resetRetry();
      emitSync('synced', 0);
    }
  });

  activeSyncHandler.on('denied', (err) => {
    log('error', 'Document write denied by server:', err?.doc?._id || err?.message || err);
    emitSync('error', 0, 'denied');
  });

  activeSyncHandler.on('error', (err) => {
    log('error', 'Replication fatal error:', err?.message || err);
    activeSyncHandler = null;
    if (isUnauthorized(err)) {
      clearToken();
      emitSync('error', 0, 'unauthorized');
    } else if (isForbidden(err)) {
      emitSync('error', 0, 'forbidden');
    } else {
      scheduleRetry();
      emitSync('error', 0, getErrorStatus(err) || 'unknown');
    }
  });

  return activeSyncHandler;
};

// Araw-araw na pag-aabang ng online/offline state at ng pag-login/logout
// para awtomatikong mag-start o mag-stop ang sync.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    log('log', 'Network online detected. Starting sync...');
    resetRetry();
    setupPouchDBSync();
  });

  window.addEventListener('offline', () => {
    log('warn', 'Network offline. Live sync paused; changes are queued locally.');
    emitSync('offline', 0, 'browser-offline');
    stopPouchDBSync();
  });

  window.addEventListener('bustrac:token-changed', (event) => {
    if (event?.detail?.token) {
      log('log', 'Session established. Starting replication.');
      resetRetry();
      setupPouchDBSync();
    } else {
      log('warn', 'Session ended. Stopping replication.');
      stopPouchDBSync();
      emitSync('offline', 0, 'no-session');
    }
  });

  // Autostart sync kung online ang app sa pagbubukas at may token na.
  if (navigator.onLine) {
    setTimeout(() => {
      setupPouchDBSync();
    }, 1500);
  }
}

export const forceSyncToRemote = async () => {
  if (!hasSession()) {
    log('warn', 'Force sync skipped: no session token.');
    return null;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    log('warn', 'Force sync skipped: browser offline.');
    return null;
  }
  try {
    log('log', 'Force sync started');
    const syncInstance = localDb.sync(remoteDb, { live: false, retry: false });
    return await new Promise((resolve) => {
      syncInstance
        .on('complete', (info) => {
          syncInstance.removeAllListeners();
          log('log', 'Force sync complete', info);
          resolve(info);
        })
        .on('error', (err) => {
          syncInstance.removeAllListeners();
          log('error', 'Force sync failed:', err?.message || err);
          resolve(null);
        });
    });
  } catch (err) {
    log('error', 'Force sync error:', err?.message || err);
    return null;
  }
};

export const resolveDbConflicts = async () => {
  try {
    const result = await localDb.allDocs({ include_docs: true, conflicts: true });
    for (const row of result.rows) {
      if (row.doc && row.doc._conflicts && row.doc._conflicts.length > 0) {
        let currentWinner = { ...row.doc };
        for (const conflictRev of row.doc._conflicts) {
          try {
            const loserDoc = await localDb.get(row.id, { rev: conflictRev });
            const winnerTime = new Date(currentWinner.updatedAt || currentWinner.createdAt || 0).getTime();
            const loserTime = new Date(loserDoc.updatedAt || loserDoc.createdAt || 0).getTime();
            const combinedHistory = [...(currentWinner.history || []), ...(loserDoc.history || [])];
            const uniqueHistory = Array.from(
              new Map(combinedHistory.map(h => [h.timestamp || JSON.stringify(h), h])).values()
            ).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
            
            let mergedDoc;
            if (loserTime > winnerTime) {
              mergedDoc = { ...currentWinner, ...loserDoc, status: loserDoc.status || currentWinner.status, history: uniqueHistory, updatedAt: new Date(loserTime).toISOString(), synced: true, isSynced: true };
            } else {
              mergedDoc = { ...loserDoc, ...currentWinner, status: currentWinner.status || loserDoc.status, history: uniqueHistory, updatedAt: new Date(winnerTime).toISOString(), synced: true, isSynced: true };
            }
            mergedDoc._id = currentWinner._id;
            mergedDoc._rev = currentWinner._rev;
            const putRes = await localDb.put(mergedDoc);
            currentWinner._rev = putRes.rev;
            await localDb.remove(loserDoc._id, conflictRev);
          } catch (conflictErr) {
            console.warn(`Conflict resolution skip for ${row.id}:`, conflictErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed during conflict resolution:', err);
  }
};

export const initDbIndices = async () => {
  try {
    if (typeof localDb.createIndex === 'function') {
      await Promise.all([
        localDb.createIndex({ index: { fields: ['type', 'status', 'createdAt'] } }),
        localDb.createIndex({ index: { fields: ['type', 'username'] } }),
        localDb.createIndex({ index: { fields: ['type', 'residentId'] } }),
        localDb.createIndex({ index: { fields: ['type', 'timestamp'] } }),
        localDb.createIndex({ index: { fields: ['docType'] } }),
        localDb.createIndex({ index: { fields: ['type'] } }),
      ]);
      console.log('All database indices verified/created successfully.');
    }
  } catch (err) {
    console.warn('Index creation warning:', err.message);
  }
};

export const sanitizeCertificateDoc = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    type: doc.type || 'certificate_request',
    refNumber: doc.refNumber || doc._id || `CERT-${Date.now().toString(36).toUpperCase().slice(-6)}`,
    residentId: doc.residentId || '',
    residentName: doc.residentName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
    username: doc.username || '',
    firstName: doc.firstName || '',
    lastName: doc.lastName || '',
    purok: doc.purok || '',
    contact: doc.contact || '',
    certType: doc.certType || doc.certificateType || 'Barangay Clearance',
    certPurpose: doc.certPurpose || doc.purpose || '',
    status: doc.status || 'Pending',
    step: doc.step || 1,
    issuanceMeta: doc.issuanceMeta || { orNumber: doc.orNumber || '', amountPaid: doc.amountPaid || '', dateIssued: doc.dateIssued || '', remarks: doc.remarks || 'No Derogatory Record', validity: '6 months' },
    timestamp: doc.timestamp || new Date().toISOString(),
    updatedAt: doc.updatedAt || new Date().toISOString()
  };
};

export const saveCertificateRequest = async (rawDoc) => {
  try {
    const cleanDoc = sanitizeCertificateDoc(rawDoc);
    const response = await localDb.put(cleanDoc);
    return response;
  } catch (err) {
    console.error('Error saving certificate request:', err);
    throw err;
  }
};

const certificateDocSignature = (doc) => JSON.stringify({
  refNumber: doc.refNumber, residentId: doc.residentId, residentName: doc.residentName,
  username: doc.username, firstName: doc.firstName, lastName: doc.lastName,
  purok: doc.purok, contact: doc.contact, certType: doc.certType,
  certPurpose: doc.certPurpose, status: doc.status, step: doc.step,
  timestamp: doc.timestamp, updatedAt: doc.updatedAt
});

export const migrateExistingCertificates = async () => {
  try {
    const result = await localDb.find({ selector: { type: 'certificate_request' } });
    if (result.docs.length ===0) return;
    const toWrite = [];
    for (const doc of result.docs) {
      const cleaned = sanitizeCertificateDoc(doc);
      if (certificateDocSignature(doc) !== certificateDocSignature(cleaned)) {
        toWrite.push(cleaned);
      }
    }
    if (toWrite.length === 0) {
      console.log('Certificate documents are already clean — no migration required.');
      return;
    }
    const writeRes = await localDb.bulkDocs(toWrite);
    const okCount = writeRes.filter((r) => r.ok).length;
    console.log(`Successfully sanitized ${okCount}/${toWrite.length} certificate documents in DB!`);
  } catch (err) {
    console.warn('Migration warning:', err.message);
  }
};

initDbIndices()
  .then(() => migrateExistingCertificates())
  .catch((err) => console.error('Error during DB init/migration:', err));