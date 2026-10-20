// src/utils/conflictMerge.js
//
// Field-level conflict diffing and merging.
//
// The admin conflict screen used to be all-or-nothing: the whole of Version A
// or the whole of Version B was kept, which silently destroyed the other
// staff member's valid edits. This module computes a per-field diff so the
// admin can keep "Contact Number" from Version A and "Purok" from Version B.
//
// The exported `computeConflictDiff` is a strict superset of the previous
// implementation: it still returns `{ field, label, valueA, valueB }` for
// every changed field and only ADDS keys (`rawA`, `rawB`, `presentA`,
// `presentB`, `defaultChoice`, `changedBy`), so existing consumers keep
// working unchanged.

// Fields that never make sense to show as "changed" in a conflict diff.
//
// The attribution fields (`updatedBy`, `lastEditedBy`, ...) are excluded on
// purpose: they are exactly the fields that DIFFER between two editors, so
// showing them would add noise — and merging them would rewrite who the
// record appears to belong to. The author is still read straight from the
// document (see `getDocEditor`) when a staff alert is raised.
export const CONFLICT_IGNORED_FIELDS = new Set([
  '_id', '_rev', '_conflicts', '_revisions', '_attachments', '_deleted',
  '_conflictResolved', '_local_seq', 'history', 'synced', 'isSynced',
  'updatedAt', 'createdAt', 'passwordHash', 'password', 'userPassword', 'tempPassword',
  'updatedBy', 'lastEditedBy', 'editedBy', 'modifiedBy', 'lastUpdatedBy',
  'createdBy', 'syncedBy', 'lastSyncedAt', 'conflictMerge',
]);

export const CONFLICT_FIELD_LABELS = {
  firstName: 'First Name',
  lastName: 'Last Name',
  middleName: 'Middle Name',
  name: 'Name',
  fullName: 'Full Name',
  purok: 'Purok',
  purokZoneAddress: 'Purok',
  addressZoneAddress: 'Address',
  address: 'Address',
  contact: 'Contact Number',
  contactNumber: 'Contact Number',
  contactNumber2: 'Alternate Contact',
  status: 'Status',
  civilStatus: 'Civil Status',
  civilStatusOther: 'Civil Status (Other)',
  sex: 'Sex',
  gender: 'Gender',
  birthdate: 'Birth Date',
  birthDate: 'Birth Date',
  age: 'Age',
  citizenship: 'Citizenship',
  religion: 'Religion',
  occupation: 'Occupation',
  residentType: 'Resident Type',
  isArchived: 'Archived',
  hasAccount: 'Has Account',
  email: 'Email',
  certType: 'Certificate Type',
  certPurpose: 'Purpose',
  residentName: 'Resident Name',
};

// Record type → human module label (used for the summary chip and filter).
export const CONFLICT_MODULE_LABELS = {
  resident: 'Residents',
  profile: 'Residents',
  household: 'Households',
  household_request: 'Households',
  certificate_request: 'Certificates',
  certificate: 'Certificates',
  blotter: 'Blotter',
  blotter_record: 'Blotter',
  announcement: 'Announcements',
  program: 'Programs',
  equipment: 'Equipment',
  medicine: 'Medicine',
  inventory: 'Inventory',
  user: 'Users',
  account_request: 'Account Requests',
  resident_account_request: 'Account Requests',
  feedback: 'Feedback',
  document: 'Documents',
  document_request: 'Documents',
};

export const prettifyConflictField = (field) => {
  const key = String(field || '');
  if (!key) return 'Field';
  return key
    .replace(/^_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

export const conflictModuleLabel = (type) => {
  const key = String(type || '').toLowerCase();
  if (CONFLICT_MODULE_LABELS[key]) return CONFLICT_MODULE_LABELS[key];
  if (!key) return 'Records';
  return `${prettifyConflictField(key)}s`;
};

export const conflictFieldLabel = (field) => {
  const key = String(field || '');
  if (!key || CONFLICT_IGNORED_FIELDS.has(key)) return null;
  return CONFLICT_FIELD_LABELS[key] || prettifyConflictField(key);
};

export const formatConflictValue = (value) => {
  if (value === undefined || value === null) return '—';
  if (value === '') return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.length === 0 ? '(none)' : value.map((v) => formatConflictValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return '[object]'; }
  }
  return String(value);
};

export const normalizeConflictValue = (value) => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
};

