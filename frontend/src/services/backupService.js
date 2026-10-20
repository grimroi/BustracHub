// src/services/backupService.js
//
// Automated local & remote backups.
//
// Previously the only backup was a manual JSON export. If the machine died
// between exports everything since the last export was gone. This service
// adds:
//
//   * `handleAutoBackup()`  — writes a timestamped JSON snapshot of the whole
//     local PouchDB, either into a real "BustraChub Backups" folder (File
//     System Access API) or as an automatic download when that API is not
//     available.
//   * `scheduleAutoBackup()` — runs the above every X hours (X configurable in
//     Barangay Settings).
//   * `uploadSnapshotToCloud()` — optional off-site copy to any S3-compatible
//     / Google Drive style endpoint when an API key is configured.
//   * `claimUnsyncedRecords()` — import a backup taken from a lost device and
//     merge the non-conflicting documents back into the central database.
//
// Everything degrades gracefully: no File System Access API, no cloud key, no
// background timer — the app still works, the user is just told what is
// unavailable.

import { localDb } from './db';
import { loadMetaRecord, saveMetaRecord, removeMetaRecord } from '../utils/syncOutbox';
import { createAuditLog } from '../utils/auditLog';
import { getDeviceId, getDeviceLabel, getLastSnapshotAt, setLastSnapshotAt } from './deviceRegistry';
import {
  buildSnapshotArtifact,
  buildSnapshotFileName,
  encryptSnapshotArtifact,
  isEncryptionSupported,
  verifySnapshotArtifact,
} from './snapshotService';

const BACKUP_DIR_HANDLE_KEY = 'backup_dir_handle';
const SETTINGS_DOC_ID = 'setting_data_protection';
// Default scheduled-snapshot interval: once a day.
const DEFAULT_SNAPSHOT_INTERVAL_HOURS = 24;

export { getLastSnapshotAt, setLastSnapshotAt };

const DEFAULT_SETTINGS = {
  autoBackupEnabled: true,
  autoBackupIntervalHours: DEFAULT_SNAPSHOT_INTERVAL_HOURS,
  autoBackupFolderName: 'BustraChub Backups',
  cloudUploadEnabled: false,
  cloudUploadUrl: '',
  cloudUploadApiKey: '',
  cloudUploadProvider: 's3',
  lastAutoBackupAt: null,
  lastAutoBackupPath: null,
  lastAutoBackupDocCount: 0,
  lastSnapshotAt: null,
  keepLocalCopies: 30,
};

let autoBackupTimer = null;
let autoBackupRunning = false;

// ─────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────

/** Read the data-protection settings (falls back to sensible defaults). */
export const getBackupSettings = async () => {
  try {
    const doc = await localDb.get(SETTINGS_DOC_ID);
    return { ...DEFAULT_SETTINGS, ...(doc || {}), _rev: doc?._rev };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
};

/**
 * Persist the data-protection settings.
 * @param {object} patch
 */
export const saveBackupSettings = async (patch = {}) => {
  const current = await getBackupSettings();
  const next = { ...current, ...patch };
  delete next._rev;

  const payload = {
    ...next,
    _id: SETTINGS_DOC_ID,
    type: 'barangay_settings',
    updatedAt: new Date().toISOString(),
  };

  try {
    const res = await localDb.put(payload);
    return { ...payload, _rev: res.rev };
  } catch (err) {
    if (err?.status === 409) {
      const fresh = await localDb.get(SETTINGS_DOC_ID);
      const retry = await localDb.put({ ...payload, _rev: fresh._rev });
      return { ...payload, _rev: retry.rev };
    }
    throw err;
  }
};

// ─────────────────────────────────────────────
// SNAPSHOT
// ─────────────────────────────────────────────

/**
 * Build a JSON snapshot of the whole local database.
 *
 * The shape is backwards compatible with the existing manual export
 * (`{ app, exportDate, rows }`) so old backup files can still be imported,
 * and it additionally carries:
 *   * a schema/version header (`schema`, `schemaVersion`),
 *   * the device id and label,
 *   * an `integrity` block with a SHA-256 checksum over the payload.
 */
export const exportLocalSnapshot = async ({ exportDate = null } = {}) => {
  const allDocs = await localDb.allDocs({ include_docs: true });
  const cleanRows = allDocs.rows.filter(
    (r) => r.doc && !String(r.doc._id).startsWith('_local/') && !String(r.doc._id).startsWith('_design/')
  );

  return buildSnapshotArtifact({
    rows: cleanRows,
    deviceId: getDeviceId(),
    deviceLabel: getDeviceLabel(),
    exportDate,
  });
};

/** The file name for a snapshot: device id + exact timestamp. */
export const buildSnapshotName = ({ deviceId = null, timestamp = null } = {}) =>
  buildSnapshotFileName({ deviceId: deviceId || getDeviceId(), timestamp });

const buildFileName = (prefix = 'BustraChub_Backup') => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `${prefix}_${stamp}.json`;
};

