'use strict';

// ──────────────────────────────────────────────────────────────
// VAWC (RA 9262 §44) CONFIDENTIALITY regression tests for the sync proxy.
// Run with: node --test server/test/vawcSync.test.js  (or `npm test`).
//
// These drive the REAL Express app from ../index.js over an ephemeral HTTP
// port with a stub upstream CouchDB (advertised via COUCHDB_URL). They prove
// the server-enforced read redaction: a viewer who is neither `admin` nor
// `vawc_officer` can NEVER pull an unmasked VAWC blotter document through the
// proxy, even though PouchDB would otherwise replicate it verbatim.
//
// Nothing is mocked at the policy layer — the actual proxyCouch buffering /
// rewriting path runs. Only the upstream CouchDB is stubbed.
//
// No new dependencies: node:test + node:http + global fetch only.
// ──────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-0123456789abcdef';
process.env.SEED_DEMO_USERS = 'false';
process.env.NODE_ENV = 'test';

// A stub "CouchDB" the proxy talks to. `upstreamBody` is what it returns for
// every request (an object → JSON; a string → verbatim).
const received = [];
let upstreamStatus = 200;
let upstreamBody = { ok: true };

const stubServer = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    received.push({ method: req.method, url: req.url, headers: req.headers });
    const payload = typeof upstreamBody === 'string' ? upstreamBody : JSON.stringify(upstreamBody ?? {});
    res.writeHead(upstreamStatus, { 'Content-Type': 'application/json' });
    res.end(payload);
  });
});

let stubPort;
let app;
let JWT_SECRET;
let server;
let baseUrl;

// In-memory CouchDB docs used by the authorization lookups (owner checks).
let docs = {};

const tokenFor = (user) => jwt.sign({ user }, JWT_SECRET, { expiresIn: '8h' });

