import PouchDB from 'pouchdb-browser';

const auditDB = new PouchDB('bustrac_audit_logs');

export async function createAuditLog({ action, module, recordId = null, details = '' }) {
  try {
    const rawUser = sessionStorage.getItem('bustrac_user');
    const role = sessionStorage.getItem('bustrac_role');
    let actor = {
      username: 'system',
      role: 'system',
    };

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

    await auditDB.put(doc);
    return {
      success: true,
      entry: doc,
    };
  } catch (err) {
    console.error('Audit log creation failed:', err);
    try {
      const currentFailures = Number(
        localStorage.getItem('bustrac_audit_failures') || '0'
      );
      localStorage.setItem(
        'bustrac_audit_failures',
        String(currentFailures + 1)
      );
    } catch (storageError) {
      console.error('Unable to record audit failure:', storageError);
    }
    return {
      success: false,
      entry: null,
      error: err,
    };
  }
}

// Wrapper function para sa logActivity
export async function logActivity({ action, module, details, performedBy }) {
  return createAuditLog({
    action,
    module,
    details: performedBy ? `${details} (Performed by: ${performedBy})` : details,
  });
}

export async function getAuditLogs() {
  try {
    const result = await auditDB.allDocs({
      include_docs: true,
    });
    return result.rows
      .map((row) => row.doc)
      .filter((doc) => doc && doc.type === 'audit_log')
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.error('Failed to fetch audit logs:', err);
    return [];
  }
}