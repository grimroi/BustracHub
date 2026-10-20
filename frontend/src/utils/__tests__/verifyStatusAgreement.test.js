// Ensures the frontend and backend status/expiry resolvers behave identically.
// The backend module lives outside the Vite/src tree, so it is required here
// directly (it is plain CommonJS with no side effects).
import { resolveDocumentStatus as frontendResolve } from '../verifyDocument';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const backend = require('../../../../server/utils/verifyStatus');

const NOW = new Date('2026-10-09T12:00:00Z');

const brgyIssued = {
  _id: 'brgy_clearance_1788929049299',
  type: 'barangay_clearance',
  clearanceNo: 'BC-2026-0001',
  dateIssued: '2026-09-09',
  validity: '(6) Six Months Validity',
};

const fixtures = [
  { name: 'issued with evidence', doc: { ...brgyIssued, status: 'Issued' }, key: 'valid' },
  { name: 'released with evidence', doc: { ...brgyIssued, status: 'Released' }, key: 'valid' },
  { name: 'issued WITHOUT evidence is unverified', doc: { type: 'barangay_clearance', status: 'Issued' }, key: 'unverified' },
  { name: 'approved without issuance evidence is unverified', doc: { type: 'certificate_request', status: 'Approved' }, key: 'unverified' },
  { name: 'approved with issuance evidence is valid', doc: { type: 'issued_certificate', status: 'Approved', isIssued: true }, key: 'valid' },
  { name: 'pending', doc: { type: 'certificate_request', status: 'Pending' }, key: 'pending' },
  { name: 'draft', doc: { type: 'certificate_request', status: 'Draft' }, key: 'pending' },
  { name: 'under review', doc: { type: 'certificate_request', status: 'Under Review' }, key: 'pending' },
  { name: 'submitted', doc: { type: 'certificate_request', status: 'Submitted' }, key: 'pending' },
  { name: 'revoked', doc: { type: 'business_clearance', status: 'Revoked', bcIdNo: '0157' }, key: 'invalid' },
  { name: 'cancelled', doc: { type: 'business_clearance', status: 'Cancelled', bcIdNo: '0157' }, key: 'invalid' },
  { name: 'voided', doc: { type: 'business_clearance', status: 'Voided', bcIdNo: '0157' }, key: 'invalid' },
  { name: 'expired status', doc: { type: 'business_clearance', status: 'Expired', bcIdNo: '0157' }, key: 'invalid' },
  { name: 'missing status, no evidence', doc: { type: 'barangay_clearance' }, key: 'unverified' },
  { name: 'missing status, barangay evidence', doc: brgyIssued, key: 'valid' },
  { name: 'missing status, business evidence', doc: { type: 'business_clearance', bcIdNo: '0157' }, key: 'valid' },
  {
    name: 'reliably expired via validity period',
    doc: { type: 'barangay_clearance', clearanceNo: 'BC-2025-0001', dateIssued: '2025-01-01', validity: '(6) Six Months Validity' },
    key: 'expired',
  },
  {
    name: 'no reliable expiry data (not expired)',
    doc: { type: 'barangay_clearance', clearanceNo: 'BC-2020-0001', dateIssued: '2020-01-01', validity: 'Valid until further notice' },
    key: 'valid',
  },
  {
    name: 'explicit stored expiry in the past is expired',
    doc: { type: 'business_clearance', status: 'Issued', bcIdNo: '0157', expiryDate: '2025-12-31' },
    key: 'expired',
  },
  {
    name: 'explicit stored expiry in the future is valid',
    doc: { type: 'business_clearance', status: 'Issued', bcIdNo: '0157', expiryDate: '2026-12-31' },
    key: 'valid',
  },
];

describe('frontend/backend status agreement', () => {
  test.each(fixtures)('$name', ({ doc, key }) => {
    const fe = frontendResolve(doc, NOW);
    const be = backend.resolveDocumentStatus(doc, NOW);
    expect(fe).toEqual(be);
    expect(fe.key).toBe(key);
    expect(fe.valid).toBe(key === 'valid');
  });

  test('backend exposes a single set of response keys', () => {
    // Guards against duplicate valid/status/statusLabel keys regressions by
    // asserting the resolved object shape itself.
    const result = backend.resolveDocumentStatus(brgyIssued, NOW);
    expect(Object.keys(result).sort()).toEqual(['key', 'label', 'valid']);
    expect(new Set(Object.keys(result)).size).toBe(3);
  });

  test('verifyCertificate HTTP response has exactly one valid/status/statusLabel key', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const controller = require('../../../../server/controllers/certificateController');
    const fakeDb = { get: async () => brgyIssued };
    const response = await new Promise((resolve) => {
      const req = { params: { id: brgyIssued._id }, app: { get: () => fakeDb } };
      const res = {
        statusCode: 0,
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ code: this.statusCode, body }); return this; },
      };
      controller.verifyCertificate(req, res);
    });

    expect(response.code).toBe(200);
    const keys = Object.keys(response.body.data);
    expect(keys).toEqual(
      expect.arrayContaining(['valid', 'status', 'statusLabel'])
    );
    expect(keys.filter((k) => k === 'valid')).toHaveLength(1);
    expect(keys.filter((k) => k === 'status')).toHaveLength(1);
    expect(keys.filter((k) => k === 'statusLabel')).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
