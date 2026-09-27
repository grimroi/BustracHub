import PouchDB from 'pouchdb';
import memoryAdapter from 'pouchdb-adapter-memory';

PouchDB.plugin(memoryAdapter);

describe('Offline-to-Online PouchDB Conflict Handling', () => {
  let localDb;

  beforeEach(async () => {
    localDb = new PouchDB('test_barangay_db', { adapter: 'memory' });
  });

  afterEach(async () => {
    await localDb.destroy();
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

    // First update succeeds and creates a new _rev
    await localDb.put(updateA);

    // Attempting to put updateB with the old _rev must throw a 409 conflict
    await expect(localDb.put(updateB)).rejects.toMatchObject({
      status: 409,
      name: 'conflict'
    });
  });

  test('should resolve conflicts using Last-Write-Wins (LWW) strategy based on updatedAt', async () => {
    const docId = 'resident_conflict_resolution';

    // Seed Initial Doc
    const seeded = await localDb.put({
      _id: docId,
      name: 'Maria Santos',
      purok: 'Purok 1',
      updatedAt: '2026-09-01T08:00:00Z'
    });

    // Create Revision Branch A
    await localDb.put({
      _id: docId,
      _rev: seeded.rev,
      purok: 'Purok 2 (Staff A)',
      updatedAt: '2026-09-01T09:00:00Z'
    });

    // Force conflicting Revision Branch B using allDocs / bulkDocs
    const conflictRevDoc = {
      _id: docId,
      _rev: seeded.rev,
      purok: 'Purok 3 (Staff B)',
      updatedAt: '2026-09-01T09:30:00Z'
    };

    await localDb.bulkDocs([conflictRevDoc], { new_edits: false });

    // Verify that the document has conflicts
    const docWithConflicts = await localDb.get(docId, { conflicts: true });
    expect(docWithConflicts._conflicts).toBeDefined();
    expect(docWithConflicts._conflicts.length).toBeGreaterThan(0);

    // LWW Resolution Logic Implementation
    const winningRev = docWithConflicts;
    const losingRevId = docWithConflicts._conflicts[0];
    const losingRev = await localDb.get(docId, { rev: losingRevId });

    const winningTime = new Date(winningRev.updatedAt).getTime();
    const losingTime = new Date(losingRev.updatedAt).getTime();

    if (losingTime > winningTime) {
      // Mark winning rev as deleted and keep losing rev as main
      await localDb.remove(winningRev._id, winningRev._rev);
    } else {
      // Delete losing conflict revision
      await localDb.remove(losingRev._id, losingRev._rev);
    }

    // Assert that conflict flag is now resolved
    const cleanDoc = await localDb.get(docId, { conflicts: true });
    expect(cleanDoc._conflicts).toBeUndefined();
  });
});