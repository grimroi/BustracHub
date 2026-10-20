// src/services/__tests__/syncCheckpoint.test.js
//
// Tests for the mandatory end-of-day sync checkpoint.
//
// These cover the three behaviours the requirement calls out:
//   - the close is BLOCKED while records are still unsynced
//   - the close PASSES when nothing is pending
//   - an audit entry (END_OF_DAY_SYNC_CONFIRMED) is written on success
// plus the "non-dismissible" property of the warning shown to the operator.
import { localDb } from '../db';
import {
  SYNC_CHECKPOINT_ACTION,
  SYNC_CHECKPOINT_MODULE,
  evaluateSyncCheckpoint,
  buildSyncCheckpointAlertOptions,
  writeSyncCheckpointAudit,
  runSyncCheckpoint,
} from '../syncCheckpoint';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('bustrac_user', JSON.stringify({ username: 'jmacabangon', role: 'admin' }));
  localDb.put.mockResolvedValue({ rev: '1-mock' });
});

const writtenDoc = () => localDb.put.mock.calls[0][0];

describe('evaluateSyncCheckpoint', () => {
  test('allows the close when nothing is pending', () => {
    const result = evaluateSyncCheckpoint({ pendingCount: 0 });
    expect(result.allowed).toBe(true);
    expect(result.pendingCount).toBe(0);
  });

  test('blocks the close while records are unsynced', () => {
    const result = evaluateSyncCheckpoint({ pendingCount: 4 });
    expect(result.allowed).toBe(false);
    expect(result.pendingCount).toBe(4);
    expect(result.reason).toContain('4 unsynced changes');
  });

  test('uses the singular form for a single pending change', () => {
    expect(evaluateSyncCheckpoint({ pendingCount: 1 }).reason).toContain('1 unsynced change ');
  });

  test('treats a missing count as zero', () => {
    expect(evaluateSyncCheckpoint().allowed).toBe(true);
  });
});

describe('buildSyncCheckpointAlertOptions', () => {
  test('is not dismissible — no cancel button, no outside click, no escape', () => {
    const options = buildSyncCheckpointAlertOptions({ pendingCount: 3 });
    expect(options.showCancelButton).toBe(false);
    expect(options.allowOutsideClick).toBe(false);
    expect(options.allowEscapeKey).toBe(false);
  });

  test('offers a Sync Now action', () => {
    const options = buildSyncCheckpointAlertOptions({ pendingCount: 3 });
    expect(options.confirmButtonText).toBe('Sync Now');
  });

  test('states the pending count in the message', () => {
    const options = buildSyncCheckpointAlertOptions({ pendingCount: 7, deviceId: 'dev_abc' });
    expect(options.html).toContain('7 unsynced changes');
    expect(options.html).toContain('dev_abc');
  });
});

describe('writeSyncCheckpointAudit', () => {
  test('writes an END_OF_DAY_SYNC_CONFIRMED audit entry with every required field', async () => {
    await writeSyncCheckpointAudit({
      pendingAtStart: 5,
      syncedCount: 5,
      deviceId: 'dev_tablet01',
      timestamp: '2026-10-20T18:00:00.000Z',
    });

    const doc = writtenDoc();
    expect(doc.type).toBe('audit_log');
    expect(doc.action).toBe(SYNC_CHECKPOINT_ACTION);
    expect(doc.module).toBe(SYNC_CHECKPOINT_MODULE);
    expect(doc.recordId).toBe('dev_tablet01');

    expect(doc.meta.deviceId).toBe('dev_tablet01');
    expect(doc.meta.actor).toBe('jmacabangon');
    expect(doc.meta.pendingAtStart).toBe(5);
    expect(doc.meta.syncedCount).toBe(5);
    expect(doc.meta.timestamp).toBe('2026-10-20T18:00:00.000Z');
  });

  test('the details state the device, the pending count and the synced count', async () => {
    await writeSyncCheckpointAudit({
      pendingAtStart: 2,
      syncedCount: 2,
      deviceId: 'dev_tablet01',
    });

    const details = writtenDoc().details;
    expect(details).toContain('dev_tablet01');
    expect(details).toContain('Pending at start: 2');
    expect(details).toContain('Changes replicated: 2');
  });
});

describe('runSyncCheckpoint', () => {
  test('passes and writes the audit entry when nothing is pending', async () => {
    const writeAudit = jest.fn().mockResolvedValue({ success: true });

    const result = await runSyncCheckpoint({
      getPendingCount: jest.fn().mockResolvedValue(0),
      syncNow: jest.fn().mockResolvedValue({ ok: true }),
      writeAudit,
      deviceId: 'dev_tablet01',
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.pendingAtStart).toBe(0);
    expect(result.syncedCount).toBe(0);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit.mock.calls[0][0]).toMatchObject({
      pendingAtStart: 0,
      syncedCount: 0,
      deviceId: 'dev_tablet01',
    });
  });

  test('passes and writes the audit entry when a queued change can be replicated', async () => {
    const writeAudit = jest.fn().mockResolvedValue({ success: true });
    const getPendingCount = jest
      .fn()
      .mockResolvedValueOnce(3)  // before the sync
      .mockResolvedValueOnce(0); // after the sync

    const result = await runSyncCheckpoint({
      getPendingCount,
      syncNow: jest.fn().mockResolvedValue({ ok: true }),
      writeAudit,
      deviceId: 'dev_tablet01',
    });

    expect(result.ok).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.pendingAtStart).toBe(3);
    expect(result.syncedCount).toBe(3);
    expect(writeAudit).toHaveBeenCalledTimes(1);
    expect(writeAudit.mock.calls[0][0]).toMatchObject({
      pendingAtStart: 3,
      syncedCount: 3,
    });
  });

  test('blocks the close and writes NO audit entry when the queue cannot be cleared', async () => {
    const writeAudit = jest.fn();

    const result = await runSyncCheckpoint({
      getPendingCount: jest.fn().mockResolvedValue(3),
      syncNow: jest.fn().mockResolvedValue({ ok: false }),
      writeAudit,
    });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.pendingAfter).toBe(3);
    expect(result.reason).toContain('must not be closed for the day');
    expect(writeAudit).not.toHaveBeenCalled();
  });

  test('blocks the close when the sync attempt throws', async () => {
    const writeAudit = jest.fn();

    const result = await runSyncCheckpoint({
      getPendingCount: jest.fn().mockResolvedValue(2),
      syncNow: jest.fn().mockRejectedValue(new Error('offline')),
      writeAudit,
    });

    expect(result.ok).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('offline');
    expect(writeAudit).not.toHaveBeenCalled();
  });

  test('a blocked close leaves the records queued (nothing is discarded)', async () => {
    const writeAudit = jest.fn();
    const getPendingCount = jest
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(4);

    const result = await runSyncCheckpoint({
      getPendingCount,
      syncNow: jest.fn().mockResolvedValue({ ok: false }),
      writeAudit,
    });

    expect(result.pendingAfter).toBe(4);
    expect(result.syncedCount).toBe(0);
  });

  test('rejects a call that does not supply the required dependencies', async () => {
    await expect(runSyncCheckpoint({})).rejects.toThrow(/getPendingCount and syncNow/);
  });
});
