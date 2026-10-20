// src/utils/__tests__/auditLog.test.js
//
// Restored test suite for utils/auditLog.js.
//
// The suite was referenced by frontend/test-output.txt but was missing from the
// tree. It exercises the real implementation (no behaviour changes were made
// to satisfy it).
import { localDb } from '../../services/db';
import {
  createAuditLog,
  logActivity,
  getAuditLogs,
} from '../auditLog';

const setSession = (user, role) => {
  if (user) localStorage.setItem('bustrac_user', JSON.stringify(user));
  else localStorage.removeItem('bustrac_user');
  if (role) localStorage.setItem('bustrac_role', role);
  else localStorage.removeItem('bustrac_role');
};

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
});

describe('createAuditLog — document shape', () => {
  test('writes an audit_log document with the supplied action/module/recordId/details', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    const result = await createAuditLog({
      action: 'CREATE_RESIDENT',
      module: 'RESIDENTS',
      recordId: 'resident_1',
      details: 'Created resident record',
    });

    expect(result.success).toBe(true);
    expect(localDb.put).toHaveBeenCalledTimes(1);

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.type).toBe('audit_log');
    expect(doc.action).toBe('CREATE_RESIDENT');
    expect(doc.module).toBe('RESIDENTS');
    expect(doc.recordId).toBe('resident_1');
    expect(doc.details).toBe('Created resident record');
    expect(doc.immutable).toBe(true);
    expect(typeof doc.timestamp).toBe('string');
    expect(Number.isNaN(new Date(doc.timestamp).getTime())).toBe(false);
    expect(result.entry).toEqual(expect.objectContaining({ type: 'audit_log' }));
  });

  test('generates a unique id per entry', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    await createAuditLog({ action: 'A', module: 'M' });
    await createAuditLog({ action: 'A', module: 'M' });

    const first = localDb.put.mock.calls[0][0]._id;
    const second = localDb.put.mock.calls[1][0]._id;
    expect(first).not.toBe(second);
  });

  test('omits the meta key when no meta payload is supplied', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(doc, 'meta')).toBe(false);
  });

  test('includes the meta payload when one is supplied', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    await createAuditLog({
      action: 'A',
      module: 'M',
      meta: { strategy: 'field-merge', mergedFields: ['purok'] },
    });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.meta).toEqual({ strategy: 'field-merge', mergedFields: ['purok'] });
  });
});

describe('createAuditLog — actor resolution', () => {
  test('resolves the actor from the stored session user', async () => {
    setSession({ username: 'mgcortero', role: 'staff', fullName: 'M. Cortero' }, 'staff');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.actor).toEqual({ username: 'mgcortero', role: 'staff' });
  });

  test('falls back to the stored role when the user object has no role', async () => {
    setSession({ username: 'mgcortero' }, 'staff');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.actor.role).toBe('staff');
  });

  test('falls back to fullName when the user object has no username', async () => {
    setSession({ fullName: 'Juan Dela Cruz', role: 'resident' }, 'resident');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.actor.username).toBe('Juan Dela Cruz');
  });

  test('uses the system actor when nobody is logged in', async () => {
    setSession(null, null);

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.actor).toEqual({ username: 'system', role: 'system' });
  });

  test('survives a corrupt bustrac_user payload', async () => {
    localStorage.setItem('bustrac_user', '{not-json');
    localStorage.setItem('bustrac_role', 'admin');

    const result = await createAuditLog({ action: 'A', module: 'M' });

    expect(result.success).toBe(true);
    const doc = localDb.put.mock.calls[0][0];
    expect(doc.actor.username).toBe('{not-json');
    expect(doc.actor.role).toBe('admin');
  });
});

describe('createAuditLog — replication safety', () => {
  test('admin audit entries get a replicated id (no _local/ prefix)', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc._id.startsWith('_local/')).toBe(false);
    expect(doc._id.startsWith('audit_')).toBe(true);
  });

  test('staff audit entries get a replicated id', async () => {
    setSession({ username: 'mgcortero', role: 'staff' }, 'staff');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc._id.startsWith('_local/')).toBe(false);
  });

  test('resident audit entries are kept local so they never replicate', async () => {
    setSession({ username: 'juan2026', role: 'resident' }, 'resident');

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc._id.startsWith('_local/')).toBe(true);
  });

  test('system audit entries are kept local', async () => {
    setSession(null, null);

    await createAuditLog({ action: 'A', module: 'M' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc._id.startsWith('_local/')).toBe(true);
  });
});

describe('createAuditLog — failure handling', () => {
  test('returns a failure result instead of throwing when the write fails', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');
    const boom = new Error('disk full');
    localDb.put.mockRejectedValueOnce(boom);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createAuditLog({ action: 'A', module: 'M' });

    expect(result.success).toBe(false);
    expect(result.entry).toBeNull();
    expect(result.error).toBe(boom);
    spy.mockRestore();
  });
});

describe('logActivity', () => {
  test('appends the performer to the details', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    await logActivity({
      action: 'A',
      module: 'M',
      details: 'Issued clearance',
      performedBy: 'jmacabangon',
    });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.details).toBe('Issued clearance (Performed by: jmacabangon)');
  });

  test('leaves the details untouched when no performer is given', async () => {
    setSession({ username: 'jmacabangon', role: 'admin' }, 'admin');

    await logActivity({ action: 'A', module: 'M', details: 'Issued clearance' });

    const doc = localDb.put.mock.calls[0][0];
    expect(doc.details).toBe('Issued clearance');
  });
});

describe('getAuditLogs', () => {
  test('returns only audit_log documents, newest first', async () => {
    localDb.allDocs.mockResolvedValueOnce({
      rows: [
        {
          doc: {
            _id: 'audit_1',
            type: 'audit_log',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        },
        {
          doc: {
            _id: 'audit_2',
            type: 'audit_log',
            timestamp: '2026-06-01T00:00:00.000Z',
          },
        },
        { doc: { _id: 'resident_1', type: 'resident' } },
      ],
    });

    const logs = await getAuditLogs();

    expect(logs).toHaveLength(2);
    expect(logs[0]._id).toBe('audit_2');
    expect(logs[1]._id).toBe('audit_1');
  });

  test('returns an empty list when the query fails', async () => {
    localDb.allDocs.mockRejectedValueOnce(new Error('nope'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getAuditLogs()).resolves.toEqual([]);
    spy.mockRestore();
  });
});
