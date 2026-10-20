'use strict';

// ──────────────────────────────────────────────────────────────
// CLOUD-READINESS: tests for GET /api/health/couchdb + endpoint classification.
// Run with: node --test server/test/couchHealth.test.js  (or `npm test`).
//
// Loads the REAL Express app from ../index.js and drives it over an ephemeral
// HTTP port (Node's global fetch). A controllable stub "CouchDB" (a plain
// node:http server) is advertised via COUCHDB_URL so we can exercise:
//   - a healthy upstream (200 + a version string)
//   - a refused connection (server closed → ECONNREFUSED → 503)
//   - a hung connection (server accepts but never replies → 5s timeout → 503)
// The endpoint classification (LOCAL / REMOTE / HTTPS / HTTP) is a pure
// function and is tested directly via the exported helper.
//
// No new dependencies: node:test + node:http + global fetch only.
// ──────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

// Must be set BEFORE requiring ../index.js (it reads them at import time).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-0123456789abcdef';
process.env.SEED_DEMO_USERS = 'false';
process.env.NODE_ENV = 'test';

// Credentials we will assert never leak into the response body.
const STUB_USER = 'healthadm';
const STUB_PASS = 's3cr3t-cloud-pass';

let app;
let JWT_SECRET;
let server;
let baseUrl;
let serverPort;

// The stub upstream CouchDB. `stubMode` controls its behaviour:
//   'ok'   → 200 { version }
//   'hang' → accepts the request but never replies (drives the 5s timeout)
let stub;
let stubMode = 'ok';

const startStub = (port) =>
  new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      if (stubMode === 'hang') return; // never respond
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ couchdb: 'Welcome', version: '3.3.3' }));
    });
    s.listen(port, '127.0.0.1', () => resolve(s));
  });

const stopStub = (s) => new Promise((resolve) => s.close(resolve));

test.before(async () => {
  // Pick a free port first, then bind the stub to it, then advertise it.
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  serverPort = probe.address().port;
  await new Promise((r) => probe.close(r));

  stub = await startStub(serverPort);
  process.env.COUCHDB_URL = `http://${STUB_USER}:${STUB_PASS}@127.0.0.1:${serverPort}`;

  const mod = require('../index');
  app = mod.app;
  JWT_SECRET = mod.JWT_SECRET;

  // Health endpoint does not use req.app.get('db'), but set a harmless stub so
  // the shared app behaves like the other route tests.
  app.set('db', { get: async () => { throw new Error('not used'); }, insert: async () => ({ ok: true }) });

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  // The stub may already be closed by the ECONNREFUSED case.
  if (stub && stub.listening) await stopStub(stub);
});

const tokenFor = (user) => jwt.sign({ user }, JWT_SECRET, { expiresIn: '8h' });

const getHealth = (token) =>
  fetch(`${baseUrl}/api/health/couchdb`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

const adminToken = () => tokenFor({ username: 'jmacabangon', role: 'admin' });
const staffToken = () => tokenFor({ username: 'mgcortero', role: 'staff' });

// ── 1. Healthy upstream → ok:true with a latency ────────────────────────────
test('health returns ok:true with latency and version when upstream answers 200', async () => {
  stubMode = 'ok';
  const res = await getHealth(adminToken());
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(typeof json.latencyMs, 'number');
  assert.ok(json.latencyMs >= 0);
  assert.equal(json.version, '3.3.3');
  assert.equal(json.endpoint.host, '127.0.0.1');
  assert.equal(json.endpoint.isRemote, false);
});

// ── 2. Refused connection → ok:false, 503 ───────────────────────────────────
// NOTE: runs after every test that needs the stub alive, so it can close it.
test('health returns ok:false and 503 when the upstream refuses the connection', async () => {
  stubMode = 'ok';
  await stopStub(stub); // nothing is listening now → ECONNREFUSED
  const res = await getHealth(adminToken());
  assert.equal(res.status, 503);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.latencyMs, null);
  assert.equal(json.endpoint.host, '127.0.0.1');
  assert.equal(typeof json.error, 'string');
  assert.ok(json.error.length > 0);
  // Bring the stub back for any later upstream-dependent assertions.
  stub = await startStub(serverPort);
});

// ── 3. Timeout → ok:false, 503 ──────────────────────────────────────────────
test('health returns ok:false and 503 when the upstream times out after 5s', async () => {
  stubMode = 'hang';
  const started = Date.now();
  const res = await getHealth(adminToken());
  const elapsed = Date.now() - started;
  assert.equal(res.status, 503);
  const json = await res.json();
  assert.equal(json.ok, false);
  assert.equal(json.latencyMs, null);
  assert.match(json.error, /Timed out after 5000ms/);
  assert.ok(elapsed >= 4800, `expected ~5s wait, got ${elapsed}ms`);
  stubMode = 'ok';
});

// ── 4/5. Endpoint classification (pure helper) ──────────────────────────────
test('classifyCouchEndpoint: https://example.com is REMOTE and SECURE', () => {
  const { classifyCouchEndpoint } = require('../index');
  const c = classifyCouchEndpoint('https://example.com');
  assert.equal(c.host, 'example.com');
  assert.equal(c.protocol, 'https');
  assert.equal(c.isRemote, true);
  assert.equal(c.isSecure, true);
});

test('classifyCouchEndpoint: http://127.0.0.1:5984 is NOT remote', () => {
  const { classifyCouchEndpoint } = require('../index');
  const c = classifyCouchEndpoint('http://127.0.0.1:5984');
  assert.equal(c.host, '127.0.0.1');
  assert.equal(c.isRemote, false);
  assert.equal(c.isSecure, false);
});

// ── 6. Credentials never leak into the response ─────────────────────────────
test('the health response never includes COUCHDB_URL credentials', async () => {
  stubMode = 'ok';
  const res = await getHealth(adminToken());
  const text = await res.text();
  assert.ok(!text.includes(STUB_USER), 'username must not appear in the response');
  assert.ok(!text.includes(STUB_PASS), 'password must not appear in the response');
  // Also assert the URL scheme/authority form is absent.
  assert.ok(!text.includes(`${STUB_USER}:${STUB_PASS}`));
});

// ── 7/8/9. RBAC ─────────────────────────────────────────────────────────────
test('GET /api/health/couchdb without a token → 401', async () => {
  const res = await getHealth(null);
  assert.equal(res.status, 401);
});

test('GET /api/health/couchdb as staff → 403 (admin only)', async () => {
  const res = await getHealth(staffToken());
  assert.equal(res.status, 403);
  const json = await res.json();
  assert.equal(json.success, false);
});

test('GET /api/health/couchdb as admin → 200', async () => {
  stubMode = 'ok';
  const res = await getHealth(adminToken());
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
});
