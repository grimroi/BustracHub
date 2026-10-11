// utils/auditLog.js
import { localDb } from '../services/db';

export async function createAuditLog({
  action,
  module,
  recordId = null,
  details = '',
  actor: actorOverride = null,
  meta = null,
}) {
  try {
    const rawUser = localStorage.getItem('bustrac_user');
    const role = localStorage.getItem('bustrac_role');

    let actor = { username: 'system', role: 'system' };

    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        actor.username = parsed.username || parsed.fullName || rawUser;
        actor.role = parsed.role || role || 'unknown';
      } catch {
        actor.username = rawUser;
        actor.role = role || 'unknown';
      }
    }

    if (actorOverride && typeof actorOverride === 'object') {
      actor = {
        ...actor,
        username: actorOverride.username || actorOverride.residentId || actor.username,
        role: actorOverride.role || actor.role,
      };
      if (actorOverride.displayName || actorOverride.fullName) {
        actor.displayName = actorOverride.displayName || actorOverride.fullName;
      }
    } else if (typeof actorOverride === 'string' && actorOverride) {
      actor.username = actorOverride;
    }

    const timestamp = new Date().toISOString();

    const doc = {
      _id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      type: 'audit_log',
      timestamp,
      actor,
      action,
      module,
      recordId,
      details,
      immutable: true,
      createdAt: timestamp,
    };

    if (meta && typeof meta === 'object') {
      doc.meta = meta;
    }

    await localDb.put(doc);

    return { success: true, entry: doc };
  } catch (err) {
    console.error('Audit log creation failed:', err);
    return { success: false, entry: null, error: err };
  }
}

export async function logConflictResolution({
  docId,
  module,
  strategy,
  winnerRev = null,
  loserRevs = [],
  mergedFields = [],
  residentName = '',
  details = '',
  actor = null,
}) {
  const labelText = Array.isArray(mergedFields) && mergedFields.length
    ? ` · Fields: ${mergedFields.join(', ')}`
    : '';
  const winnerText = winnerRev ? ` · Winner: ${winnerRev}` : '';
  const loserText = Array.isArray(loserRevs) && loserRevs.length
    ? ` · Discarded: ${loserRevs.join(', ')}`
    : '';
  const baseDetails = details || `Conflict resolved${residentName ? ` for ${residentName}` : ''}`;

  return createAuditLog({
    action: 'CONFLICT_RESOLVED',
    module: module || 'CONFLICTS',
    recordId: docId,
    details: `${baseDetails} (strategy: ${strategy})${winnerText}${loserText}${labelText}`,
    actor,
    meta: { conflict: true, strategy, winnerRev, loserRevs, mergedFields },
  });
}

export async function logActivity({
  action,
  module,
  details,
  performedBy,
}) {
  return createAuditLog({
    action,
    module,
    details: performedBy
      ? `${details} (Performed by: ${performedBy})`
      : details,
  });
}

export async function getAuditLogs() {
  try {
    const result = await localDb.allDocs({
      include_docs: true,
      startkey: 'audit_',
      endkey: 'audit_\uffff',
    });

    return result.rows
      .map((row) => row.doc)
      .filter((doc) => doc?.type === 'audit_log')
      .sort(
        (a, b) =>
          new Date(b.timestamp) - new Date(a.timestamp)
      );
  } catch (err) {
    console.error('Failed to fetch audit logs:', err);
    return [];
  }
}