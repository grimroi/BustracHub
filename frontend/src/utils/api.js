// src/utils/api.js
// Shared fetch wrapper for all backend API calls.
//
// Contract:
//   - apiFetch(path, options)
//     path: relative API path WITHOUT a leading "/api" and WITHOUT a
//           leading slash. Examples: 'login', 'blotter/send-summons',
//           'certificates/verify/abc123'.
//     options: standard RequestInit plus optional boolean
//              `redirectOn401` (default false) and `auth` (default true).
//
// URL construction: `${API_BASE}/api/${path}` where API_BASE is resolved
// exactly once from resolveApiBaseUrl(import.meta.env.VITE_API_URL).
//
// Security:
//   - The Bearer token is injected ONLY when `auth !== false` AND a token
//     is present. Public callers pass `auth: false` (or simply omit it
//     when no token exists) and never receive an automatic redirect.
//   - 401 on an authenticated request clears the stored token. A redirect
//     happens only when the caller explicitly passes redirectOn401: true,
//     and only when the current path is not /login (to avoid a redirect
//     loop) and not a public verification page.
//   - Duplicate redirects from concurrent 401s are suppressed by a
//     module-level flag.
//   - The token is never logged, never placed in a URL, and never included
//     in thrown error messages.
//   - The original Response is returned; callers decide how to parse it.

import { resolveApiBaseUrl } from './apiBase';
import { getToken, clearToken } from './tokenStore';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

if (!API_BASE || typeof API_BASE !== 'string' || !/^https?:\/\//i.test(API_BASE)) {
  throw new Error('api.js: unable to resolve a valid API base URL.');
}

let redirecting = false;

// Test-only reset for the duplicate-redirect guard. Not part of the
// public API; consumers must not depend on it.
export const __resetRedirectGuard = () => {
  redirecting = false;
};

const isPublicPath = () => {
  try {
    if (typeof window === 'undefined' || !window.location) return false;
    const path = `${window.location.pathname || ''}${window.location.search || ''}`;
    return /^\/login(\/|$|\?)/.test(path) || /^\/verify(\/|$|\?)/.test(path);
  } catch {
    return false;
  }
};

const doRedirect = (path) => {
  if (redirecting) return;
  redirecting = true;
  try {
    if (typeof window !== 'undefined' && window.location) {
      const target = `/login${path ? `?redirectTo=${encodeURIComponent(path)}` : ''}`;
      window.location.href = target;
    }
  } catch {
    // Redirect is best-effort; never throw out of a fetch handler.
  }
};

export const apiFetch = async (path, options = {}) => {
  if (typeof path !== 'string' || !path) {
    throw new Error('apiFetch: a relative API path is required.');
  }
  // Reject absolute URLs and traversal that could escape the API base.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path) || path.startsWith('//')) {
    throw new Error('apiFetch: absolute URLs are not allowed.');
  }
  if (path.startsWith('/') || path.startsWith('?') || path.startsWith('#')) {
    throw new Error('apiFetch: path must be relative without a leading slash.');
  }
  if (path.includes('..') || path.includes('\\')) {
    throw new Error('apiFetch: path traversal is not allowed.');
  }

  const url = `${API_BASE}/api/${path.replace(/^\/+/, '')}`;
  const { redirectOn401 = false, auth = true, ...fetchInit } = options;

  const headers = new Headers(fetchInit.headers || {});
  if (auth) {
    const token = getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let response;
  try {
    response = await fetch(url, { ...fetchInit, headers });
  } catch (err) {
    // Network failure: surface as a tagged error so callers can fall
    // back to offline behavior without conflating it with an HTTP status.
    const offline = new Error('Network request failed.');
    offline.kind = 'network';
    throw offline;
  }

  if (response.status === 401) {
    // Always clear a stale token; the server considers it invalid.
    clearToken();

    if (auth && redirectOn401 && !isPublicPath()) {
      doRedirect(window.location.pathname + window.location.search);
    }
    // Public callers and callers that opt out receive the Response as-is.
    return response;
  }

  if (response.status === 403) {
    const err = new Error('Forbidden.');
    err.kind = 'forbidden';
    err.status = 403;
    throw err;
  }

  return response;
};