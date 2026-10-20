'use strict';

// ──────────────────────────────────────────────────────────────
// HTTP-ROUTE regression tests for the /api/sync proxy + security layer.
// Run with: node --test server/test/syncHttp.test.js  (or `npm test`).
//
// These load the REAL Express app from ../index.js and drive it over a real
// ephemeral HTTP port (Node's global fetch). A stub upstream CouchDB is spun
// up in-process and advertised via COUCHDB_URL, so we can distinguish:
//   - 401  → authentication failed (bad/expired/missing JWT)
//   - 403  → authorization denied (resident wrote a doc they don't own …)
//   - 2xx/4xx/5xx from the stub → the request PASSED authorization and was
//     proxied upstream (we assert the stub actually received it).
// The stub lets us prove allowed mutations reach CouchDB AND assert the
// exact document body the proxy forwarded.
//
// No new dependencies: node:test + node:http + global fetch only.
// ──────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Must be set BEFORE requiring ../index.js (it reads them at import time and
// refuses to start without a strong JWT secret).
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-0123456789abcdef';
process.env.SEED_DEMO_USERS = 'false';
process.env.NODE_ENV = 'test';

// A stub "CouchDB" the proxy will talk to. Records every request it receives.
const received = [];
let stubBehavior = async () => ({ status: 200, body: { ok: true } });

const stubServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', async () => {
    const bodyText = Buffer.concat(chunks).toString('utf8');
    const record = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyText,
    };
    received.push(record);
    const { status, body } = await stubBehavior(record);
    const payload = typeof body === 'string' ? body : JSON.stringify(body ?? {});
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(payload);
  });
});

let stubPort;
let app;
let JWT_SECRET;
let server;
let baseUrl;

const jwt = require('jsonwebtoken');

const tokenFor = (user) => jwt.sign({ user }, JWT_SECRET, { expiresIn: '8h' });

test.before(async () => {
  await new Promise((resolve) => stubServer.listen(0, '127.0.0.1', resolve));
  stubPort = stubServer.address().port;
  process.env.COUCHDB_URL = `http://admin:pass@127.0.0.1:${stubPort}`;

  // Require AFTER COUCHDB_URL is set. index.js is bootstrapped-guarded so no
  // port is bound / DB connection attempted on import.
  const mod = require('../index');
  app = mod.app;
  JWT_SECRET = mod.JWT_SECRET;

  // Inject a stub DB for the authorization lookups. `docs` is the in-memory
  // "CouchDB documents" map; a miss throws a genuine 404 like nano does.
  let docs = {};
  let forceError = null;
  global.__setStubDocs = (next) => { docs = next; };
  global.__setStubError = (err) => { forceError = err || null; };
  app.set('db', {
    get: async (id) => {
      if (forceError) throw forceError;
      if (Object.prototype.hasOwnProperty.call(docs, id)) {
        return { ...docs[id], _id: id };
      }
      const err = new Error('missing');
      err.statusCode = 404;
      err.error = 'not_found';
      err.reason = 'missing';
      throw err;
    },
    insert: async () => ({ ok: true }),
  });

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => stubServer.close(resolve));
});

const reset = () => {
  received.length = 0;
  stubBehavior = async () => ({ status: 200, body: { ok: true } });
  global.__setStubDocs({});
  global.__setStubError(null);
};

const request = (method, path, { token, body, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined && typeof body !== 'string') {
    h['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, { method, headers: h, body });
};

const RESIDENT = { username: 'juan2026', residentId: 'RES-0001', role: 'resident' };
const OTHER_RESIDENT = { username: 'juanreyes', residentId: 'RES-0002', role: 'resident' };
const ADMIN = { username: 'jmacabangon', role: 'admin' };
const STAFF = { username: 'mgcortero', role: 'staff' };

// ── 1. Authentication ───────────────────────────────────────────────────
test('sync write with NO token → 401', async () => {
  reset();
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    body: { docs: [] },
  });
  assert.equal(res.status, 401);
  assert.equal(received.length, 0, 'nothing must reach CouchDB');
});

