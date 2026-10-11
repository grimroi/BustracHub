// src/utils/qrConfig.js
// Configurable QR verification settings for the Business Clearance workflow.

export const BUSINESS_QR_CONFIG_ID = 'setting_business_qr';

export const DEFAULT_BUSINESS_QR_CONFIG = {
  enabled: true,
  baseUrl: '',
  size: 92,
  level: 'H',
  includeMargin: true,
  label: 'Scan to Verify Authenticity',
};

// Hosts that should default to http:// (local machine / LAN / mDNS).
// Public host names default to https://.
const PRIVATE_HOST_PATTERN =
  /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|[a-z0-9-]+\.local)(:\d+)?(\/.*)?$/i;
const UNSUPPORTED_SCHEME = /^(javascript|data|vbscript|file|blob|about):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export const normalizeQrConfig = (config = {}) => ({
  ...DEFAULT_BUSINESS_QR_CONFIG,
  ...(config || {}),
  size: Number(config?.size) || DEFAULT_BUSINESS_QR_CONFIG.size,
  level: config?.level || DEFAULT_BUSINESS_QR_CONFIG.level,
  includeMargin:
    config?.includeMargin === undefined
      ? DEFAULT_BUSINESS_QR_CONFIG.includeMargin
      : Boolean(config.includeMargin),
  enabled:
    config?.enabled === undefined
      ? DEFAULT_BUSINESS_QR_CONFIG.enabled
      : Boolean(config.enabled),
  baseUrl: String(config?.baseUrl || '').trim(),
});

// Validates an admin-entered verification base URL.
// Blank is allowed and means "auto-detect from the current site".
export const validateBaseUrl = (value) => {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return { ok: true, normalized: '', error: '' };
  }
  if (/\s/.test(raw)) {
    return { ok: false, normalized: raw, error: 'The URL must not contain spaces.' };
  }
  if (UNSUPPORTED_SCHEME.test(raw)) {
    return { ok: false, normalized: raw, error: 'Only http:// or https:// URLs are allowed.' };
  }

  let withScheme = raw;
  if (!HAS_SCHEME.test(raw)) {
    withScheme = PRIVATE_HOST_PATTERN.test(raw) ? `http://${raw}` : `https://${raw}`;
  }

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return {
      ok: false,
      normalized: raw,
      error: 'Enter a valid host or URL, e.g. 192.168.1.10:5173 or https://bustrachub.gov.ph',
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, normalized: raw, error: 'Only http:// or https:// URLs are allowed.' };
  }
  if (!url.hostname) {
    return { ok: false, normalized: raw, error: 'The URL is missing a host name.' };
  }

  const path = url.pathname.replace(/\/+$/, '');
  return { ok: true, normalized: `${url.origin}${path}`, error: '' };
};

// Returns true when an origin points at the local machine (loopback).
// Such links are NOT reachable from phones on the same Wi-Fi.
export const isLoopbackOrigin = (origin) => {
  const raw = String(origin || '').trim();
  if (!raw) return false;
  const withScheme = HAS_SCHEME.test(raw) ? raw : `http://${raw}`;
  try {
    const { hostname } = new URL(withScheme);
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname);
  } catch {
    return false;
  }
};

// Returns an origin (scheme + optional path) for the public verification link.
export const resolveVerifyOrigin = (config = {}) => {
  const raw = String(config?.baseUrl || '').trim();
  const { ok, normalized } = validateBaseUrl(raw);

  if (raw && ok && normalized) {
    return normalized;
  }

  if (typeof window !== 'undefined' && window.location?.host) {
    const { protocol, host } = window.location;
    return `${protocol}//${host}`;
  }

  return 'http://localhost:5173';
};

export const buildVerifyUrl = (docId, config = {}) => {
  if (!docId) return '';
  const origin = resolveVerifyOrigin(config).replace(/\/+$/, '');
  return `${origin}/verify?id=${encodeURIComponent(docId)}`;
};

export const loadBusinessQrConfig = async (db) => {
  if (!db || typeof db.get !== 'function') {
    return normalizeQrConfig();
  }
  try {
    const doc = await db.get(BUSINESS_QR_CONFIG_ID);
    return normalizeQrConfig(doc);
  } catch (err) {
    if (err?.status !== 404 && err?.name !== 'not_found') {
      console.warn('Failed to load Business QR config:', err?.message || err);
    }
    return normalizeQrConfig();
  }
};

export const saveBusinessQrConfig = async (db, config) => {
  const normalized = normalizeQrConfig(config);
  const { ok, error } = validateBaseUrl(normalized.baseUrl);
  if (!ok) {
    throw new Error(error || 'Invalid verification base URL.');
  }

  let existingRev;
  try {
    const existing = await db.get(BUSINESS_QR_CONFIG_ID);
    existingRev = existing._rev;
  } catch (err) {
    if (err?.status !== 404 && err?.name !== 'not_found') {
      throw err;
    }
  }

  const payload = {
    _id: BUSINESS_QR_CONFIG_ID,
    type: 'qr_config',
    appliesTo: 'business_clearance',
    ...normalized,
    updatedAt: new Date().toISOString(),
    ...(existingRev ? { _rev: existingRev } : {}),
  };

  const response = await db.put(payload);
  return normalizeQrConfig({ ...payload, _rev: response.rev });
};
