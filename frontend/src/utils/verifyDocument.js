// src/utils/verifyDocument.js
// Pure helpers for the public QR verification page.
// IMPORTANT: Keep the returned view limited to non-sensitive fields.
//
// The status + expiry logic below is MIRRORED in server/utils/verifyStatus.js.
// Do not change one without changing the other — the agreement test
// (__tests__/verifyStatusAgreement.test.js) enforces that they match.

// Only documents with these id prefixes may be verified publicly.
export const CERTIFICATE_ID_PREFIXES = ['bus_clearance_', 'brgy_clearance_', 'CERT-', 'issued_cert_'];

// Only documents with these `type` values may be verified publicly.
export const CERTIFICATE_TYPES = [
  'business_clearance',
  'barangay_clearance',
  'certificate_request',
  'issued_certificate',
];

export const ACTIVE_STATUSES = [
  'issued',
  'released',
  'approved',
  'active',
  'valid',
  'completed',
  'paid',
  'settled',
  'resolved',
];

export const INVALID_STATUSES = [
  'revoked',
  'cancelled',
  'canceled',
  'void',
  'voided',
  'expired',
  'inactive',
  'rejected',
  'denied',
  'deleted',
  'archived',
];

const NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const PERIOD_RE = /\bmonths?\b|\byears?\b|\byrs?\b|\bmos\b/;
const YEARS_RE = /\byears?\b|\byrs?\b|\byr\b/;

const readReference = (doc) => {
  if (!doc || typeof doc !== 'object') return '';
  const ref = doc.bcIdNo || doc.clearanceNo || doc.refNumber || doc.referenceNo || doc.controlNo;
  return ref ? String(ref).trim() : '';
};

const readIssuedDate = (doc) => {
  if (!doc || typeof doc !== 'object') return '';
  return (
    doc.dateIssued ||
    doc.issuedAt ||
    doc.issuedDate ||
    (doc.issuanceMeta && doc.issuanceMeta.dateIssued) ||
    ''
  );
};

// Reads an explicit, stored expiry date (preferred over a descriptive period).
const readExplicitExpiry = (doc) => {
  if (!doc || typeof doc !== 'object') return null;
  const raw =
    doc.expiryDate ||
    doc.expiresOn ||
    doc.expirationDate ||
    doc.validUntil ||
    (doc.issuanceMeta && doc.issuanceMeta.expiryDate) ||
    '';
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date;
};

// Parses a descriptive validity string such as "(6) Six Months Validity" into a
// number of months. Returns null when no reliable period can be read.
export const parseValidityPeriod = (text) => {
  const value = String(text || '').toLowerCase().trim();
  if (!value || !PERIOD_RE.test(value)) return null;

  const digit = value.match(/(\d{1,3})/);
  let amount = digit ? parseInt(digit[1], 10) : null;

  if (!amount) {
    for (const word of Object.keys(NUMBER_WORDS)) {
      if (new RegExp(`\\b${word}\\b`).test(value)) {
        amount = NUMBER_WORDS[word];
        break;
      }
    }
  }

  if (!amount || amount <= 0) return null;
  return { months: YEARS_RE.test(value) ? amount * 12 : amount };
};

const addMonths = (date, months) => {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0); // clamp to end of previous month
  return result;
};

// Returns a Date at end-of-day for the computed expiry, or null when the expiry
// cannot be reliably determined. An explicit stored expiry date wins; otherwise
// the expiry is derived from a real issuance date + parseable validity period.
// Never invents an expiry.
export const computeExpiry = (doc) => {
  const explicit = readExplicitExpiry(doc);
  if (explicit) return explicit;

  const period = parseValidityPeriod(doc && doc.validity);
  if (!period) return null;

  const issued = new Date(readIssuedDate(doc));
  if (Number.isNaN(issued.getTime())) return null;

  const expiry = addMonths(issued, period.months);
  expiry.setHours(23, 59, 59, 999);
  return expiry;
};

