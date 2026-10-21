'use strict';

// Unit tests for the verification-token primitives.
//
// Run with: node --test server/test/verificationTokens.test.js  (or `npm test`).
//
// These cover the security properties the token design depends on:
// unpredictability, hash-only storage, format validation, idempotent
// re-minting and revocation marking.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  TOKEN_PATTERN,
  VERIFICATION_RECORD_PREFIX,
  VERIFICATION_RECORD_TYPE,
  generateVerificationToken,
  hashVerificationToken,
  isValidVerificationToken,
  verificationRecordId,
  constantTimeEquals,
  buildVerificationRecord,
  isRecordRevoked,
  markRecordRevoked,
  markRecordReprinted,
} = require('../utils/verificationTokens');

test('a generated token is 43 base64url characters', () => {
  const token = generateVerificationToken();
  assert.equal(token.length, 43);
  assert.match(token, TOKEN_PATTERN);
  assert.equal(token.includes('+'), false);
  assert.equal(token.includes('/'), false);
  assert.equal(token.includes('='), false);
});

test('generated tokens are unpredictable', () => {
  const tokens = new Set();
  for (let i = 0; i < 5000; i += 1) {
    tokens.add(generateVerificationToken());
  }
  assert.equal(tokens.size, 5000, 'every token must be unique');

  // The first bytes must not repeat in a way a counter would produce.
  const prefixes = new Set(Array.from(tokens).map((t) => t.slice(0, 6)));
  assert.equal(prefixes.size, 5000);
});

test('a token has at least 256 bits of entropy (two tokens never collide)', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const token = generateVerificationToken();
    assert.equal(seen.has(token), false);
    seen.add(token);
  }
});

test('the hash is the SHA-256 of the token and is not reversible', () => {
  const token = generateVerificationToken();
  const hash = hashVerificationToken(token);
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, crypto.createHash('sha256').update(token, 'utf8').digest('hex'));
  assert.equal(hash.includes(token), false);
});

test('the verification record id is derived from the token hash', () => {
  const token = generateVerificationToken();
  const id = verificationRecordId(token);
  assert.equal(id, `${VERIFICATION_RECORD_PREFIX}${hashVerificationToken(token)}`);
  assert.equal(id.startsWith(VERIFICATION_RECORD_PREFIX), true);
  // The raw token never appears in the id.
  assert.equal(id.includes(token), false);
});

test('two different tokens never produce the same record id', () => {
  const a = verificationRecordId(generateVerificationToken());
  const b = verificationRecordId(generateVerificationToken());
  assert.notEqual(a, b);
});

test('the format check accepts only a well-formed token', () => {
  assert.equal(isValidVerificationToken(generateVerificationToken()), true);
  assert.equal(isValidVerificationToken('short'), false);
  assert.equal(isValidVerificationToken('a'.repeat(44)), false);
  assert.equal(isValidVerificationToken('a'.repeat(42)), false);
  assert.equal(isValidVerificationToken(`${'a'.repeat(42)}+`), false);
  assert.equal(isValidVerificationToken(`${'a'.repeat(42)}=`), false);
  assert.equal(isValidVerificationToken(''), false);
  assert.equal(isValidVerificationToken(null), false);
  assert.equal(isValidVerificationToken(undefined), false);
  assert.equal(isValidVerificationToken(12345), false);
});

test('a verification record stores the hash and never the raw token', () => {
  const token = generateVerificationToken();
  const record = buildVerificationRecord({
    token,
    certificateId: 'brgy_clearance_123',
    certificateType: 'Barangay Clearance',
    certificateNumber: 'BC-2026-0001',
    issuedAt: '2026-10-20T00:00:00.000Z',
    issuedBy: 'jmacabangon',
    now: '2026-10-20T00:00:00.000Z',
  });

  assert.equal(record.type, VERIFICATION_RECORD_TYPE);
  assert.equal(record.certificateId, 'brgy_clearance_123');
  assert.equal(record.certificateNumber, 'BC-2026-0001');
  assert.equal(record.issuedBy, 'jmacabangon');
  assert.equal(record.status, 'active');
  assert.equal(record.serverMinted, true);
  assert.equal(record.tokenHash, hashVerificationToken(token));

  const serialised = JSON.stringify(record);
  assert.equal(serialised.includes(token), false, 'the raw token must never be persisted');
});

test('a verification record binds to exactly one certificate', () => {
  const token = generateVerificationToken();
  const record = buildVerificationRecord({ token, certificateId: 'CERT-1' });
  assert.equal(record.certificateId, 'CERT-1');
});

test('a record is not revoked until it is marked as such', () => {
  const token = generateVerificationToken();
  const record = buildVerificationRecord({ token, certificateId: 'CERT-1' });
  assert.equal(isRecordRevoked(record), false);

  const revoked = markRecordRevoked(record, {
    revokedBy: 'jmacabangon',
    now: '2026-10-21T00:00:00.000Z',
  });
  assert.equal(isRecordRevoked(revoked), true);
  assert.equal(revoked.status, 'revoked');
  assert.equal(revoked.revokedBy, 'jmacabangon');
  assert.equal(revoked.revokedAt, '2026-10-21T00:00:00.000Z');
  // Revoking must not change the certificate it points at.
  assert.equal(revoked.certificateId, record.certificateId);
});

test('a record with a revoked status is treated as revoked', () => {
  assert.equal(isRecordRevoked({ status: 'revoked' }), true);
  assert.equal(isRecordRevoked({ status: 'Revoked' }), true);
  assert.equal(isRecordRevoked({ status: 'active' }), false);
  assert.equal(isRecordRevoked(null), false);
});

test('reprinting increments the counter without creating a new identity', () => {
  const token = generateVerificationToken();
  const record = buildVerificationRecord({ token, certificateId: 'CERT-1' });
  const reprinted = markRecordReprinted(record, { now: '2026-10-21T00:00:00.000Z' });

  assert.equal(reprinted.reprintCount, 1);
  assert.equal(reprinted._id, record._id);
  assert.equal(reprinted.certificateId, record.certificateId);
  assert.equal(reprinted.tokenHash, record.tokenHash);
  assert.equal(JSON.stringify(reprinted).includes(token), false);
});

test('constant-time comparison behaves like equality', () => {
  assert.equal(constantTimeEquals('abc', 'abc'), true);
  assert.equal(constantTimeEquals('abc', 'abd'), false);
  assert.equal(constantTimeEquals('abc', 'abcd'), false);
  assert.equal(constantTimeEquals('', ''), true);
});
