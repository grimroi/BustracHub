'use strict';

// HTTP-ROUTE tests for the device registry endpoints.
//
// Run with: node --test server/test/devicesApi.test.js  (or `npm test`).
//
// These load the REAL Express app from ../index.js and drive it over an
// ephemeral HTTP port (Node's global fetch), with an in-memory stub standing
// in for CouchDB. They prove:
//   - POST /api/devices/heartbeat stores a `device_registry` document
//   - the stored document carries the required registry fields
//   - a repeated heartbeat UPDATES the existing document instead of
//     duplicating it
//   - GET /api/devices returns the list with a computed status
//   - RBAC: unauthenticated -> 401, staff -> 403, admin -> 200
//   - the staleness threshold is configurable per request
//
// No new dependencies: node:test + node:http + global fetch only.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

// Must be set BEFORE requiring ../index.js (it reads them at import time).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-0123456789abcdef';
process.env.SEED_DEMO_USERS = 'false';
process.env.NODE_ENV = 'test';

let app;
let JWT_SECRET;
let server;
let stubServer;
let baseUrl;

// The in-memory "CouchDB" behind req.app.get('db').
let docs = {};
let inserted = [];

const stubDb = {
  get: async (id) => {
    if (Object.prototype.hasOwnProperty.call(docs, id)) {
      return { ...docs[id], _id: id };
    }
    const err = new Error('missing');
    err.statusCode = 404;
    err.error = 'not_found';
    throw err;
  },
  insert: async (doc) => {
    const rev = `1-${Math.random().toString(36).slice(2, 8)}`;
    docs[doc._id] = { ...doc, _rev: rev };
    inserted.push({ ...doc, _rev: rev });
    return { ok: true, id: doc._id, rev };
  },
  find: async ({ selector }) => ({
    docs: Object.values(docs).filter((doc) =>
      Object.entries(selector || {}).every(([key, value]) => doc[key] === value)
    ),
  }),
};

test.before(async () => {
  // A stub upstream CouchDB so requiring index.js succeeds; the device
  // endpoints never touch it because the stub `db` is injected below.
  stubServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise((resolve) => stubServer.listen(0, '127.0.0.1', resolve));
  process.env.COUCHDB_URL = `http://admin:pass@127.0.0.1:${stubServer.address().port}`;

  const mod = require('../index');
  app = mod.app;
  JWT_SECRET = mod.JWT_SECRET;
  app.set('db', stubDb);

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => stubServer.close(resolve));
});

const tokenFor = (user) => jwt.sign({ user }, JWT_SECRET, { expiresIn: '8h' });

const request = (method, path, { token, body } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload = body;
  if (body !== undefined && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers, body: payload });
};

const adminToken = () => tokenFor({ username: 'jmacabangon', role: 'admin' });
const staffToken = () => tokenFor({ username: 'mgcortero', role: 'staff' });

const reset = () => {
  docs = {};
  inserted = [];
};

// ── 1. Heartbeat writes a device_registry document ──────────────────────────
test('POST /api/devices/heartbeat stores a device_registry document', async () => {
  reset();

  const res = await request('POST', '/api/devices/heartbeat', {
    token: adminToken(),
    body: {
      deviceId: 'dev_tablet01',
      label: 'Chrome on Windows',
      pendingChangeCount: 4,
      lastSuccessfulSyncAt: '2026-10-20T11:00:00.000Z',
    },
  });

  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.device.deviceId, 'dev_tablet01');
  assert.equal(json.device.pendingChangeCount, 4);

  const stored = docs['device_registry_dev_tablet01'];
  assert.ok(stored, 'the registry document must be persisted');
  assert.equal(stored.type, 'device_registry');
  assert.equal(stored.deviceId, 'dev_tablet01');
  assert.equal(stored.label, 'Chrome on Windows');
  assert.equal(stored.assignedUser, 'jmacabangon');
  assert.equal(stored.pendingChangeCount, 4);
  assert.equal(stored.lastSuccessfulSyncAt, '2026-10-20T11:00:00.000Z');
  assert.equal(stored.status, 'online');
  assert.ok(stored.lastHeartbeatAt);
});

test('the heartbeat assigns the device to the authenticated user, not the request body', async () => {
  reset();

  await request('POST', '/api/devices/heartbeat', {
    token: staffToken(),
    body: { deviceId: 'dev_tablet02', assignedUser: 'someone-else', pendingChangeCount: 0 },
  });

  assert.equal(docs['device_registry_dev_tablet02'].assignedUser, 'mgcortero');
});

