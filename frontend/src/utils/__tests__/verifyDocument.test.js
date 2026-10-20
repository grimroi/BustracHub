import {
  isVerifiableDocId,
  isVerifiableDoc,
  resolveDocumentStatus,
  parseValidityPeriod,
  computeExpiry,
  hasIssuanceEvidence,
  getDocumentTypeLabel,
  getDocumentReference,
  getIssuedToName,
  formatSafeDate,
  buildVerificationView,
} from '../verifyDocument';

describe('isVerifiableDocId', () => {
  test('accepts certificate id prefixes', () => {
    expect(isVerifiableDocId('bus_clearance_1788918019942')).toBe(true);
    expect(isVerifiableDocId('brgy_clearance_1788918019942')).toBe(true);
    expect(isVerifiableDocId('CERT-2026-123456')).toBe(true);
    expect(isVerifiableDocId('issued_cert_REQ-1')).toBe(true);
  });

  test('rejects unrelated / non-certificate ids', () => {
    expect(isVerifiableDocId('user_admin')).toBe(false);
    expect(isVerifiableDocId('resident_123')).toBe(false);
    expect(isVerifiableDocId('_design/anything')).toBe(false);
    expect(isVerifiableDocId('')).toBe(false);
    expect(isVerifiableDocId(null)).toBe(false);
    expect(isVerifiableDocId('x'.repeat(200))).toBe(false);
  });
});

describe('isVerifiableDoc', () => {
  test('accepts certificate documents', () => {
    expect(isVerifiableDoc({ _id: 'bus_clearance_1', type: 'business_clearance' })).toBe(true);
    expect(isVerifiableDoc({ _id: 'CERT-1', type: 'certificate_request' })).toBe(true);
  });

  test('rejects documents with a valid prefix but private type', () => {
    expect(isVerifiableDoc({ _id: 'bus_clearance_1', type: 'user' })).toBe(false);
    expect(isVerifiableDoc({ _id: 'resident_1', type: 'business_clearance' })).toBe(false);
    expect(isVerifiableDoc(null)).toBe(false);
  });
});

