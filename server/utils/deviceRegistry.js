'use strict';

// server/utils/deviceRegistry.js
//
// Server-side device registry — the authoritative answer to
// "which devices still hold unsynced records?".
//
// DESIGN
// ------
// A device (a staff/admin laptop or tablet) periodically reports a heartbeat
// to the server. The server stores one `device_registry` document per device
// in CouchDB. Because a device that is offline (or lost) cannot send a
// heartbeat, the LAST heartbeat the server received still describes the
// state that device was in when it went silent — including how many changes
// it had not yet replicated.
//
// The status of a device is therefore derived from two facts:
//   * how long ago the server last heard from it, and
//   * how many unsynced changes that last heartbeat reported.
//
// A device that is silent AND was holding unsynced changes is flagged
// "possibly-lost" — that is precisely the device-loss scenario the offline
// architecture cannot protect against.
//
// This module is deliberately free of Express/CouchDB dependencies so the
// policy can be unit-tested without a running stack, matching the pattern
// used by utils/syncAuthorization.js.

const DEVICE_REGISTRY_TYPE = 'device_registry';
const DEVICE_REGISTRY_PREFIX = 'device_registry_';
const DEFAULT_STALE_HOURS = 24;
const MAX_STALE_HOURS = 24 * 365;
const MAX_DEVICE_ID_LENGTH = 128;
const MAX_LABEL_LENGTH = 120;

const DEVICE_STATUS = {
  ONLINE: 'online',
  STALE: 'stale',
  POSSIBLY_LOST: 'possibly-lost',
};

// ─────────────────────────────────────────────────────────────────────────────
// Identifiers and normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the CouchDB document id for a device.
 * @param {string} deviceId
 * @returns {string}
 */
function deviceRegistryDocId(deviceId) {
  return `${DEVICE_REGISTRY_PREFIX}${deviceId}`;
}

/**
 * Normalise a client-supplied device id.
 * Only characters that are safe inside a CouchDB document id are kept, so a
 * malformed or hostile value can never produce an unexpected document id.
 * @param {unknown} raw
 * @returns {string|null} the sanitised id, or null when unusable
 */
function normalizeDeviceId(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const safe = trimmed
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_DEVICE_ID_LENGTH);
  return safe.length ? safe : null;
}

/**
 * Normalise a human-readable device label.
 * @param {unknown} raw
 * @param {string} fallback
 * @returns {string}
 */
function normalizeLabel(raw, fallback = 'Unnamed device') {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed.length ? trimmed : fallback;
}

/**
 * Normalise the pending-change count to a non-negative integer.
 * @param {unknown} raw
 * @returns {number}
 */
