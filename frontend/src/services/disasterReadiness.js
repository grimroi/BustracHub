// src/services/disasterReadiness.js
//
// READ-ONLY disaster-readiness assessment.
//
// PURPOSE
//   Answer one operational question: "is this device prepared to keep working
//   when the typhoon, the power cut or the loss of internet takes it
//   offline?" — and show the answer to staff BEFORE a calamity, not after.
//
// WHAT THIS IS NOT
//   This module changes nothing. It does not touch synchronisation,
//   replication, PouchDB, authentication or any offline-first behaviour. It
//   only READS state that already exists and reports it. It is a status
//   display and a checklist, not an offline-sync mechanism.
//
// DESIGN
//   `assessDisasterReadiness()` is pure: it takes already-collected values
//   and returns the assessment. `collectDisasterReadinessChecks()` gathers
//   those values from the browser, with every dependency injectable so the
//   whole thing is unit-testable without a browser.

/** A check that is not met blocks the "ready" verdict. */
export const CRITICAL_CHECK_IDS = ['offline_auth_cached', 'service_worker_active', 'local_db_healthy'];

/** How recent the last successful sync must be. */
export const RECENT_SYNC_HOURS = 24;

/** Minimum free device storage considered adequate. */
export const MIN_FREE_STORAGE_BYTES = 50 * 1024 * 1024;

/** Minimum battery percentage considered adequate. */
export const MIN_BATTERY_PERCENT = 20;

/**
 * The checks, their weights and the copy shown for each.
 * Critical checks carry 25 points each; the rest carry 5. The total (95) is
 * normalised to 100 when computing the score.
 */
export const READINESS_CHECKS = [
  {
    id: 'offline_auth_cached',
    label: 'Offline credential cached',
    critical: true,
    weight: 25,
    passDetail: 'This device can authenticate while the server is unreachable.',
    failDetail: 'No offline credential is cached. Log in online on this device before the typhoon.',
  },
  {
    id: 'service_worker_active',
    label: 'Service worker active',
    critical: true,
    weight: 25,
    passDetail: 'The application shell is served from the local cache and opens without a network.',
    failDetail: 'No service worker is controlling this page, so the app may not open offline.',
  },
  {
    id: 'local_db_healthy',
    label: 'Local database healthy',
    critical: true,
    weight: 25,
    passDetail: 'The local PouchDB database responded.',
    failDetail: 'The local database did not respond, so local records may be unavailable.',
  },
  {
    id: 'recent_sync',
    label: 'Synced within 24 hours',
    critical: false,
    weight: 5,
    passDetail: 'The last successful sync is within the last 24 hours.',
    failDetail: 'No successful sync in the last 24 hours — sync now so the server holds the latest records.',
  },
  {
    id: 'no_pending_changes',
    label: 'No pending unsynced changes',
    critical: false,
    weight: 5,
    passDetail: 'Every local change has been replicated.',
    failDetail: 'Local changes are still queued. They exist only on this device until it syncs.',
  },
  {
    id: 'storage_available',
    label: 'Sufficient device storage',
    critical: false,
    weight: 5,
    passDetail: 'At least 50 MB of device storage is free for offline records.',
    failDetail: 'Less than 50 MB of device storage is free — offline records may fail to save.',
  },
  {
    id: 'battery_ok',
    label: 'Battery level adequate',
    critical: false,
    weight: 5,
    passDetail: 'Battery is above 20%, or the device does not report its battery.',
    failDetail: 'Battery is at 20% or below. Charge the device before it is needed offline.',
  },
];

const CHECK_BY_ID = Object.fromEntries(READINESS_CHECKS.map((c) => [c.id, c]));

const normalizeValue = (value) => {
  if (value && typeof value === 'object') {
    return {
      passed: value.passed === true,
      detail: typeof value.detail === 'string' && value.detail.length ? value.detail : undefined,
    };
  }
  return { passed: value === true, detail: undefined };
};

