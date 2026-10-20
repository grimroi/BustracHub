'use strict';

// ──────────────────────────────────────────────────────────────
// SYNC PROXY AUTHORIZATION — policy + enforcement helpers
// ──────────────────────────────────────────────────────────────
// This module is deliberately dependency-free (it only needs a `nanoDb`
// object with a `.get(id)` method when verifying EXISTING documents) so it
// can be unit-tested without a running CouchDB or Express stack.
//
// Policy summary for RESIDENT writes through the /api/sync proxy:
//   - A resident may create/update ONLY documents they own, and only of the
//     types in RESIDENT_WRITE_TYPES.
//   - Account/identity documents (user_*, type 'user') are NEVER writable by
//     a resident — not created, not updated, not deleted. A resident's own
//     profile lives in a separate `resident`/`resident_profile` document
//     (RESIDENT_WRITE_TYPES), so account documents do not need to sync down
//     from the resident client. See RESIDENT_ACCOUNT_DOC_TYPES.
//   - For updates, the CURRENT stored document must also belong to the
//     resident (prevents overwriting another resident's record by id).
//   - Certain lifecycle/auth fields are pinned against the stored document
//     (blotter status, event approval provenance).
// ──────────────────────────────────────────────────────────────

// Document types a resident may legitimately create/update. Anything else
// (blotter reports, announcements, issued certificates, users, settings,
// other residents' data) requires an admin/staff session.
const RESIDENT_WRITE_TYPES = new Set([
  'certificate_request',
  'certificate',
  'feedback_report',
  'feedback',
  'blotter_record', // restricted to the resident's OWN docs (+ protected lifecycle fields below)
  'event_registration', // restricted to the resident's OWN docs (+ protected lifecycle fields below)
  'resident_profile',
  'resident',
  'profile',
]);

// Document types treated as the resident's ACCOUNT/identity document.
// These carry authentication/authorization fields (role, passwordHash,
// status) and must never be created, updated or deleted by a resident
// through the offline sync path. Account documents are managed exclusively
// by admin/staff (DashboardPortal / AddUserModal / EditUserModal) or the
// server's own /api/register + /api/login endpoints.
//
// NOTE: `RESIDENT_WRITE_TYPES` intentionally does NOT contain 'user'; this
// set exists to give a precise denial reason and to advertise the account
// boundary explicitly to the enforcement code below.
const RESIDENT_ACCOUNT_DOC_TYPES = new Set(['user', 'user_profile', 'account']);

// Case-lifecycle fields a resident must NOT be able to change on their own
// blotter through the offline sync path; only an admin/staff session may.
const RESIDENT_PROTECTED_BLOTTER_FIELDS = [
  'status',
  'summonCount',
  'nextHearingDate',
  'summonDate',
  'cfaIssued',
  'cfaIssuedAt',
  'lastSmsStatus',
  'smsSent',
  'smsSentAt',
  'resolution',
];

// Event-registration lifecycle. A resident may only create a registration as
// 'Pending' and cancel it ('Cancelled'); approval/rejection/attendance are
// barangay decisions that only an admin/staff session may set.
const RESIDENT_EVENT_ALLOWED_STATUS = new Set(['Pending', 'Cancelled']);

// Fields on an event_registration that only admin/staff may set. A resident
// must not be able to forge approval/attendance provenance.
const RESIDENT_PROTECTED_EVENT_FIELDS = [
  'approvedAt',
  'approvedBy',
  'rejectedAt',
  'rejectedBy',
  'attendedAt',
  'attendedBy',
];

const roleOf = (user) => String(user && user.role || '').toLowerCase();

// ──────────────────────────────────────────────────────────────
// FAIL-CLOSED DOCUMENT LOOKUP
// ──────────────────────────────────────────────────────────────
// `nanoDb.get(id)` rejects for BOTH a genuinely-missing document AND any
// transport/authorization/server failure. Treating every rejection as "the
// document does not exist" is a FAIL-OPEN bug: a CouchDB timeout, a 500, a
// 401/403, or a dropped connection would then be interpreted as "new
// document", letting a resident create/overwrite/delete a record whose real
// owner was never verified.
//
// ONLY a genuine CouchDB 404 ("not_found"/"missing") means the document does
// not exist. Every other error is rethrown so the caller (which maps a thrown
// error to a 5xx denial) fails closed.
function isDocumentNotFoundError(err) {
  if (!err || typeof err !== 'object') return false;
  const status = Number(err.statusCode || err.status || 0);
  if (status === 404) return true;
  const code = String(err.error || err.errid || '').toLowerCase();
  const reason = String(err.reason || '').toLowerCase();
  // Some CouchDB/proxy layers omit the numeric status but keep the error body.
  return code === 'not_found' || (code === '' && reason === 'missing');
}

