// src/services/conflictResolver.js
//
// Conflict resolution that never throws away valid work.
//
// Two resolution paths are provided:
//   * `resolveConflictByFieldMerge` — the admin picks a side per field and a
//     merged document is written as the new winning revision.
//   * `resolveConflictKeepSide`     — the whole of one side is kept
//     (keep-a / keep-b / keep-latest).
//
// Both paths:
//   1. re-read the current winning revision (so a background sync that landed
//      while the admin was reading does not cause a 409),
//   2. write the winner,
//   3. delete the losing conflict revision(s),
//   4. write an audit entry naming the strategy and the merged fields,
//   5. notify the staff member whose edit was discarded.

import { localDb } from './db';
import {
  buildMergedDocument,
  computeConflictDiff,
  describeMergeChoices,
  conflictModuleLabel,
  getDocEditorLabel,
} from '../utils/conflictMerge';
import { logConflictResolution } from '../utils/auditLog';
import { createStaffAlerts } from './staffAlerts';

const resolveRecordName = (docA, docB) => {
  const pick = (doc) => {
    if (!doc) return '';
    return (
      doc.full_name ||
      doc.name ||
      doc.residentName ||
      doc.fullName ||
      `${doc.firstName || ''} ${doc.lastName || ''}`.trim() ||
      ''
    );
  };
  return pick(docA) || pick(docB) || 'this record';
};

const isGone = (err) => !!err && (err.status === 404 || err.status === 409 || err.name === 'conflict');

/**
 * Resolve a conflict by merging selected fields from both revisions.
 *
 * @param {object} params
 * @param {string} params.docId        document id
 * @param {object} params.docA         Version A (local winning revision)
 * @param {object} params.docB         Version B (conflicting revision)
 * @param {string} params.conflictRev  the revision to delete afterwards
 * @param {Record<string,'A'|'B'>} params.choices per-field choice map
 * @param {string[]} [params.extraConflictRevs] additional losing revisions
 * @returns {Promise<{ok:boolean, mergedFields?:string[], error?:string}>}
 */
export const resolveConflictByFieldMerge = async ({
  docId,
  docA,
  docB,
  conflictRev,
  choices = {},
  extraConflictRevs = [],
  resolvedBy = 'admin',
} = {}) => {
  try {
    // Always work from the CURRENT winning revision: a background sync may
    // have advanced it while the admin was reviewing the diff.
    let current = null;
    try {
      current = await localDb.get(docId, { conflicts: true });
    } catch (err) {
      if (isGone(err)) {
        return { ok: false, alreadyResolved: true, error: 'Conflict was already resolved.' };
      }
      throw err;
    }

    const diff = computeConflictDiff(docA, docB);
    const { doc: merged, mergedFields, fieldChoices } = buildMergedDocument(docA, docB, choices, {
      base: current,
    });

    const payload = {
      ...merged,
      _id: docId,
      _rev: current._rev,
    };
    delete payload._conflicts;
    delete payload._revisions;

    const putRes = await localDb.put(payload);

    // Remove the losing revision(s) so PouchDB stops reporting a conflict.
    const losers = [conflictRev, ...(Array.isArray(extraConflictRevs) ? extraConflictRevs : [])].filter(Boolean);
    for (const rev of losers) {
      try {
        await localDb.remove(docId, rev);
      } catch (err) {
        if (!isGone(err)) {
          console.warn('[conflict] Could not remove losing revision:', err?.message || err);
        }
      }
    }

    const recordName = resolveRecordName(docA, docB);
    const module = conflictModuleLabel(payload.type || docA?.type || docB?.type);
    const fieldSummary = describeMergeChoices(diff, fieldChoices);

    await logConflictResolution({
      recordId: docId,
      docId,
      module,
      strategy: 'field-merge',
      winnerRev: putRes?.rev || current._rev,
      loserRevs: losers,
      mergedFields,
      fieldChoices,
      residentName: recordName,
      resolvedBy,
      details:
        `Field-level merge for ${recordName}. Kept ${fieldSummary || 'no differing fields'}. ` +
        `Merged fields: ${mergedFields.length ? mergedFields.join(', ') : '—'}.`,
    });

    await createStaffAlerts({
      docId,
      recordName,
      docA,
      docB,
      strategy: 'field-merge',
      fieldChoices,
      mergedFields,
      resolvedBy,
    });

    return { ok: true, mergedFields, fieldChoices, winnerRev: putRes?.rev };
  } catch (err) {
    console.error('[conflict] Field merge failed:', err?.message || err);
    return { ok: false, error: err?.message || 'Unknown error' };
  }
};

