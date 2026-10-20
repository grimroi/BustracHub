// src/utils/__tests__/vawcAccess.test.js
//
// RA 9262 §44 / DPA 2012 confidentiality controls for VAWC blotter records.
// Proves the pure masking policy used at BOTH the render boundary and the
// export boundary.
import {
  maskVawcRecord,
  maskVawcRecords,
  canUnmaskVawc,
  isVawcRecord,
  VAWC_REDACTION_MARKER,
  VAWC_SENSITIVE_FIELDS,
} from '../vawcAccess';

const STAFF = { username: 'mgcortero', role: 'staff' };
const VAWC_OFFICER = { username: 'vawc01', role: 'vawc_officer' };
const ADMIN = { username: 'jmacabangon', role: 'admin' };
const RESIDENT = { username: 'juan2026', role: 'resident' };
const SYSTEM = { username: 'x', role: 'system' };

const vawcDoc = () => ({
  _id: 'blotter_vawc_1',
  type: 'blotter_report',
  caseNumber: 'BL-2026-0042',
  status: 'Pending',
  createdAt: '2026-01-02T00:00:00.000Z',
  vawcFlag: true,
  narrative: 'Victim was physically abused by her partner.',
  complainantName: 'Maria Santos',
  complainantAddress: 'Purok 3, Barangay Bustrac',
  respondentName: 'Pedro Reyes',
  respondentAddress: 'Purok 1, Barangay Bustrac',
  contactNumber: '09171234567',
});

describe('isVawcRecord / canUnmaskVawc', () => {
  test('a doc with vawcFlag === true is a VAWC record', () => {
    expect(isVawcRecord(vawcDoc())).toBe(true);
  });

  test('a doc without vawcFlag (or false) is not a VAWC record', () => {
    expect(isVawcRecord({ type: 'blotter_report' })).toBe(false);
    expect(isVawcRecord({ type: 'blotter_report', vawcFlag: false })).toBe(false);
    expect(isVawcRecord(null)).toBe(false);
  });

  test('only admin and vawc_officer may unmask', () => {
    expect(canUnmaskVawc(ADMIN)).toBe(true);
    expect(canUnmaskVawc(VAWC_OFFICER)).toBe(true);
    expect(canUnmaskVawc(STAFF)).toBe(false);
    expect(canUnmaskVawc(RESIDENT)).toBe(false);
    expect(canUnmaskVawc(SYSTEM)).toBe(false);
    expect(canUnmaskVawc(null)).toBe(false);
  });

  test('role matching is case/whitespace insensitive', () => {
    expect(canUnmaskVawc({ role: 'VAWC_Officer ' })).toBe(true);
    expect(canUnmaskVawc({ role: ' Admin ' })).toBe(true);
  });
});

describe('maskVawcRecord — staff (unauthorized) sees masked', () => {
  test('every sensitive field is replaced with the redaction marker', () => {
    const masked = maskVawcRecord(vawcDoc(), STAFF);
    for (const field of VAWC_SENSITIVE_FIELDS) {
      expect(masked[field]).toBe(VAWC_REDACTION_MARKER);
    }
  });

  test('non-identifying tracking fields remain visible', () => {
    const masked = maskVawcRecord(vawcDoc(), STAFF);
    expect(masked._id).toBe('blotter_vawc_1');
    expect(masked.type).toBe('blotter_report');
    expect(masked.status).toBe('Pending');
    expect(masked.createdAt).toBe('2026-01-02T00:00:00.000Z');
    expect(masked.caseNumber).toBe('BL-2026-0042');
  });

  test('the original document is not mutated', () => {
    const original = vawcDoc();
    const masked = maskVawcRecord(original, STAFF);
    expect(masked).not.toBe(original);
    expect(original.narrative).toBe('Victim was physically abused by her partner.');
    expect(original.complainantName).toBe('Maria Santos');
  });

  test('raw PII never survives anywhere in the masked object', () => {
    const masked = maskVawcRecord(vawcDoc(), STAFF);
    const serialized = JSON.stringify(masked);
    expect(serialized).not.toContain('Maria Santos');
    expect(serialized).not.toContain('09171234567');
    expect(serialized).not.toContain('Pedro Reyes');
    expect(serialized).not.toContain('physically abused');
  });

  test('nested complainant/respondent objects are also redacted', () => {
    const doc = {
      ...vawcDoc(),
      complainant: { name: 'Maria Santos', address: 'Purok 3' },
      respondent: { name: 'Pedro Reyes' },
    };
    const masked = maskVawcRecord(doc, STAFF);
    expect(masked.complainant).toBe(VAWC_REDACTION_MARKER);
    expect(masked.respondent).toBe(VAWC_REDACTION_MARKER);
    expect(JSON.stringify(masked)).not.toContain('Maria Santos');
  });
});

