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
const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const COUCH_DB_NAME = import.meta.env.VITE_COUCHDB_DB || 'bustrachub_db';
const SYNC_ENDPOINT = `${API_BASE}/api/sync/${COUCH_DB_NAME}`;

// Marker to prove the browser is running the latest sync bundle. Purely
// diagnostic — it does not affect replication behavior.
const SYNC_FILTER_PATCH = 'owner-filter-event-registration-2026-10-12';
console.log(`[bustrac-sync] frontend patch loaded: ${SYNC_FILTER_PATCH}`);

// Wraps the browser fetch so every proxied CouchDB request carries the
// current server-issued session token (read live on each request, so a
// login that happens after module load is picked up immediately).
const authFetch = (url, opts = {}) => {
  const headers = new Headers((opts && opts.headers) || {});
  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Authentication is via the Authorization: Bearer header, NOT cookies, so
  // force credentials mode to 'omit'. This avoids the browser rule that
  // forbids a wildcard Access-Control-Allow-Origin when credentials mode is
  // 'include'. The Authorization header injection above is preserved.
  return fetch(url, { ...opts, headers, credentials: 'omit' });
};

export const remoteDb = new PouchDB(SYNC_ENDPOINT, {
  skip_setup: true,
  timeout: 20000,
  fetch: authFetch,
});

let activeSyncHandler = null;
// Token the current activeSyncHandler was started for. Used to make
// setupPouchDBSync idempotent: a call that arrives while a live handler is
// already alive for the SAME session reuses it instead of spinning up a
// duplicate/conflicting replication (and leaking listeners).
let syncSessionToken = null;
let syncStatusListeners = [];
let retryTimer = null;
let retryDelay = 5000;
const MAX_RETRY_DELAY = 60000;
// Guards against stacking overlapping one-shot "Sync Now" replications.
let forceSyncInFlight = null;

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

// Role of the currently logged-in user, read from the same storage keys used
// by LogIn.jsx / ProtectedRoute.jsx / auditLog.js. Kept dependency-free so
// this low-level module does not import from utils (and risk a cycle).
const getCurrentRole = () => {
  try {
    const raw = sessionStorage.getItem('bustrac_user') || localStorage.getItem('bustrac_user');
    if (raw) {
      const user = JSON.parse(raw);
      if (user && user.role) return String(user.role).toLowerCase();
    }
  } catch {
    /* ignore malformed storage */
  }
  try {
    return String(localStorage.getItem('bustrac_role') || '').toLowerCase();
  } catch {
    return '';
  }
};

// Identified user (username + residentId + role) read from the same storage
// keys used by LogIn.jsx / ProtectedRoute.jsx / auditLog.js. Kept
// dependency-free so this low-level module does not import from utils.
const getCurrentUser = () => {
  const empty = { username: '', residentId: '', role: getCurrentRole() };
  try {
    const raw = sessionStorage.getItem('bustrac_user') || localStorage.getItem('bustrac_user');
    if (!raw) return empty; // ← guard: no user logged in yet
    const user = JSON.parse(raw);
    if (!user || typeof user !== 'object') return empty; // ← guard: malformed
    return {
      username: String(user.username || user.email || '').toLowerCase().trim(),
      residentId: String(user.residentId || '').trim(),
      role: String(user.role || '').toLowerCase().trim() || getCurrentRole(),
    };
  } catch {
    return empty;
  }
};

// Only admin/staff may persist audit docs through the sync proxy. Residents
// generate audit entries as `_local/` docs (see utils/auditLog.js); a legacy
// non-`_local/` resident audit doc — or its deletion tombstone — must be kept
// OUT of the push, otherwise the server rejects the whole _bulk_docs batch
// with 403 "type not allowed".
const isAuditDoc = (doc) =>
  !!doc &&
  (String(doc._id || '').startsWith('audit_') ||
    doc.type === 'audit_log' ||
    doc.docType === 'audit_log');

const isOfflineAuthDoc = (doc) =>
  !!doc && (doc.type === 'offline_auth' || doc.docType === 'offline_auth');

