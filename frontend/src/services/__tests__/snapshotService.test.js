// src/services/__tests__/snapshotService.test.js
//
// Tests for the hardened snapshot artifact:
//   - the export format carries a schema/version header and a checksum
//   - the checksum verifies a genuine snapshot
//   - a tampered snapshot is detected
//   - the filename carries the device id and a timestamp
//   - encryption round-trips (AES-256-GCM) and a wrong passphrase fails
import {
  SNAPSHOT_SCHEMA,
  SNAPSHOT_SCHEMA_VERSION,
  ENCRYPTED_SNAPSHOT_SCHEMA,
  buildSnapshotArtifact,
  buildSnapshotFileName,
  canonicalizeSnapshot,
  verifySnapshotArtifact,
  encryptSnapshotArtifact,
  decryptSnapshotArtifact,
  isEncryptionSupported,
} from '../snapshotService';

const rows = [
  { id: 'resident_1', doc: { _id: 'resident_1', _rev: '1-a', type: 'resident', name: 'Juan Dela Cruz' } },
  { id: 'resident_2', doc: { _id: 'resident_2', _rev: '1-b', type: 'resident', name: 'Maria Santos' } },
];

const baseArtifact = (overrides = {}) =>
  buildSnapshotArtifact({
    rows,
    deviceId: 'dev_tablet01',
    deviceLabel: 'Chrome on Windows',
    exportDate: '2026-10-20T18:00:00.000Z',
    ...overrides,
  });

describe('export format', () => {
  test('carries the schema and version header', () => {
    const artifact = baseArtifact();
    expect(artifact.schema).toBe(SNAPSHOT_SCHEMA);
    expect(artifact.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
  });

  test('carries the device id, label, export date and document count', () => {
    const artifact = baseArtifact();
    expect(artifact.deviceId).toBe('dev_tablet01');
    expect(artifact.deviceLabel).toBe('Chrome on Windows');
    expect(artifact.exportDate).toBe('2026-10-20T18:00:00.000Z');
    expect(artifact.docCount).toBe(2);
  });

  test('keeps the rows at the top level so the existing importer still works', () => {
    const artifact = baseArtifact();
    expect(Array.isArray(artifact.rows)).toBe(true);
    expect(artifact.rows).toHaveLength(2);
    expect(artifact.rows[0].doc._id).toBe('resident_1');
  });

  test('carries an integrity block with a SHA-256 checksum', () => {
    const artifact = baseArtifact();
    expect(artifact.integrity.algorithm).toBe('SHA-256');
    expect(artifact.integrity.value).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('integrity verification', () => {
  test('a genuine snapshot verifies', () => {
    const result = verifySnapshotArtifact(baseArtifact());
    expect(result.valid).toBe(true);
    expect(result.reason).toBe('ok');
  });

  test('a snapshot survives a JSON round-trip', () => {
    const artifact = baseArtifact();
    const reparsed = JSON.parse(JSON.stringify(artifact));
    expect(verifySnapshotArtifact(reparsed).valid).toBe(true);
  });

  test('a modified document is detected', () => {
    const artifact = baseArtifact();
    artifact.rows[0].doc.name = 'Tampered Name';
    const result = verifySnapshotArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('checksum-mismatch');
  });

  test('a removed document is detected', () => {
    const artifact = baseArtifact();
    artifact.rows.pop();
    expect(verifySnapshotArtifact(artifact).valid).toBe(false);
  });

  test('a snapshot without an integrity block is rejected', () => {
    const artifact = baseArtifact();
    delete artifact.integrity;
    const result = verifySnapshotArtifact(artifact);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('missing-integrity');
  });

  test('a snapshot with an unexpected schema is rejected', () => {
    const artifact = baseArtifact();
    artifact.schema = 'something.else';
    expect(verifySnapshotArtifact(artifact).valid).toBe(false);
  });

  test('a non-object is rejected', () => {
    expect(verifySnapshotArtifact(null).valid).toBe(false);
  });

  test('the canonical form is independent of the key order of the input', () => {
    const a = { schema: SNAPSHOT_SCHEMA, schemaVersion: 2, rows: [] };
    const b = { rows: [], schemaVersion: 2, schema: SNAPSHOT_SCHEMA };
    expect(canonicalizeSnapshot(a)).toBe(canonicalizeSnapshot(b));
  });
});

describe('file name', () => {
  test('carries the device id and a UTC timestamp', () => {
    const name = buildSnapshotFileName({
      deviceId: 'dev_tablet01',
      timestamp: '2026-10-20T18:05:09.000Z',
    });
    expect(name).toBe('bustrac_snapshot_dev_tablet01_20261020-180509.json');
  });

  test('sanitises the device id', () => {
    const name = buildSnapshotFileName({ deviceId: 'dev/../etc', timestamp: '2026-10-20T18:05:09.000Z' });
    expect(name).not.toContain('/');
    expect(name).not.toContain('..');
  });

  test('falls back to a placeholder when there is no device id', () => {
    expect(buildSnapshotFileName({ deviceId: '' })).toMatch(/^bustrac_snapshot_unknown-device_\d{8}-\d{6}\.json$/);
  });
});

describe('encryption', () => {
  test('reports whether the platform can encrypt', () => {
    expect(typeof isEncryptionSupported()).toBe('boolean');
  });

  test('encrypts and decrypts back to the original snapshot', async () => {
    if (!isEncryptionSupported()) {
      // The platform has no WebCrypto — encryption is not offered.
      await expect(encryptSnapshotArtifact(baseArtifact(), 'correct horse')).rejects.toThrow();
      return;
    }

    const artifact = baseArtifact();
    const envelope = await encryptSnapshotArtifact(artifact, 'correct horse battery staple');

    expect(envelope.schema).toBe(ENCRYPTED_SNAPSHOT_SCHEMA);
    expect(envelope.encryption.algorithm).toBe('AES-256-GCM');
    expect(envelope.encryption.kdf).toBe('PBKDF2-SHA-256');
    expect(typeof envelope.data).toBe('string');

    // The plaintext must not be recoverable from the envelope.
    expect(JSON.stringify(envelope)).not.toContain('Juan Dela Cruz');

    const restored = await decryptSnapshotArtifact(envelope, 'correct horse battery staple');
    expect(restored.rows).toEqual(artifact.rows);
    expect(verifySnapshotArtifact(restored).valid).toBe(true);
  });

  test('a wrong passphrase is rejected', async () => {
    if (!isEncryptionSupported()) return;
    const envelope = await encryptSnapshotArtifact(baseArtifact(), 'right passphrase');
    await expect(decryptSnapshotArtifact(envelope, 'wrong passphrase')).rejects.toThrow(/decrypt/i);
  });

  test('an empty passphrase is rejected', async () => {
    await expect(encryptSnapshotArtifact(baseArtifact(), '')).rejects.toThrow(/passphrase/i);
  });

  test('a malformed envelope is rejected', async () => {
    if (!isEncryptionSupported()) return;
    await expect(decryptSnapshotArtifact({ schema: 'nope' }, 'x')).rejects.toThrow(/encrypted/i);
  });
});
