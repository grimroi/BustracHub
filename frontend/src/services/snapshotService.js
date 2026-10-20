// src/services/snapshotService.js
//
// Hardened local snapshot artifact.
//
// The previous export was a plain JSON download with no integrity check, no
// schema header and a date-only filename. This module produces a snapshot that
// carries:
//
//   * a schema/version header (`schema` + `schemaVersion`),
//   * an integrity checksum (SHA-256) over the data payload,
//   * a filename that carries the device id and an exact timestamp,
//   * optional AES-256-GCM encryption with a passphrase (WebCrypto).
//
// ENCRYPTION AVAILABILITY
// -----------------------
// WebCrypto's `crypto.subtle` is only exposed in a SECURE CONTEXT (https, or
// http://localhost). Over a plain-HTTP LAN address the API is absent, so
// encryption is offered ONLY when `isEncryptionSupported()` returns true; the
// UI disables the option and explains why otherwise. The integrity checksum
// does NOT depend on WebCrypto — it uses the dependency-free SHA-256 in
// utils/sha256.js — so a snapshot can always be verified.
import { sha256Hex } from '../utils/sha256';

export const SNAPSHOT_SCHEMA = 'bustrac.snapshot';
export const SNAPSHOT_SCHEMA_VERSION = 2;
export const ENCRYPTED_SNAPSHOT_SCHEMA = 'bustrac.snapshot.encrypted';
export const ENCRYPTED_SNAPSHOT_SCHEMA_VERSION = 2;
export const SNAPSHOT_FILE_PREFIX = 'bustrac_snapshot';
export const SNAPSHOT_INTEGRITY_ALGORITHM = 'SHA-256';

// The fields covered by the checksum, in a fixed order. Keeping the order
// fixed is what makes the checksum reproducible when the artifact is read
// back from disk.
const CANONICAL_FIELDS = [
  'app',
  'schema',
  'schemaVersion',
  'exportDate',
  'deviceId',
  'deviceLabel',
  'docCount',
  'rows',
];

/**
 * Produce the canonical string that the checksum is computed over.
 * @param {object} snapshot
 * @returns {string}
 */
export const canonicalizeSnapshot = (snapshot) => {
  const source = snapshot || {};
  const canonical = {};
  CANONICAL_FIELDS.forEach((field) => {
    if (source[field] !== undefined) canonical[field] = source[field];
  });
  return JSON.stringify(canonical);
};

/**
 * Compute the integrity block for a snapshot payload.
 * @param {object} snapshot
 * @returns {{algorithm:string, value:string}}
 */
export const computeSnapshotIntegrity = (snapshot) => ({
  algorithm: SNAPSHOT_INTEGRITY_ALGORITHM,
  value: sha256Hex(canonicalizeSnapshot(snapshot)),
});

/**
 * Build a snapshot artifact from raw rows.
 *
 * @param {object} params
 * @param {Array} params.rows             the exported documents
 * @param {string} params.deviceId
 * @param {string} [params.deviceLabel]
 * @param {string} [params.exportDate]    ISO timestamp
 * @param {string} [params.app]
 * @returns {object} the snapshot artifact
 */
export const buildSnapshotArtifact = ({
  rows = [],
  deviceId = 'unknown-device',
  deviceLabel = '',
  exportDate = null,
  app = 'Bustrac Hub',
} = {}) => {
  const snapshot = {
    app,
    schema: SNAPSHOT_SCHEMA,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    exportDate: exportDate || new Date().toISOString(),
    deviceId,
    deviceLabel,
    docCount: Array.isArray(rows) ? rows.length : 0,
    rows: Array.isArray(rows) ? rows : [],
  };

  return {
    ...snapshot,
    integrity: computeSnapshotIntegrity(snapshot),
  };
};

/**
 * Verify the integrity of a snapshot artifact.
 *
 * @param {object} snapshot
 * @returns {{valid:boolean, reason:string}}
 */