test('a repeated heartbeat updates the same document instead of creating a second one', async () => {
  reset();

  await request('POST', '/api/devices/heartbeat', {
    token: adminToken(),
    body: { deviceId: 'dev_tablet03', pendingChangeCount: 7 },
  });
  await request('POST', '/api/devices/heartbeat', {
    token: adminToken(),
    body: { deviceId: 'dev_tablet03', pendingChangeCount: 0 },
  });

  const registryDocs = Object.values(docs).filter((d) => d.type === 'device_registry');
  assert.equal(registryDocs.length, 1);
  assert.equal(registryDocs[0].pendingChangeCount, 0);
});

test('a heartbeat without a usable deviceId is rejected with 400', async () => {
  reset();

  const res = await request('POST', '/api/devices/heartbeat', {
    token: adminToken(),
    body: { pendingChangeCount: 1 },
  });

  assert.equal(res.status, 400);
  const json = await res.json();
  assert.equal(json.success, false);
  assert.equal(Object.keys(docs).length, 0);
});

test('the heartbeat records the time of the last local snapshot', async () => {
  reset();

  await request('POST', '/api/devices/heartbeat', {
    token: adminToken(),
    body: {
      deviceId: 'dev_snap',
      pendingChangeCount: 0,
      lastSnapshotAt: '2026-10-20T06:00:00.000Z',
    },
  });

  const stored = docs['device_registry_dev_snap'];
  assert.equal(stored.lastSnapshotAt, '2026-10-20T06:00:00.000Z');

  const res = await request('GET', '/api/devices', { token: adminToken() });
  const json = await res.json();
  assert.equal(json.devices[0].lastSnapshotAt, '2026-10-20T06:00:00.000Z');
});

// ── 2. Device list ─────────────────────────────────────────────────────────
test('GET /api/devices returns the registered devices with a status', async () => {
  reset();

  await request('POST', '/api/devices/heartbeat', {
    token: adminToken(),
    body: { deviceId: 'dev_list01', label: 'Tablet A', pendingChangeCount: 0 },
  });

  const res = await request('GET', '/api/devices', { token: adminToken() });
  assert.equal(res.status, 200);

  const json = await res.json();
  assert.equal(json.success, true);
  assert.equal(json.staleHours, 24);
  assert.equal(json.devices.length, 1);
  assert.equal(json.devices[0].deviceId, 'dev_list01');
  assert.equal(json.devices[0].label, 'Tablet A');
  assert.equal(json.devices[0].status, 'online');
  assert.equal(json.devices[0].pendingChangeCount, 0);
  assert.equal(json.summary.total, 1);
  assert.equal(json.summary.online, 1);
});

test('GET /api/devices flags a silent device holding unsynced changes as possibly-lost', async () => {
  reset();

  // Seed a registry document whose last heartbeat is older than the window.
  docs['device_registry_dev_lost'] = {
    _id: 'device_registry_dev_lost',
    type: 'device_registry',
    deviceId: 'dev_lost',
    label: 'Stolen Tablet',
    assignedUser: 'mgcortero',
    lastHeartbeatAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    pendingChangeCount: 12,
    lastSuccessfulSyncAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    status: 'online',
  };

  const res = await request('GET', '/api/devices', { token: adminToken() });
  const json = await res.json();

  assert.equal(json.devices.length, 1);
  assert.equal(json.devices[0].status, 'possibly-lost');
  assert.equal(json.devices[0].pendingChangeCount, 12);
  assert.equal(json.summary.possiblyLost, 1);
  assert.equal(json.summary.devicesHoldingUnsynced, 1);
});

test('the staleness threshold is configurable per request', async () => {
  reset();

  docs['device_registry_dev_2h'] = {
    _id: 'device_registry_dev_2h',
    type: 'device_registry',
    deviceId: 'dev_2h',
    lastHeartbeatAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    pendingChangeCount: 1,
  };

  const defaultRes = await request('GET', '/api/devices', { token: adminToken() });
  const defaultJson = await defaultRes.json();
  assert.equal(defaultJson.staleHours, 24);
  assert.equal(defaultJson.devices[0].status, 'online');

  const strictRes = await request('GET', '/api/devices?staleHours=1', { token: adminToken() });
  const strictJson = await strictRes.json();
  assert.equal(strictJson.staleHours, 1);
  assert.equal(strictJson.devices[0].status, 'possibly-lost');
});

// ── 3. RBAC ─────────────────────────────────────────────────────────────────
test('GET /api/devices without a token is 401', async () => {
  const res = await request('GET', '/api/devices');
  assert.equal(res.status, 401);
});

test('GET /api/devices for a staff account is 403 (admin only)', async () => {
  const res = await request('GET', '/api/devices', { token: staffToken() });
  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.success, false);
});

test('GET /api/devices for an admin account is 200', async () => {
  reset();
  const res = await request('GET', '/api/devices', { token: adminToken() });
  assert.equal(res.status, 200);
});

test('POST /api/devices/heartbeat without a token is 401', async () => {
  const res = await request('POST', '/api/devices/heartbeat', {
    body: { deviceId: 'dev_x', pendingChangeCount: 0 },
  });
  assert.equal(res.status, 401);
});

