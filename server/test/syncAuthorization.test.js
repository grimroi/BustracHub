'use strict';

// Focused authorization tests for the sync proxy policy.
// Run with: node --test server/test/syncAuthorization.test.js
// (or `npm test` from server/).
//
// These exercise the pure policy module used by the /api/sync proxy so the
// behavior is verified WITHOUT a running CouchDB or Express stack. A tiny
// in-memory `nanoDb` stub stands in for CouchDB's `.get(id)`.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RESIDENT_WRITE_TYPES,
  RESIDENT_ACCOUNT_DOC_TYPES,
  docOwnedBy,
  verifyExistingDocOwnership,
  residentDenyReason,
  assessResidentWrite,
  assessStoredDocWrite,
  isDocumentNotFoundError,
  fetchExistingDoc,
} = require('../utils/syncAuthorization');

// ── Test doubles ────────────────────────────────────────────────────────
const RESIDENT = {
  username: 'juan2026',
  residentId: 'RES-0001',
  role: 'resident',
};

const makeNanoDb = (docs = {}) => ({
  get: async (id) => {
    if (Object.prototype.hasOwnProperty.call(docs, id)) {
      return { ...docs[id], _id: id };
    }
    const err = new Error('not_found');
    err.statusCode = 404;
    throw err;
  },
});

const baseCert = () => ({
  _id: 'cert_1',
  type: 'certificate_request',
  username: 'juan2026',
  residentId: 'RES-0001',
  status: 'Pending',
});

// ── 1. RESIDENT_WRITE_TYPES must NOT contain 'user' ─────────────────────
test("RESIDENT_WRITE_TYPES excludes 'user' (account docs are never resident-writable)", () => {
  assert.equal(RESIDENT_WRITE_TYPES.has('user'), false);
});

test('RESIDENT_ACCOUNT_DOC_TYPES is aligned with the excluded account types', () => {
  assert.equal(RESIDENT_ACCOUNT_DOC_TYPES.has('user'), true);
});

// ── 2. docOwnedBy ───────────────────────────────────────────────────────
test('docOwnedBy: own certificate by username', () => {
  assert.equal(docOwnedBy(baseCert(), RESIDENT), true);
});

test('docOwnedBy: own document by residentId only', () => {
  assert.equal(
    docOwnedBy({ type: 'certificate_request', residentId: 'RES-0001' }, RESIDENT),
    true
  );
});

test('docOwnedBy: cross-user id/username is denied', () => {
  assert.equal(
    docOwnedBy({ type: 'certificate_request', username: 'other' }, RESIDENT),
    false
  );
  assert.equal(
    docOwnedBy({ type: 'certificate_request', residentId: 'RES-9999' }, RESIDENT),
    false
  );
});

test('docOwnedBy: account docs are never owned by a resident for write', () => {
  assert.equal(
    docOwnedBy({ _id: 'user_juan2026', type: 'user', username: 'juan2026' }, RESIDENT),
    false
  );
});

test('docOwnedBy: non-writable type is denied even when owned', () => {
  assert.equal(
    docOwnedBy({ type: 'announcement', username: 'juan2026' }, RESIDENT),
    false
  );
});

test('docOwnedBy: garbage input does not throw', () => {
  assert.equal(docOwnedBy(null, RESIDENT), false);
  assert.equal(docOwnedBy(undefined, RESIDENT), false);
  assert.equal(docOwnedBy('str', RESIDENT), false);
});

