// src/utils/__tests__/blotterSubmitGuard.test.js
// Focused tests for the real blotter submission decision flow: anti-spam
// ordering, the reliable-duplicate block, the neutral confirmation, the
// SweetAlert button wiring (Magpatuloy / Kanselahin), and form validation.

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

import {
  ANTI_SPAM_WINDOW_MS,
  BLOTTER_LIMITS,
  findRecentOwnBlotter,
  evaluateBlotterSubmission,
  enforceBlotterSubmission,
  validateBlotterForm,
} from '../blotterSubmitGuard';

// Mirrors the document written by submitBlotter in ResidentUI.jsx. Note that
// the complainant NAME is what matchActiveBlotterCases uses to recognise a
// resident's own filed case (the stored id is `residentId`).
const makeDoc = (overrides = {}) => ({
  _id: overrides.refNumber || 'BLT-2026-ABC',
  type: 'blotter_record',
  residentId: 'res_1',
  subject: 'Noise Complaint',
  incidentType: 'Noise Complaint',
  complainant: 'Reyes, Juan',
  respondent: 'Under Investigation',
  incidentDate: '2026-10-10',
  status: 'Pending',
  createdAt: '2026-10-10T08:00:00.000Z',
  ...overrides,
});

const makeSwal = (result = { isConfirmed: true }) => ({
  fire: jest.fn().mockResolvedValue(result),
});

describe('findRecentOwnBlotter (anti-spam)', () => {
  const now = new Date('2026-10-10T12:00:00.000Z').getTime();

  test('finds a blotter the same resident filed within the window', () => {
    const list = [makeDoc({ createdAt: new Date(now - 1000).toISOString() })];
    expect(findRecentOwnBlotter(list, 'res_1', now)).toBeTruthy();
  });

  test('ignores blotters older than the 2-hour window', () => {
    const list = [makeDoc({ createdAt: new Date(now - ANTI_SPAM_WINDOW_MS - 1000).toISOString() })];
    expect(findRecentOwnBlotter(list, 'res_1', now)).toBeUndefined();
  });

  test('ignores recent blotters filed by a DIFFERENT resident', () => {
    const list = [makeDoc({ residentId: 'res_999', createdAt: new Date(now - 1000).toISOString() })];
    expect(findRecentOwnBlotter(list, 'res_1', now)).toBeUndefined();
  });
});

describe('evaluateBlotterSubmission', () => {
  const juan = { id: 'res_1', name: 'Reyes, Juan' };

  test('blocks a reliable duplicate of the resident’s own case', () => {
    const list = [makeDoc()];
    expect(evaluateBlotterSubmission(list, juan, { subject: 'Noise Complaint', incidentDate: '2026-10-10' }))
      .toMatchObject({ action: 'block', reason: 'duplicate_submission' });
  });

  test('different resident with the SAME name is only a confirm (not block)', () => {
    const list = [makeDoc({ residentId: 'res_999', complainant: 'Reyes, Juan' })];
    const result = evaluateBlotterSubmission(list, juan, { subject: 'Noise Complaint', incidentDate: '2026-10-10' });
    expect(result.action).toBe('confirm');
  });

  test('same resident, DIFFERENT incident is only a confirm (not block)', () => {
    const list = [makeDoc({ subject: 'Noise Complaint', complainant: 'Reyes, Juan' })];
    const result = evaluateBlotterSubmission(list, juan, { subject: 'Theft', incidentDate: '2026-10-10' });
    expect(result.action).toBe('confirm');
  });

  test('similar name only (partial overlap) is a confirm, never a block', () => {
    const list = [makeDoc({ residentId: 'res_999', complainant: 'Reyes, Juan Santos' })];
    const result = evaluateBlotterSubmission(list, juan, { subject: 'Noise Complaint', incidentDate: '2026-10-10' });
    expect(result.action).toBe('confirm');
  });

  test('no related records → proceed', () => {
    expect(evaluateBlotterSubmission([], juan, { subject: 'Noise Complaint' }))
      .toMatchObject({ action: 'proceed', reason: 'ok' });
  });
});

