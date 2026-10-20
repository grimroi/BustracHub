'use strict';

// Unit tests for the device-registry policy (server/utils/deviceRegistry.js).
// Run with: node --test server/test/deviceRegistry.test.js  (or `npm test`).
//
// These exercise the pure policy module so the staleness / "possibly-lost"
// rules can be verified WITHOUT a running CouchDB or Express stack.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../utils/deviceRegistry');

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const hoursAgo = (h) => new Date(NOW - h * 60 * 60 * 1000).toISOString();

// ── 1. Document identity ────────────────────────────────────────────────────
test('deviceRegistryDocId prefixes the device id', () => {
  assert.equal(deviceRegistryDocId('dev_abc123'), `${DEVICE_REGISTRY_PREFIX}dev_abc123`);
});

test('a registry document carries the device_registry type', () => {
  const doc = buildRegistryDoc({ deviceId: 'dev_abc123' }, NOW);
  assert.equal(doc.type, DEVICE_REGISTRY_TYPE);
  assert.equal(doc.deviceId, 'dev_abc123');
});

// ── 2. Normalisation ────────────────────────────────────────────────────────
test('normalizeDeviceId keeps a well-formed id', () => {
  assert.equal(normalizeDeviceId('dev_abc-123.x'), 'dev_abc-123.x');
});

test('normalizeDeviceId trims surrounding whitespace', () => {
  assert.equal(normalizeDeviceId('  dev_abc  '), 'dev_abc');
});

test('normalizeDeviceId strips characters that are unsafe in a document id', () => {
  // "dev/../etc" -> separators removed and the dot run collapsed, so the
  // result can never be read as a path segment.
  assert.equal(normalizeDeviceId('dev/../etc'), 'dev.etc');
});

test('normalizeDeviceId rejects empty and non-string values', () => {
  assert.equal(normalizeDeviceId(''), null);
  assert.equal(normalizeDeviceId('   '), null);
  assert.equal(normalizeDeviceId(undefined), null);
  assert.equal(normalizeDeviceId(null), null);
  assert.equal(normalizeDeviceId(12345), null);
});

test('normalizeDeviceId caps the length', () => {
  const long = 'a'.repeat(500);
  assert.equal(normalizeDeviceId(long).length, 128);
});

test('normalizeLabel falls back when the label is missing', () => {
  assert.equal(normalizeLabel(undefined, 'Unnamed device'), 'Unnamed device');
  assert.equal(normalizeLabel('   ', 'Unnamed device'), 'Unnamed device');
  assert.equal(normalizeLabel('  Chrome on Windows  '), 'Chrome on Windows');
});

test('normalizePendingCount coerces to a non-negative integer', () => {
  assert.equal(normalizePendingCount(7), 7);
  assert.equal(normalizePendingCount('3'), 3);
  assert.equal(normalizePendingCount(2.9), 2);
  assert.equal(normalizePendingCount(-4), 0);
  assert.equal(normalizePendingCount('abc'), 0);
  assert.equal(normalizePendingCount(undefined), 0);
});

// ── 3. Staleness threshold resolution ──────────────────────────────────────
test('resolveStaleHours defaults to 24 hours', () => {
  assert.equal(resolveStaleHours(), DEFAULT_STALE_HOURS);
  assert.equal(resolveStaleHours({}), 24);
});

test('resolveStaleHours prefers the query value over the environment value', () => {
  assert.equal(resolveStaleHours({ envValue: '12', queryValue: '6' }), 6);
});

test('resolveStaleHours falls back to the environment value', () => {
  assert.equal(resolveStaleHours({ envValue: '12' }), 12);
});

test('resolveStaleHours ignores unusable values', () => {
  assert.equal(resolveStaleHours({ envValue: 'abc' }), DEFAULT_STALE_HOURS);
  assert.equal(resolveStaleHours({ envValue: '-4' }), DEFAULT_STALE_HOURS);
  assert.equal(resolveStaleHours({ envValue: '0' }), DEFAULT_STALE_HOURS);
});

test('resolveStaleHours caps the threshold at one year', () => {
  assert.equal(resolveStaleHours({ envValue: '99999' }), 24 * 365);
});

