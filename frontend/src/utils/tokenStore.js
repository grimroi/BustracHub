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

export const clearToken = () => {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore — best-effort cleanup only.
  }
  notifyTokenChanged(null);
};