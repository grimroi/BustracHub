'use strict';

// server/utils/insertWithConflictRetry.js
//
// Bounded conflict-retry for a read-merge-write cycle against CouchDB.
//
// WHY THIS EXISTS
// ---------------
// A device reports its state on application load, when connectivity returns,
// and after every replication cycle. Two of those heartbeats for the SAME
// device can therefore overlap: both read the registry document, both merge
// their change onto the revision they read, and both write. The loser of that
// race receives a 409 "Document update conflict." from CouchDB.
//
// Instead of failing the request, the write is retried a bounded number of
// times: the document is re-read, the incoming change is merged onto the
// FRESH revision, and the insert is attempted again.
//
// A NON-conflict error is never retried. A 500 from the database is a genuine
// failure; retrying it would only add load and delay the error.
//
// The helper is dependency-injected (db, buildDoc, sleep) so it can be
// exercised without a database and without real timing.

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 50;

const CONFLICT_STATUS_CODES = new Set([409, 'conflict']);

/**
 * True when the error is a CouchDB revision conflict.
 * A recognised non-conflict status is authoritative: it is a genuine failure.
 * @param {unknown} err
 * @returns {boolean}
 */
const isConflictError = (err) => {
  if (!err || typeof err !== 'object') return false;

  const status = err.statusCode !== undefined ? err.statusCode : err.status;
  if (status !== undefined && status !== null) {
    return CONFLICT_STATUS_CODES.has(status);
  }

  // No status: fall back to the message (nano sets `reason`/`message`).
  const message = String(err.message || err.reason || '').toLowerCase();
  return message.includes('conflict');
};

/**
 * Read a document, returning null when it does not exist.
 * @param {object} db
 * @param {string} docId
 * @returns {Promise<object|null>}
 */
const readExisting = async (db, docId) => {
  try {
    return await db.get(docId);
  } catch (err) {
    const status = err?.statusCode !== undefined ? err.statusCode : err?.status;
    if (status === 404 || status === 'not_found') return null;
    throw err;
  }
};

/**
 * Insert a document, retrying a bounded number of times on a revision
 * conflict.
 *
 * @param {object} options
 * @param {object} options.db          nano/CouchDB handle
 * @param {string} options.docId       document id
 * @param {(existing: object|null) => object} options.buildDoc merge function
 * @param {number} [options.attempts]  maximum insert attempts (default 3)
 * @param {number} [options.backoffMs] delay between attempts (default 50ms)
 * @param {(ms:number) => Promise<void>} [options.sleep]
 * @returns {Promise<{ok:boolean, doc?:object, rev?:string, attempts:number, error?:Error, conflicted:boolean}>}
 */
const insertWithConflictRetry = async ({
  db,
  docId,
  buildDoc,
  attempts = DEFAULT_ATTEMPTS,
  backoffMs = DEFAULT_BACKOFF_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) => {
  let lastError = null;
  let used = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    used = attempt;

    let existing = null;
    try {
      existing = await readExisting(db, docId);
    } catch (err) {
      // A failure while READING is not a conflict — fail fast.
      return { ok: false, error: err, attempts: attempt, conflicted: false };
    }

    const doc = buildDoc(existing);

    try {
      const written = await db.insert(doc);
      return { ok: true, doc, rev: written?.rev || null, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (!isConflictError(err)) {
        // A genuine failure — not retried.
        return { ok: false, error: err, attempts: attempt, conflicted: false };
      }
      if (attempt >= attempts) break;
      await sleep(backoffMs);
    }
  }

  return { ok: false, error: lastError, attempts: used, conflicted: true };
};

module.exports = {
  DEFAULT_ATTEMPTS,
  DEFAULT_BACKOFF_MS,
  isConflictError,
  readExisting,
  insertWithConflictRetry,
};
