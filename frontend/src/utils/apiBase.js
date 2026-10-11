// src/utils/apiBase.js
// Resolves the backend API base URL in a way that works both on the dev machine
// and from other devices (phones) on the same Wi-Fi.
//
// The problem this solves: a bundled VITE_API_URL of http://localhost:5000 is
// baked into the production build. When the app is opened from a phone, the
// phone resolves "localhost" to itself and every API call fails. We therefore
// rewrite a loopback API URL to the page's own host when the page is *not*
// served from loopback.

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'];

export const isLoopbackHost = (host) => {
  const value = String(host || '').toLowerCase().trim();
  if (!value) return false;
  return LOOPBACK_HOSTS.includes(value) || value.startsWith('127.');
};

const stripTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

// Builds the authenticated PouchDB sync endpoint as
// `${apiBase}/api/sync/${couchDbName}/` (explicit trailing slash).
//
// PouchDB's HTTP adapter derives the database name from the LAST non-empty
// path segment of the endpoint URL and everything before it as the URL path
// prefix (see getHost() in pouchdb-browser). It also strips a trailing slash
// while parsing, so `…/api/sync/<dbName>` and `…/api/sync/<dbName>/` resolve
// to the same DB URL. This helper normalizes both inputs so the endpoint is
// always exactly `…/api/sync/<dbName>/`, making the hierarchy explicit and
// ensuring checkpointer (`_local/...`) and changes (`_changes`) sub-requests
// resolve under the database name rather than the bare `/api/sync` prefix.
export const buildSyncEndpoint = (apiBase, couchDbName = 'bustrachub_db') => {
  const base = stripTrailingSlash(apiBase);
  const dbSlug = String(couchDbName || 'bustrachub_db')
    .trim()
    .replace(/^\/+|\/+$/g, '');
  return `${base}/api/sync/${dbSlug}`;
};

// Pure + testable. `envUrl` = import.meta.env.VITE_API_URL, `location` = window.location.
export const resolveApiBaseUrl = (envUrl, location) => {
  const env = stripTrailingSlash(envUrl || '');
  const loc = location || (typeof window !== 'undefined' ? window.location : null);
  const pageHost = loc && loc.hostname ? loc.hostname : '';
  const pageProtocol = (loc && loc.protocol) || 'http:';

  if (env) {
    try {
      const parsed = new URL(env);
      const envHost = parsed.hostname;
      const envPort = parsed.port || '';
      // Rewrite a loopback API URL to the page's host when viewed remotely.
      if (isLoopbackHost(envHost) && pageHost && !isLoopbackHost(pageHost)) {
        return stripTrailingSlash(`${pageProtocol}//${pageHost}${envPort ? `:${envPort}` : ':5000'}`);
      }
      return stripTrailingSlash(`${parsed.protocol}//${parsed.host}`);
    } catch {
      return env;
    }
  }

  if (pageHost) {
    return stripTrailingSlash(`${pageProtocol}//${pageHost}:5000`);
  }
  return 'http://localhost:5000';
};
