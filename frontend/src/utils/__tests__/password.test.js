import crypto from 'crypto';
import { hashPassword, verifyPassword, isBcryptHash, isSha256Hash, needsRehash } from '../password';

describe('password hashing and verification', () => {
  test('hashPassword produces a bcrypt hash', async () => {
    const hash = await hashPassword('S3cret!');
    expect(isBcryptHash(hash)).toBe(true);
    expect(hash).not.toBe('S3cret!');
  });

  test('verifyPassword accepts the matching password against a bcrypt hash', async () => {
    const hash = await hashPassword('S3cret!');
    expect(await verifyPassword('S3cret!', hash)).toBe(true);
  });

  test('verifyPassword rejects a wrong password against a bcrypt hash', async () => {
    const hash = await hashPassword('S3cret!');
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });

  // Regression guard for the removed plaintext fallback: a stored plaintext
  // `password` value must NEVER verify, only hashes do.
  test('verifyPassword rejects a stored plaintext value (no plaintext fallback)', async () => {
    expect(await verifyPassword('S3cret!', 'S3cret!')).toBe(false);
    expect(await verifyPassword('anything', 'S3cret!')).toBe(false);
  });

  test('verifyPassword rejects missing or empty stored hashes', async () => {
    expect(await verifyPassword('S3cret!', undefined)).toBe(false);
    expect(await verifyPassword('S3cret!', '')).toBe(false);
  });

  test('verifyPassword rejects unknown hash formats', async () => {
    expect(await verifyPassword('S3cret!', 'md5-ish-not-a-hash')).toBe(false);
  });

  test('legacy SHA-256 hex digests still verify and are flagged for rehash', async () => {
    const digest = crypto.createHash('sha256').update('legacyPass').digest('hex');
    expect(isSha256Hash(digest)).toBe(true);
    expect(await verifyPassword('legacyPass', digest)).toBe(true);
    expect(await verifyPassword('other', digest)).toBe(false);
    expect(needsRehash(digest)).toBe(true);
  });

  test('format guards', () => {
    expect(isBcryptHash('$2b$10$abcdefghijklmnopqrstuv')).toBe(true);
    expect(isBcryptHash('plaintext')).toBe(false);
    expect(isSha256Hash('not-a-hex-string-of-64-chars-here-that-is-short')).toBe(false);
    expect(needsRehash(null)).toBe(false);
  });
});