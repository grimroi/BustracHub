// src/sw.js
//
// BustraChub service worker.
//
// Two jobs:
//   1. Keep the application shell available offline (classic precache +
//      navigation fallback), exactly as the previous Workbox-generated worker
//      did.
//   2. Finish the sync when the tab is gone. On a `sync` event tagged
//      `bustrac-sync` the worker drains the durable outbox
//      (utils/syncOutbox.js) straight to CouchDB through the server proxy.
//
// The worker is built with vite-plugin-pwa's `injectManifest` strategy, so
// `self.__WB_MANIFEST` is replaced at build time with the list of files to
// precache.

import { listOutbox, removeFromOutbox, loadSwMeta, saveSwMeta } from './utils/syncOutbox';

const CACHE_NAME = 'bustrac-precache-v1';
const RUNTIME_CACHE_NAME = 'bustrac-runtime-v1';
const SYNC_TAG = 'bustrac-sync';
const PRECACHE_URLS = self.__WB_MANIFEST || [];

const log = (...args) => {
  try {
    console.log('[bustrac-sw]', ...args);
  } catch {
    /* logging must never break the worker */
  }
};

// ─────────────────────────────────────────────
// INSTALL / ACTIVATE
// ─────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const urls = PRECACHE_URLS.map((entry) =>
        typeof entry === 'string' ? entry : entry.url
      ).filter(Boolean);

      await Promise.allSettled(
        urls.map(async (url) => {
          const request = new Request(url, { cache: 'reload' });
          const response = await fetch(request);
          if (response && (response.ok || response.type === 'opaque')) {
            await cache.put(url, response);
          }
        })
      );

      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* navigation preload is optional */
        }
      }
      await self.clients.claim();
    })()
  );
});

// ─────────────────────────────────────────────
// FETCH (offline shell)
// ─────────────────────────────────────────────

const isApiRequest = (url) => url.pathname.startsWith('/api/');

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // API traffic must never be served from the cache.
  if (url.origin === self.location.origin && isApiRequest(url)) return;

  // SPA navigation: network first, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preloaded = await event.preloadResponse;
          if (preloaded) return preloaded;
          const network = await fetch(request);
          const cache = await caches.open(RUNTIME_CACHE_NAME);
          cache.put(request, network.clone()).catch(() => {});
          return network;
        } catch {
          const cached =
            (await caches.match('/index.html')) ||
            (await caches.match(new URL('index.html', self.registration.scope).href));
          if (cached) return cached;
          return new Response('BustraChub is offline and the application shell is not cached yet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
      })()
    );
    return;
  }

  // Everything else: cache first for precached assets, stale-while-revalidate
  // for the rest.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const networkPromise = fetch(request)
        .then(async (response) => {
          if (response && response.ok && url.origin === self.location.origin) {
            const cache = await caches.open(RUNTIME_CACHE_NAME);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        networkPromise.catch(() => {});
        return cached;
      }

      const network = await networkPromise;
      if (network) return network;

      return new Response('', { status: 504, statusText: 'Offline' });
    })()
  );
});

// ─────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────

self.addEventListener('message', (event) => {
  const data = event?.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'BUSTRAC_SYNC_META') {
    event.waitUntil(
      saveSwMeta({
        token: data.payload?.token ?? null,
        apiBase: data.payload?.apiBase ?? null,
        dbName: data.payload?.dbName ?? null,
        deviceId: data.payload?.deviceId ?? null,
      }).catch(() => null)
    );
    return;
  }

  if (data.type === 'BUSTRAC_SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // A plain `message` trigger is also supported for browsers without the
  // Background Sync API (the app calls this on "online").
  if (data.type === 'BUSTRAC_FLUSH_OUTBOX') {
    event.waitUntil(
      drainOutbox().then((result) => {
        notifyClients({ type: 'BUSTRAC_SYNC_COMPLETE', ok: !!result.ok, source: 'outbox', result });
      })
    );
  }
});

// ─────────────────────────────────────────────
// BACKGROUND SYNC
// ─────────────────────────────────────────────

const buildHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const buildDocBody = (entry) => {
  const doc = entry?.doc || {};
  if (entry?.deleted || doc._deleted === true) {
    return { _id: doc._id, _rev: doc._rev, _deleted: true };
  }
  const body = { ...doc };
  delete body._conflicts;
  delete body._revisions;
  return body;
};

