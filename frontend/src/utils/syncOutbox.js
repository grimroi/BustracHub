// src/utils/syncOutbox.js
//
// Durable "pending push" outbox that survives a browser/tab crash.
//
// WHY THIS EXISTS
// ---------------
// PouchDB replication only runs while a page is alive. If the tab is closed
// (or the device is powered off) while changes are still queued in IndexedDB,
// nothing is pushed to CouchDB until the app is opened again. On a shared
// tablet that is a real data-loss window.
//
// The outbox is a tiny IndexedDB database that mirrors the documents the
// local PouchDB has produced. The page appends to it from the PouchDB changes
// feed; the service worker drains it with plain CouchDB HTTP calls
// (`_revs_diff` + `_bulk_docs`) when the browser fires a Background Sync
// event. Both the page and the service worker import this module, so the
// storage layout is defined in exactly one place.
//
// DESIGN RULES
// ------------
//   * Never throws. Every failure degrades to "outbox unavailable" so the
//     caller (page or SW) can fall back to the normal replication path.
//   * Only metadata + document bodies are stored. No tokens are written here;
//     the session token lives in the separate `meta` store (see below) and is
//     cleared on logout.
//   * Writes are keyed by `${_id}::${_rev}` so a newer revision of the same
//     document replaces the older queued entry instead of duplicating it.

const DB_NAME = 'bustrac_sync_outbox';
const DB_VERSION = 1;
const OUTBOX_STORE = 'outbox';
const META_STORE = 'meta';

// Key used to store the service-worker bootstrap metadata (session token,
// API base, remote db name, device id). Kept in a separate store so the
// outbox can be cleared wholesale without dropping the SW credentials.
export const META_KEY = 'sw_meta';

const isIndexedDbAvailable = () => {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB;
  } catch {
    return false;
  }
};

let dbPromise = null;

const openOutboxDb = () => {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const store = db.createObjectStore(OUTBOX_STORE, { keyPath: 'key' });
        store.createIndex('byId', 'docId', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open outbox'));
    request.onblocked = () => reject(new Error('Outbox open blocked'));
  }).catch((err) => {
    // Allow a later retry if the open failed transiently.
    dbPromise = null;
    throw err;
  });

  return dbPromise;
};

const txDone = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Outbox transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('Outbox transaction aborted'));
  });

// ─────────────────────────────────────────────
// OUTBOX (pending documents)
// ─────────────────────────────────────────────

/**
 * Queue one document for background pushing.
 * @param {object} doc A PouchDB document (must have `_id`).
 * @returns {Promise<boolean>} true when the document was queued.
 */
export const enqueueDoc = async (doc) => {
  if (!doc || !doc._id) return false;
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);

    // Remove any older queued revision of the same document first so the
    // outbox never grows with superseded revisions.
    const index = store.index('byId');
    const cursorRequest = index.openCursor(IDBKeyRange.only(doc._id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    store.put({
      key: `${doc._id}::${doc._rev || ''}`,
      docId: doc._id,
      rev: doc._rev || '',
      deleted: doc._deleted === true,
      doc: doc,
      queuedAt: new Date().toISOString(),
    });

    await txDone(tx);
    return true;
  } catch {
    return false;
  }
};

/**
 * List every queued document (oldest first).
 * @returns {Promise<Array<object>>}
 */
export const listOutbox = async () => {
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const store = tx.objectStore(OUTBOX_STORE);
    const items = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
      request.onerror = () => reject(request.error || new Error('Outbox read failed'));
    });
    await txDone(tx).catch(() => {});
    return items.sort((a, b) => String(a.queuedAt || '').localeCompare(String(b.queuedAt || '')));
  } catch {
    return [];
  }
};

/**
 * Remove queued entries by their `key` (or by doc id when no key is given).
 * @param {string[]} keys
 */
export const removeFromOutbox = async (keys) => {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (list.length === 0) return 0;
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    list.forEach((key) => store.delete(key));
    await txDone(tx);
    return list.length;
  } catch {
    return 0;
  }
};

/**
 * Remove every queued entry for a document id (used after a confirmed push).
 */
export const removeOutboxEntriesForDoc = async (docId) => {
  if (!docId) return 0;
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const index = store.index('byId');
    const cursorRequest = index.openCursor(IDBKeyRange.only(docId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    await txDone(tx);
    return 1;
  } catch {
    return 0;
  }
};

/** Drop every queued entry (used after a full successful replication). */
export const clearOutbox = async () => {
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    tx.objectStore(OUTBOX_STORE).clear();
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
};

/** Number of queued documents (cheap enough to poll). */
export const getOutboxCount = async () => {
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const count = await new Promise((resolve, reject) => {
      const request = tx.objectStore(OUTBOX_STORE).count();
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error || new Error('Outbox count failed'));
    });
    await txDone(tx).catch(() => {});
    return count;
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────
// SW META (session token / endpoint bootstrap)
// ─────────────────────────────────────────────

/**
 * Persist the metadata the service worker needs to push to CouchDB.
 * The session token is stored so the SW can authenticate a background push
 * after the tab is gone. It is written on every login and cleared on logout.
 *
 * @param {{token?: string|null, apiBase?: string, dbName?: string, deviceId?: string}} meta
 */
export const saveSwMeta = async (meta) => {
  const current = await loadMetaRecord(META_KEY);
  const has = (key) => !!meta && Object.prototype.hasOwnProperty.call(meta, key);
  const next = {
    id: META_KEY,
    // An explicitly passed `null` clears the value (used on logout) — a key
    // that was NOT passed keeps whatever was stored before.
    token: has('token') ? (meta.token ?? null) : (current?.token ?? null),
    apiBase: has('apiBase') ? (meta.apiBase ?? null) : (current?.apiBase ?? null),
    dbName: has('dbName') ? (meta.dbName ?? null) : (current?.dbName ?? null),
    deviceId: has('deviceId') ? (meta.deviceId ?? null) : (current?.deviceId ?? null),
    updatedAt: new Date().toISOString(),
  };
  await saveMetaRecord(next);
  return next;
};

/** Read the stored SW metadata (token may be null). */
export const loadSwMeta = async () => loadMetaRecord(META_KEY);

/** Remove the stored session token (called on logout). */
export const clearSwMeta = async () => removeMetaRecord(META_KEY);

/**
 * Generic key/value helpers on the `meta` object store. Used for values that
 * must survive a reload but are not part of the SW bootstrap (e.g. the File
 * System Access API directory handle).
 */
export const saveMetaRecord = async (record) => {
  if (!record || !record.id) return null;
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).put(record);
    await txDone(tx);
    return record;
  } catch {
    return null;
  }
};

export const loadMetaRecord = async (id) => {
  if (!id) return null;
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(META_STORE, 'readonly');
    const record = await new Promise((resolve) => {
      const request = tx.objectStore(META_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    await txDone(tx).catch(() => {});
    return record;
  } catch {
    return null;
  }
};

export const removeMetaRecord = async (id) => {
  if (!id) return false;
  try {
    const db = await openOutboxDb();
    const tx = db.transaction(META_STORE, 'readwrite');
    tx.objectStore(META_STORE).delete(id);
    await txDone(tx);
    return true;
  } catch {
    return false;
  }
};
