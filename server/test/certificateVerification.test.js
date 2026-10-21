'use strict';

// HTTP-level tests for the secure QR verification endpoints.
//
// Run with: node --test server/test/certificateVerification.test.js (or `npm test`).
//
// These load the REAL Express app from ../index.js and drive it over an
// ephemeral HTTP port with an in-memory stub standing in for CouchDB.
//
// Covered:
//   1. a legitimately issued certificate verifies successfully
//   2. a random or altered token is rejected
//   3. a pending / unissued certificate cannot obtain a token and is never valid
//   4. a revoked certificate returns the revoked status
//   5. an expired certificate follows the existing expiry rules
//   6. a token for one certificate cannot verify a different certificate
//   7. the public response reveals no unnecessary personal information
//   8. only admin/staff may mint or revoke
//   9. reprinting keeps the same identity (idempotent mint)
//  10. an unsynchronised (offline) certificate is never reported as verified
//  11. repeated scans do not invalidate the certificate
//  12. duplicate / conflicting records are handled safely

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-jwt-secret-0123456789abcdef';
process.env.SEED_DEMO_USERS = 'false';
process.env.NODE_ENV = 'test';

let app;
let JWT_SECRET;
let server;
let baseUrl;
let stubServer;

let docs = {};

const stubDb = {
  get: async (id) => {
    if (Object.prototype.hasOwnProperty.call(docs, id)) {
      return { ...docs[id], _id: id };
    }
    const err = new Error('missing');
    err.statusCode = 404;
    err.name = 'not_found';
    throw err;
  },
  insert: async (doc) => {
    const current = docs[doc._id];
    if (current && current._rev !== doc._rev) {
      const err = new Error('Document update conflict.');
      err.statusCode = 409;
      err.name = 'conflict';
      throw err;
    }
    const rev = `${current ? Number(String(current._rev).split('-')[0]) + 1 : 1}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    docs[doc._id] = { ...doc, _rev: rev };
    return { ok: true, id: doc._id, rev };
  },
  list: async ({ include_docs } = {}) => ({
    rows: Object.values(docs).map((d) => (include_docs ? { id: d._id, doc: d } : { id: d._id })),
  }),
  find: async ({ selector } = {}) => ({
    docs: Object.values(docs).filter((doc) =>
      Object.entries(selector || {}).every(([k, v]) => doc[k] === v)
    ),
  }),
};

// The rate limiter is a module singleton shared by every request; reset it
// between cases so one test cannot throttle the next. Registered at the TOP
// LEVEL — a beforeEach registered from inside a before() hook never runs.
const controller = require('../controllers/certificateController');

test.beforeEach(() => {
  controller.verifyRateLimiter.reset();
});

test.before(async () => {
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
const adminToken = () => tokenFor({ username: 'jmacabangon', role: 'admin' });
const staffToken = () => tokenFor({ username: 'mgcortero', role: 'staff' });
const residentToken = () => tokenFor({ username: 'juan2026', role: 'resident' });

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

const ISSUED_CERT = {
  _id: 'brgy_clearance_1',
  type: 'barangay_clearance',
  status: 'Issued',
  clearanceNo: 'BC-2026-0001',
  dateIssued: '2026-09-15',
  validity: '(6) Six Months Validity',
  fullName: 'Juan Dela Cruz',
  purok: 'Purok 1',
  address: '123 Mabini Street',
  contact: '09171112222',
  purpose: 'Employment',
  orNumber: 'OR-2026-0001',
};

const reset = () => {
  docs = {};
};

const seed = (doc) => {
  docs[doc._id] = { ...doc, _rev: '1-seed' };
  return docs[doc._id];
};

const mint = async (certificateId, token = adminToken(), verificationToken = undefined) => {
  const body = { certificateId };
  if (verificationToken) body.verificationToken = verificationToken;
  const res = await request('POST', '/api/certificates/verification-token', { token, body });
  const json = await res.json().catch(() => null);
  return { res, json };
};

// ── 1. A legitimately issued certificate verifies successfully ─────────────
test('1. a legitimately issued certificate verifies successfully', async () => {
  reset();
  seed(ISSUED_CERT);

  const { res, json } = await mint('brgy_clearance_1');
  assert.equal(res.status, 200);
  assert.equal(json.success, true);
  assert.ok(json.token, 'the raw token is returned once');
  assert.equal(json.token.length, 43);

  const verify = await request('GET', `/api/certificates/verify-token/${json.token}`);
  assert.equal(verify.status, 200);
  const body = await verify.json();

  assert.equal(body.success, true);
  assert.equal(body.data.valid, true);
  assert.equal(body.data.status, 'valid');
  assert.equal(body.data.documentType, 'Barangay Clearance');
  assert.equal(body.data.referenceNo, 'BC-2026-0001');
  assert.equal(body.data.issuedTo, 'Juan Dela Cruz');
  assert.ok(body.data.dateIssued);
});

test('1b. the server stores only the hash of the token, never the token itself', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  const record = Object.values(docs).find((d) => d.type === 'certificate_verification');
  assert.ok(record, 'a verification record must exist');
  assert.equal(JSON.stringify(record).includes(json.token), false);
  assert.equal(record.tokenHash.length, 64);
  assert.equal(record.certificateId, 'brgy_clearance_1');
});

// ── 2. A random or altered token is rejected ───────────────────────────────
test('2. a random token is rejected', async () => {
  reset();
  seed(ISSUED_CERT);
  await mint('brgy_clearance_1');

  const random = 'A'.repeat(43);
  const res = await request('GET', `/api/certificates/verify-token/${random}`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.message, 'Certificate not found.');
});

test('2b. an altered token is rejected', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  const altered = `${json.token.slice(0, 42)}${json.token[42] === 'A' ? 'B' : 'A'}`;
  const res = await request('GET', `/api/certificates/verify-token/${altered}`);
  assert.equal(res.status, 404);
});

test('2c. a malformed token gets the same neutral answer as an unknown one', async () => {
  reset();
  const res = await request('GET', '/api/certificates/verify-token/not-a-token');
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.message, 'Certificate not found.');
  assert.equal(JSON.stringify(body).includes('token'), false);
});

// ── 3. A pending / unissued certificate is never valid ──────────────────────
test('3. a pending certificate cannot obtain a verification token', async () => {
  reset();
  seed({
    _id: 'CERT-pending',
    type: 'certificate_request',
    status: 'Pending',
    refNumber: 'CERT-2026-0002',
  });

  const { res, json } = await mint('CERT-pending');
  assert.equal(res.status, 409);
  assert.equal(json.success, false);
  assert.equal(json.status, 'pending');

  // And no verification record was created.
  const records = Object.values(docs).filter((d) => d.type === 'certificate_verification');
  assert.equal(records.length, 0);
});

test('3b. a draft, submitted or rejected certificate cannot obtain a token', async () => {
  reset();
  for (const status of ['Draft', 'Submitted', 'Under Review', 'Awaiting Approval', 'Cancelled', 'Needs Revision']) {
    const id = `CERT-${status.replace(/\s+/g, '-')}`;
    seed({ _id: id, type: 'certificate_request', status, refNumber: id });
    const { res } = await mint(id);
    assert.equal(res.status, 409, `${status} must not be mintable`);
  }
});

test('3c. a certificate record that is not genuinely issued is not reported as valid', async () => {
  reset();
  // Simulate a hand-written record pointing at a non-issued certificate.
  const token = 'B'.repeat(43);
  const hash = require('crypto').createHash('sha256').update(token, 'utf8').digest('hex');
  seed({
    _id: `certverify_${hash}`,
    type: 'certificate_verification',
    certificateId: 'brgy_clearance_1',
    certificateNumber: 'BC-2026-0001',
    status: 'active',
    tokenHash: hash,
  });
  seed({ ...ISSUED_CERT, status: 'Draft' });

  const res = await request('GET', `/api/certificates/verify-token/${token}`);
  const body = await res.json();
  assert.equal(body.data.valid, false);
  assert.equal(body.data.status, 'pending');
});

// ── 4. A revoked certificate returns the revoked status ────────────────────
test('4. a revoked certificate returns the revoked status', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  const revoke = await request('POST', '/api/certificates/revoke', {
    token: adminToken(),
    body: { certificateId: 'brgy_clearance_1' },
  });
  assert.equal(revoke.status, 200);
  const revokeBody = await revoke.json();
  assert.equal(revokeBody.success, true);
  assert.equal(revokeBody.verificationRevoked, true);

  const verify = await request('GET', `/api/certificates/verify-token/${json.token}`);
  const body = await verify.json();
  assert.equal(body.data.valid, false);
  assert.equal(body.data.status, 'invalid');
  assert.equal(body.data.statusLabel, 'Revoked');
});

test('4b. revoking writes an audit entry naming the actor and the certificate', async () => {
  reset();
  seed(ISSUED_CERT);
  await mint('brgy_clearance_1');
  await request('POST', '/api/certificates/revoke', {
    token: staffToken(),
    body: { certificateId: 'brgy_clearance_1' },
  });

  const audit = Object.values(docs).find((d) => d.type === 'audit_log' && d.action === 'REVOKE_CERTIFICATE');
  assert.ok(audit, 'a REVOKE_CERTIFICATE audit entry must be written');
  assert.equal(audit.actor.username, 'mgcortero');
  assert.equal(audit.recordId, 'brgy_clearance_1');
  assert.ok(audit.timestamp);
  assert.ok(audit.details.includes('BC-2026-0001'));
});

test('4c. minting writes an audit entry naming the actor and the certificate', async () => {
  reset();
  seed(ISSUED_CERT);
  await mint('brgy_clearance_1');

  const audit = Object.values(docs).find(
    (d) => d.type === 'audit_log' && d.action === 'ISSUE_CERTIFICATE_VERIFICATION_TOKEN'
  );
  assert.ok(audit);
  assert.equal(audit.actor.username, 'jmacabangon');
  assert.equal(audit.recordId, 'brgy_clearance_1');
  assert.ok(audit.timestamp);
});

// ── 5. An expired certificate follows the existing expiry rules ────────────
test('5. an expired certificate is reported as expired', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  // The certificate expires: 6 months from the issue date.
  seed({ ...ISSUED_CERT, dateIssued: '2020-01-10' });

  const verify = await request('GET', `/api/certificates/verify-token/${json.token}`);
  const body = await verify.json();
  assert.equal(body.data.valid, false);
  assert.equal(body.data.status, 'expired');
});

test('5b. an expired certificate cannot obtain a new token', async () => {
  reset();
  seed({ ...ISSUED_CERT, dateIssued: '2020-01-10' });
  const { res, json } = await mint('brgy_clearance_1');
  assert.equal(res.status, 409);
  assert.equal(json.status, 'expired');
});

// ── 6. A token for one certificate cannot verify a different certificate ─────
test('6. a token issued for one certificate does not verify a different one', async () => {
  reset();
  seed(ISSUED_CERT);
  seed({
    _id: 'brgy_clearance_2',
    type: 'barangay_clearance',
    status: 'Issued',
    clearanceNo: 'BC-2026-0002',
    dateIssued: '2026-09-15',
    validity: '(6) Six Months Validity',
    fullName: 'Maria Santos',
  });

  const { json } = await mint('brgy_clearance_1');

  // The token still verifies certificate 1 …
  const first = await request('GET', `/api/certificates/verify-token/${json.token}`);
  const firstBody = await first.json();
  assert.equal(firstBody.data.referenceNo, 'BC-2026-0001');
  assert.equal(firstBody.data.issuedTo, 'Juan Dela Cruz');

  // … and it can never be presented as certificate 2: the record is bound to
  // one certificate id, and the endpoint always reports the bound record.
  const record = Object.values(docs).find((d) => d.type === 'certificate_verification');
  assert.equal(record.certificateId, 'brgy_clearance_1');
  assert.notEqual(record.certificateNumber, 'BC-2026-0002');
});

test('6b. copying a token onto another certificate does not change what it verifies', async () => {
  reset();
  seed(ISSUED_CERT);
  seed({
    _id: 'brgy_clearance_2',
    type: 'barangay_clearance',
    status: 'Issued',
    clearanceNo: 'BC-2026-0002',
    dateIssued: '2026-09-15',
    validity: '(6) Six Months Validity',
    fullName: 'Maria Santos',
  });
  const { json } = await mint('brgy_clearance_1');

  // Simulate a forged certificate that carries the token of certificate 1.
  seed({ ...ISSUED_CERT, _id: 'brgy_clearance_2', clearanceNo: 'BC-2026-0002', fullName: 'Maria Santos', verificationToken: json.token });

  const verify = await request('GET', `/api/certificates/verify-token/${json.token}`);
  const body = await verify.json();

  // The endpoint reports the certificate the record is bound to, so the
  // details still do not match the forged document.
  assert.equal(body.data.referenceNo, 'BC-2026-0001');
  assert.equal(body.data.issuedTo, 'Juan Dela Cruz');
});

// ── 7. The public response reveals no unnecessary personal information ──────
test('7. the public verification response exposes only the minimum fields', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  const res = await request('GET', `/api/certificates/verify-token/${json.token}`);
  const body = await res.json();
  const data = body.data;

  assert.deepEqual(
    Object.keys(data).sort(),
    ['dateIssued', 'documentType', 'issuedTo', 'referenceNo', 'status', 'statusLabel', 'valid'].sort()
  );

  const serialised = JSON.stringify(body);
  assert.equal(serialised.includes('123 Mabini Street'), false, 'no address');
  assert.equal(serialised.includes('09171112222'), false, 'no contact number');
  assert.equal(serialised.includes('Employment'), false, 'no purpose');
  assert.equal(serialised.includes('OR-2026-0001'), false, 'no OR number');
  assert.equal(serialised.includes('Purok 1'), false, 'no purok');
  assert.equal(serialised.includes(json.token), false, 'the token is never echoed back');
});

// ── 8. Only admin/staff may mint or revoke ────────────────────────────────
test('8. minting requires a session', async () => {
  reset();
  seed(ISSUED_CERT);
  const res = await request('POST', '/api/certificates/verification-token', {
    body: { certificateId: 'brgy_clearance_1' },
  });
  assert.equal(res.status, 401);
});

test('8b. a resident may not mint or revoke', async () => {
  reset();
  seed(ISSUED_CERT);
  const mintRes = await request('POST', '/api/certificates/verification-token', {
    token: residentToken(),
    body: { certificateId: 'brgy_clearance_1' },
  });
  assert.equal(mintRes.status, 403);

  const revokeRes = await request('POST', '/api/certificates/revoke', {
    token: residentToken(),
    body: { certificateId: 'brgy_clearance_1' },
  });
  assert.equal(revokeRes.status, 403);
});

test('8c. staff may mint and revoke', async () => {
  reset();
  seed(ISSUED_CERT);
  const { res } = await mint('brgy_clearance_1', staffToken());
  assert.equal(res.status, 200);
});

test('8d. a bad request body is rejected', async () => {
  reset();
  const missing = await request('POST', '/api/certificates/verification-token', {
    token: adminToken(),
    body: {},
  });
  assert.equal(missing.status, 400);

  const badId = await request('POST', '/api/certificates/verification-token', {
    token: adminToken(),
    body: { certificateId: '_local/secret' },
  });
  assert.equal(badId.status, 400);
});

// ── 9. Reprinting keeps the same identity ──────────────────────────────────
test('9. minting again with the same token returns the SAME token', async () => {
  reset();
  seed(ISSUED_CERT);

  const first = await mint('brgy_clearance_1');
  assert.equal(first.res.status, 200);

  // The device still holds the token it was given and presents it again
  // (this is what a reprint does).
  const second = await mint('brgy_clearance_1', adminToken(), first.json.token);

  assert.equal(second.res.status, 200);
  assert.equal(second.json.reused, true);
  assert.equal(second.json.token, first.json.token, 'reprinting must not create a second identity');

  const records = Object.values(docs).filter((d) => d.type === 'certificate_verification');
  assert.equal(records.length, 1, 'exactly one verification record per certificate');
});

test('9a. minting without the existing token is refused rather than duplicated', async () => {
  reset();
  seed(ISSUED_CERT);
  const first = await mint('brgy_clearance_1');
  assert.equal(first.res.status, 200);

  // The device lost the token and asks for a new one. Rather than create a
  // second identity, the server refuses and asks for the existing token.
  const second = await mint('brgy_clearance_1');
  assert.equal(second.res.status, 409);
  assert.equal(second.json.existing, true);

  const records = Object.values(docs).filter((d) => d.type === 'certificate_verification');
  assert.equal(records.length, 1, 'no duplicate verification record may be created');
});

test('9b. the certificate document keeps the token so a reprint can use it', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  // The issuing device stores the token on the certificate so the printed QR
  // (and any reprint) uses the same secret.
  docs.brgy_clearance_1.verificationToken = json.token;

  const again = await mint('brgy_clearance_1', adminToken(), json.token);
  assert.equal(again.json.token, json.token);
  assert.equal(again.json.reused, true);
});

test('9c. a token that belongs to another certificate is not reused', async () => {
  reset();
  seed(ISSUED_CERT);
  seed({
    _id: 'brgy_clearance_2',
    type: 'barangay_clearance',
    status: 'Issued',
    clearanceNo: 'BC-2026-0002',
    dateIssued: '2026-09-15',
    validity: '(6) Six Months Validity',
  });
  const first = await mint('brgy_clearance_1');

  // Certificate 2 carries certificate 1's token — a forgery attempt.
  seed({ ...docs.brgy_clearance_2, verificationToken: first.json.token });

  const second = await mint('brgy_clearance_2', adminToken(), first.json.token);
  assert.equal(second.res.status, 200);
  assert.notEqual(second.json.token, first.json.token, 'a foreign token must not be adopted');
  assert.equal(second.json.reused, false);
});

// ── 10. An unsynchronised (offline) certificate is never reported valid ────
test('10. a certificate the server has never seen is not found', async () => {
  reset();
  // The certificate exists only on the device — it has not replicated yet.
  const { res, json } = await mint('brgy_clearance_offline');
  assert.equal(res.status, 404);
  assert.equal(json.message, 'Certificate not found.');
});

test('10b. a verification record whose certificate never replicated is not valid', async () => {
  reset();
  const token = 'C'.repeat(43);
  const hash = require('crypto').createHash('sha256').update(token, 'utf8').digest('hex');
  seed({
    _id: `certverify_${hash}`,
    type: 'certificate_verification',
    certificateId: 'brgy_clearance_offline',
    certificateNumber: 'BC-2026-0009',
    status: 'active',
    tokenHash: hash,
  });

  const res = await request('GET', `/api/certificates/verify-token/${token}`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
});

// ── 11. Repeated scans do not invalidate the certificate ───────────────────
test('11. repeated scans of a valid certificate all succeed', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  for (let i = 0; i < 5; i += 1) {
    const res = await request('GET', `/api/certificates/verify-token/${json.token}`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.valid, true, `scan ${i + 1} must still be valid`);
  }

  // The record is unchanged — a scan is read-only.
  const record = Object.values(docs).find((d) => d.type === 'certificate_verification');
  assert.equal(record.status, 'active');
  assert.equal(record.reprintCount, 0);
});

// ── 12. Duplicate / conflicting records are handled safely ─────────────────
test('12. minting is safe when a verification record already exists', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  // The certificate lost its token field (e.g. an old document), so the
  // device cannot present it. The server refuses rather than silently
  // creating a second identity for the same certificate.
  delete docs.brgy_clearance_1.verificationToken;

  const second = await mint('brgy_clearance_1');
  assert.equal(second.res.status, 409);
  assert.equal(second.json.existing, true);

  const records = Object.values(docs).filter((d) => d.type === 'certificate_verification');
  assert.equal(records.length, 1, 'no duplicate verification record may be created');

  // The original token still works — the original is never invalidated.
  const verify = await request('GET', `/api/certificates/verify-token/${json.token}`);
  assert.equal((await verify.json()).data.valid, true);
});

test('12a. a revoked certificate cannot be issued a new token', async () => {
  reset();
  seed(ISSUED_CERT);
  const first = await mint('brgy_clearance_1');
  await request('POST', '/api/certificates/revoke', {
    token: adminToken(),
    body: { certificateId: 'brgy_clearance_1' },
  });

  // A revoked certificate must never be re-mintable: it is not an issued
  // document any more. A REPLACEMENT is a new document with a new id.
  const second = await mint('brgy_clearance_1');
  assert.equal(second.res.status, 409);
  assert.equal(second.json.status, 'invalid');

  // The original token is dead.
  const oldVerify = await request('GET', `/api/certificates/verify-token/${first.json.token}`);
  const oldBody = await oldVerify.json();
  assert.equal(oldBody.data.valid, false);
  assert.equal(oldBody.data.statusLabel, 'Revoked');
});

test('12b. the public endpoint is rate limited', async () => {
  reset();
  seed(ISSUED_CERT);
  const { json } = await mint('brgy_clearance_1');

  let limited = null;
  for (let i = 0; i < 40; i += 1) {
    const res = await request('GET', `/api/certificates/verify-token/${json.token}`);
    if (res.status === 429) {
      limited = res;
      break;
    }
  }

  assert.ok(limited, 'the endpoint must start refusing requests');
  const body = await limited.json();
  assert.equal(body.success, false);
  assert.match(body.message, /Too many verification requests/);
  // A rate-limited response must not leak the certificate details.
  assert.equal(body.data, undefined);
});

// ── 13. A resident-forged certificate is never publicly verifiable ─────────
test('13. a resident-forged certificate_request (Issued/isIssued, no verification record) is not found by token', async () => {
  reset();
  // The forgery the sync proxy used to allow: a resident-written document that
  // claims to be issued — with NO server-minted token and NO verification
  // record behind it. The proxy now pins the certificate lifecycle fields
  // (RESIDENT_PROTECTED_CERTIFICATE_FIELDS), so this document can no longer
  // be created through /api/sync; even given such a document, the public
  // token endpoint must not report it as verified.
  seed({
    _id: 'CERT-forged-by-resident',
    type: 'certificate_request',
    username: 'juan2026',
    residentId: 'RES-0001',
    status: 'Issued',
    isIssued: true,
    step: 5,
    refNumber: 'CERT-2026-999999',
    dateIssued: '2026-10-01',
    fullName: 'Forged Name',
  });

  // Nothing in the server-owned registry corresponds to it: no token was ever
  // minted, so there is no verification record to resolve.
  const records = Object.values(docs).filter((d) => d.type === 'certificate_verification');
  assert.equal(records.length, 0);

  const res = await request('GET', `/api/certificates/verify-token/${'D'.repeat(43)}`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.message, 'Certificate not found.');
  assert.equal(body.data, undefined);
});
