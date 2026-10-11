// src/utils/__tests__/conflictResolutionAudit.test.js
import { createAuditLog, logConflictResolution } from '../auditLog';
import { localDb } from '../../services/db';

describe('Conflict resolution audit logging (Feature D)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  test('logConflictResolution includes original conflict metadata', async () => {
    const res = await logConflictResolution({
      docId: 'res_123',
      module: 'Residents',
      strategy: 'keep-local',
      winnerRev: '1-abc',
      loserRevs: ['2-def'],
      mergedFields: ['name', 'purok'],
      residentName: 'Test Resident',
      details: 'Bulk resolution kept local version for Test Resident',
    });

    expect(localDb.put).toHaveBeenCalledTimes(1);
    const doc = res.entry;
    expect(doc.action).toBe('CONFLICT_RESOLVED');
    expect(doc.recordId).toBe('res_123');
    expect(doc.module).toBe('Residents');
    expect(doc.meta).toEqual({
      conflict: true,
      strategy: 'keep-local',
      winnerRev: '1-abc',
      loserRevs: ['2-def'],
      mergedFields: ['name', 'purok'],
    });
    expect(doc.details).toContain('Bulk resolution kept local version for Test Resident');
    expect(doc.details).toContain('strategy: keep-local');
    expect(doc.details).toContain('Winner: 1-abc');
    expect(doc.details).toContain('Discarded: 2-def');
    expect(doc.details).toContain('Fields: name, purok');
  });

  test('logConflictResolution handles keep-both with empty loserRevs', async () => {
    const res = await logConflictResolution({
      docId: 'res_456',
      module: 'CONFLICTS',
      strategy: 'keep-both',
      winnerRev: '1-aaa',
      loserRevs: [],
      mergedFields: [],
      residentName: 'Jane Doe',
      details: 'Split conflict for Jane Doe; Version B preserved as distinct record',
    });

    const doc = res.entry;
    expect(doc.action).toBe('CONFLICT_RESOLVED');
    expect(doc.meta.loserRevs).toEqual([]);
    expect(doc.meta.winnerRev).toBe('1-aaa');
    expect(doc.meta.strategy).toBe('keep-both');
    expect(doc.details).toContain('Split conflict');
    expect(doc.details).toContain('Version B preserved as distinct record');
  });

  test('logConflictResolution preserves original revs for bulk resolution context', async () => {
    const res = await logConflictResolution({
      docId: 'bulk_doc',
      module: 'CONFLICTS',
      strategy: 'keep-local',
      winnerRev: '3-original',
      loserRevs: ['4-conflict'],
      mergedFields: ['address'],
      residentName: 'Bulk Test',
    });

    const doc = res.entry;
    expect(doc.meta.winnerRev).toBe('3-original');
    expect(doc.meta.loserRevs).toEqual(['4-conflict']);
    expect(doc.meta.conflict).toBe(true);
    expect(doc.details).toContain('Winner: 3-original');
    expect(doc.details).toContain('Discarded: 4-conflict');
  });
});
