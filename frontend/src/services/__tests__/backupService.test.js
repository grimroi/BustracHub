// src/services/__tests__/backupService.test.js
//
// Tests for the hardened snapshot pipeline:
//   - the export carries a schema header and a verifiable checksum
//   - a restore round-trip returns the documents to the database
//   - a tampered snapshot is refused on restore
//   - a scheduled snapshot runs and records its timestamp
//   - the recorded timestamp is reported to the device registry
import { localDb } from '../db';
import {
  exportLocalSnapshot,
  claimUnsyncedRecords,
  handleAutoBackup,
  scheduleSnapshot,
  stopAutoBackup,
  getLastSnapshotAt,
  buildSnapshotName,
} from '../backupService';
import { verifySnapshotArtifact } from '../snapshotService';
import { getDeviceId, setLastSnapshotAt } from '../deviceRegistry';

const missingDoc = () => {
  const err = new Error('missing');
  err.status = 404;
  throw err;
};

const rows = [
  { id: 'resident_1', doc: { _id: 'resident_1', _rev: '1-a', type: 'resident', name: 'Juan', updatedAt: '2026-10-20T10:00:00.000Z' } },
  { id: 'resident_2', doc: { _id: 'resident_2', _rev: '1-b', type: 'resident', name: 'Maria', updatedAt: '2026-10-20T10:00:00.000Z' } },
];

let originalCreateObjectURL;
let originalRevokeObjectURL;
let clickSpy;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();

  localDb.allDocs.mockResolvedValue({ rows });
  localDb.get.mockImplementation(missingDoc);
  localDb.put.mockResolvedValue({ rev: '2-mock' });

  // jsdom does not implement the object-URL API used by the download path.
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:mock');
  URL.revokeObjectURL = jest.fn();
  clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  if (clickSpy) clickSpy.mockRestore();
  stopAutoBackup();
  clearTimeout(global.__snapshotTestTimer);
});

describe('export format', () => {
  test('carries the schema header, the device id and a verifiable checksum', async () => {
    const snapshot = await exportLocalSnapshot();

    expect(snapshot.schema).toBe('bustrac.snapshot');
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.deviceId).toBe(getDeviceId());
    expect(snapshot.docCount).toBe(2);
    expect(verifySnapshotArtifact(snapshot).valid).toBe(true);
  });

  test('the file name carries the device id', async () => {
    const snapshot = await exportLocalSnapshot();
    const name = buildSnapshotName({ timestamp: snapshot.exportDate });
    expect(name).toContain(getDeviceId());
    expect(name.endsWith('.json')).toBe(true);
  });
});

describe('restore round-trip', () => {
  test('a snapshot taken from the database can be restored into an empty database', async () => {
    const snapshot = await exportLocalSnapshot();

    // The restored documents are written back to the database.
    const result = await claimUnsyncedRecords(snapshot);

    expect(result.ok).toBe(true);
    expect(result.inserted).toHaveLength(2);
    expect(result.conflicts).toHaveLength(0);
    expect(result.integrity.checked).toBe(true);
    expect(result.integrity.valid).toBe(true);

    const writtenIds = localDb.put.mock.calls.map((c) => c[0]._id);
    expect(writtenIds).toEqual(expect.arrayContaining(['resident_1', 'resident_2']));
  });

  test('the restored documents keep their content', async () => {
    const snapshot = await exportLocalSnapshot();
    await claimUnsyncedRecords(snapshot);

    const restored = localDb.put.mock.calls.map((c) => c[0]);
    const juan = restored.find((d) => d._id === 'resident_1');
    expect(juan.type).toBe('resident');
    expect(juan.name).toBe('Juan');
  });

  test('a tampered snapshot is refused', async () => {
    const snapshot = await exportLocalSnapshot();
    snapshot.rows[0].doc.name = 'Tampered';

    const result = await claimUnsyncedRecords(snapshot);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('integrity-check-failed');

    // No document from the file was written — only the refusal is audited.
    const writtenIds = localDb.put.mock.calls.map((c) => c[0]._id);
    expect(writtenIds).not.toContain('resident_1');
    expect(writtenIds).not.toContain('resident_2');

    const refusal = localDb.put.mock.calls.find(
      (c) => c[0].action === 'CLAIM_UNSYNCED_RECORDS' && c[0].meta?.refused
    );
    expect(refusal).toBeTruthy();
    expect(refusal[0].meta.reason).toBe('checksum-mismatch');
  });

  test('a legacy export without an integrity block is still accepted', async () => {
    const legacy = { app: 'Bustrac Hub', exportDate: '2026-01-01T00:00:00.000Z', rows };

    const result = await claimUnsyncedRecords(legacy);

    expect(result.ok).toBe(true);
    expect(result.integrity.checked).toBe(false);
    expect(result.inserted).toHaveLength(2);
  });

  test('a file that is not valid JSON is refused', async () => {
    const result = await claimUnsyncedRecords('{not json');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('invalid-json');
  });
});

describe('scheduled snapshot', () => {
  test('records the snapshot time so it can be reported to the registry', async () => {
    expect(getLastSnapshotAt()).toBeNull();

    const result = await handleAutoBackup();

    expect(result.ok).toBe(true);
    expect(result.snapshotAt).toBeTruthy();
    expect(getLastSnapshotAt()).toBe(result.snapshotAt);
  });

  test('writes an audit entry naming the snapshot and its integrity block', async () => {
    await handleAutoBackup();

    const auditCall = localDb.put.mock.calls.find((c) => c[0].action === 'AUTO_BACKUP');
    expect(auditCall).toBeTruthy();
    expect(auditCall[0].meta.integrity.algorithm).toBe('SHA-256');
    expect(auditCall[0].meta.snapshotAt).toBeTruthy();
  });

  test('schedules a recurring snapshot and reports the interval', async () => {
    const result = await scheduleSnapshot({ intervalHours: 6 });
    expect(result.scheduled).toBe(true);
    expect(result.intervalHours).toBe(6);
  });

  test('the default interval is daily', async () => {
    const result = await scheduleSnapshot({});
    expect(result.intervalHours).toBe(24);
  });

  test('the recorded timestamp is what the registry heartbeat reports', async () => {
    const stamp = setLastSnapshotAt('2026-10-20T18:00:00.000Z');
    expect(getLastSnapshotAt()).toBe(stamp);
  });
});