// ── 3. Account document writes are fully denied ─────────────────────────
test('account doc CREATE by resident is denied', async () => {
  const nano = makeNanoDb({});
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'user_juan2026', type: 'user', username: 'juan2026', role: 'admin' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('account doc UPDATE by resident is denied (cannot change role)', async () => {
  const nano = makeNanoDb({
    user_juan2026: { type: 'user', username: 'juan2026', role: 'resident', passwordHash: 'x', status: 'Active' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'user_juan2026', type: 'user', username: 'juan2026', role: 'admin' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

// ── 4. Attempts to change auth/authz fields on a resident-profile doc ────
// The profile document is the only self-serviceable identity doc; if a
// resident tries to smuggle role/passwordHash/status onto it, ownership of
// the type still holds but the field is not a server-side account field, so
// the write is allowed only insofar as it remains a `resident` doc. The
// server's authoritative auth fields live on the `user` account doc, which
// is impossible to write (asserted above). We assert the account boundary.
for (const field of ['role', 'passwordHash', 'status', 'permissions', 'username', 'isAdmin']) {
  test(`resident cannot write account field "${field}" via account doc`, async () => {
    const nano = makeNanoDb({
      user_juan2026: {
        type: 'user', username: 'juan2026', role: 'resident', status: 'Active', passwordHash: 'h',
      },
    });
    const doc = {
      _id: 'user_juan2026', type: 'user', username: 'juan2026',
      role: 'resident', status: 'Active', passwordHash: 'h',
    };
    doc[field] = field === 'status' ? 'Deactivated' : 'ESCALATED';
    const verdict = await assessResidentWrite(nano, doc, RESIDENT);
    assert.equal(verdict.allowed, false, `expected ${field} escalation to be denied`);
  });
}

// ── 5. Cross-user update (stored doc owned by someone else) ──────────────
test('cross-user update denied even when submitted doc looks owned', async () => {
  const nano = makeNanoDb({
    cert_1: { type: 'certificate_request', username: 'other', residentId: 'RES-9999' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_1', type: 'certificate_request', username: 'juan2026', residentId: 'RES-0001' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'existing document not owned or protected field changed');
});

// ── 6. Forged ownership identifiers on a NEW doc (no stored doc) ─────────
test('new doc with forged username for a non-account type is denied', async () => {
  const nano = makeNanoDb({});
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_2', type: 'certificate_request', username: 'someone-else' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('new own doc with no owner fields is denied', async () => {
  const nano = makeNanoDb({});
  const verdict = await assessResidentWrite(nano, { _id: 'cert_3', type: 'certificate_request' }, RESIDENT);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'missing owner fields');
});

// ── 7. Protected blotter lifecycle fields ────────────────────────────────
test('resident cannot self-advance blotter status', async () => {
  const nano = makeNanoDb({
    blt_1: { type: 'blotter_record', username: 'juan2026', status: 'Pending' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'blt_1', type: 'blotter_record', username: 'juan2026', status: 'Settled / Resolved' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('resident may edit own blotter narrative without touching protected fields', async () => {
  const nano = makeNanoDb({
    blt_2: { type: 'blotter_record', username: 'juan2026', status: 'Pending' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'blt_2', type: 'blotter_record', username: 'juan2026', status: 'Pending', details: 'updated narrative' },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

// ── 8. Event registration lifecycle ──────────────────────────────────────
test('resident may create an event registration as Pending for a real event', async () => {
  const nano = makeNanoDb({
    evt_1: { type: 'barangay_event' },
  });
  const verdict = await assessResidentWrite(
    nano,
    {
      _id: 'reg_1', type: 'event_registration', username: 'juan2026',
      residentId: 'RES-0001', status: 'Pending', eventId: 'evt_1',
    },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

test('resident cannot forge event approval provenance', async () => {
  const nano = makeNanoDb({
    evt_1: { type: 'barangay_event' },
  });
  const verdict = await assessResidentWrite(
    nano,
    {
      _id: 'reg_2', type: 'event_registration', username: 'juan2026',
      residentId: 'RES-0001', status: 'Pending', eventId: 'evt_1',
      approvedBy: 'admin', approvedAt: '2020-01-01',
    },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('resident cannot register for an unknown/missing event', async () => {
  const nano = makeNanoDb({});
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'reg_3', type: 'event_registration', username: 'juan2026', status: 'Pending', eventId: 'nope' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

// ── 9. Deletes ───────────────────────────────────────────────────────────
test('resident may delete own document (id-only DELETE path)', () => {
  const verdict = assessStoredDocWrite(
    { _id: 'cert_1', type: 'certificate_request', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

test('resident may NOT delete another resident document', () => {
  const verdict = assessStoredDocWrite(
    { _id: 'cert_1', type: 'certificate_request', username: 'other' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('resident may NOT delete an account document', () => {
  const verdict = assessStoredDocWrite(
    { _id: 'user_juan2026', type: 'user', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('tombstone (_deleted) update of own doc is allowed', async () => {
  const nano = makeNanoDb({
    cert_9: { type: 'certificate_request', username: 'juan2026' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_9', type: 'certificate_request', username: 'juan2026', _deleted: true },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

test('tombstone of an account doc is denied', async () => {
  const nano = makeNanoDb({
    user_juan2026: { type: 'user', username: 'juan2026' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'user_juan2026', type: 'user', username: 'juan2026', _deleted: true },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

// ── 10. Stale revision must not bypass ownership ─────────────────────────
test('stale/absent revision does not bypass the stored-owner check', async () => {
  const nano = makeNanoDb({
    cert_x: { type: 'certificate_request', username: 'other', _rev: '5-abc' },
  });
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_x', type: 'certificate_request', username: 'juan2026', _rev: '1-stale' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

// ── 11. Mixed authorized/unauthorized bulk batch semantics ───────────────
// The proxy denies the whole batch if ANY doc is unauthorized. We assert the
// per-doc verdicts that drive that decision.
test('bulk batch with one unauthorized doc yields a denial signal', async () => {
  const nano = makeNanoDb({
    blt_ok: { type: 'blotter_record', username: 'juan2026', status: 'Pending' },
  });
  const docs = [
    { _id: 'cert_ok', type: 'certificate_request', username: 'juan2026' },
    { _id: 'blt_ok', type: 'blotter_record', username: 'juan2026', status: 'Pending' },
    { _id: 'user_juan2026', type: 'user', username: 'juan2026', role: 'admin' }, // unauthorized
  ];
  const results = await Promise.all(docs.map((d) => assessResidentWrite(nano, d, RESIDENT)));
  const offenders = results.filter((r) => !r.allowed);
  assert.equal(offenders.length, 1, 'exactly the account doc must be flagged');
  // A batch is rejected if offenders.length > 0.
  assert.ok(offenders.length > 0);
});

// ── 12. Error handling never fails open ─────────────────────────────────
// A non-404 lookup failure (timeout, dropped connection, 401/403, 5xx) must
// DENY the write. Only a genuine CouchDB 404 means "document does not exist".
test('a non-404 get() error denies a self-owned doc (fail closed, not treated as new)', async () => {
  const throwingDb = { get: async () => { throw new Error('boom'); } };
  const verdict = await assessResidentWrite(
    throwingDb,
    { _id: 'cert_1', type: 'certificate_request', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'ownership check failed');
});

test('a timeout error denies a resident write', async () => {
  const timeoutDb = {
    get: async () => {
      const err = new Error('timed out');
      err.code = 'ETIMEDOUT';
      throw err;
    },
  };
  const verdict = await assessResidentWrite(
    timeoutDb,
    { _id: 'cert_1', type: 'certificate_request', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('a CouchDB 500 on lookup denies a resident write', async () => {
  const db500 = {
    get: async () => {
      const err = new Error('server error');
      err.statusCode = 500;
      throw err;
    },
  };
  const verdict = await assessResidentWrite(
    db500,
    { _id: 'cert_1', type: 'certificate_request', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('a 401/403 on lookup denies a resident write', async () => {
  for (const statusCode of [401, 403]) {
    const dbAuth = {
      get: async () => {
        const err = new Error('unauthorized');
        err.statusCode = statusCode;
        throw err;
      },
    };
    const verdict = await assessResidentWrite(
      dbAuth,
      { _id: 'cert_1', type: 'certificate_request', username: 'juan2026' },
      RESIDENT
    );
    assert.equal(verdict.allowed, false, `expected denial on ${statusCode}`);
  }
});

test('a genuine 404 still allows creating a self-owned NEW doc', async () => {
  const nano = makeNanoDb({}); // 404 for unknown ids
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_new', type: 'certificate_request', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

test('a genuine 404 with not_found body (no status) still means "new"', async () => {
  const nano = {
    get: async () => {
      const err = new Error('missing');
      err.error = 'not_found';
      err.reason = 'missing';
      throw err;
    },
  };
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_new2', type: 'certificate_request', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

test('account doc is denied even when the stored-owner lookup errors', async () => {
  const throwingDb = { get: async () => { throw new Error('boom'); } };
  const verdict = await assessResidentWrite(
    throwingDb,
    { _id: 'user_juan2026', type: 'user', username: 'juan2026' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('tombstone with a failing (non-404) lookup denies the delete', async () => {
  const throwingDb = { get: async () => { throw new Error('boom'); } };
  const verdict = await assessResidentWrite(
    throwingDb,
    { _id: 'cert_1', type: 'certificate_request', username: 'juan2026', _deleted: true },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

test('tombstone with a genuine 404 is allowed (deleting an absent owned id is a no-op)', async () => {
  const nano = makeNanoDb({});
  const verdict = await assessResidentWrite(
    nano,
    { _id: 'cert_absent', type: 'certificate_request', username: 'juan2026', _deleted: true },
    RESIDENT
  );
  assert.equal(verdict.allowed, true);
});

test('event-registration creation denies when the event lookup fails (non-404)', async () => {
  const throwingDb = {
    get: async (id) => {
      if (id === 'reg_evtfail') {
        const err = new Error('not_found');
        err.statusCode = 404;
        throw err;
      }
      throw new Error('connection reset'); // event lookup error
    },
  };
  const verdict = await assessResidentWrite(
    throwingDb,
    { _id: 'reg_evtfail', type: 'event_registration', username: 'juan2026', status: 'Pending', eventId: 'evt_x' },
    RESIDENT
  );
  assert.equal(verdict.allowed, false);
});

// ── 12b. isDocumentNotFoundError discriminates ONLY genuine 404s ────────
test('isDocumentNotFoundError: true for a 404 status', () => {
  const err = new Error('x');
  err.statusCode = 404;
  assert.equal(isDocumentNotFoundError(err), true);
});

test('isDocumentNotFoundError: true for err.status = 404', () => {
  const err = new Error('x');
  err.status = 404;
  assert.equal(isDocumentNotFoundError(err), true);
});

test('isDocumentNotFoundError: true for not_found body without status', () => {
  const err = new Error('missing');
  err.error = 'not_found';
  assert.equal(isDocumentNotFoundError(err), true);
});

test('isDocumentNotFoundError: FALSE for timeouts, connection resets and 5xx', () => {
  const timeout = new Error('timeout'); timeout.code = 'ETIMEDOUT';
  const reset = new Error('reset');
  const e500 = new Error('boom'); e500.statusCode = 500;
  const e401 = new Error('auth'); e401.statusCode = 401;
  assert.equal(isDocumentNotFoundError(timeout), false);
  assert.equal(isDocumentNotFoundError(reset), false);
  assert.equal(isDocumentNotFoundError(e500), false);
  assert.equal(isDocumentNotFoundError(e401), false);
  assert.equal(isDocumentNotFoundError(null), false);
});

// ── 12c. fetchExistingDoc returns found:false ONLY on 404, else rejects ──
test('fetchExistingDoc: existing doc returns { found: true }', async () => {
  const nano = makeNanoDb({ cert_1: { type: 'certificate_request' } });
  const r = await fetchExistingDoc(nano, 'cert_1');
  assert.equal(r.found, true);
  assert.equal(r.doc.type, 'certificate_request');
});

test('fetchExistingDoc: genuine 404 returns { found: false }', async () => {
  const nano = makeNanoDb({});
  const r = await fetchExistingDoc(nano, 'nope');
  assert.equal(r.found, false);
  assert.equal(r.doc, null);
});

test('fetchExistingDoc: non-404 error REJECTS (does not swallow)', async () => {
  const nano = { get: async () => { const e = new Error('boom'); e.code = 'ECONNRESET'; throw e; } };
  await assert.rejects(() => fetchExistingDoc(nano, 'cert_1'));
});

test('fetchExistingDoc: a store without get() rejects (fail closed)', async () => {
  await assert.rejects(() => fetchExistingDoc(null, 'cert_1'));
  await assert.rejects(() => fetchExistingDoc({}, 'cert_1'));
});

test('fetchExistingDoc: empty id returns { found: false } without calling get()', async () => {
  let called = false;
  const nano = { get: async () => { called = true; return {}; } };
  const r = await fetchExistingDoc(nano, '');
  assert.equal(r.found, false);
  assert.equal(called, false);
});

// ── 13. residentDenyReason returns metadata-only reasons ────────────────
test('residentDenyReason categorizes denials', () => {
  assert.equal(residentDenyReason({ type: 'user', username: 'juan2026' }, RESIDENT), 'account document not writable by residents');
  assert.equal(residentDenyReason({ type: 'announcement', username: 'juan2026' }, RESIDENT), 'type not allowed');
  assert.equal(residentDenyReason({ type: 'certificate_request' }, RESIDENT), 'missing owner fields');
  assert.equal(residentDenyReason({ type: 'certificate_request', username: 'juan2026' }, RESIDENT), null);
});

// ── 14. Non-resident roles are not constrained here ─────────────────────
test('admin ownership bypass is not the module’s concern (docOwnedBy still type-checks)', () => {
  // The proxy short-circuits admin/staff BEFORE calling this module; here we
  // only confirm the module never throws for a staff-shaped user object.
  assert.doesNotThrow(() => docOwnedBy(baseCert(), { username: 'x', role: 'staff' }));
});
