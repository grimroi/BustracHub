'use strict';

// ──────────────────────────────────────────────────────────────
// VAWC (RA 9262) CONFIDENTIALITY — server-side policy
// ──────────────────────────────────────────────────────────────
// This is the authoritative twin of frontend/src/utils/vawcAccess.js. The
// sync proxy uses it to guarantee that a user who is NOT admin and NOT a
// `vawc_officer` can never pull an unmasked VAWC document out of CouchDB —
// even though PouchDB would otherwise replicate it verbatim. Client-side
// masking alone is not a security boundary (a user can query the proxy with
// curl), so the server must enforce the same redaction on read.
//
// A blotter document is VAWC-sensitive when `vawcFlag === true`. The
// sensitive fields are replaced with a fixed redaction marker for every
// viewer who is neither `admin` nor `vawc_officer`. `_id`, `type`, `status`,
// `createdAt` and `caseNumber` stay visible so the case can still be tracked.

const VAWC_REDACTION_MARKER = '[REDACTED — VAWC]';

const VAWC_SENSITIVE_FIELDS = [
  'narrative',
  'complainantName',
  'complainantAddress',
  'respondentName',
  'respondentAddress',
  'contactNumber',
];

// Roles allowed to see an unmasked VAWC record. `vawc_officer` inherits staff
// permissions for everything else, but is the ONLY non-admin role allowed to
// unmask VAWC records.
const VAWC_UNMASK_ROLES = new Set(['admin', 'vawc_officer']);

// Roles the proxy recognizes at all (superset used by authorization).
const KNOWN_ROLES = new Set(['admin', 'staff', 'vawc_officer', 'resident']);

const roleOf = (user) => String((user && user.role) || '').toLowerCase().trim();

const canUnmaskVawc = (user) => VAWC_UNMASK_ROLES.has(roleOf(user));

const isVawcRecord = (doc) =>
  !!doc && typeof doc === 'object' && doc.vawcFlag === true;

// Shallow-copy `doc` with sensitive fields redacted unless the viewer may
// unmask. Non-VAWC docs and authorized viewers get the SAME object back.
function maskVawcRecord(doc, user) {
  if (!isVawcRecord(doc)) return doc;
  if (canUnmaskVawc(user)) return doc;

  const masked = { ...doc };
  for (const field of VAWC_SENSITIVE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(masked, field)) {
      masked[field] = VAWC_REDACTION_MARKER;
    }
  }
  // Nested party shapes must be redacted too (alternate blotter schemas).
  if (masked.complainant && typeof masked.complainant === 'object') {
    masked.complainant = VAWC_REDACTION_MARKER;
  }
  if (masked.respondent && typeof masked.respondent === 'object') {
    masked.respondent = VAWC_REDACTION_MARKER;
  }
  return masked;
}

module.exports = {
  VAWC_REDACTION_MARKER,
  VAWC_SENSITIVE_FIELDS,
  VAWC_UNMASK_ROLES,
  KNOWN_ROLES,
  roleOf,
  canUnmaskVawc,
  isVawcRecord,
  maskVawcRecord,
};
