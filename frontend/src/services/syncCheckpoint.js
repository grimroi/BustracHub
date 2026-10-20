// src/services/syncCheckpoint.js
//
// Mandatory end-of-day sync checkpoint.
//
// The offline-first architecture means a device can legitimately hold records
// that have not yet been replicated. If the device is then damaged, formatted
// or stolen, those records are lost with it. The checkpoint turns that silent
// risk into an explicit, auditable procedure: before the device is closed for
// the day, the application verifies that the replication queue is empty and
// records the confirmation in the audit trail.
//
// The policy lives here (not in the page component) so it can be unit-tested
// without a browser, and so the admin UI and any future surface (e.g. a
// service worker) enforce exactly the same rule.
import { createAuditLog } from '../utils/auditLog';
import { getDeviceId } from './deviceRegistry';

export const SYNC_CHECKPOINT_ACTION = 'END_OF_DAY_SYNC_CONFIRMED';
export const SYNC_CHECKPOINT_MODULE = 'SYSTEM';

/**
 * Decide whether the device may be closed for the day.
 *
 * @param {object} params
 * @param {number} [params.pendingCount] unsynced local documents
 * @returns {{allowed:boolean, pendingCount:number, reason:string}}
 */
export const evaluateSyncCheckpoint = ({ pendingCount = 0 } = {}) => {
  const pending = Number(pendingCount) || 0;
  if (pending > 0) {
    return {
      allowed: false,
      pendingCount: pending,
      reason:
        `${pending} unsynced change${pending === 1 ? '' : 's'} are still queued on this device. ` +
        'They would be lost if the device were damaged, formatted or stolen before the next connection.',
    };
  }
  return {
    allowed: true,
    pendingCount: 0,
    reason: 'All local changes have been replicated to the server.',
  };
};

/**
 * Build the (non-dismissible) warning shown while the queue is not empty.
 * The options are produced here so the "cannot be waved away" property is
 * covered by a test rather than by inspection.
 *
 * @param {object} params
 * @param {number} params.pendingCount
 * @param {string} [params.deviceId]
 * @returns {object} SweetAlert2 options
 */
export const buildSyncCheckpointAlertOptions = ({ pendingCount = 0, deviceId = null } = {}) => {
  const pending = Number(pendingCount) || 0;
  const plural = pending === 1 ? 'change' : 'changes';
  return {
    title: 'Sync required before closing for the day',
    html:
      `<div style="text-align:left;font-size:13px;line-height:1.55">` +
      `<p style="margin:0 0 8px"><strong>${pending} unsynced ${plural} ${pending === 1 ? 'is' : 'are'} still queued on this device.</strong></p>` +
      `<p style="margin:0 0 8px;color:#64748b">` +
      'Records that have not been replicated are only stored on this device. If it is damaged, formatted or ' +
      'stolen before the next connection, they are lost permanently.' +
      `</p>` +
      (deviceId
        ? `<p style="margin:0;color:#64748b">Device: <code>${deviceId}</code></p>`
        : '') +
      `</div>`,
    icon: 'warning',
    // Non-dismissible: the operator must either sync or cancel the close.
    showCancelButton: false,
    allowOutsideClick: false,
    allowEscapeKey: false,
    confirmButtonText: 'Sync Now',
    confirmButtonColor: '#dc2626',
  };
};

const readCurrentActor = () => {
  try {
    const raw = localStorage.getItem('bustrac_user');
    if (!raw) return 'system';
    const parsed = JSON.parse(raw);
    return parsed?.username || parsed?.fullName || raw;
  } catch {
    return 'system';
  }
};

/**
 * Write the audit entry for a confirmed end-of-day checkpoint.
 *
 * @param {object} params
 * @param {number} [params.pendingAtStart] unsynced count when the checkpoint began
 * @param {number} [params.syncedCount]    how many of those were replicated
 * @param {string} [params.deviceId]
 * @param {string} [params.actor]
 * @param {string} [params.timestamp]
 * @returns {Promise<object>} the createAuditLog result
 */
