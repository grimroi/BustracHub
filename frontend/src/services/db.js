import PouchDB from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';

PouchDB.plugin(PouchDBFind);

export const localDb = new PouchDB('bustrachub_db');

if (typeof localDb.setMaxListeners === 'function') {
  localDb.setMaxListeners(500);
}


const RAW_COUCH_URL = import.meta.env.VITE_COUCHDB_URL;

if (!RAW_COUCH_URL) {
  console.warn('VITE_COUCHDB_URL is not set. Remote database sync will be disabled.');
}

export const remoteDb = RAW_COUCH_URL
  ? new PouchDB(RAW_COUCH_URL, {
      skip_setup: true,
      timeout: 10000
    })
  : null;

let activeSyncHandler = null;
let syncStatusListeners = [];

export const onSyncStatusChange = (cb) => {
  syncStatusListeners.push(cb);
  return () => {
    syncStatusListeners = syncStatusListeners.filter((l) => l !== cb);
  };
};

const emitSync = (status) => syncStatusListeners.forEach((cb) => cb(status));

export const setupPouchDBSync = () => {
  // Huwag ituloy ang sync kung walang remoteDb o offline ang client
  if (!remoteDb || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;

  if (activeSyncHandler) {
    try { activeSyncHandler.cancel(); } catch (e) { /* ignore */ }
    activeSyncHandler = null;
  }

  activeSyncHandler = localDb.sync(remoteDb, {
    live: true,
    retry: true,
    backoff_def: { initial_delay: 1000, max_delay: 5000 }
  });

  activeSyncHandler.on('change', (info) => { console.log('Sync change detected:', info); }); 
  activeSyncHandler.on('paused', (err) => {
    if (err) console.warn('Sync paused. Operating in offline mode.');
  });
  activeSyncHandler.on('error', (err) => {
    console.error('Replication error:', err);
  });

  return activeSyncHandler;
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setupPouchDBSync());
  window.addEventListener('offline', () => {
    if (activeSyncHandler) {
      try { activeSyncHandler.cancel(); } catch (e) { }
      activeSyncHandler = null;
    }
  });
}

export const forceSyncToRemote = async () => {
  if (!remoteDb) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    if (typeof localDb.setMaxListeners === 'function') localDb.setMaxListeners(50);
    const syncInstance = localDb.sync(remoteDb, { live: false, retry: false });
    return new Promise((resolve) => {
      syncInstance
        .on('complete', (info) => { syncInstance.removeAllListeners(); resolve(info); })
        .on('error', (err) => { syncInstance.removeAllListeners(); console.warn('Sync error:', err); resolve(null); });
    });
  } catch (err) {
    console.warn('Force sync error:', err);
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
            const combinedHistory = [...(currentWinner.history || []), ...(loserDoc.history || [])];
            const uniqueHistory = Array.from(
              new Map(combinedHistory.map(h => [h.timestamp || JSON.stringify(h), h])).values()
            ).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
            
            let mergedDoc;
            if (loserTime > winnerTime) {
              mergedDoc = { ...currentWinner, ...loserDoc, status: loserDoc.status || currentWinner.status, history: uniqueHistory, updatedAt: new Date(loserTime).toISOString(), synced: true, isSynced: true };
            } else {
              mergedDoc = { ...loserDoc, ...currentWinner, status: currentWinner.status || loserDoc.status, history: uniqueHistory, updatedAt: new Date(winnerTime).toISOString(), synced: true, isSynced: true };
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

export const initDbIndices = async () => {
  try {
    if (typeof localDb.createIndex === 'function') {
      await Promise.all([
        localDb.createIndex({ index: { fields: ['type', 'status', 'createdAt'] } }),
        localDb.createIndex({ index: { fields: ['type', 'username'] } }),
        localDb.createIndex({ index: { fields: ['type', 'residentId'] } }),
        localDb.createIndex({ index: { fields: ['type', 'timestamp'] } }),
        localDb.createIndex({ index: { fields: ['docType'] } }),
        localDb.createIndex({ index: { fields: ['type'] } }),
      ]);
      console.log('All database indices verified/created successfully.');
    }
  } catch (err) {
    console.warn('Index creation warning:', err.message);
  }
};

export const sanitizeCertificateDoc = (doc) => ({
  _id: doc._id,
  ...(doc._rev && { _rev: doc._rev }),
  type: 'certificate_request',
  refNumber: doc.refNumber || `CERT-${Date.now().toString(36).toUpperCase().slice(-6)}`,
  residentId: doc.residentId || '',
  residentName: doc.residentName || `${doc.firstName || ''} ${doc.lastName || ''}`.trim(),
  username: doc.username || '',
  firstName: doc.firstName || '',
  lastName: doc.lastName || '',
  purok: doc.purok || '',
  contact: doc.contact || '',
  certType: doc.certType || doc.certificateType || 'Barangay Clearance',
  certPurpose: doc.certPurpose || doc.purpose || '',
  status: doc.status || 'Pending',
  step: doc.step || 1,
  issuanceMeta: doc.issuanceMeta || {
    orNumber: doc.orNumber || '',
    amountPaid: doc.amountPaid || '',
    dateIssued: doc.dateIssued || '',
    remarks: doc.remarks || 'No Derogatory Record',
    validity: '6 months'
  },
  timestamp: doc.timestamp || new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

export const saveCertificateRequest = async (rawDoc) => {
  try {
    const cleanDoc = sanitizeCertificateDoc(rawDoc);
    const response = await localDb.put(cleanDoc);
    return response;
  } catch (err) {
    console.error('Error saving certificate request:', err);
    throw err;
  }
};

export const migrateExistingCertificates = async () => {
  try {
    const result = await localDb.find({ selector: { type: 'certificate_request' } });
    if (result.docs.length === 0) return;
    const cleanedDocs = result.docs.map(doc => sanitizeCertificateDoc(doc));
    await localDb.bulkDocs(cleanedDocs);
    console.log(`Successfully sanitized ${cleanedDocs.length} certificate documents in DB!`);
  } catch (err) {
    console.warn('Migration warning:', err.message);
  }
};

initDbIndices()
  .then(() => migrateExistingCertificates())
  .catch((err) => console.error('Error during DB init/migration:', err));