/**
 * Turn collected check values into a readiness assessment.
 *
 * @param {object} params
 * @param {Record<string, boolean|{passed?:boolean, detail?:string}>} params.checks
 * @returns {{ready:boolean, score:number, checks:Array, recommendation:string}}
 */
export const assessDisasterReadiness = ({ checks = {} } = {}) => {
  const results = READINESS_CHECKS.map((definition) => {
    const normalized = normalizeValue(checks[definition.id]);
    return {
      id: definition.id,
      label: definition.label,
      critical: definition.critical,
      weight: definition.weight,
      passed: normalized.passed,
      detail: normalized.detail || (normalized.passed ? definition.passDetail : definition.failDetail),
    };
  });

  const totalWeight = results.reduce((sum, check) => sum + check.weight, 0);
  const earnedWeight = results.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  const failed = results.filter((check) => !check.passed);
  // Critical first, so the recommendation leads with what actually blocks
  // deployment.
  failed.sort((a, b) => Number(b.critical) - Number(a.critical));

  // "Ready" means every CRITICAL check passed. A non-critical failure (a low
  // battery, a stale sync) lowers the score and is named in the
  // recommendation, but does not block deployment.
  const ready = failed.every((check) => !check.critical);

  const recommendation =
    failed.length === 0
      ? 'Ready for deployment'
      : `Needs attention: ${failed.map((check) => check.label).join(', ')}`;

  return { ready, score, checks: results, recommendation };
};

/**
 * Read the Battery Status API.
 *
 * Never throws: an unavailable or failing API resolves to a clean
 * "not supported" result.
 *
 * @returns {Promise<{level:number|null, charging:boolean|null, supported:boolean}>}
 */
export const getBatteryStatus = async () => {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.getBattery !== 'function') {
      return { level: null, charging: null, supported: false };
    }
    const battery = await navigator.getBattery();
    if (!battery) {
      return { level: null, charging: null, supported: false };
    }
    return {
      level: typeof battery.level === 'number' ? Math.round(battery.level * 100) : null,
      charging: typeof battery.charging === 'boolean' ? battery.charging : null,
      supported: true,
    };
  } catch {
    return { level: null, charging: null, supported: false };
  }
};

// ─────────────────────────────────────────────
// Collection (the caller-facing half)
// ─────────────────────────────────────────────

const defaultHasOfflineAuthCache = () => {
  try {
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem('bustrac_offline_auth');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return !!parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
  } catch {
    return false;
  }
};

const defaultGetServiceWorkerController = () => {
  try {
    if (typeof navigator === 'undefined') return null;
    return navigator.serviceWorker?.controller || null;
  } catch {
    return null;
  }
};

const defaultGetLastSyncedAt = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('bustrac_last_synced') || null;
  } catch {
    return null;
  }
};

const defaultEstimateStorage = async () => {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
};

/**
 * Gather the check values from the running application.
 *
 * Every dependency is injectable so the collection can be exercised without a
 * browser. Nothing here mutates any state.
 *
 * @param {object} [options]
 * @returns {Promise<Record<string, {passed:boolean, detail:string}>>}
 */
