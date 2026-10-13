// utils/auditLog.js
import { localDb } from '../services/db';

export async function createAuditLog({
  action,
  module,
  recordId = null,
  details = '',
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

    const timestamp = new Date().toISOString();

    // Only admin/staff may write audit docs through the sync proxy (residents
    // are restricted to their own data). A resident-generated audit entry is
    // therefore kept as a _local/ doc so PouchDB never replicates it — this
    // avoids a 403 that would otherwise fail the ENTIRE _bulk_docs batch.
    const isPrivileged = actor.role === 'admin' || actor.role === 'staff';
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const doc = {
      _id: isPrivileged ? auditId : `_local/${auditId}`,
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

    await localDb.put(doc);

    return { success: true, entry: doc };
  } catch (err) {
    console.error('Audit log creation failed:', err);
    return { success: false, entry: null, error: err };
  }
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

export async function logConflictResolution({
  recordId,
  strategy, // e.g., 'keep_local', 'keep_server', 'manual_merge'
  details = '',
}) {
  return createAuditLog({
    action: 'RESOLVE_CONFLICT',
    module: 'SYNC_ENGINE',
    recordId,
    details: `Conflict resolved using strategy: ${strategy}. ${details}`,
  });
}