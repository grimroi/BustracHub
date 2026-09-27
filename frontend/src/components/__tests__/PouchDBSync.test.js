// 1. Unang i-assign ang setImmediate global Polyfill para sa memdown/leveldown
if (typeof setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args);
}

// 2. I-unmock ang pouchdb para magamit ang totoong PouchDB engine
jest.unmock('pouchdb');

const PouchDB = require('pouchdb');
const memoryAdapter = require('pouchdb-adapter-memory');

PouchDB.plugin(memoryAdapter);

describe('Offline-to-Online PouchDB Conflict Handling', () => {
  let localDb;

  beforeEach(async () => {
    // Gumawa ng totoong in-memory PouchDB instance na may unique name bawat test
    localDb = new PouchDB('test_barangay_db_' + Date.now(), { adapter: 'memory' });
  });

  afterEach(async () => {
    if (localDb) {
      await localDb.destroy();
    }
  });

  test('should correctly identify and handle document conflicts during parallel offline edits', async () => {
    // 1. Initial Resident Document
    const initialDoc = {
      _id: 'resident_001',
      name: 'Juan Dela Cruz',
      contactNo: '09171234567',
      updatedAt: '2026-09-01T10:00:00Z'
    };
    await localDb.put(initialDoc);

    // 2. Fetch doc to get initial _rev
    const fetchedDoc = await localDb.get('resident_001');

    // 3. Simulate two parallel offline updates (creating conflict)
    const updateA = {
      ...fetchedDoc,
      contactNo: '09179999999',
      updatedAt: '2026-09-01T10:05:00Z'
    };
    const updateB = {
      ...fetchedDoc,
      contactNo: '09188888888',
      updatedAt: '2026-09-01T10:10:00Z'
    };

    // Ang unang update ay magtatagumpay at gagawa ng bagong _rev
    await localDb.put(updateA);

    // Ang pagsubok na i-save ang updateB gamit ang LUMANG _rev ay dapat magtapon ng 409 conflict error
    await expect(localDb.put(updateB)).rejects.toMatchObject({
      status: 409,
      name: 'conflict'
    });
  });

  test('should resolve conflicts using Last-Write-Wins (LWW) strategy based on updatedAt', async () => {
    const docId = 'resident_conflict_resolution';

    // 1. Seed Initial Parent Doc
    const seeded = await localDb.put({
      _id: docId,
      name: 'Maria Santos',
      purok: 'Purok 1',
      updatedAt: '2026-09-01T08:00:00Z'
    });

    const parentRevHash = seeded.rev.split('-')[1];

    // 2. Gumawa ng dalawang magkaibang valid revision branch sa parehong parent (_rev) gamit ang 32-char hex hashes
    const revBranchA = {
      _id: docId,
      _rev: '2-a1111111111111111111111111111111',
      purok: 'Purok 2 (Staff A)',
      updatedAt: '2026-09-01T09:00:00Z',
      _revisions: {
        start: 2,
        ids: ['a1111111111111111111111111111111', parentRevHash]
      }
    };

    const revBranchB = {
      _id: docId,
      _rev: '2-b2222222222222222222222222222222',
      purok: 'Purok 3 (Staff B)',
      updatedAt: '2026-09-01T09:30:00Z',
      _revisions: {
        start: 2,
        ids: ['b2222222222222222222222222222222', parentRevHash]
      }
    };

    // Forced insertion ng dalawang magkatunggaling revision branch
    await localDb.bulkDocs([revBranchA, revBranchB], { new_edits: false });

    // 3. Kunin ang document kasama ang conflict status
    const docWithConflicts = await localDb.get(docId, { conflicts: true });
    expect(docWithConflicts._conflicts).toBeDefined();
    expect(docWithConflicts._conflicts.length).toBeGreaterThan(0);

    // 4. Last-Write-Wins (LWW) Resolution Logic Execution
    const winningRev = docWithConflicts;
    const losingRevId = docWithConflicts._conflicts[0];
    const losingRev = await localDb.get(docId, { rev: losingRevId });

    const winningTime = new Date(winningRev.updatedAt).getTime();
    const losingTime = new Date(losingRev.updatedAt).getTime();

    if (losingTime > winningTime) {
      // Kung mas bago ang losing revision, i-delete ang kasalukuyang winning at palitan ito
      await localDb.remove(winningRev._id, winningRev._rev);
    } else {
      // Kung mas lumang timestamp ang losing conflict, i-delete ang losing conflict branch
      await localDb.remove(losingRev._id, losingRev._rev);
    }

    // 5. Tiyakin na resolved na ang conflict at wala nang _conflicts array
    const cleanDoc = await localDb.get(docId, { conflicts: true });
    expect(cleanDoc._conflicts).toBeUndefined();
  });
});