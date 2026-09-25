import PouchDB from 'pouchdb-browser';

// 1. Local Database Initialization
export const localDb = new PouchDB('bustrachub_db');

// 2. Remote CouchDB Connection Setup
const RAW_COUCH_URL = import.meta.env.VITE_COUCHDB_URL || 'http://localhost:5984/bustrachub_db';
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

/**
 * Robust Live Two-Way Sync Handler
 */
export const setupPouchDBSync = () => {
  // Do not attempt if the device is offline
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('📡 Device is currently offline. Background sync on standby.');
    return null;
  }

  // If an existing sync instance exists, cancel and clean it up properly before creating a new one
  if (activeSyncHandler) {
    try {
      activeSyncHandler.cancel();
    } catch (e) {
      // Ignore cancellation errors
    }
    activeSyncHandler = null;
  }

  console.log('🔄 Initializing Two-Way Live Replication with CouchDB...');

  activeSyncHandler = localDb.sync(remoteDb, {
    live: true,
    retry: true,
    backoff_def: {
      initial_delay: 1000,
      max_delay: 5000
    }
  });

  // A. Real-time changes event
  activeSyncHandler.on('change', (info) => {
    console.log('⚡ Real-time Data Synced with CouchDB:', info);
    resolveDbConflicts();
  });

  activeSyncHandler.on('paused', (err) => {
    if (err) {
      console.warn('⚠️ Sync paused due to network loss. Operating in offline mode.');
    } else {
      console.log('🟢 Local database is fully synchronized with CouchDB.');
    }
  });

  activeSyncHandler.on('active', () => {
    console.log('🚀 Syncing pending changes to CouchDB...');
  });

  activeSyncHandler.on('error', (err) => {
    console.error('❌ Critical Replication Error:', err);
  });

  return activeSyncHandler;
};

// Global Event Listeners for Online/Offline switching
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 Connection restored! Auto-triggering background sync...');
    setupPouchDBSync();
  });

  window.addEventListener('offline', () => {
    console.warn('📡 Device offline. Canceling active sync handler...');
    if (activeSyncHandler) {
      try {
        activeSyncHandler.cancel();
      } catch (e) {}
      activeSyncHandler = null;
    }
  });
}

// ── Dagdag sa src/services/db.js ──
export const forceSyncToRemote = async () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    console.log('📡 Offline: Force sync skipped.');
    return;
  }
  try {
    console.log('⚡ Executing immediate PouchDB -> CouchDB push sync...');
    await localDb.replicate.to(remoteDb);
    console.log('✅ Immediate push sync complete.');
  } catch (err) {
    console.warn('⚠️ Immediate push sync warning:', err);
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
    console.log('✅ Audit Log entry saved:', response.id);

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      if (typeof forceSyncToRemote === 'function') {
        forceSyncToRemote().catch(err => console.warn('Auto-sync audit log warning:', err));
      }
    }

    return response;
  } catch (error) {
    console.error('❌ Failed to create audit log entry:', error);
    throw error;
  }
};

/**
 * Smart Conflict Resolution Strategy
 */
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

            // 1. Merge History & Audit Logs
            const combinedHistory = [
              ...(currentWinner.history || []),
              ...(loserDoc.history || [])
            ];
            const uniqueHistory = Array.from(
              new Map(combinedHistory.map(h => [h.timestamp || JSON.stringify(h), h])).values()
            ).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

            // 2. Last-Write-Wins Merge
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
            console.log(`⚡ Conflict merged & resolved for Document ID: ${row.id}`);
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