export const verifySnapshotArtifact = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return { valid: false, reason: 'not-an-object' };
  }
  if (snapshot.schema !== SNAPSHOT_SCHEMA) {
    return { valid: false, reason: `unexpected-schema:${snapshot.schema || 'none'}` };
  }
  if (!snapshot.integrity || !snapshot.integrity.value) {
    return { valid: false, reason: 'missing-integrity' };
  }
  const expected = computeSnapshotIntegrity(snapshot).value;
  if (expected !== snapshot.integrity.value) {
    return { valid: false, reason: 'checksum-mismatch' };
  }
  return { valid: true, reason: 'ok' };
};

/**
 * Build the file name for a snapshot: device id + exact timestamp.
 *
 * The timestamp is rendered in **UTC** so that snapshots produced on devices
 * in different time zones sort correctly against one another and the name
 * identifies an unambiguous point in time.
 *
 * @param {object} params
 * @param {string} params.deviceId
 * @param {string} [params.timestamp] ISO timestamp
 * @returns {string}
 */
export const buildSnapshotFileName = ({ deviceId = 'unknown-device', timestamp = null } = {}) => {
  const safeDeviceId =
    String(deviceId)
      .replace(/[^A-Za-z0-9._-]/g, '')
      .replace(/\.{2,}/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 64) || 'unknown-device';
  const date = timestamp ? new Date(timestamp) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `${SNAPSHOT_FILE_PREFIX}_${safeDeviceId}_${stamp}.json`;
};

// ─────────────────────────────────────────────────────────────────────────────
// ENCRYPTION (WebCrypto AES-256-GCM + PBKDF2)
// ─────────────────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 210000;

const toBase64 = (bytes) => {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
};

const fromBase64 = (text) => {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
};

/** True when the platform can encrypt a snapshot (secure context required). */
export const isEncryptionSupported = () => {
  try {
    return (
      typeof crypto !== 'undefined' &&
      !!crypto.subtle &&
      typeof crypto.subtle.encrypt === 'function' &&
      typeof crypto.getRandomValues === 'function'
    );
  } catch {
    return false;
  }
};

const deriveKey = async (passphrase, salt) => {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(String(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

/**
 * Encrypt a snapshot artifact with a passphrase.
 *
 * @param {object} snapshot
 * @param {string} passphrase
 * @returns {Promise<object>} an encrypted envelope
 * @throws when the platform cannot encrypt or the passphrase is empty
 */
export const encryptSnapshotArtifact = async (snapshot, passphrase) => {
  if (!isEncryptionSupported()) {
    throw new Error('Encryption is not available in this browser context (a secure context is required).');
  }
  if (!passphrase || String(passphrase).length === 0) {
    throw new Error('A passphrase is required to encrypt a snapshot.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(snapshot));
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return {
    app: 'Bustrac Hub',
    schema: ENCRYPTED_SNAPSHOT_SCHEMA,
    schemaVersion: ENCRYPTED_SNAPSHOT_SCHEMA_VERSION,
    encryption: {
      algorithm: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
      iv: toBase64(iv),
    },
    data: toBase64(new Uint8Array(cipherBuffer)),
  };
};

/**
 * Decrypt an encrypted snapshot envelope.
 *
 * @param {object} envelope
 * @param {string} passphrase
 * @returns {Promise<object>} the original snapshot artifact
 * @throws when the passphrase is wrong or the envelope is malformed
 */
export const decryptSnapshotArtifact = async (envelope, passphrase) => {
  if (!isEncryptionSupported()) {
    throw new Error('Decryption is not available in this browser context (a secure context is required).');
  }
  if (!envelope || envelope.schema !== ENCRYPTED_SNAPSHOT_SCHEMA) {
    throw new Error('Not an encrypted BustracHub snapshot.');
  }
  if (!passphrase) {
    throw new Error('A passphrase is required to decrypt a snapshot.');
  }

  const { salt, iv, iterations } = envelope.encryption || {};
  const saltBytes = fromBase64(salt);
  const ivBytes = fromBase64(iv);
  const key = await deriveKey(passphrase, saltBytes, iterations);
  const cipherBytes = fromBase64(envelope.data);

  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);
  } catch {
    throw new Error('The snapshot could not be decrypted — the passphrase is incorrect or the file is damaged.');
  }

  const snapshot = JSON.parse(new TextDecoder().decode(plaintext));
  return snapshot;
};