describe('maskVawcRecord — authorized viewers see unmasked', () => {
  test('vawc_officer receives the unmasked record', () => {
    const masked = maskVawcRecord(vawcDoc(), VAWC_OFFICER);
    expect(masked.narrative).toBe('Victim was physically abused by her partner.');
    expect(masked.complainantName).toBe('Maria Santos');
    expect(masked.respondentName).toBe('Pedro Reyes');
    expect(masked.contactNumber).toBe('09171234567');
  });

  test('admin receives the unmasked record', () => {
    const masked = maskVawcRecord(vawcDoc(), ADMIN);
    expect(masked.narrative).toBe('Victim was physically abused by her partner.');
    expect(masked.complainantName).toBe('Maria Santos');
  });
});

describe('maskVawcRecord — non-VAWC documents are unaffected', () => {
  test('a plain blotter doc is returned unchanged for staff', () => {
    const plain = {
      _id: 'blotter_1',
      type: 'blotter_report',
      narrative: 'Noise complaint.',
      complainantName: 'Ana Cruz',
      respondentName: 'Ben Cruz',
    };
    const out = maskVawcRecord(plain, STAFF);
    expect(out).toBe(plain);
    expect(out.narrative).toBe('Noise complaint.');
    expect(out.complainantName).toBe('Ana Cruz');
  });

  test('a resident viewing a non-VAWC doc sees it unchanged', () => {
    const plain = { _id: 'blotter_2', type: 'blotter_report', narrative: 'Lost wallet.' };
    expect(maskVawcRecord(plain, RESIDENT)).toBe(plain);
  });
});

describe('export boundary — maskVawcRecords', () => {
  // The Excel/print export maps a list of blotter docs through this helper, so
  // asserting on it proves the export path redacts too.
  test('a mixed list masks only VAWC rows for staff', () => {
    const rows = [vawcDoc(), { _id: 'b2', type: 'blotter_report', caseNumber: 'BL-2', narrative: 'Noise.' }];
    const out = maskVawcRecords(rows, STAFF);
    expect(out[0].narrative).toBe(VAWC_REDACTION_MARKER);
    expect(out[0].complainantName).toBe(VAWC_REDACTION_MARKER);
    expect(out[1].narrative).toBe('Noise.');
    expect(JSON.stringify(out)).not.toContain('Maria Santos');
  });

  test('a vawc_officer export list keeps VAWC contents', () => {
    const rows = [vawcDoc()];
    const out = maskVawcRecords(rows, VAWC_OFFICER);
    expect(out[0].complainantName).toBe('Maria Santos');
  });

  test('simulated Excel export cell mapping carries no raw PII for staff', () => {
    // Mirrors DashboardPortal.handleExportBlotterToExcel: mask the list, then
    // map the sensitive columns exactly as the exporter does.
    const rows = [vawcDoc()];
    const exportData = maskVawcRecords(rows, STAFF).map((b) => ({
      'Case No': b.caseNumber || b._id,
      Complainant: b.complainantName || 'N/A',
      Respondent: b.respondentName || 'N/A',
      Narrative: b.narrative || '',
    }));
    const cellText = JSON.stringify(exportData);
    expect(cellText).not.toContain('Maria Santos');
    expect(cellText).not.toContain('Pedro Reyes');
    expect(cellText).not.toContain('physically abused');
    expect(exportData[0]['Case No']).toBe('BL-2026-0042');
  });
});

describe('maskVawcRecords — input hygiene', () => {
  test('non-array input is returned as-is', () => {
    expect(maskVawcRecords(null, STAFF)).toBe(null);
    expect(maskVawcRecords(undefined, STAFF)).toBe(undefined);
  });

  test('empty array yields empty array', () => {
    expect(maskVawcRecords([], STAFF)).toEqual([]);
  });
});
