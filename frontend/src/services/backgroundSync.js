// src/services/backgroundSync.js
//
// Service Worker registration + Background Sync plumbing.
//
// The page cannot guarantee a push happens before a tab is closed, so the
// browser itself must be able to finish the job. The Background Sync API lets
// the app register a `sync` tag; when connectivity returns, the browser wakes
// the service worker and asks it to flush the pending outbox.
//
// Everything in this module degrades gracefully:
//   * No service worker support  → `registerBackgroundSyncWorker()` resolves
//     to null and every other function becomes a no-op.
//   * No Background Sync support → `requestBackgroundSync()` resolves false;
//     the app falls back to replicating on `online` / on app start.

export const SYNC_TAG = 'bustrac-sync';
const SW_URL = '/sw.js';
const SW_SCOPE = '/';

/** True when the browser can register a Background Sync tag. */
export const supportsBackgroundSync = () => {
  try {
    return typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator
      && !!navigator.serviceWorker.sync
      && typeof navigator.serviceWorker.sync.register === 'function';
  } catch {
    return false;
  }
};

/** True when service workers are available at all. */
export const supportsServiceWorker = () => {
  try {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  } catch {
    return false;
  }
};

/**
 * Register the service worker.
 * Registration is idempotent: the PWA plugin already registers the same URL,
 * so this resolves with the existing registration when there is one.
 */
export const registerBackgroundSyncWorker = async () => {
  if (!supportsServiceWorker()) return null;
  try {
    const registration = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    return registration;
  } catch (err) {
    console.warn('[bg-sync] Service worker registration failed:', err?.message || err);
    return null;
  }
};

/**
 * Hand the service worker everything it needs to push on its own:
 * the session token, the API base URL, the remote database name and the
 * device id.
 */
export const pushServiceWorkerMeta = async (meta) => {
  if (!supportsServiceWorker()) return false;

  const payload = {
    type: 'BUSTRAC_SYNC_META',
    payload: {
      token: meta?.token || null,
      apiBase: meta?.apiBase || null,
      dbName: meta?.dbName || null,
      deviceId: meta?.deviceId || null,
    },
  };

  try {
    const registration = await navigator.serviceWorker.ready;
    const target = navigator.serviceWorker.controller || registration.active;
    if (!target) return false;
    target.postMessage(payload);
    return true;
  } catch (err) {
    console.warn('[bg-sync] Could not deliver sync metadata to the worker:', err?.message || err);
    return false;
  }
};

/**
 * Ask the browser to run the background sync when connectivity returns.
 * @returns {Promise<boolean>} true when the tag was registered.
 */
export const requestBackgroundSync = async (tag = SYNC_TAG) => {
  if (!supportsBackgroundSync()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register(tag);
    return true;
  } catch (err) {
    console.warn('[bg-sync] Could not register the background sync tag:', err?.message || err);
    return false;
  }
};