/**
 * Resolve a conflict by keeping one whole side.
 *
 * @param {object} params
 * @param {string} params.docId
 * @param {string} params.conflictRev    revision to delete
 * @param {'A'|'B'} params.side          which version wins
 * @param {object} [params.docA]
 * @param {object} [params.docB]
 * @param {string} [params.strategy]     audit strategy label
 */
export const resolveConflictKeepSide = async ({
  docId,
  conflictRev,
  side = 'A',
  docA = null,
  docB = null,
  strategy = null,
  extraConflictRevs = [],
  resolvedBy = 'admin',
} = {}) => {
  try {
    let current = null;
    try {
      current = await localDb.get(docId, { conflicts: true });
    } catch (err) {
      if (isGone(err)) {
        return { ok: false, alreadyResolved: true, error: 'Conflict was already resolved.' };
      }
      throw err;
    }

    let a = docA;
    let b = docB;
    if (!a) {
      try { a = await localDb.get(docId); } catch { a = current; }
    }
    if (!b && conflictRev) {
      try { b = await localDb.get(docId, { rev: conflictRev }); } catch { b = null; }
    }

    const mergedFields = computeConflictDiff(a, b).map((d) => d.field);
    const auditStrategy = strategy || (side === 'B' ? 'keep-b' : 'keep-a');

    if (side === 'B' && b) {
      const payload = {
        ...b,
        _id: docId,
        _rev: current._rev,
        updatedAt: new Date().toISOString(),
        _conflictResolved: true,
      };
      delete payload._conflicts;
      delete payload._revisions;
      const putRes = await localDb.put(payload);
      current = { ...current, _rev: putRes.rev };
    }

    const losers = [conflictRev, ...(Array.isArray(extraConflictRevs) ? extraConflictRevs : [])].filter(Boolean);
    for (const rev of losers) {
      try {
        await localDb.remove(docId, rev);
      } catch (err) {
        if (!isGone(err)) {
          console.warn('[conflict] Could not remove losing revision:', err?.message || err);
        }
      }
    }

    const recordName = resolveRecordName(a, b);
    const module = conflictModuleLabel(current.type || a?.type || b?.type);
    const editor = getDocEditorLabel(side === 'B' ? b : a);

    await logConflictResolution({
      recordId: docId,
      docId,
      module,
      strategy: auditStrategy,
      winnerRev: current._rev,
      loserRevs: losers,
      mergedFields,
      residentName: recordName,
      resolvedBy,
      details:
        `Retained Version ${side} for ${recordName}` +
        (editor ? ` (author: ${editor})` : '') +
        `. Discarded fields: ${mergedFields.length ? mergedFields.join(', ') : '—'}.`,
    });

    await createStaffAlerts({
      docId,
      recordName,
      docA: a,
      docB: b,
      strategy: auditStrategy,
      winnerSide: side,
      mergedFields,
      resolvedBy,
    });

    return { ok: true, mergedFields, winnerRev: current._rev };
  } catch (err) {
    console.error('[conflict] Keep-side resolution failed:', err?.message || err);
    return { ok: false, error: err?.message || 'Unknown error' };
  }
};

/**
 * Split a conflict into two records ("Keep Both").
 * The losing side is preserved as a distinct document instead of being lost.
 */
export const resolveConflictKeepBoth = async ({
  docId,
  conflictRev,
  docB,
  resolvedBy = 'admin',
} = {}) => {
  try {
    const newDocId = `${docId}_split_${Date.now()}`;
    const duplicate = { ...(docB || {}), _id: newDocId };
    delete duplicate._rev;
    delete duplicate._conflicts;
    delete duplicate._revisions;
    duplicate.updatedAt = new Date().toISOString();
    duplicate.splitFromConflict = docId;

    await localDb.put(duplicate);
    try {
      await localDb.remove(docId, conflictRev);
    } catch (err) {
      if (!isGone(err)) console.warn('[conflict] Could not remove losing revision:', err?.message || err);
    }

    let current = null;
    try { current = await localDb.get(docId); } catch { current = null; }

    const recordName = resolveRecordName(current, docB);
    const module = conflictModuleLabel(current?.type || docB?.type);

    await logConflictResolution({
      recordId: docId,
      docId,
      module,
      strategy: 'keep-both',
      winnerRev: current?._rev,
      loserRevs: [],
      mergedFields: [],
      residentName: recordName,
      resolvedBy,
      details:
        `Split conflict for ${recordName}; Version B (rev ${conflictRev}) preserved as a distinct ` +
        `record (${newDocId}).`,
    });

    return { ok: true, splitId: newDocId };
  } catch (err) {
    console.error('[conflict] Keep-both failed:', err?.message || err);
    return { ok: false, error: err?.message || 'Unknown error' };
  }
};