export const writeSyncCheckpointAudit = async ({
  pendingAtStart = 0,
  syncedCount = 0,
  deviceId = null,
  actor = null,
  timestamp = null,
} = {}) => {
  const id = deviceId || getDeviceId();
  const stamp = timestamp || new Date().toISOString();
  const resolvedActor = actor || readCurrentActor();

  return createAuditLog({
    action: SYNC_CHECKPOINT_ACTION,
    module: SYNC_CHECKPOINT_MODULE,
    recordId: id,
    details:
      `End-of-day sync confirmed on device ${id}. ` +
      `Pending at start: ${pendingAtStart}. Changes replicated: ${syncedCount}. ` +
      `Actor: ${resolvedActor}.`,
    meta: {
      deviceId: id,
      actor: resolvedActor,
      pendingAtStart: Number(pendingAtStart) || 0,
      syncedCount: Number(syncedCount) || 0,
      timestamp: stamp,
    },
  });
};

/**
 * Run the checkpoint.
 *
 * The queue is measured, then an attempt is made to replicate it. The
 * checkpoint only passes when the queue is empty afterwards; the audit entry
 * is written on success and NOT written on a blocked close.
 *
 * @param {object} deps
 * @param {() => Promise<number>} deps.getPendingCount  current unsynced count
 * @param {() => Promise<any>}    deps.syncNow           force a replication
 * @param {(entry:object) => Promise<any>} [deps.writeAudit] audit writer (injectable)
 * @param {string} [deps.deviceId]
 * @param {string} [deps.timestamp]
 * @returns {Promise<{ok:boolean, blocked:boolean, pendingAtStart:number, pendingAfter:number, syncedCount:number, reason:string, audit?:any}>}
 */
export const runSyncCheckpoint = async ({
  getPendingCount,
  syncNow,
  writeAudit = writeSyncCheckpointAudit,
  deviceId = null,
  timestamp = null,
} = {}) => {
  if (typeof getPendingCount !== 'function' || typeof syncNow !== 'function') {
    throw new Error('runSyncCheckpoint requires getPendingCount and syncNow functions.');
  }

  const pendingAtStart = Math.max(0, Number(await getPendingCount()) || 0);

  if (pendingAtStart === 0) {
    // Nothing was queued: the close is allowed and is recorded.
    const audit = await writeAudit({
      pendingAtStart: 0,
      syncedCount: 0,
      deviceId,
      timestamp,
    });
    return {
      ok: true,
      blocked: false,
      pendingAtStart: 0,
      pendingAfter: 0,
      syncedCount: 0,
      reason: 'All local changes have been replicated to the server.',
      audit,
    };
  }

  // Something is queued: try to replicate it before deciding.
  let syncError = null;
  try {
    await syncNow();
  } catch (err) {
    syncError = err;
  }

  const pendingAfter = Math.max(0, Number(await getPendingCount()) || 0);

  if (pendingAfter > 0) {
    return {
      ok: false,
      blocked: true,
      pendingAtStart,
      pendingAfter,
      syncedCount: Math.max(0, pendingAtStart - pendingAfter),
      reason:
        `${pendingAfter} unsynced change${pendingAfter === 1 ? '' : 's'} could not be replicated` +
        (syncError ? ` (${syncError?.message || 'sync error'})` : '') +
        '. The device must not be closed for the day until the queue is empty.',
      audit: null,
    };
  }

  const syncedCount = pendingAtStart;
  const audit = await writeAudit({
    pendingAtStart,
    syncedCount,
    deviceId,
    timestamp,
  });

  return {
    ok: true,
    blocked: false,
    pendingAtStart,
    pendingAfter: 0,
    syncedCount,
    reason: `All ${syncedCount} queued change${syncedCount === 1 ? '' : 's'} were replicated to the server.`,
    audit,
  };
};
