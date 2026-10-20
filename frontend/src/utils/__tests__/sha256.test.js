// src/utils/__tests__/sha256.test.js
//
// Verifies the dependency-free SHA-256 against the published FIPS 180-4 test
// vectors. If these pass, the snapshot integrity checksum is trustworthy.
import { sha256Hex, utf8Bytes } from '../sha256';

describe('sha256Hex — FIPS 180-4 test vectors', () => {
  test('empty string', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  test('"abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  test('"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  test('448-bit message ("abcdbcde…nopq")', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    );
  });

  test('512-bit message', () => {
    expect(sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmno')).toBe(
      '2ff100b36c386c65a1afc462ad53e25479bec9498ed00aa5a04de584bc25301b'
    );
  });

  test('one million "a" characters (NIST example 3)', () => {
    expect(sha256Hex('a'.repeat(1000000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    );
  });
});

describe('sha256Hex — properties', () => {
  test('a one million "a" characters is not required, but length changes the digest', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('aa'));
  });

  test('the digest is 64 lowercase hex characters', () => {
    expect(sha256Hex('bustrac')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('it is deterministic', () => {
    expect(sha256Hex('bustrac')).toBe(sha256Hex('bustrac'));
  });

  test('it accepts a byte array as well as a string', () => {
    const bytes = utf8Bytes('abc');
    expect(sha256Hex(bytes)).toBe(sha256Hex('abc'));
  });

  test('it handles multi-byte UTF-8 characters', () => {
    // "é" encodes as two bytes; the digest must match the UTF-8 encoding.
    expect(sha256Hex('é')).toBe(sha256Hex(new Uint8Array([0xc3, 0xa9])));
  });
});