// Resident-writable document types. A resident may only replicate docs they
// actually OWN (matched by username OR residentId) — see residentDocOwnedBy.
const RESIDENT_OWNED_WRITE_TYPES = new Set([
  'certificate_request',
  'feedback_report',
  'feedback',
  'blotter_record',
  // Event sign-up + self-cancel of the resident's OWN registration only. The
  // server additionally pins the status to Pending/Cancelled and blocks any
  // approval/attendance provenance (see server RESIDENT_EVENT_ALLOWED_STATUS).
  'event_registration',
  // Own profile only (the server also restricts these to the resident's doc).
  'resident',
  'resident_profile',
  'profile',
  // Health records — residents can write their own health data (immunization,
  // prenatal logs, medicine received) but only for themselves/their children.
  'health_record',
]);

// Public/read-only barangay content the resident must still be able to PULL
// for read-only views. Residents never write these. Kept in sync with the
// types read by ResidentUI (announcement, aid_distribution, advisory/activity
// via public pages, plus common aliases).
const RESIDENT_PUBLIC_READ_TYPES = new Set([
  'announcement', 'announcements',
  'advisory', 'advisories',
  'activity', 'activities',
  'hotline', 'hotlines',
  'settings', 'barangay_info',
  'news',
  'aid_distribution',
  // Public barangay events — read-only for residents (they register via the
  // owned, write-allowlisted 'event_registration' type above).
  'barangay_event',
  // BHS inventory — residents can view medicine availability (read-only)
  'bhs_inventory',
]);

const SYSTEM_PREFIXES = ['announcement_seed_', 'user_', 'settings', 'hotline', 'announcement_'];
const isSystemDoc = (id) => SYSTEM_PREFIXES.some(p => id.startsWith(p));
// Local-only account/cache docs a resident must NEVER push. The server rejects
// these with 403 and, since push is a bulk request, one bad doc fails the
// entire batch. Checked by both type and `_id` prefix.
const isResidentExcludedDoc = (doc) => {
  const id = String(doc._id || '');
  if (id.startsWith('user_')) return true;
  const t = String(doc.type || '');
  return (
    t === 'user' || t === 'user_profile' ||
    // NOTE: 'event_registration' is intentionally NOT excluded here — it is a
    // resident-owned, write-allowlisted type (see RESIDENT_OWNED_WRITE_TYPES).
    t === 'account' || t === 'session'
  );
};

const residentDocOwnedBy = (doc, user) => {
  const u = String(doc.username || '').toLowerCase().trim();
  const r = String(doc.residentId || '').trim();
  return (Boolean(u) && Boolean(user.username) && u === user.username) ||
    (Boolean(r) && Boolean(user.residentId) && r === user.residentId);
};

// Log a filter exclusion at most once per document type (safe metadata only).
const excludedFilterLog = new Set();
const logExcludedOnce = (doc) => {
  try {
    const type = String(doc.type || doc.docType || 'unknown');
    if (excludedFilterLog.has(type)) return;
    excludedFilterLog.add(type);
    console.log(
      `[sync-filter] Excluded non-replicable resident local doc: ${String(doc._id || '')} (${type})`
    );
  } catch {
    /* logging must never break sync */
  }
};

// Replication filter (applied to push AND pull). `_local/` and `_design/` docs
// never replicate. For admin/staff, legacy audit docs are allowed and
// everything else passes (unchanged behavior).
//
// For RESIDENTS the filter is conservative and owner-aware so a local doc the
// server would reject can never fail the bulk push:
//   - exclude account/cache docs (`user_*`, account, session, …)
//   - owned writable types only when owned by the current resident
//     (includes event_registration — self-registration/cancel only)
//   - allow known public read-only content (so pull still works)
//   - default-DENY unknown types (prevents accidental 403)
const makeReplicationFilter = () => {
  // Read identity lazily. `setToken()` (which triggers sync) is called just
  // BEFORE `bustrac_user` is written during login, so a setup-time read can
  // see an unknown role. Re-reading until the role is known keeps the resident
  // rules active for the very first push; once known, the value is cached.
  let user = getCurrentUser();

  return (doc) => {
    if (!doc || typeof doc !== 'object') return true;
    const id = String(doc._id || '');
    if (!id) return true;

    // Local-only + design docs never leave/enter this device.
    if (id.startsWith('_local/')) return false;
    if (id.startsWith('_design/')) return false;

    // Identity may not be in storage yet on the very first push (see above).
    if (!user.role) {
      user = getCurrentUser();
    }

    const role = user.role;
    const privileged = role === 'admin' || role === 'staff';
    const isResident = role === 'resident' && !privileged;

    if (isAuditDoc(doc)) return privileged;
    if (isOfflineAuthDoc(doc)) return false;

    if (!isResident) return true;

    // ── Resident-only conservative rules ──
    if (isResidentExcludedDoc(doc)) {
      logExcludedOnce(doc);
      return false;
    }

    const type = String(doc.type || doc.docType || '');

    if (RESIDENT_OWNED_WRITE_TYPES.has(type)) {
      if (residentDocOwnedBy(doc, user)) return true;
      logExcludedOnce(doc);
      return false;
    }

    if (RESIDENT_PUBLIC_READ_TYPES.has(type)) return true;

    // Unknown type → default-deny (avoids a 403 that would kill the push).
    logExcludedOnce(doc);
    return false;
  };
};

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

