// src/services/deviceRegistry.js
//
// Device awareness — the first line of defence against "the tablet was stolen
// / formatted before it synced".
//
// Every device gets a stable id on first load. Each device continuously
// publishes a small heartbeat document so an admin can see, from any other
// device, which tablets exist, when they last synced and how many changes they
// still had queued.
//
// Two kinds of state are kept:
//   * `_local/bustrac_heartbeat`  — this device's own last known state. It is
//     written on every heartbeat and is NEVER replicated.
//   * `device_status_<deviceId>`  — a replicated document, one per device. Each
//     device only ever writes its OWN document, so these never conflict.

import { localDb } from './db';
import { apiFetch } from '../utils/api';

const DEVICE_ID_KEY = 'bustrac_device_id';
const DEVICE_LABEL_KEY = 'bustrac_device_label';
const LOCAL_HEARTBEAT_ID = '_local/bustrac_heartbeat';
const DEVICE_STATUS_PREFIX = 'device_status_';

// Key under which the time of the last local snapshot is stored. It is
// reported to the server with every heartbeat so the `device_registry`
// document records when this device last produced a backup.
export const LAST_SNAPSHOT_KEY = 'bustrac_last_snapshot_at';

// Heartbeats are throttled so a busy device does not flood the shared
// database with status documents.
const HEARTBEAT_THROTTLE_MS = 60 * 1000;

// How long a device may stay silent before it is considered "possibly lost".
const STALE_DEVICE_MS = 24 * 60 * 60 * 1000;

const randomId = () => {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${rand}`;
};

/** Stable per-device id, generated on first load. */
export const getDeviceId = () => {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev_${randomId()}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev_${randomId()}`;
  }
};

/** A human friendly label for this device (browser + platform). */
export const getDefaultDeviceLabel = () => {
  try {
    const ua = navigator.userAgent || '';
    const browser =
      /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari'
      : /Firefox\//.test(ua) ? 'Firefox'
      : 'Browser';
    const platform = /Windows/i.test(ua) ? 'Windows'
      : /Android/i.test(ua) ? 'Android'
      : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Mac OS/i.test(ua) ? 'macOS'
      : /Linux/i.test(ua) ? 'Linux'
      : 'Unknown device';
    return `${browser} on ${platform}`;
  } catch {
    return 'Unknown device';
  }
};

/** The user-settable name of this device. */
export const getDeviceLabel = () => {
  try {
    return localStorage.getItem(DEVICE_LABEL_KEY) || getDefaultDeviceLabel();
  } catch {
    return getDefaultDeviceLabel();
  }
};

export const setDeviceLabel = (label) => {
  try {
    const value = String(label || '').trim();
    if (value) localStorage.setItem(DEVICE_LABEL_KEY, value);
    else localStorage.removeItem(DEVICE_LABEL_KEY);
    return value || getDefaultDeviceLabel();
  } catch {
    return getDefaultDeviceLabel();
  }
};