test.before(async () => {
  await new Promise((resolve) => stubServer.listen(0, '127.0.0.1', resolve));
  stubPort = stubServer.address().port;
  process.env.COUCHDB_URL = `http://admin:pass@127.0.0.1:${stubPort}`;

  const mod = require('../index');
  app = mod.app;
  JWT_SECRET = mod.JWT_SECRET;

  const inserted = [];
  app.set('db', {
    get: async (id) => {
      if (Object.prototype.hasOwnProperty.call(docs, id)) return { ...docs[id], _id: id };
      const err = new Error('missing');
      err.statusCode = 404;
      err.error = 'not_found';
      err.reason = 'missing';
      throw err;
    },
    insert: async (doc) => { inserted.push(doc); return { ok: true }; },
  });
  app.set('__insertedAudits', inserted);

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
  upstreamStatus = 200;
  upstreamBody = { ok: true };
  docs = {};
  app.get('__insertedAudits').length = 0;
};

const get = (path, token) =>
  fetch(`${baseUrl}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const STAFF = { username: 'mgcortero', role: 'staff' };
const VAWC_OFFICER = { username: 'vawcdesk', role: 'vawc_officer' };
const ADMIN = { username: 'jmacabangon', role: 'admin' };
const RESIDENT = { username: 'juan2026', residentId: 'RES-0001', role: 'resident' };

const VAWC_DOC = {
  _id: 'blt_vawc_1',
  _rev: '1-abc',
  type: 'blotter_record',
  vawcFlag: true,
  caseNumber: 'BLT-2026-0001',
  status: 'Pending',
  narrative: 'Confidential VAWC narrative.',
  complainantName: 'Maria Santos',
  complainantAddress: 'Purok 3, Bustrac',
  respondentName: 'Jose Reyes',
  respondentAddress: 'Purok 5, Bustrac',
  contactNumber: '09171234567',
  createdAt: '2026-01-01T00:00:00.000Z',
};

// ── 1. Non-authorized viewer (staff) must NOT receive raw VAWC PII ──────
test('staff GET of a VAWC doc → sensitive fields are REDACTED', async () => {
  reset();
  upstreamBody = { ...VAWC_DOC };
  const res = await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(STAFF));
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.narrative, '[REDACTED — VAWC]');
  assert.equal(body.complainantName, '[REDACTED — VAWC]');
  assert.equal(body.respondentName, '[REDACTED — VAWC]');
  assert.equal(body.complainantAddress, '[REDACTED — VAWC]');
  assert.equal(body.respondentAddress, '[REDACTED — VAWC]');
  assert.equal(body.contactNumber, '[REDACTED — VAWC]');

  // Tracking fields remain visible.
  assert.equal(body._id, 'blt_vawc_1');
  assert.equal(body.type, 'blotter_record');
  assert.equal(body.status, 'Pending');
  assert.equal(body.caseNumber, 'BLT-2026-0001');

  // Raw PII must not appear anywhere in the serialized response.
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('Maria Santos'), 'complainant name leaked');
  assert.ok(!raw.includes('Jose Reyes'), 'respondent name leaked');
  assert.ok(!raw.includes('09171234567'), 'contact number leaked');
  assert.ok(!raw.includes('Confidential VAWC narrative'), 'narrative leaked');
});

test('resident GET of a VAWC doc → sensitive fields are REDACTED', async () => {
  reset();
  upstreamBody = { ...VAWC_DOC };
  const res = await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(RESIDENT));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.narrative, '[REDACTED — VAWC]');
  assert.equal(body.complainantName, '[REDACTED — VAWC]');
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('Maria Santos'));
  assert.ok(!raw.includes('Confidential VAWC narrative'));
});

// ── 2. Authorized viewer (vawc_officer) receives the UNMASKED doc ───────
test('vawc_officer GET of a VAWC doc → UNMASKED (full PII)', async () => {
  reset();
  upstreamBody = { ...VAWC_DOC };
  const res = await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(VAWC_OFFICER));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.narrative, 'Confidential VAWC narrative.');
  assert.equal(body.complainantName, 'Maria Santos');
  assert.equal(body.respondentName, 'Jose Reyes');
  assert.equal(body.contactNumber, '09171234567');
});

test('admin GET of a VAWC doc → UNMASKED (full PII)', async () => {
  reset();
  upstreamBody = { ...VAWC_DOC };
  const res = await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(ADMIN));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.complainantName, 'Maria Santos');
  assert.equal(body.narrative, 'Confidential VAWC narrative.');
});

// ── 3. The unmask must be audited (VAWC_UNMASK_ACCESS) ──────────────────
test('vawc_officer read of a VAWC doc writes a VAWC_UNMASK_ACCESS audit entry', async () => {
  reset();
  upstreamBody = { ...VAWC_DOC };
  await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(VAWC_OFFICER));
  // Give the fire-and-forget insert a tick to land.
  await new Promise((r) => setTimeout(r, 50));
  const audits = app.get('__insertedAudits').filter((d) => d.action === 'VAWC_UNMASK_ACCESS');
  assert.equal(audits.length, 1, 'exactly one unmask audit expected');
  assert.equal(audits[0].actor.username, 'vawcdesk');
  assert.equal(audits[0].actor.role, 'vawc_officer');
  assert.ok(
    String(audits[0].details).includes('blt_vawc_1'),
    'audit details must reference the unmasked doc'
  );
});

test('staff read of a VAWC doc writes NO unmask audit (they saw nothing)', async () => {
  reset();
  upstreamBody = { ...VAWC_DOC };
  await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(STAFF));
  await new Promise((r) => setTimeout(r, 50));
  const audits = app.get('__insertedAudits').filter((d) => d.action === 'VAWC_UNMASK_ACCESS');
  assert.equal(audits.length, 0);
});

// ── 4. Non-VAWC docs are never altered, regardless of role ──────────────
test('staff GET of a NON-VAWC blotter doc → unchanged (no redaction)', async () => {
  reset();
  const plain = {
    _id: 'blt_plain_1',
    type: 'blotter_record',
    vawcFlag: false,
    narrative: 'Ordinary blotter narrative.',
    complainantName: 'Pedro Cruz',
    respondentName: 'Ana Lim',
  };
  upstreamBody = { ...plain };
  const res = await get('/api/sync/bustrachub_db/blt_plain_1', tokenFor(STAFF));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.narrative, 'Ordinary blotter narrative.');
  assert.equal(body.complainantName, 'Pedro Cruz');
});

// ── 5. _all_docs / _changes row shape is redacted too ───────────────────
test('staff GET _all_docs with VAWC rows → each row.doc is redacted', async () => {
  reset();
  upstreamBody = {
    total_rows: 2,
    rows: [
      { id: 'blt_vawc_1', key: 'blt_vawc_1', doc: { ...VAWC_DOC } },
      { id: 'blt_plain_1', key: 'blt_plain_1', doc: { _id: 'blt_plain_1', type: 'blotter_record', vawcFlag: false, complainantName: 'Pedro Cruz' } },
    ],
  };
  const res = await get('/api/sync/bustrachub_db/_all_docs?include_docs=true', tokenFor(STAFF));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rows[0].doc.complainantName, '[REDACTED — VAWC]');
  assert.equal(body.rows[0].doc.narrative, '[REDACTED — VAWC]');
  // Non-VAWC row untouched.
  assert.equal(body.rows[1].doc.complainantName, 'Pedro Cruz');
  const raw = JSON.stringify(body);
  assert.ok(!raw.includes('Maria Santos'));
});

test('vawc_officer GET _all_docs → VAWC rows stay unmasked', async () => {
  reset();
  upstreamBody = {
    total_rows: 1,
    rows: [{ id: 'blt_vawc_1', key: 'blt_vawc_1', doc: { ...VAWC_DOC } }],
  };
  const res = await get('/api/sync/bustrachub_db/_all_docs?include_docs=true', tokenFor(VAWC_OFFICER));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rows[0].doc.complainantName, 'Maria Santos');
});

// ── 6. Content-Length is recomputed after redaction (no client hang) ────
test('redacted response has a Content-Length matching the rewritten body', async () => {
  reset();
  // A long narrative guarantees the masked body is SHORTER than upstream, so a
  // stale Content-Length would truncate/hang the client.
  upstreamBody = {
    ...VAWC_DOC,
    narrative: 'X'.repeat(5000),
  };
  const res = await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(STAFF));
  const text = await res.text();
  const declared = Number(res.headers.get('content-length'));
  assert.equal(declared, Buffer.byteLength(text), 'Content-Length must match the masked body');
  assert.ok(
    declared < Buffer.byteLength(JSON.stringify(upstreamBody)),
    'the redacted body must be shorter than upstream for this fixture'
  );
});

// ── 7. Error responses are never masked/rewritten ───────────────────────
test('a 500 from upstream streams through untouched (not masked)', async () => {
  reset();
  upstreamStatus = 500;
  upstreamBody = { error: 'internal', reason: 'boom' };
  const res = await get('/api/sync/bustrachub_db/blt_vawc_1', tokenFor(STAFF));
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.error, 'internal');
});