function normalizePendingCount(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * Resolve the staleness threshold in hours.
 * Precedence: explicit request value > environment value > 24h default.
 * @param {{envValue?: unknown, queryValue?: unknown}} options
 * @returns {number}
 */
function resolveStaleHours({ envValue, queryValue } = {}) {
  const candidates = [queryValue, envValue];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const value = Number(candidate);
    if (!Number.isFinite(value) || value <= 0) continue;
    return Math.min(value, MAX_STALE_HOURS);
  }
  return DEFAULT_STALE_HOURS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status policy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide the operational status of one device.
 *
 * @param {object} params
 * @param {string|null} [params.lastHeartbeatAt] ISO timestamp
 * @param {number} [params.pendingChangeCount] unsynced changes at heartbeat time
 * @param {number} [params.staleHours] staleness threshold
 * @param {number} [params.now] epoch millis (injectable for tests)
 * @returns {'online'|'stale'|'possibly-lost'}
 */
function computeDeviceStatus({
  lastHeartbeatAt,
  pendingChangeCount = 0,
  staleHours = DEFAULT_STALE_HOURS,
  now = Date.now(),
} = {}) {
  const parsed = lastHeartbeatAt ? Date.parse(lastHeartbeatAt) : NaN;
  const hasHeartbeat = Number.isFinite(parsed);
  const staleMs = Math.max(1, Number(staleHours) || DEFAULT_STALE_HOURS) * 60 * 60 * 1000;
  const ageMs = hasHeartbeat ? now - parsed : Infinity;
  const isStale = !hasHeartbeat || ageMs > staleMs;

  if (!isStale) return DEVICE_STATUS.ONLINE;
  return normalizePendingCount(pendingChangeCount) > 0
    ? DEVICE_STATUS.POSSIBLY_LOST
    : DEVICE_STATUS.STALE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Document construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a fresh `device_registry` document from a heartbeat.
 * @param {object} heartbeat
 * @param {number} [now]
 * @returns {object}
 */
function buildRegistryDoc(heartbeat = {}, now = Date.now()) {
  const deviceId = normalizeDeviceId(heartbeat.deviceId);
  const timestamp = new Date(now).toISOString();
  return {
    _id: deviceRegistryDocId(deviceId),
    type: DEVICE_REGISTRY_TYPE,
    deviceId,
    label: normalizeLabel(heartbeat.label, 'Unnamed device'),
    assignedUser: normalizeLabel(heartbeat.assignedUser, 'unknown'),
    lastHeartbeatAt: timestamp,
    pendingChangeCount: normalizePendingCount(heartbeat.pendingChangeCount),
    lastSuccessfulSyncAt: heartbeat.lastSuccessfulSyncAt
      ? new Date(heartbeat.lastSuccessfulSyncAt).toISOString()
      : null,
    // When the device last produced a local snapshot (backup file).
    lastSnapshotAt: heartbeat.lastSnapshotAt ? new Date(heartbeat.lastSnapshotAt).toISOString() : null,
    status: DEVICE_STATUS.ONLINE,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Merge a heartbeat into an existing registry document.
 * The device id and the registration timestamp are preserved; everything else
 * reflects the newest report.
 *
 * @param {object|null} existing
 * @param {object} heartbeat
 * @param {number} [now]
 * @returns {object}
 */
function applyHeartbeat(existing, heartbeat = {}, now = Date.now()) {
  const base = existing && typeof existing === 'object' ? existing : {};
  const deviceId = normalizeDeviceId(heartbeat.deviceId) || base.deviceId || null;
  const timestamp = new Date(now).toISOString();

  return {
    ...base,
    _id: base._id || deviceRegistryDocId(deviceId),
    type: DEVICE_REGISTRY_TYPE,
    deviceId,
    label: normalizeLabel(heartbeat.label, base.label || 'Unnamed device'),
    assignedUser: normalizeLabel(heartbeat.assignedUser, base.assignedUser || 'unknown'),
    lastHeartbeatAt: timestamp,
    pendingChangeCount: normalizePendingCount(heartbeat.pendingChangeCount),
    lastSuccessfulSyncAt: heartbeat.lastSuccessfulSyncAt
      ? new Date(heartbeat.lastSuccessfulSyncAt).toISOString()
      : base.lastSuccessfulSyncAt || null,
    // When the device last produced a local snapshot (backup file).
    lastSnapshotAt: heartbeat.lastSnapshotAt
      ? new Date(heartbeat.lastSnapshotAt).toISOString()
      : base.lastSnapshotAt || null,
    status: DEVICE_STATUS.ONLINE,
    createdAt: base.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Listing
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_RANK = {
  [DEVICE_STATUS.POSSIBLY_LOST]: 0,
  [DEVICE_STATUS.STALE]: 1,
  [DEVICE_STATUS.ONLINE]: 2,
};

/**
 * Build the administrative device list from raw `device_registry` documents.
 *
 * @param {object[]} docs
 * @param {object} [options]
 * @param {number} [options.staleHours]
 * @param {number} [options.now]
 * @returns {object[]}
 */
function buildDeviceList(docs, { staleHours = DEFAULT_STALE_HOURS, now = Date.now() } = {}) {
  const list = (Array.isArray(docs) ? docs : [])
    .filter((doc) => doc && doc.type === DEVICE_REGISTRY_TYPE)
    .map((doc) => {
      const pending = normalizePendingCount(doc.pendingChangeCount);
      const status = computeDeviceStatus({
        lastHeartbeatAt: doc.lastHeartbeatAt,
        pendingChangeCount: pending,
        staleHours,
        now,
      });
      const parsed = doc.lastHeartbeatAt ? Date.parse(doc.lastHeartbeatAt) : NaN;
      return {
        deviceId: doc.deviceId || null,
        label: doc.label || 'Unnamed device',
        assignedUser: doc.assignedUser || 'unknown',
        lastHeartbeatAt: doc.lastHeartbeatAt || null,
        pendingChangeCount: pending,
        lastSuccessfulSyncAt: doc.lastSuccessfulSyncAt || null,
        lastSnapshotAt: doc.lastSnapshotAt || null,
        status,
        staleHours,
        minutesSinceHeartbeat: Number.isFinite(parsed)
          ? Math.max(0, Math.round((now - parsed) / 60000))
          : null,
      };
    });

  list.sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    if (b.pendingChangeCount !== a.pendingChangeCount) {
      return b.pendingChangeCount - a.pendingChangeCount;
    }
    const aTime = a.lastHeartbeatAt ? Date.parse(a.lastHeartbeatAt) : 0;
    const bTime = b.lastHeartbeatAt ? Date.parse(b.lastHeartbeatAt) : 0;
    return bTime - aTime;
  });

  return list;
}

/**
 * Aggregate counters used by the admin UI header.
 * @param {object[]} list
 * @returns {{total:number, online:number, stale:number, possiblyLost:number, devicesHoldingUnsynced:number}}
 */
function summarizeDeviceList(list) {
  const rows = Array.isArray(list) ? list : [];
  return {
    total: rows.length,
    online: rows.filter((r) => r.status === DEVICE_STATUS.ONLINE).length,
    stale: rows.filter((r) => r.status === DEVICE_STATUS.STALE).length,
    possiblyLost: rows.filter((r) => r.status === DEVICE_STATUS.POSSIBLY_LOST).length,
    devicesHoldingUnsynced: rows.filter((r) => r.pendingChangeCount > 0).length,
  };
}

module.exports = {
  DEVICE_REGISTRY_TYPE,
  DEVICE_REGISTRY_PREFIX,
  DEFAULT_STALE_HOURS,
  DEVICE_STATUS,
  deviceRegistryDocId,
  normalizeDeviceId,
  normalizeLabel,
  normalizePendingCount,
  resolveStaleHours,
  computeDeviceStatus,
  buildRegistryDoc,
  applyHeartbeat,
  buildDeviceList,
  summarizeDeviceList,
};