describe('resolveDocumentStatus', () => {
  const NOW = new Date('2026-10-09T12:00:00Z');
  const issuedBusiness = { type: 'business_clearance', status: 'Issued', bcIdNo: '0157' };
  const issuedCert = { type: 'issued_certificate', status: 'Issued', isIssued: true };

  test('treats issued/released as valid only with issuance evidence', () => {
    expect(resolveDocumentStatus(issuedBusiness, NOW).valid).toBe(true);
    expect(resolveDocumentStatus({ ...issuedCert, status: 'Released' }, NOW).valid).toBe(true);
  });

  test('issued status WITHOUT issuance evidence is unverified, not valid', () => {
    const bare = resolveDocumentStatus({ type: 'certificate_request', status: 'Issued' }, NOW);
    expect(bare.valid).toBe(false);
    expect(bare.key).toBe('unverified');
  });

  test('an "Approved but not yet issued" request is never authentic', () => {
    const approved = resolveDocumentStatus(
      { type: 'certificate_request', status: 'Approved', step: 4 },
      NOW
    );
    expect(approved.valid).toBe(false);
    expect(approved.key).toBe('unverified');
  });

  test('treats revoked/cancelled/voided/expired as invalid', () => {
    for (const status of ['Revoked', 'Cancelled', 'Canceled', 'Void', 'Voided', 'Expired']) {
      expect(resolveDocumentStatus({ status }, NOW).key).toBe('invalid');
      expect(resolveDocumentStatus({ status }, NOW).valid).toBe(false);
    }
  });

  test('treats pending / draft / under-review workflow statuses as NOT valid', () => {
    for (const status of ['Pending', 'Draft', 'Submitted', 'Under Review', 'Processing', 'For Approval']) {
      const result = resolveDocumentStatus({ type: 'business_clearance', status }, NOW);
      expect(result.valid).toBe(false);
      expect(result.key).toBe('pending');
    }
  });

  test('missing status WITHOUT issuance evidence is unverified, never valid', () => {
    const result = resolveDocumentStatus({ type: 'barangay_clearance' }, NOW);
    expect(result.valid).toBe(false);
    expect(result.key).toBe('unverified');
  });

  test('missing status WITH reliable evidence (barangay clearance) is valid', () => {
    const doc = {
      type: 'barangay_clearance',
      clearanceNo: 'BC-2026-0001',
      dateIssued: '2026-09-09',
      validity: '(6) Six Months Validity',
    };
    const result = resolveDocumentStatus(doc, NOW);
    expect(result.valid).toBe(true);
    expect(result.key).toBe('valid');
  });

  test('missing status WITH reliable evidence (business bcIdNo) is valid', () => {
    const result = resolveDocumentStatus({ type: 'business_clearance', bcIdNo: '0157' }, NOW);
    expect(result.valid).toBe(true);
  });

  test('explicit not-issued flags override reference evidence', () => {
    expect(hasIssuanceEvidence({ type: 'barangay_clearance', clearanceNo: 'BC-1', dateIssued: '2026-09-09', isIssuedByBarangay: false })).toBe(false);
    expect(hasIssuanceEvidence({ type: 'barangay_clearance', clearanceNo: 'BC-1', dateIssued: '2026-09-09', isIssued: false })).toBe(false);
  });

  test('reliably-expired clearance is invalid', () => {
    const doc = {
      type: 'barangay_clearance',
      clearanceNo: 'BC-2025-0001',
      dateIssued: '2025-01-01',
      validity: '(6) Six Months Validity',
    };
    const result = resolveDocumentStatus(doc, NOW);
    expect(result.valid).toBe(false);
    expect(result.key).toBe('expired');
  });

  test('clearance without a readable validity period is NOT marked expired', () => {
    const doc = {
      type: 'barangay_clearance',
      clearanceNo: 'BC-2020-0001',
      dateIssued: '2020-01-01',
      validity: 'Valid until further notice',
    };
    const result = resolveDocumentStatus(doc, NOW);
    expect(result.valid).toBe(true);
    expect(result.key).toBe('valid');
  });

  test('an explicit stored expiry date is honoured', () => {
    const expired = resolveDocumentStatus({ ...issuedBusiness, expiryDate: '2025-12-31' }, NOW);
    expect(expired.key).toBe('expired');
    const future = resolveDocumentStatus({ ...issuedBusiness, expiryDate: '2026-12-31' }, NOW);
    expect(future.key).toBe('valid');
  });

  test('a non-Date `now` never throws (defensive coercion)', () => {
    expect(() => resolveDocumentStatus({ ...issuedBusiness, expiryDate: '2026-12-31' }, null)).not.toThrow();
    expect(() => resolveDocumentStatus({ ...issuedBusiness, expiryDate: '2026-12-31' }, 'nonsense')).not.toThrow();
  });
});

describe('validity / expiry parsing', () => {
  test('parses descriptive validity periods', () => {
    expect(parseValidityPeriod('(6) Six Months Validity')).toEqual({ months: 6 });
    expect(parseValidityPeriod('6 months')).toEqual({ months: 6 });
    expect(parseValidityPeriod('One (1) Year Validity')).toEqual({ months: 12 });
    expect(parseValidityPeriod('Three Years')).toEqual({ months: 36 });
  });

  test('refuses to invent a period from non-period text', () => {
    expect(parseValidityPeriod('Valid until further notice')).toBeNull();
    expect(parseValidityPeriod('No expiration')).toBeNull();
    expect(parseValidityPeriod('')).toBeNull();
    expect(parseValidityPeriod(undefined)).toBeNull();
  });

  test('computes expiry only from a real issuance date + period', () => {
    const expiry = computeExpiry({ dateIssued: '2026-09-09', validity: '(6) Six Months Validity' });
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.getUTCFullYear()).toBe(2027);
    expect(expiry.getUTCMonth()).toBe(2); // March
    expect(computeExpiry({ validity: '6 months' })).toBeNull();
    expect(computeExpiry({ dateIssued: '2026-09-09', validity: 'n/a' })).toBeNull();
  });

  test('an explicit stored expiry date wins over a period-derived one', () => {
    const expiry = computeExpiry({ dateIssued: '2020-01-01', validity: '6 months', expiryDate: '2026-12-31' });
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.getUTCFullYear()).toBe(2026);
    expect(expiry.getUTCMonth()).toBe(11); // December
  });

  test('an unparseable explicit expiry falls back to the period', () => {
    const expiry = computeExpiry({ dateIssued: '2026-09-09', validity: '6 months', expiryDate: 'not-a-date' });
    expect(expiry).toBeInstanceOf(Date);
    expect(expiry.getUTCMonth()).toBe(2); // March 2027
  });
});

