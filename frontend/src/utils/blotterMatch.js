// src/utils/blotterMatch.js
// Determines whether a resident has an ACTIVE blotter case. Stable resident IDs
// are preferred; an exact normalised full-name match is accepted; looser partial
// name matches are returned separately as "ambiguous" so callers never treat an
// uncertain match as a confirmed case automatically.

export const CLOSED_BLOTTER_STATUSES = [
  'Settled / Resolved',
  'Resolved',
  'Settled',
  'Dismissed',
  'Referred to PNP (CFA Issued)',
];

export const isClosedBlotterStatus = (status) =>
  CLOSED_BLOTTER_STATUSES.includes(String(status || '').trim());

// Lowercases, strips punctuation, and collapses whitespace so "Dela Cruz, Juan"
// and "juan dela cruz" normalise to the same token sequence.
export const normalizePersonName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Order-independent comparison key: the same name written "Last, First" or
// "First Last" produces the same sorted-token key.
export const nameKey = (value) =>
  normalizePersonName(value)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');

const idsOf = (blotter) =>
  [blotter?.complainantId, blotter?.respondentId]
    .filter(Boolean)
    .map((value) => String(value).trim());

// Normalises an incident subject/date string for equality comparison.
export const normalizeIncidentSubject = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Stable owner identifier for cases that a resident FILED (complainant side).
const ownerIdOf = (blotter) =>
  String(blotter?.residentId || blotter?.complainantId || '').trim();

// Returns true ONLY when there is reliable evidence that `submission` is a
// duplicate of one of the resident's OWN active cases: the existing record must
// belong to the same stable resident id AND describe the same incident
// (normalised subject, and the same incident date when both dates are known).
//
// Name similarity alone is deliberately NOT treated as a duplicate, so a
// resident can still file a legitimate new incident even when a similarly named
// person already has a case on file. Only `resident.id` is trusted for
// ownership, so other residents' records never satisfy this check.
export const isDuplicateSubmission = (blotterList, resident, submission) => {
  const id = String(resident?.id || resident?._id || resident?.residentId || '').trim();
  const subject = normalizeIncidentSubject(submission?.subject);
  if (!id || !subject) return false;

  const date = normalizeIncidentSubject(submission?.incidentDate);

  return (Array.isArray(blotterList) ? blotterList : []).some((blotter) => {
    if (!blotter || isClosedBlotterStatus(blotter.status)) return false;
    if (ownerIdOf(blotter) !== id) return false;

    const existingSubject = normalizeIncidentSubject(
      blotter.subject || blotter.incidentType || blotter.title
    );
    if (existingSubject !== subject) return false;

    const existingDate = normalizeIncidentSubject(blotter.incidentDate || blotter.dateFiled || '');
    // If either date is unknown, fall back to subject-only matching; otherwise
    // require the dates to agree so genuinely separate same-subject incidents
    // filed on different dates are still permitted.
    if (!date || !existingDate) return true;
    return existingDate === date;
  });
};

// Returns { confirmed, ambiguous } arrays of active blotter records.
//   confirmed - matched by resident id OR exact normalised name
//   ambiguous - only a partial name overlap was found (needs manual review)
export const matchActiveBlotterCases = (blotterList, resident) => {
  const id = String(resident?.id || resident?._id || resident?.residentId || '').trim();
  const residentKey = nameKey(
    resident?.name || `${resident?.firstName || ''} ${resident?.lastName || ''}`
  );

  const confirmed = [];
  const ambiguous = [];

  for (const blotter of Array.isArray(blotterList) ? blotterList : []) {
    if (!blotter || isClosedBlotterStatus(blotter.status)) continue;

    if (id && idsOf(blotter).includes(id)) {
      confirmed.push(blotter);
      continue;
    }

    const complainant = nameKey(blotter.complainant);
    const respondent = nameKey(blotter.respondent);

    if (residentKey && (complainant === residentKey || respondent === residentKey)) {
      confirmed.push(blotter);
      continue;
    }

    // Partial overlap is only a hint — never auto-confirmed. Require both sides
    // to be meaningful (>= 3 chars) so empty/short values cannot match everything.
    const partial =
      residentKey.length >= 3 &&
      ((complainant.length >= 3 &&
        (complainant.includes(residentKey) || residentKey.includes(complainant))) ||
        (respondent.length >= 3 &&
          (respondent.includes(residentKey) || residentKey.includes(respondent))));

    if (partial) ambiguous.push(blotter);
  }

  return { confirmed, ambiguous };
};