// ── 4. Status policy ────────────────────────────────────────────────────────
test('a device that heartbeated inside the window is online', () => {
  const status = computeDeviceStatus({
    lastHeartbeatAt: hoursAgo(1),
    pendingChangeCount: 0,
    staleHours: 24,
    now: NOW,
  });
  assert.equal(status, DEVICE_STATUS.ONLINE);
});

test('a device that heartbeated inside the window is online even with pending changes', () => {
  const status = computeDeviceStatus({
    lastHeartbeatAt: hoursAgo(2),
    pendingChangeCount: 5,
    staleHours: 24,
    now: NOW,
  });
  assert.equal(status, DEVICE_STATUS.ONLINE);
});

test('a silent device with no pending changes is merely stale', () => {
  const status = computeDeviceStatus({
    lastHeartbeatAt: hoursAgo(30),
    pendingChangeCount: 0,
    staleHours: 24,
    now: NOW,
  });
  assert.equal(status, DEVICE_STATUS.STALE);
});

test('a silent device that was holding unsynced changes is possibly-lost', () => {
  const status = computeDeviceStatus({
    lastHeartbeatAt: hoursAgo(30),
    pendingChangeCount: 5,
    staleHours: 24,
    now: NOW,
  });
  assert.equal(status, DEVICE_STATUS.POSSIBLY_LOST);
});

test('a device that never reported a heartbeat is stale, not online', () => {
  const status = computeDeviceStatus({
    lastHeartbeatAt: null,
    pendingChangeCount: 0,
    staleHours: 24,
    now: NOW,
  });
  assert.equal(status, DEVICE_STATUS.STALE);
});

test('the staleness boundary is inclusive of the threshold', () => {
  const status = computeDeviceStatus({
    lastHeartbeatAt: hoursAgo(24.5),
    pendingChangeCount: 0,
    staleHours: 24,
    now: NOW,
  });
  assert.equal(status, DEVICE_STATUS.STALE);
});

// ── 5. Document construction and merging ───────────────────────────────────
test('buildRegistryDoc records every required field', () => {
  const doc = buildRegistryDoc(
    {
      deviceId: 'dev_abc',
      label: 'Chrome on Windows',
      assignedUser: 'mgcortero',
      pendingChangeCount: 3,
      lastSuccessfulSyncAt: hoursAgo(0.1),
    },
    NOW
  );

  assert.equal(doc._id, `${DEVICE_REGISTRY_PREFIX}dev_abc`);
  assert.equal(doc.type, DEVICE_REGISTRY_TYPE);
  assert.equal(doc.deviceId, 'dev_abc');
  assert.equal(doc.label, 'Chrome on Windows');
  assert.equal(doc.assignedUser, 'mgcortero');
  assert.equal(doc.lastHeartbeatAt, '2026-10-20T12:00:00.000Z');
  assert.equal(doc.pendingChangeCount, 3);
  assert.equal(doc.status, DEVICE_STATUS.ONLINE);
  assert.ok(doc.lastSuccessfulSyncAt);
});

test('applyHeartbeat creates a first-registration document', () => {
  const doc = applyHeartbeat(null, { deviceId: 'dev_abc', assignedUser: 'staff' }, NOW);
  assert.equal(doc._id, `${DEVICE_REGISTRY_PREFIX}dev_abc`);
  assert.equal(doc.createdAt, '2026-10-20T12:00:00.000Z');
  assert.equal(doc.assignedUser, 'staff');
});