/** Trigger a normal browser download of a snapshot. */
export const downloadSnapshot = (snapshot, fileName) => {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || buildFileName();
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return a.download;
};

// ─────────────────────────────────────────────
// FILE SYSTEM ACCESS API
// ─────────────────────────────────────────────

export const supportsFileSystemAccess = () => {
  try {
    return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  } catch {
    return false;
  }
};

/** Ask the user for the backup folder and remember the handle. */
export const chooseBackupDirectory = async () => {
  if (!supportsFileSystemAccess()) {
    throw new Error('This browser does not support the File System Access API.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'bustrac-backups' });
  await saveMetaRecord({ id: BACKUP_DIR_HANDLE_KEY, handle, pickedAt: new Date().toISOString() });
  return handle;
};

/** The remembered backup folder, if the user granted one and it is still valid. */
export const getBackupDirectoryHandle = async () => {
  const record = await loadMetaRecord(BACKUP_DIR_HANDLE_KEY);
  if (!record?.handle) return null;
  try {
    // `queryPermission` is only available on Chromium-based browsers.
    if (typeof record.handle.queryPermission === 'function') {
      const state = await record.handle.queryPermission({ mode: 'readwrite' });
      if (state === 'denied') return null;
    }
    return record.handle;
  } catch {
    return null;
  }
};

/** Forget the granted folder. */
export const forgetBackupDirectory = async () => removeMetaRecord(BACKUP_DIR_HANDLE_KEY);

/**
 * Write the snapshot into the granted folder.
 * @returns {Promise<{ok:boolean, fileName?:string, error?:string}>}
 */
export const writeSnapshotToDirectory = async (snapshot, fileName) => {
  const handle = await getBackupDirectoryHandle();
  if (!handle) return { ok: false, error: 'no-directory' };

  const name = fileName || buildFileName();
  try {
    const permission = typeof handle.requestPermission === 'function'
      ? await handle.requestPermission({ mode: 'readwrite' })
      : 'granted';
    if (permission !== 'granted') {
      return { ok: false, error: 'permission-denied' };
    }
    const fileHandle = await handle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(snapshot, null, 2));
    await writable.close();
    return { ok: true, fileName: name };
  } catch (err) {
    return { ok: false, error: err?.message || 'write-failed' };
  }
};

// ─────────────────────────────────────────────
// CLOUD UPLOAD
// ─────────────────────────────────────────────

/**
 * Upload a snapshot to a configured cloud endpoint.
 *
 * The endpoint contract is intentionally simple so it can be satisfied by
 * S3-compatible object storage, Google Drive's file API, or a small internal
 * receiver: a single `PUT` with the JSON body and the API key in the
 * `Authorization: Bearer` header.
 */
export const uploadSnapshotToCloud = async (snapshot, settings = null) => {
  const config = settings || (await getBackupSettings());
  if (!config?.cloudUploadEnabled) return { ok: false, error: 'disabled' };
  if (!config.cloudUploadUrl) return { ok: false, error: 'no-url' };
  if (!config.cloudUploadApiKey) return { ok: false, error: 'no-api-key' };

  const fileName = buildFileName('BustraChub_Backup');
  const headers = { 'Content-Type': 'application/json' };
  if (config.cloudUploadProvider === 'google-drive') {
    headers['Authorization'] = `Bearer ${config.cloudUploadApiKey}`;
  } else {
    headers['Authorization'] = `Bearer ${config.cloudUploadApiKey}`;
  }

  try {
    const res = await fetch(config.cloudUploadUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ ...snapshot, fileName }),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true, fileName };
  } catch (err) {
    return { ok: false, error: err?.message || 'upload-failed' };
  }
};

// ─────────────────────────────────────────────
// AUTO BACKUP / SCHEDULED SNAPSHOT
// ─────────────────────────────────────────────

/**
 * Perform one automatic backup.
 * Produces the hardened snapshot artifact (schema header + integrity
 * checksum), writes it to the backup folder (or downloads it), and records
 * the snapshot time so it can be reported to the device registry.
 *
 * Safe to call at any time; it never throws.
 *
 * @param {object} [options]
 * @param {string} [options.passphrase] encrypt the artifact with AES-256-GCM
 */
