import {
  matchActiveBlotterCases,
  normalizePersonName,
  nameKey,
  isClosedBlotterStatus,
  normalizeIncidentSubject,
  isDuplicateSubmission,
} from '../blotterMatch';

const resident = { id: 'res_1', name: 'Dela Cruz, Juan' };

describe('isClosedBlotterStatus', () => {
  test('recognises closed statuses', () => {
    for (const s of ['Settled / Resolved', 'Resolved', 'Settled', 'Dismissed', 'Referred to PNP (CFA Issued)']) {
      expect(isClosedBlotterStatus(s)).toBe(true);
    }
    expect(isClosedBlotterStatus('Open')).toBe(false);
  });
});

describe('normalizePersonName', () => {
  test('normalises punctuation, case and spacing', () => {
    expect(normalizePersonName('Dela Cruz, Juan')).toBe('dela cruz juan');
    expect(normalizePersonName('  JUAN   DELA CRUZ ')).toBe('juan dela cruz');
  });
});

describe('nameKey', () => {
  test('is order-independent for "Last, First" vs "First Last"', () => {
    expect(nameKey('Dela Cruz, Juan')).toBe(nameKey('juan dela cruz'));
  });
});

describe('matchActiveBlotterCases', () => {
  test('matches by stable resident id regardless of name', () => {
    const list = [{ id: 'blt1', status: 'Open', complainant: 'Someone Else', respondentId: 'res_1' }];
    const { confirmed, ambiguous } = matchActiveBlotterCases(list, resident);
    expect(confirmed).toHaveLength(1);
    expect(ambiguous).toHaveLength(0);
  });

  test('matches by exact normalised name', () => {
    const list = [{ id: 'blt2', status: 'Open', complainant: 'juan dela cruz', respondent: 'N/A' }];
    const { confirmed } = matchActiveBlotterCases(list, resident);
    expect(confirmed).toHaveLength(1);
  });

  test('partial name overlap is ambiguous, not confirmed', () => {
    const list = [{ id: 'blt3', status: 'Open', complainant: 'Juan Dela Cruz Santos', respondent: 'N/A' }];
    const { confirmed, ambiguous } = matchActiveBlotterCases(list, resident);
    expect(confirmed).toHaveLength(0);
    expect(ambiguous).toHaveLength(1);
  });

  test('empty blotter names never match (regression: resName.includes(""))', () => {
    const list = [
      { id: 'blt4', status: 'Open', complainant: '', respondent: '' },
      { id: 'blt5', status: 'Open', complainant: 'N/A', respondent: 'N/A' },
    ];
    const { confirmed, ambiguous } = matchActiveBlotterCases(list, resident);
    expect(confirmed).toHaveLength(0);
    expect(ambiguous).toHaveLength(0);
  });

  test('closed cases are ignored entirely', () => {
    const list = [{ id: 'blt6', status: 'Settled', respondentId: 'res_1' }];
    const { confirmed, ambiguous } = matchActiveBlotterCases(list, resident);
    expect(confirmed).toHaveLength(0);
    expect(ambiguous).toHaveLength(0);
  });
});

describe('normalizeIncidentSubject', () => {
  test('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalizeIncidentSubject('  Noise   Complaint!! ')).toBe('noise complaint');
    expect(normalizeIncidentSubject('Property-Dispute')).toBe('property dispute');
  });

  test('empty / nullish values normalise to an empty string', () => {
    expect(normalizeIncidentSubject('')).toBe('');
    expect(normalizeIncidentSubject(null)).toBe('');
    expect(normalizeIncidentSubject(undefined)).toBe('');
  });
});