const isAuthError = (err) => {
  const status = getErrorStatus(err);
  // Only 401 means the session token is invalid/expired. A 403 means the user
  // IS authenticated but not permitted to write/read that document, which must
  // NOT log them out.
  return status === 401;
};

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
const scheduleRetry = (detail = 'retry-scheduled') => {
  if (retryTimer) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!hasSession()) return;

  const delay = retryDelay;
  log('warn', `Replication failed. Retrying in ${Math.round(delay / 1000)}s...`);
  // Show the red "retrying" state (not offline) — the browser `offline`
  // event is what drives the orange "Offline • Queued" state.
  emitSync('error', 0, detail);
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
  syncSessionToken = null;
  if (activeSyncHandler) {
    try {
      // Detach listeners first so repeated online/offline toggles (or a
      // token change) cannot accumulate handlers on dead sync instances.
      if (typeof activeSyncHandler.removeAllListeners === 'function') {
        activeSyncHandler.removeAllListeners();
      }
      activeSyncHandler.cancel();
    } catch {
      /* ignore */
    }
    activeSyncHandler = null;
  }
};

// Best-effort cleanup of legacy LOCAL docs that must never replicate for the
// current user. Idempotent and safe to run on every boot / after every login.
//
// IMPORTANT: `user_<username>` docs are deliberately NOT purged — they are the
// REAL account documents (created via AddUserModal / EditUserModal /
// DashboardPortal) that must sync to CouchDB, not disposable caches. Deleting
// them would break user management and produce a tombstone the server rejects
// with 403. Only resident audit docs and offline_auth cache docs are removed.
export const purgeLegacyReplicableLocalDocs = async () => {
  try {
    const role = getCurrentRole();
    const purgeAudits = role === 'resident';

    const all = await localDb.allDocs({ include_docs: true });
    const toDelete = [];

    for (const row of all.rows) {
      const doc = row.doc;
      if (!doc || !doc._id) continue;
      if (doc._id.startsWith('_local/') || doc._id.startsWith('_design/')) continue;

      const shouldPurge = (purgeAudits && isAuditDoc(doc)) || isOfflineAuthDoc(doc);
      if (!shouldPurge) continue;

      toDelete.push({ _id: doc._id, _rev: doc._rev, _deleted: true });
    }

    if (toDelete.length === 0) return 0;

    await localDb.bulkDocs(toDelete);
    // Safe metadata only — never log document bodies, hashes, or tokens.
    console.log(
      `[migration] Removed ${toDelete.length} legacy replicable local docs: audit/offline_auth cache.`
    );
    return toDelete.length;
  } catch (err) {
    // Never block login/sync if cleanup fails (e.g. offline, locked DB).
    console.warn('[migration] Legacy local doc cleanup skipped:', err?.message || err);
    return 0;
  }
};