// Resolve an existing document, returning:
//   { found: true,  doc }  — document exists
//   { found: false, doc: null } — document genuinely does not exist (404)
// Rejects for any other failure (timeout, connection, 401/403, 5xx, …), which
// callers MUST treat as a denial.
const fetchExistingDoc = async (nanoDb, id) => {
  if (!nanoDb || typeof nanoDb.get !== 'function') {
    throw new Error('document store unavailable');
  }
  if (!id) return { found: false, doc: null };
  try {
    const doc = await nanoDb.get(id);
    return { found: true, doc };
  } catch (err) {
    if (isDocumentNotFoundError(err)) return { found: false, doc: null };
    throw err;
  }
};

const docTypeOf = (doc) => String((doc && (doc.type || doc.docType)) || '');

const isAccountDocType = (doc) => RESIDENT_ACCOUNT_DOC_TYPES.has(docTypeOf(doc));

// True when `doc` can be attributed to the authenticated resident.
const docOwnedBy = (doc, user) => {
  if (!doc || typeof doc !== 'object') return false;

  // Account/identity documents are never owned by a resident for WRITE
  // purposes — authorization denies them outright (they remain readable).
  if (isAccountDocType(doc)) return false;

  const username = String(doc.username || '').toLowerCase();
  const residentId = String(doc.residentId || '');
  const userUsername = String((user && user.username) || '').toLowerCase();
  const userResidentId = String((user && user.residentId) || '');

  const sameUsername = Boolean(username) && username === userUsername && Boolean(userUsername);
  const sameResidentId = Boolean(residentId) && userResidentId && residentId === userResidentId;

  if (!RESIDENT_WRITE_TYPES.has(docTypeOf(doc))) return false;
  return sameUsername || sameResidentId;
};

// For updates to an existing document, also confirm the CURRENT document
// belongs to the resident (prevents overwriting another resident's record
// whose id happens to be known) and that protected fields are unchanged.
const verifyExistingDocOwnership = async (nanoDb, doc, user) => {
  if (!doc || !doc._id) return true;
  if (!nanoDb || typeof nanoDb.get !== 'function') return false;

  const isResident = roleOf(user) === 'resident';
  const docType = docTypeOf(doc);

  // Account/identity documents are never writable by a resident. Denied for
  // creation, update and deletion alike (the docOwnedBy check in the caller
  // already rejects them; this is defence-in-depth for direct callers).
  if (isResident && RESIDENT_ACCOUNT_DOC_TYPES.has(docType)) {
    return false;
  }

  // Deletion tombstones: nothing further to verify beyond ownership, which
  // the caller already checked with docOwnedBy. A resident may delete only
  // documents the (already-fetched) stored doc proves they own.
  if (doc._deleted === true) {
    const { found, doc: stored } = await fetchExistingDoc(nanoDb, doc._id);
    if (!found) return true; // deleting an absent doc is a no-op; allow
    return docOwnedBy(stored, user);
  }

  const { found, doc: existing } = await fetchExistingDoc(nanoDb, doc._id);

  // Event registrations: a resident may create/cancel ONLY their own, may not
  // forge the barangay approval lifecycle, and the referenced event must
  // exist. Enforced for BOTH new and updated documents.
  if (isResident && docType === 'event_registration') {
    const existingStatus = existing ? String(existing.status ?? '') : '';
    const newStatus = doc.status === undefined
      ? (existing ? existingStatus : 'Pending')
      : String(doc.status);
    if (newStatus !== existingStatus && !RESIDENT_EVENT_ALLOWED_STATUS.has(newStatus)) {
      console.warn(
        `[SYNC DENY] Resident @${user?.username} tried to set event_registration status "${newStatus}" on ${doc._id}`
      );
      return false;
    }
    // Residents may not introduce/alter admin-only provenance fields. Absent
    // fields are tolerated so a stale local doc can still be cancelled.
    for (const field of RESIDENT_PROTECTED_EVENT_FIELDS) {
      const next = doc[field];
      if (next === undefined || next === null || next === '') continue;
      const current = existing ? existing[field] : undefined;
      if (JSON.stringify(next) !== JSON.stringify(current)) {
        console.warn(
          `[SYNC DENY] Resident @${user?.username} tried to change protected event field "${field}" on ${doc._id}`
        );
        return false;
      }
    }
    if (!existing) {
      const eventId = String(doc.eventId || '');
      // Fail closed: a lookup error on the referenced event denies the write
      // rather than being treated as "event missing".
      const eventRes = eventId
        ? await fetchExistingDoc(nanoDb, eventId)
        : { found: false, doc: null };
      const eventDoc = eventRes.found ? eventRes.doc : null;
      if (!eventDoc || String(eventDoc.type || '') !== 'barangay_event') {
        console.warn(
          `[SYNC DENY] Resident @${user?.username} registered for missing/unknown event "${eventId}" on ${doc._id}`
        );
        return false;
      }
    }
  }

  if (!existing) return true; // new document (ownership already checked)
  if (!docOwnedBy(existing, user)) return false; // stored doc owned by someone else

  // Residents may file/edit their own blotter, but must not self-advance the
  // case lifecycle (e.g. mark it 'Settled / Resolved' or fake a summons).
  if (
    isResident &&
    existing.type === 'blotter_record' &&
    String(doc.type) === 'blotter_record'
  ) {
    for (const field of RESIDENT_PROTECTED_BLOTTER_FIELDS) {
      if (JSON.stringify(doc[field]) !== JSON.stringify(existing[field])) {
        console.warn(
          `[SYNC DENY] Resident @${user?.username} tried to change protected blotter field "${field}" on ${doc._id}`
        );
        return false;
      }
    }
  }

  return true;
};