describe('enforceBlotterSubmission', () => {
  const juan = { id: 'res_1', name: 'Reyes, Juan' };
  const now = new Date('2026-10-10T12:00:00.000Z').getTime();

  test('anti-spam runs FIRST and short-circuits the duplicate guard', async () => {
    // This doc is ALSO a reliable duplicate — but anti-spam must win.
    const list = [makeDoc({ createdAt: new Date(now - 1000).toISOString() })];
    const swal = makeSwal();
    const result = await enforceBlotterSubmission({
      blotterList: list,
      resident: juan,
      submission: { subject: 'Noise Complaint', incidentDate: '2026-10-10' },
      now,
      swal,
    });
    expect(result).toMatchObject({ proceed: false, reason: 'anti_spam' });
    expect(swal.fire).toHaveBeenCalledTimes(1);
    expect(swal.fire).toHaveBeenCalledWith('Wait a moment', expect.any(String), 'warning');
  });

  test('reliable duplicate is blocked', async () => {
    const list = [makeDoc({ createdAt: '2026-01-01T00:00:00.000Z' })];
    const swal = makeSwal();
    const result = await enforceBlotterSubmission({
      blotterList: list,
      resident: juan,
      submission: { subject: 'Noise Complaint', incidentDate: '2026-10-10' },
      now,
      swal,
    });
    expect(result).toMatchObject({ proceed: false, reason: 'duplicate_submission' });
    expect(swal.fire).toHaveBeenCalledTimes(1);
  });

  test('Magpatuloy (confirm) continues the submission', async () => {
    const list = [makeDoc({ residentId: 'res_999', complainant: 'Reyes, Juan', createdAt: '2026-01-01T00:00:00.000Z' })];
    const swal = makeSwal({ isConfirmed: true });
    const result = await enforceBlotterSubmission({
      blotterList: list,
      resident: juan,
      submission: { subject: 'Noise Complaint', incidentDate: '2026-10-10' },
      now,
      swal,
    });
    expect(result.proceed).toBe(true);
    expect(swal.fire).toHaveBeenCalledWith(expect.objectContaining({
      confirmButtonText: 'Magpatuloy',
      cancelButtonText: 'Kanselahin',
    }));
  });

  test('Kanselahin (cancel) stops the submission', async () => {
    const list = [makeDoc({ residentId: 'res_999', complainant: 'Reyes, Juan', createdAt: '2026-01-01T00:00:00.000Z' })];
    const swal = makeSwal({ isConfirmed: false });
    const result = await enforceBlotterSubmission({
      blotterList: list,
      resident: juan,
      submission: { subject: 'Noise Complaint', incidentDate: '2026-10-10' },
      now,
      swal,
    });
    expect(result).toMatchObject({ proceed: false, reason: 'user_cancelled_related_warning' });
  });

  test('nothing related → proceed without any alert', async () => {
    const swal = makeSwal();
    const result = await enforceBlotterSubmission({
      blotterList: [],
      resident: juan,
      submission: { subject: 'Noise Complaint' },
      now,
      swal,
    });
    expect(result).toMatchObject({ proceed: true, reason: 'ok' });
    expect(swal.fire).not.toHaveBeenCalled();
  });

  test('warnings never include another person’s case ref or name', async () => {
    // Another resident sharing Juan's name (so the neutral warning fires), whose
    // record carries a private ref and a respondent name that must not leak.
    const list = [makeDoc({
      residentId: 'res_999',
      complainant: 'Reyes, Juan',
      respondent: 'Maria Clara',
      refNumber: 'BLT-2026-SECRET',
      createdAt: '2026-01-01T00:00:00.000Z',
    })];
    const swal = makeSwal({ isConfirmed: true });
    await enforceBlotterSubmission({
      blotterList: list,
      resident: juan,
      submission: { subject: 'Noise Complaint', incidentDate: '2026-10-10' },
      now,
      swal,
    });
    const serialized = JSON.stringify(swal.fire.mock.calls);
    expect(serialized).not.toContain('BLT-2026-SECRET');
    expect(serialized).not.toContain('Maria Clara');
  });
});

describe('validateBlotterForm', () => {
  test('rejects an empty subject', () => {
    expect(validateBlotterForm({ subject: '', details: 'Valid details here' }))
      .toMatchObject({ valid: false, reason: 'subject_required' });
  });

  test('rejects a whitespace-only subject', () => {
    expect(validateBlotterForm({ subject: '   ', details: 'Valid details here' }))
      .toMatchObject({ valid: false, reason: 'subject_required' });
  });

  test('rejects a too-short subject', () => {
    expect(validateBlotterForm({ subject: 'Hi', details: 'Valid details here' }))
      .toMatchObject({ valid: false, reason: 'subject_too_short' });
  });

  test('rejects empty / whitespace-only details', () => {
    expect(validateBlotterForm({ subject: 'Noise Complaint', details: '' }))
      .toMatchObject({ valid: false, reason: 'details_required' });
    expect(validateBlotterForm({ subject: 'Noise Complaint', details: '     ' }))
      .toMatchObject({ valid: false, reason: 'details_required' });
  });

  test('rejects very short / random-gibberish details (hjkjg)', () => {
    expect(validateBlotterForm({ subject: 'Noise Complaint', details: 'hjkjg' }))
      .toMatchObject({ valid: false, reason: 'details_too_short' });
  });

  test('accepts a longer random string (no wording heuristic is applied)', () => {
    expect(validateBlotterForm({ subject: 'Noise Complaint', details: 'b b nbkhjrgsrgfbfg' }).valid).toBe(true);
  });

  test('accepts a legitimate short report', () => {
    expect(validateBlotterForm({ subject: 'Theft', details: 'Nakaw ang bike ko.' }).valid).toBe(true);
  });

  test('accepts a report with all required fields', () => {
    expect(validateBlotterForm({
      subject: 'Noise Complaint',
      details: 'Malakas ang videoke hanggang madaling araw sa Purok 3.',
    })).toMatchObject({ valid: true, reason: 'ok' });
  });

  test('rejects details exceeding the maximum length', () => {
    expect(validateBlotterForm({ subject: 'Noise Complaint', details: 'x'.repeat(BLOTTER_LIMITS.DETAILS_MAX + 1) }))
      .toMatchObject({ valid: false, reason: 'details_too_long' });
  });
});