describe('isDuplicateSubmission (reliable-duplicate gate)', () => {
  const owner = { id: 'res_1' };
  const submission = { subject: 'Noise Complaint', incidentDate: '2026-10-10' };

  test('CONFIRMED duplicate: same stable owner id AND same subject/date', () => {
    const list = [
      {
        id: 'blt1',
        status: 'Pending',
        residentId: 'res_1',
        subject: 'noise  complaint',
        incidentDate: '2026-10-10',
      },
    ];
    expect(isDuplicateSubmission(list, owner, submission)).toBe(true);
  });

  test('LEGITIMATE new incident: same resident, DIFFERENT subject is allowed', () => {
    const list = [
      { id: 'blt1', status: 'Pending', residentId: 'res_1', subject: 'Noise Complaint', incidentDate: '2026-10-10' },
    ];
    expect(isDuplicateSubmission(list, owner, { subject: 'Theft', incidentDate: '2026-10-10' })).toBe(false);
  });

  test('LEGITIMATE repeat incident: same subject on a DIFFERENT date is allowed', () => {
    const list = [
      { id: 'blt1', status: 'Pending', residentId: 'res_1', subject: 'Noise Complaint', incidentDate: '2026-01-01' },
    ];
    expect(isDuplicateSubmission(list, owner, submission)).toBe(false);
  });

  test('AMBIGUOUS / other person: same name but different owner id never blocks', () => {
    const list = [
      // Same person-name, but this record belongs to another resident.
      { id: 'blt1', status: 'Pending', residentId: 'res_999', subject: 'Noise Complaint', incidentDate: '2026-10-10' },
    ];
    expect(isDuplicateSubmission(list, owner, submission)).toBe(false);
  });

  test('closed duplicate case is ignored', () => {
    const list = [
      { id: 'blt1', status: 'Settled', residentId: 'res_1', subject: 'Noise Complaint', incidentDate: '2026-10-10' },
    ];
    expect(isDuplicateSubmission(list, owner, submission)).toBe(false);
  });

  test('missing incident date falls back to subject-only match', () => {
    const list = [{ id: 'blt1', status: 'Pending', residentId: 'res_1', subject: 'Noise Complaint' }];
    expect(isDuplicateSubmission(list, owner, submission)).toBe(true);
  });

  test('never duplicates without a stable resident id or a subject', () => {
    const list = [{ id: 'blt1', status: 'Pending', residentId: 'res_1', subject: 'Noise Complaint' }];
    expect(isDuplicateSubmission(list, {}, submission)).toBe(false);
    expect(isDuplicateSubmission(list, owner, { incidentDate: '2026-10-10' })).toBe(false);
  });
});

// Mirrors the document exactly as written by submitBlotter in ResidentUI.jsx
// (see the `payload` object). These tests guard the real field contract so the
// duplicate guard cannot silently drift from what the app actually stores.
const makeFiledBlotter = (overrides = {}) => {
  const subject = overrides.subject || 'Noise Complaint';
  return {
    type: 'blotter_record',
    docType: 'blotter',
    subject: subject.trim(),
    incidentType: subject.trim(),
    complainant: overrides.complainant || 'Dela Cruz, Juan',
    complainantName: overrides.complainant || 'Dela Cruz, Juan',
    respondent: 'Under Investigation',
    incidentDate: overrides.incidentDate || '2026-10-10',
    status: 'Pending',
    residentId: overrides.residentId || 'res_1',
    ...overrides,
  };
};

// Replicates the exact decision the component makes: BLOCK on a reliable
// duplicate, otherwise WARN (non-blocking) when any related record is found.
const decide = (list, resident, submission) => {
  const blocked = isDuplicateSubmission(list, { id: resident.id }, submission);
  const { confirmed, ambiguous } = matchActiveBlotterCases(list, resident);
  return { blocked, warn: !blocked && (confirmed.length > 0 || ambiguous.length > 0) };
};

describe('submitBlotter decision contract (real payload shape)', () => {
  const juan = { id: 'res_1', name: 'Dela Cruz, Juan' };

  test('different resident with the SAME name is warned but NOT blocked', () => {
    // A case filed by another resident (res_999) who shares Juan's name.
    const list = [makeFiledBlotter({ residentId: 'res_999', complainant: 'Dela Cruz, Juan' })];
    const result = decide(list, juan, { subject: 'Noise Complaint', incidentDate: '2026-10-10' });
    expect(result.blocked).toBe(false);
    expect(result.warn).toBe(true); // neutral, non-blocking warning only
  });

  test('same resident with a DIFFERENT incident is warned but NOT blocked', () => {
    const list = [makeFiledBlotter({ residentId: 'res_1', subject: 'Noise Complaint' })];
    const result = decide(list, juan, { subject: 'Theft', incidentDate: '2026-10-10' });
    expect(result.blocked).toBe(false);
    expect(result.warn).toBe(true);
  });

  test('same resident re-filing the SAME incident is blocked (reliable duplicate)', () => {
    const list = [makeFiledBlotter({ residentId: 'res_1', subject: 'Noise Complaint', incidentDate: '2026-10-10' })];
    const result = decide(list, juan, { subject: 'noise  complaint', incidentDate: '2026-10-10' });
    expect(result.blocked).toBe(true);
    expect(result.warn).toBe(false);
  });

  test('similar name alone (partial overlap) never blocks a submission', () => {
    const list = [makeFiledBlotter({ residentId: 'res_999', complainant: 'Juan Dela Cruz Santos' })];
    const result = decide(list, juan, { subject: 'Noise Complaint', incidentDate: '2026-10-10' });
    expect(result.blocked).toBe(false);
    expect(result.warn).toBe(true); // ambiguous → neutral warning
  });

  test('consistent-incident repeat on a different date is NOT blocked', () => {
    const list = [makeFiledBlotter({ residentId: 'res_1', subject: 'Noise Complaint', incidentDate: '2026-01-01' })];
    const result = decide(list, juan, { subject: 'Noise Complaint', incidentDate: '2026-10-10' });
    expect(result.blocked).toBe(false);
  });
});
