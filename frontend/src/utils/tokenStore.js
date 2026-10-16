// src/utils/tokenStore.js
// Single source of truth for the server-issued online session token.
//
// Storage choice: sessionStorage, NOT localStorage.
//   - Survives a page reload within the same tab (so a refresh does not
//     force a re-login mid-shift).
//   - Cleared automatically when the tab closes, which limits the window
//     in which a stolen token is useful.
//   - Never persisted to the server; deleting this key does NOT revoke
//     the server-side session (see server/index.js SESSIONS Map).
//
// Offline login never calls setToken(). An absent token here means the
// caller has no valid server session and must not attempt authenticated
// requests.

const STORAGE_KEY = 'bustrac_session_token';

// Offline sessions are likewise per-tab: they exist only after a successful
// device-bound offline login and are ended by logout or a forced re-auth.
const OFFLINE_SESSION_KEY = 'bustrac_offline_session';

// Informs the sync layer (src/services/db.js) that auth state changed so it
// can start/stop live replication immediately instead of waiting for a
// network event or page reload.
const notifyTokenChanged = (token) => {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('bustrac:token-changed', { detail: { token: token || null } }));
    }
  } catch {
    // Best-effort only; sync falls back to the online/offline listeners.
  }
};

export const setOfflineSession = () => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(OFFLINE_SESSION_KEY, '1');
    }
  } catch {
    // Best-effort; an unavailable store simply means no offline session.
  }
};

export const hasOfflineSession = () => {
  try {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(OFFLINE_SESSION_KEY) === '1';
  } catch {
    return false;
  }
};

export const clearOfflineSession = () => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(OFFLINE_SESSION_KEY);
    }
  } catch {
    // Ignore — best-effort cleanup only.
  }
};

export const getToken = () => {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const value = sessionStorage.getItem(STORAGE_KEY);
    return value || null;
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (typeof sessionStorage === 'undefined') {
      notifyTokenChanged(token);
      return;
    }
    if (token === null) {
      sessionStorage.removeItem(STORAGE_KEY);
      notifyTokenChanged(null);
      return;
    }
    const value = String(token).trim();
    if (!value) {
      sessionStorage.removeItem(STORAGE_KEY);
      notifyTokenChanged(null);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, value);
    notifyTokenChanged(value);
  } catch {
    // Storage may be unavailable (private mode, quota). Fail silently;
    // authenticated requests will simply receive 401.
    notifyTokenChanged(token);
  }
};

export const clearActiveSessionOnly = () => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(OFFLINE_SESSION_KEY);
      sessionStorage.removeItem('bustrac_user');
    }
  } catch {
    // Ignore — best-effort cleanup only.
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bustrac_user');
      localStorage.removeItem('bustrac_role');
      localStorage.removeItem('bustrac_loginTime');
    }
  } catch {
    // Ignore.
  }
  notifyTokenChanged(null);
};

export const clearToken = () => {
  // Backward-compatible: clear active session only (retain offline auth cache).
  clearActiveSessionOnly();
};

export const clearDeviceAuthCache = async () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('bustrac_offline_auth');
    }
  } catch {
    // ignore
  }
  try {
    const { localDb } = await import('../services/db.js');
    const all = await localDb.allDocs({ include_docs: true });
    const dels = [];
    for (const r of all.rows) {
      const d = r.doc;
      if (d && d._id && d._id.startsWith('_local/user-')) {
        dels.push({ _id: d._id, _rev: d._rev, _deleted: true });
      }
    }
    if (dels.length) await localDb.bulkDocs(dels);
  } catch {
    // ignore
  }
  clearActiveSessionOnly();
};