export const collectDisasterReadinessChecks = async ({
  db = null,
  getPendingCount = null,
  getLastSyncedAt = null,
  hasOfflineAuthCache = null,
  getServiceWorkerController = null,
  estimateStorage = null,
  battery = null,
  now = Date.now(),
} = {}) => {
  const collected = {};

  // 1. offline_auth_cached
  try {
    const present = hasOfflineAuthCache
      ? !!hasOfflineAuthCache()
      : defaultHasOfflineAuthCache();
    collected.offline_auth_cached = {
      passed: present,
      detail: present
        ? CHECK_BY_ID.offline_auth_cached.passDetail
        : CHECK_BY_ID.offline_auth_cached.failDetail,
    };
  } catch {
    collected.offline_auth_cached = { passed: false, detail: CHECK_BY_ID.offline_auth_cached.failDetail };
  }

  // 2. service_worker_active
  try {
    const controller = getServiceWorkerController
      ? getServiceWorkerController()
      : defaultGetServiceWorkerController();
    collected.service_worker_active = {
      passed: !!controller,
      detail: controller
        ? CHECK_BY_ID.service_worker_active.passDetail
        : CHECK_BY_ID.service_worker_active.failDetail,
    };
  } catch {
    collected.service_worker_active = { passed: false, detail: CHECK_BY_ID.service_worker_active.failDetail };
  }

  // 3. recent_sync
  try {
    const lastSynced = getLastSyncedAt ? getLastSyncedAt() : defaultGetLastSyncedAt();
    if (!lastSynced) {
      collected.recent_sync = {
        passed: false,
        detail: 'This device has never reported a successful sync. Sync now before the typhoon.',
      };
    } else {
      const syncedAt = new Date(lastSynced).getTime();
      const ageHours = Number.isFinite(syncedAt) ? (now - syncedAt) / (60 * 60 * 1000) : Infinity;
      const fresh = ageHours <= RECENT_SYNC_HOURS;
      collected.recent_sync = {
        passed: fresh,
        detail: fresh
          ? `Last successful sync ${Math.max(0, Math.round(ageHours))}h ago.`
          : `Last successful sync was ${Math.round(ageHours)}h ago — sync now so the server holds the latest records.`,
      };
    }
  } catch {
    collected.recent_sync = { passed: false, detail: CHECK_BY_ID.recent_sync.failDetail };
  }

  // 4. no_pending_changes
  try {
    const pending = getPendingCount ? Number(await getPendingCount()) || 0 : 0;
    collected.no_pending_changes = {
      passed: pending === 0,
      detail:
        pending === 0
          ? CHECK_BY_ID.no_pending_changes.passDetail
          : `${pending} local change${pending === 1 ? '' : 's'} are still queued on this device.`,
    };
  } catch {
    collected.no_pending_changes = { passed: false, detail: CHECK_BY_ID.no_pending_changes.failDetail };
  }

  // 5. storage_available
  try {
    const estimate = estimateStorage ? await estimateStorage() : await defaultEstimateStorage();
    if (!estimate || !Number.isFinite(estimate.quota) || !Number.isFinite(estimate.usage)) {
      collected.storage_available = {
        passed: false,
        detail: 'The browser did not report its storage usage.',
      };
    } else {
      const free = estimate.quota - estimate.usage;
      const enough = free >= MIN_FREE_STORAGE_BYTES;
      collected.storage_available = {
        passed: enough,
        detail: enough
          ? `${formatBytes(free)} of device storage is free.`
          : `Only ${formatBytes(free)} of device storage is free — offline records may fail to save.`,
      };
    }
  } catch {
    collected.storage_available = { passed: false, detail: CHECK_BY_ID.storage_available.failDetail };
  }

  // 6. battery_ok — an unavailable battery API is not a failure.
  try {
    const status = battery || { level: null, charging: null, supported: false };
    if (!status.supported || status.level === null || status.level === undefined) {
      collected.battery_ok = {
        passed: true,
        detail: 'This device does not report its battery level.',
      };
    } else {
      const ok = status.level >= MIN_BATTERY_PERCENT;
      collected.battery_ok = {
        passed: ok,
        detail: ok
          ? `Battery is at ${status.level}%.`
          : `Battery is at ${status.level}% — charge the device before it is needed offline.`,
      };
    }
  } catch {
    collected.battery_ok = { passed: true, detail: 'This device does not report its battery level.' };
  }

  // 7. local_db_healthy
  try {
    if (!db || typeof db.info !== 'function') {
      collected.local_db_healthy = { passed: false, detail: CHECK_BY_ID.local_db_healthy.failDetail };
    } else {
      const info = await db.info();
      collected.local_db_healthy = {
        passed: !!info,
        detail: info
          ? `The local database responded (${info.doc_count ?? '?'} documents).`
          : CHECK_BY_ID.local_db_healthy.failDetail,
      };
    }
  } catch {
    collected.local_db_healthy = { passed: false, detail: CHECK_BY_ID.local_db_healthy.failDetail };
  }

  return collected;
};