describe('field extraction', () => {
  test('document type label maps known types', () => {
    expect(getDocumentTypeLabel({ type: 'business_clearance' })).toBe('Barangay Business Clearance');
    expect(getDocumentTypeLabel({ certificateType: 'Indigency' })).toBe('Certificate of Indigency');
  });

  test('reference prefers business id / clearance no', () => {
    expect(getDocumentReference({ bcIdNo: '0157' })).toBe('0157');
    expect(getDocumentReference({ clearanceNo: 'BC-2026-0001' })).toBe('BC-2026-0001');
    expect(getDocumentReference({})).toBe('');
  });

  test('issued-to name never returns "undefined undefined"', () => {
    expect(getIssuedToName({ businessName: 'Store', firstName: 'A', lastName: 'B' })).toBe('Store (A B)');
    expect(getIssuedToName({ businessName: 'Store' })).toBe('Store');
    expect(getIssuedToName({ firstName: 'A', lastName: 'B' })).toBe('A B');
    expect(getIssuedToName({})).toBe('');
  });

  test('formatSafeDate ignores invalid dates', () => {
    expect(formatSafeDate('N/A')).toBe('');
    expect(formatSafeDate('')).toBe('');
    expect(formatSafeDate('2026-08-25')).toMatch(/2026/);
  });
});

describe('buildVerificationView', () => {
  test('returns only minimum, non-sensitive fields', () => {
    const view = buildVerificationView({
      _id: 'bus_clearance_1',
      type: 'business_clearance',
      bcIdNo: '0157',
      businessName: 'JUANILLA STORE',
      ownerName: 'RONALD JUANILLA',
      status: 'Issued',
      dateIssued: '2026-08-25',
      // sensitive fields that must NOT be surfaced
      applicantAddress: 'Zone 5, Bustrac',
      contactNo: '09083541942',
      businessAddress: 'Zone 5',
      purpose: 'Business Registration',
      orNo: '5452377',
    });

    expect(view.valid).toBe(true);
    expect(view.documentType).toBe('Barangay Business Clearance');
    expect(view.referenceNo).toBe('0157');
    expect(view.issuedTo).toBe('RONALD JUANILLA');
    expect(view.dateIssued).toMatch(/2026/);

    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('09083541942');
    expect(serialized).not.toContain('Zone 5');
    expect(serialized).not.toContain('5452377');
    expect(serialized).not.toContain('Business Registration');
    expect(Object.keys(view).sort()).toEqual(
      ['dateIssued', 'documentType', 'issuedTo', 'referenceNo', 'status', 'statusLabel', 'valid'].sort()
    );
  });

  test('flags revoked documents as invalid', () => {
    const view = buildVerificationView({ _id: 'bus_clearance_1', type: 'business_clearance', status: 'Revoked' });
    expect(view.valid).toBe(false);
    expect(view.status).toBe('invalid');
  });

  test('flags pending requests as not yet valid (never authentic)', () => {
    const view = buildVerificationView(
      {
        _id: 'CERT-2026-1072',
        type: 'certificate_request',
        status: 'Pending',
        certificateType: 'Barangay Clearance',
        firstName: 'Maria',
        lastName: 'Santos',
      }
    );
    expect(view.valid).toBe(false);
    expect(view.status).toBe('pending');
    expect(view.statusLabel).toBe('Not Yet Valid');
  });

  test('flags a statusless record without evidence as unverified (never authentic)', () => {
    const view = buildVerificationView({ _id: 'brgy_clearance_1', type: 'barangay_clearance' });
    expect(view.valid).toBe(false);
    expect(view.status).toBe('unverified');
  });
});