const startLiveSync = () => {
  // Only one live handler at a time: detach + cancel any previous instance.
  stopPouchDBSync();

  const token = getToken();
  syncSessionToken = token;

  // Clean up legacy non-replicable local docs BEFORE the first push. The
  // replication filter below already guards against them, so this is
  // best-effort and must never block replication.
  purgeLegacyReplicableLocalDocs().catch(() => {});

  log('info', `Starting live replication with ${SYNC_ENDPOINT}`);
  activeSyncHandler = localDb.sync(remoteDb, {
    live: true,
    retry: true,
    heartbeat: 10000,
    // Keep `_local/` docs, client cache docs and legacy resident audit docs
    // out of the push/pull so they can never fail the server-side
    // ownership check (403).
    filter: makeReplicationFilter(),
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
      const status = getErrorStatus(err);

      if (status === 401) {
        log('error', 'Authentication failed (401). Forcing logout...');
        stopPouchDBSync();
        clearToken();
        window.dispatchEvent(new Event('auth:logout-required'));
        return; // Exit early, do not retry
      }

      if (status === 403) {
        // Authenticated but not permitted to sync a document. The session is
        // still valid, so keep it — do NOT clear the token or log out.
        log('warn', 'Permission denied syncing some local changes. Session kept; retrying automatically.');
        emitSync('error', 0, 'forbidden');
        scheduleRetry('forbidden');
        return;
      }

      log('warn', 'Replication paused with error:', err?.message || err);
      emitSync('offline', 0, status || 'network');
    } else {
      log('log', 'Replication paused — local changes saved.');
      resetRetry();
      emitSync('synced', 0);
      // Replication is idle with no error — safe point to clean up conflicts.
      resolveDbConflicts().catch(() => {});
    }
  });

  activeSyncHandler.on('denied', (err) => {
    log('error', 'Document write denied by server:', err?.doc?._id || err?.message || err);
    emitSync('error', 0, 'denied');
  });

  activeSyncHandler.on('error', (err) => {
    log('error', 'Replication fatal error:', err?.message || err);
    activeSyncHandler = null;
    const status = getErrorStatus(err);
    if (isAuthError(err)) {
      // 401 — the session token is invalid/expired. Clear it and send the
      // user back to login. No retry: a fresh token is required.
      log('error', `Authentication failed (${status}). Clearing session.`);
      clearToken();
      emitSync('error', 0, 'unauthorized');
      window.dispatchEvent(new Event('auth:logout-required'));
    } else if (status === 403) {
      // Authenticated but not permitted — keep the session alive and keep
      // retrying automatically (permission may be granted later). Never
      // clear the token or log out on a 403.
      log('warn', 'Permission denied syncing some local changes. Session kept; retrying automatically.');
      emitSync('error', 0, 'forbidden');
      scheduleRetry('forbidden');
    } else {
      // Network blip, server restart, 5xx, timeout, etc. Keep the session
      // and automatically restart live sync with exponential backoff.
      emitSync('error', 0, status || 'network');
      scheduleRetry('network');
    }
  });

  return activeSyncHandler;
};

// Idempotent, self-healing entry point. Safe to call on login, on
// `bustrac:token-changed`, on the browser `online` event, on initial page
// load, and from the backoff timer. It will NOT create a second handler when
// one is already running for the current session.
export const setupPouchDBSync = () => {
  if (!hasSession()) {
    // No valid server session — make sure no stale replication lingers.
    stopPouchDBSync();
    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[offline-first] Sync paused until login - local PouchDB active');
    }
    emitSync('offline', 0, 'no-session');
    return null;
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    clearRetryTimer();
    stopPouchDBSync();
    log('warn', 'Browser is offline. Sync deferred until reconnect.');
    emitSync('offline', 0, 'browser-offline');
    return null;
  }

  // Reuse the already-running handler for this exact session so repeated
  // online/offline toggles and page mounts cannot spawn duplicate syncs.
  const token = getToken();
  if (activeSyncHandler && syncSessionToken === token) {
    log('log', 'Live replication already running for this session. Reusing handler.');
    return activeSyncHandler;
  }

  return startLiveSync();
};