export const conflictDocTime = (doc) => {
  const raw = doc && (doc.updatedAt || doc.createdAt);
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export const formatConflictTime = (value) => {
  if (!value) return 'Unknown';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
};

// Attribution helpers — used to warn the staff member whose edit was
// discarded. The schema is not fixed, so every known alias is probed.
export const getDocEditor = (doc) => {
  if (!doc) return '';
  return String(
    doc.lastEditedBy ||
    doc.updatedBy ||
    doc.editedBy ||
    doc.modifiedBy ||
    doc.lastUpdatedBy ||
    doc.username ||
    doc.createdBy ||
    ''
  ).trim().toLowerCase();
};

export const getDocEditorLabel = (doc) => {
  if (!doc) return '';
  const value =
    doc.lastEditedBy ||
    doc.updatedBy ||
    doc.editedBy ||
    doc.modifiedBy ||
    doc.lastUpdatedBy ||
    doc.username ||
    doc.createdBy ||
    '';
  return String(value || '').trim();
};

/**
 * Compare two revisions and return only the fields that actually differ.
 *
 * Each entry keeps the legacy `{ field, label, valueA, valueB }` shape and
 * adds:
 *   rawA / rawB    – the untouched values, used to build the merged document
 *   presentA/B     – whether the field exists in that revision at all
 *   defaultChoice  – 'A' | 'B': the version pre-selected in the merge UI
 *   changedBy      – who produced each side of the diff (when known)
 */
export const computeConflictDiff = (docA, docB) => {
  const a = docA || {};
  const b = docB || {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];

  const timeA = conflictDocTime(a);
  const timeB = conflictDocTime(b);
  // The newer revision is the sensible default for fields present in BOTH
  // versions. Ties fall back to Version A (the local winning revision).
  const bIsNewer = timeB > timeA;

  for (const key of keys) {
    const label = conflictFieldLabel(key);
    if (!label) continue;

    const presentA = Object.prototype.hasOwnProperty.call(a, key) && a[key] !== undefined;
    const presentB = Object.prototype.hasOwnProperty.call(b, key) && b[key] !== undefined;

    if (presentA && presentB && normalizeConflictValue(a[key]) === normalizeConflictValue(b[key])) {
      continue;
    }

    // A field that exists in only one version is never a real disagreement:
    // keep the value that exists. For fields present in both versions the
    // newer revision is the sensible default (ties fall back to Version A).
    let defaultChoice;
    if (presentB && !presentA) defaultChoice = 'B';
    else if (presentA && !presentB) defaultChoice = 'A';
    else defaultChoice = bIsNewer ? 'B' : 'A';

    diffs.push({
      field: key,
      label,
      valueA: presentA ? formatConflictValue(a[key]) : '—',
      valueB: presentB ? formatConflictValue(b[key]) : '—',
      rawA: presentA ? a[key] : undefined,
      rawB: presentB ? b[key] : undefined,
      presentA,
      presentB,
      defaultChoice,
      editorA: getDocEditorLabel(a),
      editorB: getDocEditorLabel(b),
    });
  }

  return diffs;
};

/**
 * Build the merged document from two revisions and a per-field choice map.
 *
 * @param {object} docA          Version A (local winning revision)
 * @param {object} docB          Version B (conflicting revision)
 * @param {Record<string,'A'|'B'>} choices field → chosen side
 * @param {object} [options]
 * @param {object} [options.base] doc used for fields that are identical in
 *                               both revisions (defaults to docA then docB)
 * @returns {{ doc: object, mergedFields: string[], fieldChoices: object }}
 */
export const buildMergedDocument = (docA, docB, choices = {}, options = {}) => {
  const a = docA || {};
  const b = docB || {};
  const base = options.base || a || {};
  const choiceMap = choices || {};

  const diff = computeConflictDiff(a, b);
  const merged = { ...base };
  const mergedFields = [];
  const fieldChoices = {};

  // Preserve the history trail of both revisions (deduplicated, ordered).
  const combinedHistory = [...(Array.isArray(a.history) ? a.history : []), ...(Array.isArray(b.history) ? b.history : [])];
  if (combinedHistory.length) {
    const uniqueHistory = Array.from(
      new Map(combinedHistory.map((h) => [h?.timestamp || JSON.stringify(h), h])).values()
    ).sort((x, y) => new Date(x?.timestamp || 0) - new Date(y?.timestamp || 0));
    merged.history = uniqueHistory;
  }

  diff.forEach((entry) => {
    const chosen = choiceMap[entry.field] || entry.defaultChoice || 'A';
    fieldChoices[entry.field] = chosen;
    mergedFields.push(entry.field);

    if (chosen === 'B') {
      if (entry.presentB) merged[entry.field] = entry.rawB;
      else delete merged[entry.field];
    } else {
      if (entry.presentA) merged[entry.field] = entry.rawA;
      else delete merged[entry.field];
    }
  });

  // Keep the schema conventions used across the app.
  merged.type = merged.type || b.type || a.type;
  merged.status = merged.status || b.status || a.status;
  merged.updatedAt = new Date().toISOString();
  merged.synced = true;
  merged.isSynced = true;
  merged._conflictResolved = true;
  merged.conflictMerge = {
    mergedAt: merged.updatedAt,
    mergedFields,
    fieldChoices,
  };

  return { doc: merged, mergedFields, fieldChoices };
};

/**
 * Build the default choice map for a diff (used to pre-select radio buttons).
 * @returns {Record<string,'A'|'B'>}
 */
export const buildDefaultChoices = (diff) => {
  const choices = {};
  (diff || []).forEach((entry) => {
    choices[entry.field] = entry.defaultChoice || 'A';
  });
  return choices;
};

/**
 * Human readable summary of a merge, e.g. "Contact Number (A), Purok (B)".
 */
export const describeMergeChoices = (diff, choices) => {
  const map = choices || {};
  return (diff || [])
    .map((entry) => {
      const chosen = map[entry.field] || entry.defaultChoice || 'A';
      return `${entry.label} (Version ${chosen})`;
    })
    .join(', ');
};
