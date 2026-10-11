// src/utils/clearanceNumber.js
// Pure helpers that make clearance/business reference numbers collision-safe.
// The storage layer (PouchDB) has no unique constraint, and the counter document
// is device-local, so a freshly generated number is always checked against the
// numbers already known locally and bumped until it is unique.

// ── Barangay clearance numbers: BC-<year>-<4 digits> ──
export const formatClearanceNo = (year, sequence) =>
  `BC-${year}-${String(sequence).padStart(4, '0')}`;

export const parseClearanceSequence = (clearanceNo, year) => {
  const match = String(clearanceNo || '').trim().match(new RegExp(`^BC-${year}-(\\d+)$`));
  return match ? parseInt(match[1], 10) : null;
};

// Returns `candidate` when it is unused, otherwise the next free sequence for
// the current year (never reuses a number that already exists locally).
export const nextAvailableClearanceNo = (existingNumbers, candidate, year = new Date().getFullYear()) => {
  const used = new Set((existingNumbers || []).map((n) => String(n || '').trim()).filter(Boolean));
  const clean = String(candidate || '').trim();
  if (clean && !used.has(clean)) return clean;

  let max = 0;
  for (const number of used) {
    const seq = parseClearanceSequence(number, year);
    if (seq && seq > max) max = seq;
  }

  let next = max + 1;
  let result = formatClearanceNo(year, next);
  while (used.has(result)) {
    next += 1;
    result = formatClearanceNo(year, next);
  }
  return result;
};

// ── Business clearance IDs: bare 4-digit sequence ──
export const parseBusinessSequence = (bcIdNo) => {
  const match = String(bcIdNo || '').trim().match(/^(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
};

export const nextAvailableBusinessId = (existingIds, candidate) => {
  const used = new Set((existingIds || []).map((n) => String(n || '').trim()).filter(Boolean));
  const clean = String(candidate || '').trim();
  if (clean && !used.has(clean)) return clean;

  let max = 0;
  for (const number of used) {
    const seq = parseBusinessSequence(number);
    if (seq && seq > max) max = seq;
  }

  let next = max + 1;
  let result = String(next).padStart(4, '0');
  while (used.has(result)) {
    next += 1;
    result = String(next).padStart(4, '0');
  }
  return result;
};

// Document ids are time-based; a random suffix avoids same-millisecond clashes
// (two records created in quick succession would otherwise share an _id).
export const collisionSafeId = (prefix, now = Date.now(), random = Math.random()) =>
  `${prefix}${now}_${random.toString(36).slice(2, 8)}`;