test('applyHeartbeat preserves the original registration timestamp', () => {
  const existing = {
    _id: `${DEVICE_REGISTRY_PREFIX}dev_abc`,
    type: DEVICE_REGISTRY_TYPE,
    deviceId: 'dev_abc',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
  };
  const doc = applyHeartbeat(existing, { deviceId: 'dev_abc', pendingChangeCount: 2 }, NOW);
  assert.equal(doc.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(doc.lastHeartbeatAt, '2026-10-20T12:00:00.000Z');
  assert.equal(doc.pendingChangeCount, 2);
});

test('applyHeartbeat keeps the previous lastSuccessfulSyncAt when none is reported', () => {
  const existing = {
    _id: `${DEVICE_REGISTRY_PREFIX}dev_abc`,
    type: DEVICE_REGISTRY_TYPE,
    deviceId: 'dev_abc',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
  };
  const doc = applyHeartbeat(existing, { deviceId: 'dev_abc' }, NOW);
  assert.equal(doc.lastSuccessfulSyncAt, '2026-01-01T00:00:00.000Z');
});

// ── 6. Device list ──────────────────────────────────────────────────────────
const registryDoc = (overrides) => ({
  _id: `${DEVICE_REGISTRY_PREFIX}dev_x`,
  type: DEVICE_REGISTRY_TYPE,
  deviceId: 'dev_x',
  label: 'Tablet',
  assignedUser: 'mgcortero',
  lastHeartbeatAt: hoursAgo(1),
  pendingChangeCount: 0,
  lastSuccessfulSyncAt: hoursAgo(1),
  status: DEVICE_STATUS.ONLINE,
  ...overrides,
});

test('buildDeviceList computes the status for every device', () => {
  const list = buildDeviceList(
    [
      registryDoc({ deviceId: 'dev_online' }),
      registryDoc({ deviceId: 'dev_stale', lastHeartbeatAt: hoursAgo(48) }),
      registryDoc({
        deviceId: 'dev_lost',
        lastHeartbeatAt: hoursAgo(48),
        pendingChangeCount: 9,
      }),
    ],
    { staleHours: 24, now: NOW }
  );

  const byId = Object.fromEntries(list.map((d) => [d.deviceId, d]));
  assert.equal(byId.dev_online.status, DEVICE_STATUS.ONLINE);
  assert.equal(byId.dev_stale.status, DEVICE_STATUS.STALE);
  assert.equal(byId.dev_lost.status, DEVICE_STATUS.POSSIBLY_LOST);
});

test('buildDeviceList ignores documents that are not device_registry records', () => {
  const list = buildDeviceList(
    [{ _id: 'resident_1', type: 'resident', deviceId: 'dev_x' }],
    { staleHours: 24, now: NOW }
  );
  assert.equal(list.length, 0);
});

test('buildDeviceList sorts possibly-lost devices first', () => {
  const list = buildDeviceList(
    [
      registryDoc({ deviceId: 'dev_online' }),
      registryDoc({ deviceId: 'dev_stale', lastHeartbeatAt: hoursAgo(48) }),
      registryDoc({
        deviceId: 'dev_lost',
        lastHeartbeatAt: hoursAgo(48),
        pendingChangeCount: 9,
      }),
    ],
    { staleHours: 24, now: NOW }
  );

  assert.equal(list[0].deviceId, 'dev_lost');
  assert.equal(list[1].deviceId, 'dev_stale');
  assert.equal(list[2].deviceId, 'dev_online');
});

test('buildDeviceList reports how many minutes since the last heartbeat', () => {
  const list = buildDeviceList([registryDoc({ lastHeartbeatAt: hoursAgo(2) })], {
    staleHours: 24,
    now: NOW,
  });
  assert.equal(list[0].minutesSinceHeartbeat, 120);
});

test('buildDeviceList tolerates an empty or invalid input', () => {
  assert.deepEqual(buildDeviceList(null, { now: NOW }), []);
  assert.deepEqual(buildDeviceList([], { now: NOW }), []);
});

test('summarizeDeviceList counts the statuses and the devices holding unsynced records', () => {
  const list = buildDeviceList(
    [
      registryDoc({ deviceId: 'dev_online' }),
      registryDoc({ deviceId: 'dev_online2' }),
      registryDoc({ deviceId: 'dev_stale', lastHeartbeatAt: hoursAgo(48) }),
      registryDoc({
        deviceId: 'dev_lost',
        lastHeartbeatAt: hoursAgo(48),
        pendingChangeCount: 9,
      }),
    ],
    { staleHours: 24, now: NOW }
  );

  const summary = summarizeDeviceList(list);
  assert.equal(summary.total, 4);
  assert.equal(summary.online, 2);
  assert.equal(summary.stale, 1);
  assert.equal(summary.possiblyLost, 1);
  assert.equal(summary.devicesHoldingUnsynced, 1);
});