// Human-readable reason a resident write was denied, for [SYNC 403] logs.
const residentDenyReason = (doc, user) => {
  if (!doc || typeof doc !== 'object') return 'invalid document';
  const username = String(doc.username || '').toLowerCase();
  const residentId = String(doc.residentId || '');
  const userUsername = String((user && user.username) || '').toLowerCase();
  const userResidentId = String((user && user.residentId) || '');

  if (isAccountDocType(doc)) return 'account document not writable by residents';
  if (!RESIDENT_WRITE_TYPES.has(doc.type)) return 'type not allowed';
  if (username && username === userUsername) return null;
  if (residentId && userResidentId && residentId === userResidentId) return null;
  if (!username && !residentId) return 'missing owner fields';
  if (username && username !== userUsername) return 'username mismatch';
  if (residentId && residentId !== userResidentId) return 'residentId mismatch';
  return 'not owned';
};

// Single entry point used by the sync proxy for EVERY resident write path
// (single PUT/POST, DELETE, and each doc in a _bulk_docs batch). Returns a
// uniform { allowed, reason } result so callers cannot accidentally rely on
// only one of the two ownership checks:
//   1. docOwnedBy          — is the SUBMITTED doc attributed to the resident?
//   2. verifyExistingDocOwnership — does the STORED doc belong to the
//      resident, and are protected lifecycle fields unchanged?
// A denial of either one denies the write.
const assessResidentWrite = async (nanoDb, doc, user) => {
  if (!doc || typeof doc !== 'object') {
    return { allowed: false, reason: 'invalid document' };
  }
  if (!docOwnedBy(doc, user)) {
    return { allowed: false, reason: residentDenyReason(doc, user) };
  }
  let existingOwned;
  try {
    existingOwned = await verifyExistingDocOwnership(nanoDb, doc, user);
  } catch {
    // Never fail open: an ownership-check error denies the write.
    return { allowed: false, reason: 'ownership check failed' };
  }
  if (!existingOwned) {
    return { allowed: false, reason: 'existing document not owned or protected field changed' };
  }
  return { allowed: true, reason: null };
};

// Authorization for a DELETE whose document id is known (PouchDB sends no
// body for remove()). The STORED document is the source of truth: a resident
// may delete only a document they own and of a writable type.
const assessStoredDocWrite = (storedDoc, user) => {
  if (!storedDoc || typeof storedDoc !== 'object') {
    return { allowed: false, reason: 'invalid document' };
  }
  if (isAccountDocType(storedDoc)) {
    return { allowed: false, reason: 'account document not writable by residents' };
  }
  if (!docOwnedBy(storedDoc, user)) {
    return { allowed: false, reason: residentDenyReason(storedDoc, user) };
  }
  return { allowed: true, reason: null };
};

module.exports = {
  RESIDENT_WRITE_TYPES,
  RESIDENT_ACCOUNT_DOC_TYPES,
  RESIDENT_PROTECTED_BLOTTER_FIELDS,
  RESIDENT_EVENT_ALLOWED_STATUS,
  RESIDENT_PROTECTED_EVENT_FIELDS,
  docOwnedBy,
  verifyExistingDocOwnership,
  residentDenyReason,
  assessResidentWrite,
  assessStoredDocWrite,
  isDocumentNotFoundError,
  fetchExistingDoc,
};