const getCurrentUsername = () => {
  try {
    const raw = sessionStorage.getItem('bustrac_user') || localStorage.getItem('bustrac_user');
    if (!raw) return '';
    const user = JSON.parse(raw);
    return String(user?.username || user?.email || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

// ─────────────────────────────────────────────
// LAST SNAPSHOT TIME
// ─────────────────────────────────────────────

/** ISO timestamp of the last local snapshot written by this device (or null). */
export const getLastSnapshotAt = () => {
  try {
    return localStorage.getItem(LAST_SNAPSHOT_KEY) || null;
  } catch {
    return null;
  }
};

/**
 * Record the time of the last snapshot. The value is reported to the server
 * with the next device heartbeat, so the `device_registry` document records
 * when this device last produced a snapshot.
 */
export const setLastSnapshotAt = (timestamp) => {
  const value = timestamp || new Date().toISOString();
  try {
    localStorage.setItem(LAST_SNAPSHOT_KEY, value);
  } catch {
    /* storage may be unavailable; the value is still reported in-session */
  }
  return value;
};

// ─────────────────────────────────────────────
// HEARTBEAT
// ─────────────────────────────────────────────

let lastHeartbeatAt = 0;
let lastReportedPending = null;

/**
 * Record that this device is alive and how much work it still has queued.
 *
 * @param {object} params
 * @param {number} [params.pendingCount]  unsynced changes on this device
 * @param {string} [params.lastSyncedAt]  ISO timestamp of the last successful sync
 * @param {boolean} [params.force]        write even if throttled
 */
export const recordHeartbeat = async ({ pendingCount = 0, lastSyncedAt = null, force = false } = {}) => {
  const now = Date.now();
  const pending = Number(pendingCount) || 0;
  // A changed pending count is always reported: the server must never keep a
  // stale "0 unsynced" picture of a device that actually has queued work.
  const pendingChanged = lastReportedPending !== null && pending !== lastReportedPending;
  if (!force && !pendingChanged && now - lastHeartbeatAt < HEARTBEAT_THROTTLE_MS) {
    return null;
  }
  lastHeartbeatAt = now;
  lastReportedPending = pending;

  const deviceId = getDeviceId();
  const timestamp = new Date().toISOString();
  const payload = {
    deviceId,
    label: getDeviceLabel(),
    platform: getDefaultDeviceLabel(),
    username: getCurrentUsername(),
    pendingCount: pending,
    lastSyncedAt: lastSyncedAt || null,
    lastSeenAt: timestamp,
    updatedAt: timestamp,
  };

  // Local copy (never replicated) — this is what the app reads when it boots
  // to decide whether the PREVIOUS session on this device left work behind.
  try {
    let rev = null;
    try {
      const existing = await localDb.get(LOCAL_HEARTBEAT_ID);
      rev = existing._rev;
    } catch {
      rev = null;
    }
    await localDb.put({ ...payload, _id: LOCAL_HEARTBEAT_ID, _rev: rev || undefined });
  } catch (err) {
    console.warn('[device] Local heartbeat write failed:', err?.message || err);
  }

  // Replicated copy so other devices can see this device's state.
  try {
    const statusId = `${DEVICE_STATUS_PREFIX}${deviceId}`;
    let rev = null;
    try {
      const existing = await localDb.get(statusId);
      rev = existing._rev;
    } catch {
      rev = null;
    }
    await localDb.put({
      ...payload,
      _id: statusId,
      _rev: rev || undefined,
      type: 'device_status',
      docType: 'device_status',
    });
  } catch (err) {
    console.warn('[device] Shared status write failed:', err?.message || err);
  }

  // Server-side registry: this is what lets the server answer "which devices
  // still hold unsynced records?". Failures are non-fatal — the local copies
  // above are still written, and the next heartbeat will retry.
  const reported = await sendHeartbeat({
    pendingCount: payload.pendingCount,
    lastSyncedAt: payload.lastSyncedAt,
  });

  return { ...payload, reportedToServer: reported };
};

/**
 * Report this device's state to the server's device registry.
 *
 * @param {object} params
 * @param {number} [params.pendingCount]   unsynced changes on this device
 * @param {string} [params.lastSyncedAt]   ISO timestamp of the last successful sync
 * @param {boolean} [params.force]          bypass the local throttle
 * @returns {Promise<boolean>} true when the server accepted the heartbeat
 */
export const sendHeartbeat = async ({ pendingCount = 0, lastSyncedAt = null } = {}) => {
  try {
    const body = {
      deviceId: getDeviceId(),
      label: getDeviceLabel(),
      pendingChangeCount: Number(pendingCount) || 0,
      lastSuccessfulSyncAt: lastSyncedAt || null,
      // When this device last produced a local snapshot.
      lastSnapshotAt: getLastSnapshotAt(),
    };

    const res = await apiFetch('devices/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`[device] Heartbeat rejected (HTTP ${res.status}).`);
      return false;
    }
    return true;
  } catch (err) {
    // Offline / server unreachable / not permitted: the heartbeat is
    // best-effort and must never interrupt the application.
    console.warn('[device] Heartbeat could not be sent:', err?.message || err);
    return false;
  }
};

/**
 * Fetch the server-side device registry (admin only).
 * @param {object} [params]
 * @param {number} [params.staleHours] override the server's staleness threshold
 * @returns {Promise<{devices:Array, summary:Object, staleHours:number}|null>}
 */
export const fetchRegisteredDevices = async ({ staleHours } = {}) => {
  try {
    const query = staleHours ? `?staleHours=${encodeURIComponent(staleHours)}` : '';
    const res = await apiFetch(`devices${query}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.success) return null;
    return {
      devices: Array.isArray(json.devices) ? json.devices : [],
      summary: json.summary || {},
      staleHours: json.staleHours,
    };
  } catch (err) {
    console.warn('[device] Could not load the device registry:', err?.message || err);
    return null;
  }
};

/**
 * Fetch the server's CouchDB connection health (admin only).
 * Never throws: resolves to a normalized object so the UI can always render.
 * @returns {Promise<{ok:boolean, endpoint:{host:string,protocol:string,isRemote:boolean,isSecure:boolean}|null, latencyMs:number|null, version:string|null, error:string|null}>}
 */
export const fetchCouchHealth = async () => {
  try {
    const res = await apiFetch('health/couchdb');
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        endpoint: json?.endpoint || null,
        latencyMs: null,
        version: null,
        error: json?.error || 'CouchDB is not reachable',
      };
    }
    return {
      ok: true,
      endpoint: json.endpoint || null,
      latencyMs: typeof json.latencyMs === 'number' ? json.latencyMs : null,
      version: json.version || null,
      error: null,
    };
  } catch (err) {
    // 403 (non-admin) and network failures both land here.
    return { ok: false, endpoint: null, latencyMs: null, version: null, error: err?.message || 'Request failed' };
  }
};

/** This device's last recorded heartbeat (or null). */
export const getLocalHeartbeat = async () => {
  try {
    const doc = await localDb.get(LOCAL_HEARTBEAT_ID);
    return {
      deviceId: doc.deviceId,
      label: doc.label,
      pendingCount: doc.pendingCount || 0,
      lastSyncedAt: doc.lastSyncedAt || null,
      lastSeenAt: doc.lastSeenAt || null,
    };
  } catch {
    return null;
  }
};

/** Every known device (this one included), newest heartbeat first. */
export const getKnownDevices = async () => {
  try {
    const result = await localDb.allDocs({ include_docs: true });
    const devices = result.rows
      .map((row) => row.doc)
      .filter((doc) => doc && doc.type === 'device_status' && String(doc._id).startsWith(DEVICE_STATUS_PREFIX))
      .map((doc) => ({
        deviceId: doc.deviceId,
        label: doc.label || 'Unnamed device',
        username: doc.username || '',
        pendingCount: doc.pendingCount || 0,
        lastSyncedAt: doc.lastSyncedAt || null,
        lastSeenAt: doc.lastSeenAt || null,
        isCurrent: doc.deviceId === getDeviceId(),
      }));

    return devices.sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
  } catch (err) {
    console.warn('[device] Failed to list devices:', err?.message || err);
    return [];
  }
};

/**
 * Detect a device-loss risk.
 *
 * Two situations are reported:
 *   1. The previous session ON THIS DEVICE ended with unsynced changes.
 *   2. Another device has been silent for a long time and still had pending
 *      changes — the classic "the tablet was taken away" scenario.
 *
 * @returns {Promise<{risky:boolean, reasons:string[], devices:object[]}>}
 */
export const detectDeviceLossRisk = async () => {
  const reasons = [];
  const currentDeviceId = getDeviceId();

  const local = await getLocalHeartbeat();
  if (local && (local.pendingCount || 0) > 0) {
    reasons.push(
      `The previous session on this device (${local.label}) still had ${local.pendingCount} unsynced change(s) ` +
      'when it was last used.'
    );
  }

  const devices = await getKnownDevices();
  const now = Date.now();
  devices
    .filter((d) => d.deviceId !== currentDeviceId)
    .forEach((d) => {
      const lastSeen = new Date(d.lastSeenAt || 0).getTime() || 0;
      const isStale = !lastSeen || now - lastSeen > STALE_DEVICE_MS;
      if (isStale && (d.pendingCount || 0) > 0) {
        reasons.push(
          `Device "${d.label}" was last seen ${d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'a long time ago'} ` +
          `and still had ${d.pendingCount} unsynced change(s).`
        );
      }
    });

  return { risky: reasons.length > 0, reasons, devices, localHeartbeat: local };
};

/**
 * Clear the "previous session had pending work" flag after the user has
 * acknowledged the warning (or after a successful sync cleared the queue).
 */
export const clearLocalHeartbeatPending = async () => {
  try {
    const doc = await localDb.get(LOCAL_HEARTBEAT_ID);
    await localDb.put({ ...doc, pendingCount: 0, updatedAt: new Date().toISOString() });
    return true;
  } catch {
    return false;
  }
};
