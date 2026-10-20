// src/utils/__tests__/conflictMerge.test.js
import {
  buildDefaultChoices,
  buildMergedDocument,
  computeConflictDiff,
  conflictFieldLabel,
  describeMergeChoices,
  formatConflictValue,
  normalizeConflictValue,
} from '../conflictMerge';

const docA = {
  _id: 'resident_1',
  _rev: '2-aaa',
  type: 'resident',
  name: 'Juan Dela Cruz',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  purok: 'Purok 1',
  contact: '09171112222',
  address: '123 Mabini St.',
  updatedAt: '2026-10-20T08:00:00.000Z',
  updatedBy: 'staffA',
};

const docB = {
  _id: 'resident_1',
  _rev: '2-bbb',
  type: 'resident',
  name: 'Juan Dela Cruz',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  purok: 'Purok 3',
  contact: '09171112222',
  address: '123 Mabini St.',
  occupation: 'Farmer',
  updatedAt: '2026-10-20T09:00:00.000Z',
  updatedBy: 'staffB',
};

describe('computeConflictDiff', () => {
  it('only reports fields that actually differ', () => {
    const diff = computeConflictDiff(docA, docB);
    const fields = diff.map((d) => d.field).sort();
    expect(fields).toEqual(['occupation', 'purok']);
  });

  it('keeps the legacy { field, label, valueA, valueB } shape', () => {
    const diff = computeConflictDiff(docA, docB);
    const purok = diff.find((d) => d.field === 'purok');
    expect(purok).toMatchObject({
      field: 'purok',
      label: 'Purok',
      valueA: 'Purok 1',
      valueB: 'Purok 3',
    });
  });

  it('flags which side actually has the field', () => {
    const diff = computeConflictDiff(docA, docB);
    const occupation = diff.find((d) => d.field === 'occupation');
    expect(occupation.presentA).toBe(false);
    expect(occupation.presentB).toBe(true);
  });

  it('pre-selects the only existing value for a one-sided field', () => {
    const diff = computeConflictDiff(docA, docB);
    const occupation = diff.find((d) => d.field === 'occupation');
    expect(occupation.defaultChoice).toBe('B');
  });

  it('pre-selects the newer revision for a field present in both', () => {
    const diff = computeConflictDiff(docA, docB);
    const purok = diff.find((d) => d.field === 'purok');
    // Version B is newer in this fixture.
    expect(purok.defaultChoice).toBe('B');
  });

  it('ignores bookkeeping and attribution fields', () => {
    const diff = computeConflictDiff(
      {
        _id: 'x', _rev: '1-a', _conflicts: ['1-b'], createdAt: 'x', updatedAt: 'x',
        updatedBy: 'staffA', name: 'Same Name', purok: 'Purok 1',
      },
      {
        _id: 'x', _rev: '1-b', _conflicts: ['1-a'], createdAt: 'y', updatedAt: 'y',
        updatedBy: 'staffB', name: 'Same Name', purok: 'Purok 1',
      }
    );
    expect(diff).toEqual([]);
  });
});

describe('buildMergedDocument', () => {
  it('merges field by field without losing valid data', () => {
    const diff = computeConflictDiff(docA, docB);
    const choices = { ...buildDefaultChoices(diff), purok: 'A' };

    const { doc, mergedFields } = buildMergedDocument(docA, docB, choices);

    // Field taken from A.
    expect(doc.purok).toBe('Purok 1');
    // Field that only exists in B is kept.
    expect(doc.occupation).toBe('Farmer');
    // Untouched fields survive.
    expect(doc.contact).toBe('09171112222');
    expect(doc.name).toBe('Juan Dela Cruz');
    expect(mergedFields).toEqual(expect.arrayContaining(['purok', 'occupation']));
  });

  it('can take a field from B while keeping another from A', () => {
    const choices = { purok: 'A', occupation: 'B' };
    const { doc } = buildMergedDocument(docA, docB, choices);
    expect(doc.purok).toBe('Purok 1');
    expect(doc.occupation).toBe('Farmer');
  });

  it('records the merge decisions on the document', () => {
    const { doc } = buildMergedDocument(docA, docB, { purok: 'A' });
    expect(doc._conflictResolved).toBe(true);
    expect(doc.conflictMerge.fieldChoices.purok).toBe('A');
    expect(doc.conflictMerge.mergedFields).toContain('purok');
  });

  it('does not mutate the source documents', () => {
    buildMergedDocument(docA, docB, { purok: 'B' });
    expect(docA.purok).toBe('Purok 1');
  });
});

describe('helpers', () => {
  it('labels known fields and prettifies unknown ones', () => {
    expect(conflictFieldLabel('contact')).toBe('Contact Number');
    expect(conflictFieldLabel('someNewField')).toBe('Some New Field');
    expect(conflictFieldLabel('_rev')).toBeNull();
  });

  it('formats values for display', () => {
    expect(formatConflictValue(null)).toBe('—');
    expect(formatConflictValue('')).toBe('(empty)');
    expect(formatConflictValue(true)).toBe('Yes');
    expect(formatConflictValue(['a', 'b'])).toBe('a, b');
  });

  it('normalizes values for comparison', () => {
    expect(normalizeConflictValue(1)).toBe('1');
    expect(normalizeConflictValue(null)).toBe('');
  });

  it('describes the merge decisions', () => {
    const summary = describeMergeChoices(computeConflictDiff(docA, docB), { purok: 'A' });
    expect(summary).toContain('Purok (Version A)');
  });
});
