// src/services/staffAlerts.js
//
// "Your edit was overwritten" alerts.
//
// When a conflict is resolved the losing revision's author is frequently not
// the person sitting at the keyboard. Without a trace they never learn that
// their work was discarded, and they may re-apply (or lose) data without
// knowing why.
//
// Every resolution therefore writes one `staff_alert` document per affected
// staff member. The documents REPLICATE (unlike the `_local/` notification
// store) so the alert survives a lost device and reaches the staff member on
// any machine they log in from.
//
// Schema (backward compatible with the rest of the app):
//   _id        : staff_alert_<timestamp>_<random>
//   type       : 'staff_alert'
//   username   : the staff member the alert is addressed to
//   recordId   : the document that was resolved
//   recordName : human readable name of the record
//   strategy   : 'field-merge' | 'keep-a' | 'keep-b' | 'keep-latest' | 'keep-both'
//   fields     : the fields that were taken from the other version
//   read       : false until the recipient acknowledges it
//   createdAt  : ISO timestamp

import { localDb } from './db';
import { computeConflictDiff, getDocEditor, getDocEditorLabel } from '../utils/conflictMerge';
import { createNotification } from './notifications';

const ALERT_PREFIX = 'staff_alert_';
const ALERT_TYPE = 'staff_alert';

// Placeholder values that are written by scripts/migrations rather than by a
// real person. They must never receive an "your edit was overwritten" alert.
const NON_USER_ACTORS = new Set([
  'system', 'unknown', 'resident', 'server', 'sync', 'auto', 'auto-sync', 'bustrac',
]);

const isPrivilegedUser = (username) => {
  const value = String(username || '').trim().toLowerCase();
  if (!value) return false;
  return !NON_USER_ACTORS.has(value);
};

const normalize = (value) => String(value || '').trim().toLowerCase();

// A staff member can be identified by their username OR by the display name
// that was recorded on the document (the app sometimes stores a full name
// instead of a username).
const matchesIdentity = (doc, identities) => {
  const candidates = new Set((identities || []).map(normalize).filter(Boolean));
  if (candidates.size === 0) return false;
  if (candidates.has(normalize(doc?.username))) return true;
  if (candidates.has(normalize(doc?.displayName))) return true;
  return false;
};