export const handleAutoBackup = async (options = {}) => {
  if (autoBackupRunning) {
    return { ok: false, error: 'already-running' };
  }
  autoBackupRunning = true;

  try {
    const settings = options.settings || (await getBackupSettings());
    const snapshot = await exportLocalSnapshot();
    const fileName = buildSnapshotName({ timestamp: snapshot.exportDate });

    // Optional encryption. Only possible where WebCrypto is available.
    let payload = snapshot;
    let encrypted = false;
    if (options.passphrase) {
      if (!isEncryptionSupported()) {
        return {
          ok: false,
          error: 'encryption-unavailable',
          message:
            'Encryption needs a secure context (https or localhost). The snapshot was not written.',
        };
      }
      payload = await encryptSnapshotArtifact(snapshot, options.passphrase);
      encrypted = true;
    }

    let written = { ok: false, error: 'no-writer' };
    let mode = 'download';

    if (settings.autoBackupToDirectory !== false) {
      written = await writeSnapshotToDirectory(payload, fileName);
      if (written.ok) mode = 'directory';
    }

    if (!written.ok && settings.autoDownloadFallback !== false) {
      try {
        downloadSnapshot(payload, fileName);
        written = { ok: true, fileName };
        mode = 'download';
      } catch (err) {
        written = { ok: false, error: err?.message || 'download-failed' };
      }
    }

    let cloud = { ok: false, error: 'skipped' };
    if (settings.cloudUploadEnabled) {
      cloud = await uploadSnapshotToCloud(payload, settings);
    }

    const now = new Date().toISOString();
    const snapshotAt = setLastSnapshotAt(now);
    await saveBackupSettings({
      lastAutoBackupAt: now,
      lastAutoBackupPath: mode === 'directory' ? `${settings.autoBackupFolderName || 'BustraChub Backups'}/${fileName}` : fileName,
      lastAutoBackupDocCount: snapshot.docCount,
      lastSnapshotAt: snapshotAt,
    }).catch(() => {});

    await createAuditLog({
      action: 'AUTO_BACKUP',
      module: 'SYSTEM',
      recordId: 'FULL_DB',
      details:
        `Automated backup written (${mode}, ${snapshot.docCount} documents` +
        (encrypted ? ', encrypted' : '') +
        (cloud.ok ? ', uploaded to cloud' : '') +
        ').',
      meta: {
        mode,
        fileName,
        docCount: snapshot.docCount,
        cloudOk: cloud.ok,
        deviceId: snapshot.deviceId,
        encrypted,
        snapshotAt,
        integrity: snapshot.integrity,
      },
    }).catch(() => {});

    return { ok: true, mode, fileName, docCount: snapshot.docCount, cloud, encrypted, snapshotAt };
  } catch (err) {
    console.warn('[backup] Automatic backup failed:', err?.message || err);
    return { ok: false, error: err?.message || 'backup-failed' };
  } finally {
    autoBackupRunning = false;
  }
};

/**
 * Start the periodic snapshot timer.
 * The default interval is daily (24 hours).
 *
 * @param {object} [options]
 * @param {number} [options.intervalHours]
 * @param {boolean} [options.runImmediately]
 */
export const scheduleSnapshot = async (options = {}) => {
  stopAutoBackup();

  const intervalHours = Number(options.intervalHours) > 0
    ? Number(options.intervalHours)
    : DEFAULT_SNAPSHOT_INTERVAL_HOURS;
  const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;

  autoBackupTimer = setInterval(() => {
    handleAutoBackup(options).catch(() => {});
  }, intervalMs);

  if (options.runImmediately) {
    // Delay slightly so the first snapshot does not compete with app start-up.
    setTimeout(() => handleAutoBackup(options).catch(() => {}), 5000);
  }

  return { scheduled: true, intervalHours, intervalMs };
};

/**
 * Start the periodic backup timer.
 * @param {object} [options]
 * @param {number} [options.intervalHours]
 * @param {boolean} [options.runImmediately]
 */
export const scheduleAutoBackup = async (options = {}) => {
  const settings = options.settings || (await getBackupSettings());
  const enabled = options.enabled ?? settings.autoBackupEnabled;

  if (!enabled) {
    stopAutoBackup();
    return { scheduled: false, reason: 'disabled' };
  }

  return scheduleSnapshot({
    intervalHours: options.intervalHours ?? settings.autoBackupIntervalHours ?? DEFAULT_SNAPSHOT_INTERVAL_HOURS,
    runImmediately: options.runImmediately,
    passphrase: options.passphrase,
  });
};