test('POST /api/devices/heartbeat for a resident account is 403', async () => {
  const residentToken = tokenFor({ username: 'juan2026', role: 'resident' });
  const res = await request('POST', '/api/devices/heartbeat', {
    token: residentToken,
    body: { deviceId: 'dev_resident', pendingChangeCount: 0 },
  });
  assert.equal(res.status, 403);
});

// ── 4. Concurrent heartbeats (read-merge-write race) ───────────────────────
// A device reports its state on application load, on reconnect and after every
// replication completion, so two heartbeats for the same device can overlap.
// Both read the registry document, both merge, both write — and the loser of
// that race gets a 409 from CouchDB. The handler must recover by re-reading,
// re-merging and retrying, not by failing the request.
test('two concurrent heartbeats for the same device both succeed and leave one registry document', async () => {
  const docs = {};

  // The heartbeat carrying pendingChangeCount 1 always loses the race, so the
  // outcome is deterministic regardless of which request arrives first.
  let releaseFirstWrite = null;
  const firstWriteDone = new Promise((resolve) => { releaseFirstWrite = resolve; });

  const conflictError = () => {
    const err = new Error('Document update conflict.');
    err.statusCode = 409;
    err.name = 'conflict';
    err.reason = 'Document update conflict.';
    return err;
  };

  const racingDb = {
    get: async (id) => {
      if (!docs[id]) {
        const err = new Error('missing');
        err.statusCode = 404;
        err.name = 'not_found';
        throw err;
      }
      return { ...docs[id] };
    },
    insert: async (doc) => {
      // The pending=1 heartbeat waits until the pending=2 heartbeat has
      // written, so the two genuinely contend for the same document.
      if (doc.pendingChangeCount === 1) {
        await firstWriteDone;
      }

      const current = docs[doc._id];
      // CouchDB rejects a write whose _rev is not the current revision.
      if (current && current._rev !== doc._rev) throw conflictError();

      const generation = current ? Number(String(current._rev).split('-')[0]) + 1 : 1;
      const rev = `${generation}-${Math.random().toString(36).slice(2, 8)}`;
      docs[doc._id] = { ...doc, _rev: rev };

      if (doc.pendingChangeCount === 2) releaseFirstWrite();

      return { ok: true, id: doc._id, rev };
    },
    find: async () => ({ docs: Object.values(docs) }),
  };

  app.set('db', racingDb);
  try {
    const [winner, loser] = await Promise.all([
      request('POST', '/api/devices/heartbeat', {
        token: adminToken(),
        body: { deviceId: 'dev_race', label: 'Tablet', pendingChangeCount: 2 },
      }),
      request('POST', '/api/devices/heartbeat', {
        token: adminToken(),
        body: { deviceId: 'dev_race', label: 'Tablet', pendingChangeCount: 1 },
      }),
    ]);

    // Neither request may fail with 500 (or anything else).
    assert.equal(winner.status, 200);
    assert.equal(loser.status, 200);

    const winnerJson = await winner.json();
    const loserJson = await loser.json();
    assert.equal(winnerJson.success, true);
    assert.equal(loserJson.success, true);

    // Exactly one registry document survives the race.
    const registryDocs = Object.values(docs).filter((d) => d.type === 'device_registry');
    assert.equal(registryDocs.length, 1);
    assert.equal(registryDocs[0].deviceId, 'dev_race');

    // The write applied LAST wins: the pending=1 heartbeat retried onto the
    // fresh revision and overwrote the pending=2 value.
    assert.equal(registryDocs[0].pendingChangeCount, 1);

    // The response of the retried request reports the merged value.
    assert.equal(loserJson.device.pendingChangeCount, 1);
  } finally {
    app.set('db', stubDb);
  }
});

test('a genuine (non-409) database error returns 503 and is not retried', async () => {
  let insertAttempts = 0;

  const failingDb = {
    get: async () => {
      const err = new Error('missing');
      err.statusCode = 404;
      err.name = 'not_found';
      throw err;
    },
    insert: async () => {
      insertAttempts += 1;
      const err = new Error('Database is unavailable.');
      err.statusCode = 500;
      throw err;
    },
    find: async () => ({ docs: [] }),
  };

  app.set('db', failingDb);
  try {
    const res = await request('POST', '/api/devices/heartbeat', {
      token: adminToken(),
      body: { deviceId: 'dev_fail', pendingChangeCount: 1 },
    });

    assert.equal(res.status, 503);
    const json = await res.json();
    assert.equal(json.success, false);
    // The error is sanitised — no internal detail is echoed to the client.
    assert.equal(json.error, 'The device registry could not be updated. Please retry.');

    // A non-conflict failure must NOT be retried (no loop).
    assert.equal(insertAttempts, 1);
  } finally {
    app.set('db', stubDb);
  }
});
