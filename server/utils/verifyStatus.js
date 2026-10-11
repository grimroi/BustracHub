'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Pure status + expiry resolution for public QR verification.
// Mirrored by frontend/src/utils/verifyDocument.js — keep the two in sync.
// The frontend agreement test imports THIS file to guarantee identical behavior.
//
// Design rules (deliberately conservative):
//   * A non-empty workflow status that is not an "issued-like" status (pending,
//     draft, under review, processing, ...) is NEVER valid.
//   * Revoked / cancelled / voided / expired / deleted statuses are NEVER valid.
//   * Issued-like statuses (issued/released/approved/...) AND a missing status
//     both require reliable issuance evidence (a real reference number and/or an
//     explicit issued flag). Without it the record is "unverified" — we never
//     claim authenticity by default. An "Approved but not yet issued" request
//     therefore resolves to "unverified", not "Authentic & Valid".
//   * A document is only "expired" when an expiry can be computed from verified
//     issuance data: an explicit stored expiry date (expiryDate/validUntil/...)
//     or a real issuance date AND a parseable validity period. A descriptive
//     string with no readable period is never guessed.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = [
  'issued',
  'released',
  'approved',
  'active',
  'valid',
  'completed',
  'paid',
  'settled',
  'resolved'
];

const INVALID_STATUSES = [
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
  'archived'
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
  twelve: 12
};

const PERIOD_RE = /\bmonths?\b|\byears?\b|\byrs?\b|\bmos\b/;
const YEARS_RE = /\byears?\b|\byrs?\b|\byr\b/;

function readReference(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const ref = doc.bcIdNo || doc.clearanceNo || doc.refNumber || doc.referenceNo || doc.controlNo;
  return ref ? String(ref).trim() : '';
}

function readIssuedDate(doc) {
  if (!doc || typeof doc !== 'object') return '';
  return (
    doc.dateIssued ||
    doc.issuedAt ||
    doc.issuedDate ||
    (doc.issuanceMeta && doc.issuanceMeta.dateIssued) ||
    ''
  );
}

// Reads an explicit, stored expiry date (preferred over a descriptive period).
function readExplicitExpiry(doc) {
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
}

// Parses a descriptive validity string such as "(6) Six Months Validity" into a
// number of months. Returns null when no reliable period can be read.
function parseValidityPeriod(text) {
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
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() < day) result.setDate(0); // clamp to end of previous month
  return result;
}

// Returns a Date at end-of-day for the computed expiry, or null when the expiry
// cannot be reliably determined. An explicit stored expiry date wins; otherwise
// the expiry is derived from a real issuance date + parseable validity period.
// Never invents an expiry.
function computeExpiry(doc) {
  const explicit = readExplicitExpiry(doc);
  if (explicit) return explicit;

  const period = parseValidityPeriod(doc && doc.validity);
  if (!period) return null;

  const issued = new Date(readIssuedDate(doc));
  if (Number.isNaN(issued.getTime())) return null;

  const expiry = addMonths(issued, period.months);
  expiry.setHours(23, 59, 59, 999);
  return expiry;
}

// Returns true only when the record carries reliable proof that it was issued
// (as opposed to a draft/pending record that merely lacks a status field).
function hasIssuanceEvidence(doc) {
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
}

// Returns { key, valid, label }. `now` is injectable for deterministic tests.
function resolveDocumentStatus(doc, now) {
  const at = now instanceof Date ? now : new Date();
  const status = String((doc && doc.status) || '').trim().toLowerCase();

  if (INVALID_STATUSES.indexOf(status) !== -1) {
    return { key: 'invalid', valid: false, label: 'Revoked / Invalid' };
  }

  const issuedLike = ACTIVE_STATUSES.indexOf(status) !== -1;
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
}

module.exports = {
  ACTIVE_STATUSES,
  INVALID_STATUSES,
  parseValidityPeriod,
  computeExpiry,
  hasIssuanceEvidence,
  resolveDocumentStatus
};