test('sync write with an INVALID token → 401', async () => {
  reset();
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    token: 'not.a.jwt',
    body: { docs: [] },
  });
  assert.equal(res.status, 401);
  assert.equal(received.length, 0);
});

test('sync write with a token signed by the WRONG secret → 401', async () => {
  reset();
  const bad = jwt.sign({ user: ADMIN }, 'a-different-secret-that-is-long-enough-123', {
    expiresIn: '8h',
  });
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', { token: bad, body: { docs: [] } });
  assert.equal(res.status, 401);
  assert.equal(received.length, 0);
});

test('sync write with an EXPIRED token → 401', async () => {
  reset();
  const expired = jwt.sign({ user: RESIDENT }, JWT_SECRET, { expiresIn: -10 });
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', { token: expired, body: { docs: [] } });
  assert.equal(res.status, 401);
  assert.equal(received.length, 0);
});

// ── 2. Role gating on the proxy ─────────────────────────────────────────
test('unknown role is denied by the proxy → 403', async () => {
  reset();
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_1', {
    token: tokenFor({ username: 'x', role: 'guest' }),
    body: { _id: 'cert_1', type: 'certificate_request', username: 'x' },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('admin write on the proxy passes authorization and reaches CouchDB', async () => {
  reset();
  stubBehavior = async () => ({ status: 201, body: { ok: true, id: 'ann1', rev: '1-x' } });
  const res = await request('PUT', '/api/sync/bustrachub_db/ann1', {
    token: tokenFor(ADMIN),
    body: { _id: 'ann1', type: 'announcement', title: 'hello' },
  });
  assert.equal(res.status, 201);
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'PUT');
  assert.match(received[0].url, /\/bustrachub_db\/ann1$/);
});

test('staff write on the proxy passes authorization and reaches CouchDB', async () => {
  reset();
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    token: tokenFor(STAFF),
    body: { docs: [{ _id: 'x', type: 'announcement' }] },
  });
  assert.notEqual(res.status, 403);
  assert.equal(received.length, 1);
});

// ── 3. Resident write authorization (single-doc PUT) ────────────────────
test('resident CANNOT create an account (type:user) doc → 403, not proxied', async () => {
  reset();
  const res = await request('PUT', '/api/sync/bustrachub_db/user_juan2026', {
    token: tokenFor(RESIDENT),
    body: { _id: 'user_juan2026', type: 'user', username: 'juan2026', role: 'admin' },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0, 'account-doc write must never reach CouchDB');
});

test('resident CANNOT overwrite another resident record (stored owner differs) → 403', async () => {
  reset();
  global.__setStubDocs({
    cert_1: { type: 'certificate_request', username: 'juanreyes', residentId: 'RES-0002' },
  });
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_1', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_1', type: 'certificate_request', username: 'juan2026', residentId: 'RES-0001' },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('resident CANNOT forge path/_id mismatch → 403', async () => {
  reset();
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_1', {
    token: tokenFor(RESIDENT),
    body: { _id: 'something_else', type: 'certificate_request', username: 'juan2026' },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('resident CAN create their OWN new certificate request → proxied', async () => {
  reset();
  stubBehavior = async () => ({ status: 201, body: { ok: true, id: 'cert_new', rev: '1-a' } });
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_new', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_new', type: 'certificate_request', username: 'juan2026', residentId: 'RES-0001' },
  });
  assert.equal(res.status, 201);
  assert.equal(received.length, 1);
});

// ── 4. Fail-closed ownership checks (DB errors) ─────────────────────────
test('DB timeout on ownership lookup → NOT proxied (fail closed)', async () => {
  reset();
  const err = new Error('timed out');
  err.code = 'ETIMEDOUT';
  global.__setStubError(err);
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_1', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_1', type: 'certificate_request', username: 'juan2026', residentId: 'RES-0001' },
  });
  assert.notEqual(res.status, 200);
  assert.notEqual(res.status, 201);
  assert.equal(received.length, 0, 'a lookup failure must deny, never proxy');
  assert.ok(res.status === 403 || res.status === 500, `expected denial, got ${res.status}`);
});