/**
 * Push every queued document to the server.
 *
 * The CouchDB replication protocol is followed in its simplest form:
 *   1. `_revs_diff` asks the server which revisions it is still missing.
 *   2. `_bulk_docs` sends only the missing revisions.
 *
 * Documents the server rejects (permissions, conflicts) are reported and left
 * in the outbox — the open application will resolve them properly.
 */
const drainOutbox = async () => {
  const meta = await loadSwMeta();
  if (!meta?.apiBase || !meta?.dbName) {
    return { ok: false, reason: 'no-endpoint', pushed: 0 };
  }
  if (!meta?.token) {
    return { ok: false, reason: 'no-session', pushed: 0 };
  }

  const items = await listOutbox();
  if (!items.length) {
    return { ok: true, pushed: 0, reason: 'empty' };
  }

  const base = `${String(meta.apiBase).replace(/\/+$/, '')}/api/sync/${meta.dbName}`;
  const headers = buildHeaders(meta.token);

  // 1. Which revisions does the server still need?
  const wanted = {};
  items.forEach((entry) => {
    const id = entry?.doc?._id;
    if (!id || !entry.rev) return;
    wanted[id] = wanted[id] || [];
    if (!wanted[id].includes(entry.rev)) wanted[id].push(entry.rev);
  });

  let missing = {};
  try {
    const res = await fetch(`${base}/_revs_diff`, {
      method: 'POST',
      headers,
      body: JSON.stringify(wanted),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: `auth-${res.status}`, pushed: 0 };
    }
    if (!res.ok) {
      return { ok: false, reason: `revs_diff-${res.status}`, pushed: 0 };
    }
    missing = await res.json();
  } catch (err) {
    return { ok: false, reason: `network-${err?.message || 'error'}`, pushed: 0 };
  }

  // 2. Send only the missing revisions.
  const docs = [];
  const pushedKeys = [];
  items.forEach((entry) => {
    const id = entry?.doc?._id;
    if (!id || !entry.rev) return;
    const needed = missing?.[id]?.missing;
    if (!Array.isArray(needed) || !needed.includes(entry.rev)) {
      // The server already has this revision — drop it from the outbox.
      pushedKeys.push(entry.key);
      return;
    }
    docs.push(buildDocBody(entry));
  });

  if (!docs.length) {
    if (pushedKeys.length) await removeFromOutbox(pushedKeys);
    return { ok: true, pushed: 0, reason: 'nothing-to-push' };
  }

  let results;
  try {
    const res = await fetch(`${base}/_bulk_docs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ docs, new_edits: true }),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: `auth-${res.status}`, pushed: 0 };
    }
    if (!res.ok) {
      return { ok: false, reason: `bulk_docs-${res.status}`, pushed: 0 };
    }
    results = await res.json();
  } catch (err) {
    return { ok: false, reason: `network-${err?.message || 'error'}`, pushed: 0 };
  }

  const accepted = new Set();
  (Array.isArray(results) ? results : []).forEach((row, index) => {
    if (row?.ok) {
      const entry = items[index];
      if (entry?.key) accepted.add(entry.key);
    }
  });

  if (accepted.size) {
    await removeFromOutbox(Array.from(accepted));
  }

  const failed = (Array.isArray(results) ? results : []).filter((row) => row && !row.ok);
  return {
    ok: failed.length === 0,
    pushed: accepted.size,
    failed: failed.length,
    reason: failed.length ? 'partial' : undefined,
  };
};

const notifyClients = (payload) => {
  try {
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        clients.forEach((client) => client.postMessage(payload));
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
};

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) return;

  event.waitUntil(
    (async () => {
      // Fast path: a live tab can run a proper PouchDB replication.
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (clients.length > 0) {
        const acknowledged = await new Promise((resolve) => {
          let settled = false;
          const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            self.removeEventListener('message', onMessage);
            resolve(value);
          };
          const onMessage = (messageEvent) => {
            if (messageEvent?.data?.type === 'BUSTRAC_SYNC_DONE') {
              finish(!!messageEvent.data.ok);
            }
          };
          const timer = setTimeout(() => finish(false), 10000);
          self.addEventListener('message', onMessage);
          clients.forEach((client) => client.postMessage({ type: 'BUSTRAC_RUN_SYNC' }));
        });

        if (acknowledged) {
          notifyClients({ type: 'BUSTRAC_SYNC_COMPLETE', ok: true, source: 'client' });
          return;
        }
      }

      // Slow path: push the durable outbox directly.
      const result = await drainOutbox();
      log('background sync finished', result);
      notifyClients({ type: 'BUSTRAC_SYNC_COMPLETE', ok: !!result.ok, source: 'outbox', result });
    })()
  );
});
