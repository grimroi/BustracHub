import PouchDB from 'pouchdb-browser';

export const localDb = new PouchDB('bustrachub_db');

if (localDb.setMaxListeners) {
  localDb.setMaxListeners(20);
}

const RAW_COUCH_URL = import.meta.env.VITE_COUCHDB_URL || 'http://admin:capstone2026@192.168.1.3:5984/bustrachub_db';
const CLEAN_URL = RAW_COUCH_URL.replace(/\/\/[^:]+:[^@]+@/, '//');

export const remoteDb = new PouchDB(CLEAN_URL, {
  auth: {
    username: 'admin',
    password: 'capstone2026'
  },
  skip_setup: true,
  timeout: 10000
});

let activeSyncHandler = null;

export const setupPouchDBSync = () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null;
  }

  if (activeSyncHandler) {
    try {
      activeSyncHandler.cancel();
    } catch (e) {
      // Ignore cancellation errors
    }
    activeSyncHandler = null;
  }

  activeSyncHandler = localDb.sync(remoteDb, {
    live: true,
    retry: true,
    backoff_def: {
      initial_delay: 1000,
      max_delay: 5000
    }
  });

  activeSyncHandler.on('change', (info) => {
    resolveDbConflicts();
  });

  activeSyncHandler.on('paused', (err) => {
    if (err) {
      console.warn('Sync paused due to network loss. Operating in offline mode.');
    }
  });

  activeSyncHandler.on('error', (err) => {
    console.error('Critical replication error:', err);
  });

  return activeSyncHandler;
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    setupPouchDBSync();
  });

  window.addEventListener('offline', () => {
    if (activeSyncHandler) {
      try {
        activeSyncHandler.cancel();
      } catch (e) {}
      activeSyncHandler = null;
    }
  });
}

export const forceSyncToRemote = async () => {
  if (!remoteDb) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return;
  }

  try {
    if (typeof localDb.setMaxListeners === 'function') {
      localDb.setMaxListeners(50);
    }

    const syncInstance = localDb.sync(remoteDb, {
      live: false,
      retry: false
    });

    return new Promise((resolve) => {
      syncInstance
        .on('complete', (info) => {
          syncInstance.removeAllListeners();
          resolve(info);
        })
        .on('error', (err) => {
          syncInstance.removeAllListeners();
          console.warn('Sync error (continuing operation):', err);
          resolve(null);
        });
    });
  } catch (err) {
    console.warn('Force sync error:', err);
  }
};

export const createAuditLog = async ({ action, module, recordId, user, details }) => {
  try {
    const timestamp = new Date().toISOString();
    const logId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const logEntry = {
      _id: logId,
      type: 'audit_log',
      docType: 'audit_log',
      action: action || 'UNKNOWN_ACTION',
      module: module || 'SYSTEM',
      recordId: recordId || 'N/A',
      user: user || 'Unknown User',
      details: details || '',
      timestamp: timestamp,
      createdAt: timestamp,
      synced: false,
      isSynced: false
    };

    const response = await localDb.put(logEntry);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      forceSyncToRemote().catch(err => console.warn('Auto-sync audit log warning:', err));
    }

    return response;
  } catch (error) {
    console.error('Failed to create audit log entry:', error);
    throw error;
  }
};

export const resolveDbConflicts = async () => {
  try {
    const result = await localDb.allDocs({ include_docs: true, conflicts: true });
    for (const row of result.rows) {
      if (row.doc && row.doc._conflicts && row.doc._conflicts.length > 0) {
        let currentWinner = { ...row.doc };
        for (const conflictRev of row.doc._conflicts) {
          try {
            const loserDoc = await localDb.get(row.id, { rev: conflictRev });
            const winnerTime = new Date(currentWinner.updatedAt || currentWinner.createdAt || 0).getTime();
            const loserTime = new Date(loserDoc.updatedAt || loserDoc.createdAt || 0).getTime();

            const combinedHistory = [
              ...(currentWinner.history || []),
              ...(loserDoc.history || [])
            ];
            const uniqueHistory = Array.from(
              new Map(combinedHistory.map(h => [h.timestamp || JSON.stringify(h), h])).values()
            ).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

            let mergedDoc;
            if (loserTime > winnerTime) {
              mergedDoc = {
                ...currentWinner,
                ...loserDoc,
                status: loserDoc.status || currentWinner.status,
                history: uniqueHistory,
                updatedAt: new Date(loserTime).toISOString(),
                synced: true,
                isSynced: true
              };
            } else {
              mergedDoc = {
                ...loserDoc,
                ...currentWinner,
                status: currentWinner.status || loserDoc.status,
                history: uniqueHistory,
                updatedAt: new Date(winnerTime).toISOString(),
                synced: true,
                isSynced: true
              };
            }

            mergedDoc._id = currentWinner._id;
            mergedDoc._rev = currentWinner._rev;
            const putRes = await localDb.put(mergedDoc);
            currentWinner._rev = putRes.rev;

            await localDb.remove(loserDoc._id, conflictRev);
          } catch (conflictErr) {
            console.warn(`Conflict resolution skip for ${row.id}:`, conflictErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed during conflict resolution:', err);
  }
};

setupPouchDBSync();

export default localDb;