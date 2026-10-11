// src/utils/password.js
// Shared password hashing utilities.
//
// Strategy:
//   - New passwords are hashed with bcrypt (bcryptjs) — an established,
//     adaptive, salted password-hashing algorithm suitable for browser and
//     Node runtimes.
//   - Existing records stored as SHA-256 hex digests are NOT silently
//     dropped. `verifyPassword` accepts both bcrypt hashes and legacy
//     SHA-256 hashes so previously-created accounts keep working until they
//     are migrated (e.g. next time the password is changed).
//   - `isBcryptHash` / `isSha256Hash` distinguish the two formats.

import bcrypt from 'bcryptjs';

const BCRYPT_PREFIX = '$2';
const SHA256_HEX_LENGTH = 64;

export const isBcryptHash = (value) =>
  typeof value === 'string' && value.startsWith(BCRYPT_PREFIX);

export const isSha256Hash = (value) =>
  typeof value === 'string' &&
  value.length === SHA256_HEX_LENGTH &&
  /^[0-9a-f]{64}$/i.test(value);

/**
 * Hash a plaintext password with bcrypt.
 * @param {string} password
 * @param {number} [rounds=10] bcrypt cost factor
 * @returns {Promise<string>}
 */
export const hashPassword = async (password, rounds = 10) => {
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(String(password), salt);
};

/**
 * Verify a plaintext password against a stored hash.
 * Supports:
 *   - bcrypt hashes (preferred)
 *   - legacy SHA-256 hex digests (backward compatibility)
 * @param {string} password
 * @param {string} storedHash
 * @returns {Promise<boolean>}
 */
export const verifyPassword = async (password, storedHash) => {
  if (!storedHash) return false;

  if (isBcryptHash(storedHash)) {
    try {
      return await bcrypt.compare(String(password), storedHash);
    } catch (e) {
      console.warn('bcrypt compare failed:', e?.message);
      return false;
    }
  }

if (isSha256Hash(storedHash)) {
  try {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) return false;

    const encoder = new TextEncoder();
    const data = encoder.encode(String(password));
    const hashBuffer = await subtle.digest('SHA-256', data);
    const digest = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return digest === storedHash;
  } catch (e) {
    console.warn('SHA-256 verification failed:', e?.message);
    return false;
  }
}

  // Unknown format — reject rather than fall through to plaintext match.
  return false;
};

/**
 * Returns true when the stored hash is still using the legacy SHA-256 format
 * and should be upgraded to bcrypt on the next successful login.
 */
export const needsRehash = (storedHash) =>
  typeof storedHash === 'string' && isSha256Hash(storedHash);