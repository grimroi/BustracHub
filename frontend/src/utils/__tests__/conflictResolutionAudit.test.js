// src/utils/__tests__/conflictResolutionAudit.test.js
//
// Restored test suite for the conflict-resolution audit entry.
//
// The suite was referenced by frontend/test-output.txt but was missing from the
// tree. It asserts that a conflict resolution is recorded with the strategy
// used and the list of fields that were merged, so the audit trail can answer
// "what was discarded and who decided to discard it".
import { localDb } from '../../services/db';
import { logConflictResolution } from '../auditLog';

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('bustrac_user', JSON.stringify({ username: 'jmacabangon', role: 'admin' }));
  localStorage.setItem('bustrac_role', 'admin');
});

const writtenDoc = () => localDb.put.mock.calls[0][0];

describe('logConflictResolution — identity', () => {
  test('writes a RESOLVE_CONFLICT audit entry', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      details: 'Retained Version A',
    });

    const doc = writtenDoc();
    expect(doc.type).toBe('audit_log');
    expect(doc.action).toBe('RESOLVE_CONFLICT');
    expect(doc.module).toBe('SYNC_ENGINE');
  });

  test('uses the supplied module when one is given', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      module: 'CONFLICTS',
    });

    expect(writtenDoc().module).toBe('CONFLICTS');
  });

  test('accepts recordId as the primary identifier', async () => {
    await logConflictResolution({
      recordId: 'resident_42',
      docId: 'resident_1',
      strategy: 'keep-a',
    });

    expect(writtenDoc().recordId).toBe('resident_42');
  });

  test('falls back to the legacy docId alias when recordId is absent', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
    });

    expect(writtenDoc().recordId).toBe('resident_1');
  });

  test('records a null recordId when neither identifier is supplied', async () => {
    await logConflictResolution({ strategy: 'keep-a' });

    expect(writtenDoc().recordId).toBeNull();
  });
});

describe('logConflictResolution — strategy', () => {
  test('names the strategy in the human-readable details', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'field-merge',
    });

    expect(writtenDoc().details).toContain('Conflict resolved using strategy: field-merge.');
  });

  test('records the strategy in the structured meta payload', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-b',
    });

    expect(writtenDoc().meta.strategy).toBe('keep-b');
  });

  test('labels a missing strategy as unspecified rather than leaving it blank', async () => {
    await logConflictResolution({ docId: 'resident_1' });

    expect(writtenDoc().meta.strategy).toBe('unspecified');
    expect(writtenDoc().details).toContain('strategy: unspecified');
  });

  test('includes the resident name in the details when supplied', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      residentName: 'Juan Dela Cruz',
    });

    expect(writtenDoc().details).toContain('Record: Juan Dela Cruz.');
    expect(writtenDoc().meta.residentName).toBe('Juan Dela Cruz');
  });
});

describe('logConflictResolution — merged fields', () => {
  test('lists the merged fields in the details', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'field-merge',
      mergedFields: ['purok', 'contact'],
    });

    expect(writtenDoc().details).toContain('Merged fields: purok, contact.');
  });

  test('records the merged fields in the meta payload', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'field-merge',
      mergedFields: ['purok', 'contact'],
    });

    expect(writtenDoc().meta.mergedFields).toEqual(['purok', 'contact']);
  });

  test('states that no differing fields were merged when the list is empty', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      mergedFields: [],
    });

    expect(writtenDoc().details).toContain('No differing fields were merged.');
  });

  test('tolerates a non-array mergedFields value', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      mergedFields: 'purok',
    });

    expect(writtenDoc().meta.mergedFields).toEqual([]);
  });
});

describe('logConflictResolution — per-field decisions', () => {
  test('records the per-field decisions in the details', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'field-merge',
      mergedFields: ['purok', 'contact'],
      fieldChoices: { purok: 'A', contact: 'B' },
    });

    expect(writtenDoc().details).toContain('Field decisions: purok=Version A, contact=Version B.');
  });

  test('records the per-field decisions in the meta payload', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'field-merge',
      fieldChoices: { purok: 'A' },
    });

    expect(writtenDoc().meta.fieldChoices).toEqual({ purok: 'A' });
  });

  test('omits the field-decision block when no choices are supplied', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
    });

    expect(writtenDoc().details).not.toContain('Field decisions:');
    expect(Object.prototype.hasOwnProperty.call(writtenDoc().meta, 'fieldChoices')).toBe(false);
  });
});

describe('logConflictResolution — revision bookkeeping', () => {
  test('records the winning revision and the discarded revisions', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-b',
      winnerRev: '3-bbb',
      loserRevs: ['2-aaa'],
    });

    expect(writtenDoc().meta.winnerRev).toBe('3-bbb');
    expect(writtenDoc().meta.loserRevs).toEqual(['2-aaa']);
  });

  test('defaults the discarded-revision list to an empty array', async () => {
    await logConflictResolution({ docId: 'resident_1', strategy: 'keep-b' });

    expect(writtenDoc().meta.loserRevs).toEqual([]);
    expect(writtenDoc().meta.winnerRev).toBeNull();
  });

  test('records who resolved the conflict when supplied', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      resolvedBy: 'admin',
    });

    expect(writtenDoc().meta.resolvedBy).toBe('admin');
  });
});

describe('logConflictResolution — free-text details', () => {
  test('appends the caller-supplied details after the generated summary', async () => {
    await logConflictResolution({
      docId: 'resident_1',
      strategy: 'keep-a',
      details: 'Retained Version A for Juan Dela Cruz',
    });

    const details = writtenDoc().details;
    expect(details).toContain('Conflict resolved using strategy: keep-a.');
    expect(details.endsWith('Retained Version A for Juan Dela Cruz')).toBe(true);
  });
});