// Araw-araw na pag-aabang ng online/offline state at ng pag-login/logout
// para awtomatikong mag-start o mag-stop ang sync.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    log('log', 'Network online detected. Checking for session...');
    resetRetry();
    // HINTAYIN MUNA KUNG MAY TOKEN BAGO MAG-START
    if (hasSession()) {
      setupPouchDBSync();
    } else {
      log('warn', 'Online but no session token yet. Waiting for login.');
    }
  });

  window.addEventListener('offline', () => {
    log('warn', 'Network offline. Live sync paused; changes are queued locally.');
    emitSync('offline', 0, 'browser-offline');
    stopPouchDBSync();
  });

  window.addEventListener('bustrac:token-changed', (event) => {
    const token = event?.detail?.token;
    
    if (token) {
      log('log', '✅ Session established. Starting replication immediately.');
      resetRetry();
      setupPouchDBSync();
    } else {
      log('warn', '❌ Session ended/cleared. Stopping replication.');
      stopPouchDBSync();
      emitSync('offline', 0, 'no-session');
    }
  });

  // INITIAL CHECK ON LOAD:
  // Kung may existing token na (hal. from previous session in same tab), simulan agad.
  // Kung wala, huwag mag-start hangga't hindi nag-login.
  if (navigator.onLine && hasSession()) {
    log('log', 'Initial load: Found existing session. Starting sync.');
    setupPouchDBSync();
  } else if (navigator.onLine) {
    log('info', 'Initial load: No session found. Sync will start after login.');
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
  // Optional manual retry only. Normal operation is handled automatically by
  // the live replication, so overlapping "Sync Now" clicks are coalesced
  // rather than spawning multiple simultaneous one-shot replications.
  if (forceSyncInFlight) {
    log('log', 'Force sync already in progress; joining the running sync.');
    return forceSyncInFlight;
  }
  try {
    log('log', 'Force sync started');
    const syncInstance = localDb.sync(remoteDb, {
      live: false,
      retry: false,
      filter: makeReplicationFilter(),
    });
    forceSyncInFlight = new Promise((resolve) => {
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
    return await forceSyncInFlight;
  } catch (err) {
    log('error', 'Force sync error:', err?.message || err);
    return null;
  } finally {
    forceSyncInFlight = null;
  }
};

export const resolveDbConflicts = async () => {
  try {
    const result = await localDb.allDocs({ include_docs: true, conflicts: true });
    for (const row of result.rows) {
      if (row.doc && row.doc._conflicts && row.doc._conflicts.length > 0) {
        if (isSystemDoc(row.id)) {
          for (const rev of row.doc._conflicts) {
            try { await localDb.remove(row.id, rev); } catch { /* ignore */ }
          }
          continue; // wag na i-merge, tapos na
        }

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
        // BHS module indexes
        localDb.createIndex({ index: { fields: ['type', 'residentId', 'recordType'] } }),
        localDb.createIndex({ index: { fields: ['type', 'residentId', 'dateAdministered'] } }),
        localDb.createIndex({ index: { fields: ['type', 'category', 'stockLevel'] } }),
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

// Expose a manual trigger for testing/ops (safe: idempotent, no secrets).
if (typeof window !== 'undefined') {
  window.resolveDbConflicts = resolveDbConflicts; 
  window.localDb = localDb;
  window.purgeLegacyLocalDocs = purgeLegacyReplicableLocalDocs;
  window.__BUSTRAC_SYNC_PATCH__ = SYNC_FILTER_PATCH;

  // Safe debug helper: list the local docs that replication would consider,
  // with metadata only (never bodies, narratives, contacts, hashes, tokens).
  window.inspectLocalSyncQueue = async () => {
    try {
      const res = await localDb.allDocs({ include_docs: true });
      const rows = res.rows
        .map((r) => r.doc)
        .filter((doc) => doc && doc._id && !String(doc._id).startsWith('_local/'))
        .map((doc) => ({
          _id: doc._id,
          type: doc.type || '',
          docType: doc.docType || '',
          username: doc.username || '',
          residentId: doc.residentId || '',
          deleted: doc._deleted === true,
        }));
      if (typeof console.table === 'function') {
        console.table(rows);
      } else {
        console.log('[sync-inspect] local docs:', rows);
      }
      return rows;
    } catch (err) {
      console.warn('[sync-inspect] Failed to inspect local queue:', err?.message || err);
      return [];
    }
  };
}

initDbIndices()
  .then(() => migrateExistingCertificates())
  .then(() => purgeLegacyReplicableLocalDocs())
  .then(() => resolveDbConflicts())
  .catch((err) => console.error('Error during DB init/migration:', err));