/** Stop the periodic backup timer. */
export const stopAutoBackup = () => {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
};

// ─────────────────────────────────────────────
// RECOVERY: CLAIM UNSYNCED RECORDS
// ─────────────────────────────────────────────

/**
 * Import a backup file produced on a lost device and merge the documents into
 * the local database (which then replicates them to the central CouchDB).
 *
 * Merge rules:
 *   * A document that does not exist locally is inserted as-is.
 *   * A document that exists locally is only overwritten when the backup copy
 *     is NEWER (by `updatedAt`) — otherwise the local copy wins and the
 *     conflict is left for the normal conflict-resolution screen.
 *
 * @param {object|string|File} source parsed backup JSON, its text, or a File
 * @returns {Promise<{ok:boolean, inserted:number, skipped:number, conflicts:number}>}
 */
export const claimUnsyncedRecords = async (source) => {
  let data = source;
  if (typeof source === 'string') {
    try {
      data = JSON.parse(source);
    } catch {
      return { ok: false, error: 'invalid-json' };
    }
  } else if (typeof File !== 'undefined' && source instanceof File) {
    try {
      data = JSON.parse(await source.text());
    } catch {
      return { ok: false, error: 'invalid-json' };
    }
  }

  const rawDocs = Array.isArray(data?.rows)
    ? data.rows.map((r) => r?.doc).filter(Boolean)
    : Array.isArray(data)
      ? data
      : [];

  // Integrity check: a snapshot produced by the hardened exporter carries a
  // SHA-256 checksum. A legacy export (no `integrity` block) is accepted, but
  // a snapshot whose checksum does NOT match is refused — it may be truncated
  // or tampered with.
  let integrity = { checked: false, valid: true, reason: 'no-integrity-block' };
  if (data && typeof data === 'object' && data.integrity) {
    integrity = { checked: true, ...verifySnapshotArtifact(data) };
    if (!integrity.valid) {
      await createAuditLog({
        action: 'CLAIM_UNSYNCED_RECORDS',
        module: 'SYSTEM',
        recordId: 'FULL_DB',
        details: `Refused a backup file that failed its integrity check (${integrity.reason}).`,
        meta: { refused: true, reason: integrity.reason },
      }).catch(() => {});
      return { ok: false, error: 'integrity-check-failed', reason: integrity.reason };
    }
  }

  if (rawDocs.length === 0) {
    return { ok: false, error: 'no-documents' };
  }

  const candidates = rawDocs.filter((doc) => doc?._id && !String(doc._id).startsWith('_local/'));
  const inserted = [];
  const skipped = [];
  const conflicts = [];

  for (const doc of candidates) {
    try {
      const existing = await localDb.get(doc._id);
      const backupTime = new Date(doc.updatedAt || doc.createdAt || 0).getTime() || 0;
      const localTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime() || 0;

      if (backupTime > localTime) {
        // Newer copy from the lost device: take it, but keep the local rev so
        // the write does not conflict with the current winning revision.
        const payload = { ...doc, _id: existing._id, _rev: existing._rev, updatedAt: doc.updatedAt || existing.updatedAt };
        delete payload._conflicts;
        delete payload._revisions;
        await localDb.put(payload);
        inserted.push(doc._id);
      } else {
        skipped.push(doc._id);
      }
    } catch (err) {
      if (err?.status === 404) {
        const payload = { ...doc };
        delete payload._rev;
        delete payload._conflicts;
        delete payload._revisions;
        try {
          await localDb.put(payload);
          inserted.push(doc._id);
        } catch {
          conflicts.push(doc._id);
        }
      } else {
        conflicts.push(doc._id);
      }
    }
  }

  await createAuditLog({
    action: 'CLAIM_UNSYNCED_RECORDS',
    module: 'SYSTEM',
    recordId: 'FULL_DB',
    details:
      `Claimed records from a recovered device backup: ${inserted.length} imported, ` +
      `${skipped.length} kept local, ${conflicts.length} need review.`,
    meta: {
      inserted: inserted.length,
      skipped: skipped.length,
      conflicts: conflicts.length,
      sourceDeviceId: data?.deviceId || null,
      integrityChecked: integrity.checked,
      integrityValid: integrity.valid,
    },
  }).catch(() => {});

  return { ok: true, inserted, skipped, conflicts, integrity };
};
