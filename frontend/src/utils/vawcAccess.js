// utils/vawcAccess.js
//
// VAWC (RA 9262) confidentiality controls.
//
// RA 9262 §44 and the Data Privacy Act of 2012 require that records of
// violence against women and their children be treated as confidential: only
// the persons enumerated by law (and by this MIS, the administering officer)
// may read the identifying narrative and party details.
//
// A blotter document is considered VAWC-sensitive when `vawcFlag === true`.
// For every viewer who is neither `admin` nor `vawc_officer`, the sensitive
// fields are replaced with a fixed redaction marker. Non-identifying fields
// (`_id`, `type`, `status`, `createdAt`, `caseNumber`) stay visible so the
// case can still be tracked without revealing its contents.
//
// This module is deliberately pure and dependency-free so the exact same
// policy can be unit-tested and reused at every boundary (render + export).
// The server keeps an equivalent copy (server/utils/vawcAccess.js) so a
// non-authorized user cannot even pull an unmasked document through the sync
// proxy.

export const VAWC_REDACTION_MARKER = '[REDACTED — VAWC]';

// Fields redacted on a VAWC-flagged document.
export const VAWC_SENSITIVE_FIELDS = [
  'narrative',
  'complainantName',
  'complainantAddress',
  'respondentName',
  'respondentAddress',
  'contactNumber',
];

// Roles allowed to see an unmasked VAWC record. `admin` administers the
// system; `vawc_officer` is the designated RA 9262 desk officer. Staff and
// residents are NOT authorized, even though vawc_officer inherits staff
// permissions for everything else.
const VAWC_UNMASK_ROLES = new Set(['admin', 'vawc_officer']);

export const roleOf = (user) => String((user && user.role) || '').toLowerCase().trim();

// True when the viewer may read the unmasked contents of a VAWC record.
export const canUnmaskVawc = (user) => VAWC_UNMASK_ROLES.has(roleOf(user));

// True when the document itself is VAWC-sensitive.
export const isVawcRecord = (doc) =>
  !!doc && typeof doc === 'object' && doc.vawcFlag === true;

// Returns a shallow copy of `doc` with VAWC-sensitive fields replaced by the
// redaction marker when the viewer is not authorized to unmask it.
//
// Rules:
//   - Non-VAWC documents are returned UNCHANGED (identity-equal copy).
//   - An authorized viewer (admin / vawc_officer) receives the document
//     unchanged.
//   - Any other viewer receives a copy in which every sensitive field is
//     `[REDACTED — VAWC]`. _id/type/status/createdAt/caseNumber are preserved.
export function maskVawcRecord(doc, user) {
  if (!isVawcRecord(doc)) return doc;
  if (canUnmaskVawc(user)) return doc;

  const masked = { ...doc };
  for (const field of VAWC_SENSITIVE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(masked, field)) {
      masked[field] = VAWC_REDACTION_MARKER;
    }
  }
  // Nested party objects (some blotter docs store `complainant`/`respondent`
  // as objects) are redacted the same way so the PII cannot leak through an
  // alternate shape.
  if (masked.complainant && typeof masked.complainant === 'object') {
    masked.complainant = VAWC_REDACTION_MARKER;
  }
  if (masked.respondent && typeof masked.respondent === 'object') {
    masked.respondent = VAWC_REDACTION_MARKER;
  }
  return masked;
}

// Mask an array of records (list/export boundary helper).
export function maskVawcRecords(docs, user) {
  if (!Array.isArray(docs)) return docs;
  return docs.map((doc) => maskVawcRecord(doc, user));
}
