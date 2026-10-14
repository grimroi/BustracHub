// Lightweight offline-first notification service.
//
// Notifications are kept in a single PouchDB `_local/` document. `_local/`
// documents never replicate (the db.js replication filter explicitly excludes
// them for every role), so notifications stay device-local and can never
// pollute the shared CouchDB or fail an admin/staff bulk push.
import { localDb } from './db';

const STORE_ID = '_local/notifications_store';

export const createNotificationId = () => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `notif_${ts}${rand}`;
};

const readStore = async () => {
  if (!localDb) return { doc: null, items: [] };
  try {
    const doc = await localDb.get(STORE_ID);
    return { doc, items: Array.isArray(doc.items) ? doc.items : [] };
  } catch (err) {
    if (err && err.status === 404) return { doc: null, items: [] };
    throw err;
  }
};

const writeStore = async (doc, items) => {
  if (!localDb) return null;
  const next = { ...(doc || {}), _id: STORE_ID, items };
  return localDb.put(next);
};

// Serialize read-modify-write cycles so rapid notifications (e.g. a loop that
// fires many createNotification calls) cannot clobber each other.
let writeChain = Promise.resolve();
const enqueue = (fn) => {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

export const createNotification = async (data = {}) => {
  if (!localDb) return null;
  const now = new Date().toISOString();
  try {
    return await enqueue(async () => {
      const { doc, items } = await readStore();
      if (data.dedupeKey && items.some((n) => n.dedupeKey === data.dedupeKey)) {
        return null;
      }
      const entry = {
        _id: createNotificationId(),
        type: 'notification',
        for: data.for || 'resident', // 'resident' | 'admin'
        userId: data.userId || null,
        category: data.category || 'general',
        title: data.title || 'Notification',
        body: data.body || '',
        link: data.link || null,
        refId: data.refId || null,
        dedupeKey: data.dedupeKey || null,
        read: false,
        createdAt: now,
        updatedAt: now,
      };
      // Keep the newest first and cap the local history to a reasonable size.
      const trimmed = [entry, ...items].slice(0, 200);
      await writeStore(doc, trimmed);
      return entry;
    });
  } catch (err) {
    console.warn('createNotification failed:', err?.message || err);
    return null;
  }
};

export const getUnreadCount = (notifs = []) => {
  return (notifs || []).filter((n) => !n.read).length;
};

export const markNotificationRead = async (id) => {
  if (!localDb || !id) return null;
  try {
    return await enqueue(async () => {
      const { doc, items } = await readStore();
      let changed = false;
      const now = new Date().toISOString();
      const next = items.map((n) => {
        if (n._id === id && !n.read) {
          changed = true;
          return { ...n, read: true, updatedAt: now };
        }
        return n;
      });
      if (changed) await writeStore(doc, next);
      return changed;
    });
  } catch (err) {
    console.warn('markNotificationRead failed:', err?.message || err);
    return null;
  }
};

export const markAllReadForUser = async (forRole, userId = null) => {
  if (!localDb) return 0;
  try {
    return await enqueue(async () => {
      const { doc, items } = await readStore();
      const now = new Date().toISOString();
      let count = 0;
      const next = items.map((n) => {
        const matches =
          n.for === forRole && (!userId || n.userId === userId) && !n.read;
        if (matches) {
          count++;
          return { ...n, read: true, updatedAt: now };
        }
        return n;
      });
      if (count > 0) await writeStore(doc, next);
      return count;
    });
  } catch (err) {
    console.warn('markAllReadForUser failed:', err?.message || err);
    return 0;
  }
};

export const fetchNotifications = async (forRole = null, userId = null) => {
  try {
    const { items } = await readStore();
    let notifs = items;
    if (forRole) notifs = notifs.filter((n) => n.for === forRole);
    if (userId) notifs = notifs.filter((n) => n.userId === userId);
    return notifs.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
    );
  } catch (err) {
    console.warn('fetchNotifications failed:', err?.message || err);
    return [];
  }
};