test('DB 500 on ownership lookup for DELETE → NOT proxied (fail closed)', async () => {
  reset();
  const err = new Error('server error');
  err.statusCode = 500;
  global.__setStubError(err);
  const res = await request('DELETE', '/api/sync/bustrachub_db/cert_1?rev=1-a', {
    token: tokenFor(RESIDENT),
  });
  assert.equal(received.length, 0, 'a lookup failure must deny the delete');
  assert.ok(res.status === 403 || res.status === 500, `expected denial, got ${res.status}`);
});

test('DB 401 on ownership lookup → NOT proxied (fail closed)', async () => {
  reset();
  const err = new Error('unauthorized');
  err.statusCode = 401;
  global.__setStubError(err);
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_9', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_9', type: 'certificate_request', username: 'juan2026' },
  });
  assert.equal(received.length, 0);
  assert.ok(res.status === 403 || res.status === 500, `expected denial, got ${res.status}`);
});

test('genuine 404 (new doc) still allows a self-owned create → proxied', async () => {
  reset();
  stubBehavior = async () => ({ status: 201, body: { ok: true } });
  // stub throws 404 for unknown ids (see before()).
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_fresh', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_fresh', type: 'certificate_request', username: 'juan2026' },
  });
  assert.equal(res.status, 201);
  assert.equal(received.length, 1);
});