const buildAlertId = () => {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ALERT_PREFIX}${ts}_${rand}`;
};

/**
 * Work out which staff members lost data in a conflict resolution.
 *
 * @param {object} params
 * @param {object} params.docA           Version A (local winning revision)
 * @param {object} params.docB           Version B (conflicting revision)
 * @param {string} params.strategy       Resolution strategy
 * @param {'A'|'B'} [params.winnerSide]  which side was kept
 * @param {Record<string,'A'|'B'>} [params.fieldChoices] per-field choices for a merge
 * @param {string[]} [params.mergedFields] fields touched by a merge
 * @returns {Array<{username:string, displayName:string, lostFields:string[]}>}
 */
export const collectOverwrittenEditors = ({
  docA,
  docB,
  strategy = 'keep-a',
  winnerSide = 'A',
  fieldChoices = null,
  mergedFields = null,
} = {}) => {
  const diff = computeConflictDiff(docA, docB);
  if (diff.length === 0) return [];

  const editorA = getDocEditor(docA);
  const editorB = getDocEditor(docB);

  // Which side lost which fields?
  const lostByA = [];
  const lostByB = [];

  if (strategy === 'field-merge' && fieldChoices) {
    diff.forEach((entry) => {
      const chosen = fieldChoices[entry.field] || entry.defaultChoice || 'A';
      if (chosen === 'B' && entry.presentA && entry.presentB) {
        lostByA.push(entry.field);
      } else if (chosen === 'A' && entry.presentA && entry.presentB) {
        lostByB.push(entry.field);
      }
    });
  } else if (strategy === 'keep-both') {
    // Nothing is discarded — both versions survive.
    return [];
  } else {
    // A whole side was kept: the other side lost every differing field.
    const allFields = mergedFields && mergedFields.length
      ? mergedFields
      : diff.map((d) => d.field);
    if (winnerSide === 'B') lostByA.push(...allFields);
    else lostByB.push(...allFields);
  }

  const affected = [];

  if (lostByA.length && editorA && isPrivilegedUser(editorA)) {
    affected.push({
      username: editorA,
      displayName: getDocEditorLabel(docA) || editorA,
      lostFields: lostByA,
    });
  }
  if (lostByB.length && editorB && isPrivilegedUser(editorB)) {
    // Do not alert the same person twice.
    if (!affected.some((a) => a.username === editorB)) {
      affected.push({
        username: editorB,
        displayName: getDocEditorLabel(docB) || editorB,
        lostFields: lostByB,
      });
    }
  }

  return affected;
};

/**
 * Persist one alert document per affected staff member.
 *
 * @returns {Promise<Array<object>>} the created alert documents
 */
export const createStaffAlerts = async ({
  docId,
  recordName = 'a record',
  docA,
  docB,
  strategy = 'keep-a',
  winnerSide = 'A',
  fieldChoices = null,
  mergedFields = null,
  resolvedBy = 'admin',
} = {}) => {
  const affected = collectOverwrittenEditors({
    docA,
    docB,
    strategy,
    winnerSide,
    fieldChoices,
    mergedFields,
  });

  if (affected.length === 0) return [];

  const created = [];
  const now = new Date().toISOString();

  for (const person of affected) {
    const doc = {
      _id: buildAlertId(),
      type: ALERT_TYPE,
      docType: ALERT_TYPE,
      username: person.username,
      recordId: docId || null,
      recordName,
      strategy,
      fields: person.lostFields,
      message:
        `Your recent edit to ${recordName} was ${strategy === 'field-merge' ? 'merged' : 'overwritten'} ` +
        'during server synchronization. Please review if the data is still correct.',
      resolvedBy,
      read: false,
      createdAt: now,
      updatedAt: now,
    };

    try {
      const res = await localDb.put(doc);
      created.push({ ...doc, _rev: res?.rev });
    } catch (err) {
      console.warn('[staff-alert] Failed to store alert:', err?.message || err);
    }

    // Local (device-only) notification so the toast can be raised even when
    // the alert document has not synced yet.
    try {
      await createNotification({
        for: 'staff',
        userId: person.username,
        category: 'conflict-overwrite',
        title: 'Your edit was overwritten during sync',
        body:
          `Your recent edit to ${recordName} was ${strategy === 'field-merge' ? 'merged' : 'overwritten'} ` +
          'during server synchronization. Please review if the data is still correct.',
        link: 'conflicts',
        refId: docId || null,
        dedupeKey: `staff-alert:${docId}:${person.username}:${now.slice(0, 16)}`,
      });
    } catch {
      /* notifications are best-effort */
    }
  }

  return created;
};

/** Every alert document (newest first). */
export const getAllStaffAlerts = async () => {
  try {
    const result = await localDb.allDocs({
      include_docs: true,
      startkey: ALERT_PREFIX,
      endkey: `${ALERT_PREFIX}\uffff`,
    });
    return result.rows
      .map((row) => row.doc)
      .filter((doc) => doc && doc.type === ALERT_TYPE)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch (err) {
    console.warn('[staff-alert] Failed to load alerts:', err?.message || err);
    return [];
  }
};

/**
 * Unread alerts addressed to a specific staff member.
 * @param {string|string[]} identity the staff member's username and/or full name
 */
export const getPendingStaffAlerts = async (identity) => {
  const identities = Array.isArray(identity) ? identity : [identity];
  if (!identities.some((value) => String(value || '').trim())) return [];
  const all = await getAllStaffAlerts();
  return all.filter((doc) => doc.read !== true && matchesIdentity(doc, identities));
};

/**
 * Mark the given alerts as read (or every alert matching the identity when no
 * ids are supplied).
 * @param {string[]|null} ids
 * @param {string|string[]|null} identity
 */
export const markStaffAlertsRead = async (ids = null, identity = null) => {
  try {
    const all = await getAllStaffAlerts();
    const identities = Array.isArray(identity) ? identity : identity ? [identity] : [];
    const wanted = Array.isArray(ids) && ids.length ? new Set(ids) : null;

    const toUpdate = all.filter((doc) => {
      if (doc.read === true) return false;
      if (wanted) return wanted.has(doc._id);
      if (identities.length) return matchesIdentity(doc, identities);
      return true;
    });

    if (toUpdate.length === 0) return 0;

    const now = new Date().toISOString();
    await localDb.bulkDocs(
      toUpdate.map((doc) => ({
        ...doc,
        read: true,
        readAt: now,
        updatedAt: now,
      }))
    );
    return toUpdate.length;
  } catch (err) {
    console.warn('[staff-alert] Failed to mark alerts read:', err?.message || err);
    return 0;
  }
};
