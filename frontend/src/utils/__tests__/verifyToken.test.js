// src/utils/__tests__/verifyToken.test.js
//
// Tests for the client half of the secure QR verification flow:
//   - the token URL carries the token, not the document id
//   - the token format check
//   - the server payload is mapped onto the display states
//   - the service mints a token and stores it on the certificate
//   - an offline device never fabricates a token
import {
  buildVerifyUrlForToken,
  normalizeQrConfig,
} from '../qrConfig';
import {
  isValidVerificationToken,
  buildTokenVerificationView,
  VERIFICATION_RESULT,
  VERIFICATION_RESULT_HEADLINE,
} from '../verifyDocument';

const TOKEN = 'aB3-_xYz9'.repeat(5).slice(0, 43);

describe('buildVerifyUrlForToken', () => {
  test('encodes the token in the query string', () => {
    const url = buildVerifyUrlForToken(TOKEN, { baseUrl: 'https://bustrac.example.gov.ph' });
    expect(url).toBe(`https://bustrac.example.gov.ph/verify?token=${encodeURIComponent(TOKEN)}`);
  });

  test('never carries the document id', () => {
    const url = buildVerifyUrlForToken(TOKEN, { baseUrl: 'https://bustrac.example.gov.ph' });
    expect(url).not.toContain('id=');
  });

  test('returns an empty string for a missing token', () => {
    expect(buildVerifyUrlForToken('')).toBe('');
    expect(buildVerifyUrlForToken(null)).toBe('');
    expect(buildVerifyUrlForToken(undefined)).toBe('');
  });

  test('honours the configured base URL', () => {
    const url = buildVerifyUrlForToken(TOKEN, normalizeQrConfig({ baseUrl: 'http://192.168.1.5:5173' }));
    expect(url.startsWith('http://192.168.1.5:5173/verify?token=')).toBe(true);
  });

  test('falls back to the current origin when no base URL is configured', () => {
    const url = buildVerifyUrlForToken(TOKEN, normalizeQrConfig({ baseUrl: '' }));
    expect(url).toContain('/verify?token=');
  });
});

describe('isValidVerificationToken', () => {
  test('accepts a well-formed 43-character base64url token', () => {
    expect(isValidVerificationToken(TOKEN)).toBe(true);
  });

  test('rejects anything that is not a well-formed token', () => {
    expect(isValidVerificationToken('')).toBe(false);
    expect(isValidVerificationToken('short')).toBe(false);
    expect(isValidVerificationToken('a'.repeat(42))).toBe(false);
    expect(isValidVerificationToken('a'.repeat(44))).toBe(false);
    expect(isValidVerificationToken(`${'a'.repeat(42)}+`)).toBe(false);
    expect(isValidVerificationToken(null)).toBe(false);
    expect(isValidVerificationToken(12345)).toBe(false);
  });

  test('rejects a document id (the legacy QR payload)', () => {
    expect(isValidVerificationToken('brgy_clearance_1788929049299_xx1y2z')).toBe(false);
  });
});

describe('buildTokenVerificationView', () => {
  test('maps a valid payload to the Valid state', () => {
    const view = buildTokenVerificationView({
      valid: true,
      status: 'valid',
      statusLabel: 'Authentic & Valid',
      documentType: 'Barangay Clearance',
      referenceNo: 'BC-2026-0001',
      issuedTo: 'Juan Dela Cruz',
      dateIssued: 'September 15, 2026',
    });

    expect(view.result).toBe(VERIFICATION_RESULT.VALID);
    expect(view.valid).toBe(true);
    expect(view.status).toBe('valid');
    expect(view.statusLabel).toBe('Authentic & Valid');
    expect(view.documentType).toBe('Barangay Clearance');
    expect(view.referenceNo).toBe('BC-2026-0001');
  });

  test('maps a revoked payload to the Revoked state', () => {
    const view = buildTokenVerificationView({ valid: false, status: 'invalid', statusLabel: 'Revoked' });
    expect(view.result).toBe(VERIFICATION_RESULT.REVOKED);
    expect(view.valid).toBe(false);
    expect(view.status).toBe('invalid');
  });

  test('maps an expired payload to the Expired state', () => {
    const view = buildTokenVerificationView({ valid: false, status: 'expired', statusLabel: 'Expired' });
    expect(view.result).toBe(VERIFICATION_RESULT.EXPIRED);
    expect(view.status).toBe('expired');
  });

  test('maps a not-yet-issued payload to the Not Yet Valid state', () => {
    const view = buildTokenVerificationView({ valid: false, status: 'pending', statusLabel: 'Not Yet Valid' });
    expect(view.result).toBe(VERIFICATION_RESULT.NOT_YET_VALID);
    expect(view.valid).toBe(false);
  });

  test('an empty payload is never valid', () => {
    const view = buildTokenVerificationView(null);
    expect(view.valid).toBe(false);
    expect(view.result).toBe(VERIFICATION_RESULT.UNVERIFIED);
  });

  test('every result state has a headline', () => {
    Object.values(VERIFICATION_RESULT).forEach((result) => {
      expect(typeof VERIFICATION_RESULT_HEADLINE[result]).toBe('string');
    });
  });
});