// Returns true only when the record carries reliable proof that it was issued
// (as opposed to a draft/pending record that merely lacks a status field).
export const hasIssuanceEvidence = (doc) => {
  if (!doc || typeof doc !== 'object') return false;
  if (doc.isIssued === true) return true;
  if (doc.isIssued === false || doc.isIssuedByBarangay === false) return false;

  const type = String(doc.type || '').toLowerCase();
  const hasReference = Boolean(readReference(doc));
  const issuedRaw = readIssuedDate(doc);
  const hasIssuedDate = Boolean(issuedRaw) && !Number.isNaN(new Date(issuedRaw).getTime());

  if (type === 'business_clearance') {
    // bcIdNo is only assigned by the issuance workflow (O.R. + fee required).
    return Boolean(doc.bcIdNo && String(doc.bcIdNo).trim());
  }
  if (type === 'barangay_clearance') {
    // Newer records flag isIssuedByBarangay; every issued record also carries a
    // clearance number + issuance date. A draft has neither.
    if (doc.isIssuedByBarangay === true) return hasReference;
    return hasReference && hasIssuedDate;
  }
  // issued_certificate / certificate_request without a status must prove issuance.
  return hasReference && hasIssuedDate;
};

export const isVerifiableDocId = (docId) => {
  if (typeof docId !== 'string') return false;
  const id = docId.trim();
  if (!id || id.length > 128) return false;
  if (id.startsWith('_')) return false; // CouchDB design docs / internal
  return CERTIFICATE_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
};

export const isVerifiableDoc = (doc) => {
  if (!doc || typeof doc !== 'object') return false;
  if (!isVerifiableDocId(doc._id)) return false;
  const type = String(doc.type || '').toLowerCase();
  return CERTIFICATE_TYPES.includes(type);
};

// Returns { key, valid, label }. `now` is injectable for deterministic tests.
export const resolveDocumentStatus = (doc, now) => {
  const at = now instanceof Date ? now : new Date();
  const status = String((doc && doc.status) || '').trim().toLowerCase();

  if (INVALID_STATUSES.includes(status)) {
    return { key: 'invalid', valid: false, label: 'Revoked / Invalid' };
  }

  const issuedLike = ACTIVE_STATUSES.includes(status);
  const statusMissing = status === '';

  // A non-empty status that is neither issued-like nor invalid (pending, draft,
  // submitted, under review, ...) is never valid.
  if (!issuedLike && !statusMissing) {
    return { key: 'pending', valid: false, label: 'Not Yet Valid' };
  }

  // Both an issued-like status and a missing status must be backed by reliable
  // issuance evidence; otherwise the authenticity cannot be confirmed.
  if (!hasIssuanceEvidence(doc)) {
    return { key: 'unverified', valid: false, label: 'Unverified' };
  }

  const expiry = computeExpiry(doc);
  if (expiry && at.getTime() > expiry.getTime()) {
    return { key: 'expired', valid: false, label: 'Expired' };
  }

  return { key: 'valid', valid: true, label: 'Authentic & Valid' };
};

export const getDocumentTypeLabel = (doc) => {
  const raw = String(doc?.certificateType || doc?.certType || doc?.type || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');

  const map = {
    'business clearance': 'Barangay Business Clearance',
    'business permit': 'Barangay Business Permit',
    'barangay clearance': 'Barangay Clearance',
    'certificate request': 'Barangay Certificate',
    indigency: 'Certificate of Indigency',
    residency: 'Certificate of Residency',
    'issued certificate': 'Barangay Certificate',
  };
  return map[raw] || (raw ? raw.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Barangay Certificate');
};

export const getDocumentReference = (doc) => {
  const ref = doc?.bcIdNo || doc?.clearanceNo || doc?.refNumber || doc?.referenceNo || doc?.controlNo;
  return ref ? String(ref).trim() : '';
};

export const getIssuedToName = (doc) => {
  const direct = [doc?.fullName, doc?.applicantName, doc?.residentName, doc?.ownerName];
  for (const value of direct) {
    if (value && String(value).trim()) return String(value).trim();
  }

  const person = `${doc?.firstName || ''} ${doc?.lastName || ''}`.trim();
  const business = doc?.businessName ? String(doc.businessName).trim() : '';

  if (business && person) return `${business} (${person})`;
  if (business) return business;
  if (person) return person;
  return '';
};

export const formatSafeDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// Builds the minimal, privacy-safe view for the public page.
export const buildVerificationView = (doc, now) => {
  const status = resolveDocumentStatus(doc, now);
  return {
    status: status.key,
    valid: status.valid,
    statusLabel: status.label,
    documentType: getDocumentTypeLabel(doc),
    referenceNo: getDocumentReference(doc),
    issuedTo: getIssuedToName(doc),
    dateIssued: formatSafeDate(doc?.dateIssued || doc?.issuedAt || doc?.issuedDate || doc?.createdAt),
  };
};