// ── 5. DELETE authorization ─────────────────────────────────────────────
test('resident CANNOT delete another resident doc → 403, not proxied', async () => {
  reset();
  global.__setStubDocs({
    cert_1: { type: 'certificate_request', username: 'juanreyes', residentId: 'RES-0002' },
  });
  const res = await request('DELETE', '/api/sync/bustrachub_db/cert_1?rev=1-a', {
    token: tokenFor(RESIDENT),
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('resident CAN delete their OWN doc → proxied', async () => {
  reset();
  global.__setStubDocs({
    cert_1: { type: 'certificate_request', username: 'juan2026', residentId: 'RES-0001' },
  });
  stubBehavior = async () => ({ status: 200, body: { ok: true, id: 'cert_1', rev: '2-a' } });
  const res = await request('DELETE', '/api/sync/bustrachub_db/cert_1?rev=1-a', {
    token: tokenFor(RESIDENT),
  });
  assert.equal(res.status, 200);
  assert.equal(received.length, 1);
  assert.equal(received[0].method, 'DELETE');
});

test('resident CANNOT delete an account doc → 403', async () => {
  reset();
  global.__setStubDocs({ user_juan2026: { type: 'user', username: 'juan2026' } });
  const res = await request('DELETE', '/api/sync/bustrachub_db/user_juan2026?rev=1-a', {
    token: tokenFor(RESIDENT),
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

// ── 6. _bulk_docs — mixed batches, new_edits, tombstones ────────────────
test('bulk with one unauthorized doc denies the WHOLE batch → 403, nothing proxied', async () => {
  reset();
  global.__setStubDocs({
    blt_ok: { type: 'blotter_record', username: 'juan2026', status: 'Pending' },
  });
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    token: tokenFor(RESIDENT),
    body: {
      docs: [
        { _id: 'cert_ok', type: 'certificate_request', username: 'juan2026' },
        { _id: 'blt_ok', type: 'blotter_record', username: 'juan2026', status: 'Pending' },
        { _id: 'user_juan2026', type: 'user', username: 'juan2026', role: 'admin' },
      ],
    },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0, 'a partial push must never be forwarded');
});

test('bulk of all-own documents is proxied', async () => {
  reset();
  stubBehavior = async () => ({ status: 201, body: [{ ok: true }] });
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    token: tokenFor(RESIDENT),
    body: {
      docs: [
        { _id: 'cert_ok', type: 'certificate_request', username: 'juan2026' },
        { _id: 'fb_ok', type: 'feedback', username: 'juan2026' },
      ],
    },
  });
  assert.equal(res.status, 201);
  assert.equal(received.length, 1);
});

test('bulk with new_edits:false still enforces ownership per doc → 403', async () => {
  reset();
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    token: tokenFor(RESIDENT),
    body: {
      new_edits: false,
      docs: [
        { _id: 'user_juan2026', type: 'user', username: 'juan2026', role: 'admin', _rev: '1-x' },
      ],
    },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('bulk tombstone of another resident doc is denied → 403', async () => {
  reset();
  global.__setStubDocs({
    cert_1: { type: 'certificate_request', username: 'juanreyes', residentId: 'RES-0002' },
  });
  const res = await request('POST', '/api/sync/bustrachub_db/_bulk_docs', {
    token: tokenFor(RESIDENT),
    body: {
      docs: [{ _id: 'cert_1', type: 'certificate_request', username: 'juan2026', _deleted: true }],
    },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

// ── 7. Cross-user / forged ownership over HTTP ──────────────────────────
test('resident cannot write a doc owned by another username → 403', async () => {
  reset();
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_x', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_x', type: 'certificate_request', username: 'juanreyes' },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('resident cannot smuggle role escalation through a resident_profile doc → stored owner check holds', async () => {
  reset();
  // Stored profile belongs to RES-0002; RESIDENT (RES-0001) tries to write it.
  global.__setStubDocs({ profile_a: { type: 'profile', residentId: 'RES-0002' } });
  const res = await request('PUT', '/api/sync/bustrachub_db/profile_a', {
    token: tokenFor(RESIDENT),
    body: { _id: 'profile_a', type: 'profile', residentId: 'RES-0002', role: 'admin' },
  });
  assert.equal(res.status, 403);
  assert.equal(received.length, 0);
});

test('stale revision does not bypass the stored-owner check → 403', async () => {
  reset();
  global.__setStubDocs({
    cert_x: { type: 'certificate_request', username: 'juanreyes', _rev: '5-abc' },
  });
  const res = await request('PUT', '/api/sync/bustrachub_db/cert_x', {
    token: tokenFor(RESIDENT),
    body: { _id: 'cert_x', type: 'certificate_request', username: 'juan2026', _rev: '1-stale' },
  });
  assert.equal(res.status, 403);
});

// ── 8. Read paths remain open to residents ──────────────────────────────
test('resident GET (read) is proxied (not blocked)', async () => {
  reset();
  stubBehavior = async () => ({ status: 200, body: { db_name: 'bustrachub_db' } });
  const res = await request('GET', '/api/sync/bustrachub_db', { token: tokenFor(RESIDENT) });
  assert.equal(res.status, 200);
  assert.equal(received.length, 1);
});

// ── 9. CORS behavior ────────────────────────────────────────────────────
test('allowed origin receives Access-Control-Allow-Origin + credentials', async () => {
  reset();
  const res = await fetch(`${baseUrl}/api/sync/`, {
    method: 'GET',
    headers: { Origin: 'http://localhost:5173' },
  });
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
});

test('disallowed origin does NOT receive a permissive ACAO header', async () => {
  reset();
  let res;
  try {
    res = await fetch(`${baseUrl}/api/sync/`, {
      method: 'GET',
      headers: { Origin: 'http://evil.example.com' },
    });
  } catch (e) {
    // A rejected CORS origin may surface as a network error; that's a denial.
    return;
  }
  const acao = res.headers.get('access-control-allow-origin');
  assert.notEqual(acao, 'http://evil.example.com');
  assert.notEqual(acao, '*');
});

test('CORS preflight (OPTIONS) does not require a Bearer token', async () => {
  reset();
  const res = await fetch(`${baseUrl}/api/sync/bustrachub_db/_bulk_docs`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.ok(res.status === 200 || res.status === 204, `preflight status ${res.status}`);
  assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

// ── 10. Security headers on API responses (including errors) ────────────
test('API responses carry the expected security headers', async () => {
  reset();
  const res = await fetch(`${baseUrl}/api/sync/`, { method: 'GET' });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(res.headers.get('content-security-policy'), 'CSP header must be present');
  assert.ok(
    /frame-ancestors\s+'none'/.test(res.headers.get('content-security-policy')),
    'CSP must include frame-ancestors none'
  );
});

test('security headers are also present on a 401 error response', async () => {
  reset();
  const res = await fetch(`${baseUrl}/api/sync/bustrachub_db/_bulk_docs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"docs":[]}',
  });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});
