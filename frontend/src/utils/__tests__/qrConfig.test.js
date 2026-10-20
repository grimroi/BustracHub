import {
  validateBaseUrl,
  resolveVerifyOrigin,
  isLoopbackOrigin,
  buildVerifyUrl,
  normalizeQrConfig,
  loadBusinessQrConfig,
  saveBusinessQrConfig,
  BUSINESS_QR_CONFIG_ID,
} from '../qrConfig';

describe('validateBaseUrl', () => {
  test('blank is allowed (means auto-detect)', () => {
    expect(validateBaseUrl('')).toEqual({ ok: true, normalized: '', error: '' });
    expect(validateBaseUrl('   ')).toEqual({ ok: true, normalized: '', error: '' });
  });

  test('accepts a LAN host with port and defaults to http for private ranges', () => {
    const result = validateBaseUrl('192.168.1.10:5173');
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe('http://192.168.1.10:5173');
  });

  test('accepts localhost with port using http', () => {
    expect(validateBaseUrl('localhost:5173').normalized).toBe('http://localhost:5173');
  });

  test('accepts a public host and defaults to https', () => {
    expect(validateBaseUrl('bustrachub.gov.ph').normalized).toBe('https://bustrachub.gov.ph');
  });

  test('preserves scheme and path for a full URL', () => {
    expect(validateBaseUrl('https://example.gov.ph/bustrac/').normalized).toBe(
      'https://example.gov.ph/bustrac'
    );
  });

  test('rejects spaces', () => {
    expect(validateBaseUrl('192.168.1.10 :5173').ok).toBe(false);
  });

  test('rejects dangerous schemes', () => {
    expect(validateBaseUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateBaseUrl('data:text/html,<script>').ok).toBe(false);
  });
});

describe('isLoopbackOrigin', () => {
  test('detects loopback origins', () => {
    expect(isLoopbackOrigin('http://localhost:5173')).toBe(true);
    expect(isLoopbackOrigin('127.0.0.1:5173')).toBe(true);
    expect(isLoopbackOrigin('http://[::1]:5173')).toBe(true);
  });

  test('treats LAN and public hosts as reachable', () => {
    expect(isLoopbackOrigin('http://192.168.1.10:5173')).toBe(false);
    expect(isLoopbackOrigin('https://bustrachub.gov.ph')).toBe(false);
  });
});

describe('resolveVerifyOrigin', () => {
  test('uses the configured base URL when present', () => {
    expect(resolveVerifyOrigin({ baseUrl: 'bustrachub.gov.ph' })).toBe('https://bustrachub.gov.ph');
  });

  test('falls back to the current window origin when blank', () => {
    // jsdom default origin
    expect(resolveVerifyOrigin({ baseUrl: '' })).toBe(window.location.protocol + '//' + window.location.host);
  });
});

describe('buildVerifyUrl', () => {
  test('returns empty string without a doc id', () => {
    expect(buildVerifyUrl('', { baseUrl: 'example.com' })).toBe('');
    expect(buildVerifyUrl(null, { baseUrl: 'example.com' })).toBe('');
  });

  test('builds and encodes the verification URL', () => {
    expect(buildVerifyUrl('bus_clearance_123', { baseUrl: '192.168.1.10:5173' })).toBe(
      'http://192.168.1.10:5173/verify?id=bus_clearance_123'
    );
  });

  test('encodes special characters in the id', () => {
    expect(buildVerifyUrl('CERT-2026 a/b', { baseUrl: 'https://x.ph' })).toBe(
      'https://x.ph/verify?id=CERT-2026%20a%2Fb'
    );
  });
});

describe('normalizeQrConfig', () => {
  test('fills defaults and coerces types', () => {
    const config = normalizeQrConfig({ size: '120', enabled: 0 });
    expect(config.size).toBe(120);
    expect(config.enabled).toBe(false);
    expect(config.level).toBe('H');
  });
});

describe('loadBusinessQrConfig / saveBusinessQrConfig', () => {
  test('loads and normalizes an existing config', async () => {
    const fakeDb = { get: jest.fn().mockResolvedValue({ _id: BUSINESS_QR_CONFIG_ID, size: 80, enabled: true }) };
    const loaded = await loadBusinessQrConfig(fakeDb);
    expect(loaded.size).toBe(80);
    expect(loaded.enabled).toBe(true);
  });

  test('falls back to defaults when the doc is missing', async () => {
    const fakeDb = { get: jest.fn().mockRejectedValue({ status: 404 }) };
    const loaded = await loadBusinessQrConfig(fakeDb);
    expect(loaded.enabled).toBe(true);
    expect(loaded.baseUrl).toBe('');
  });

  test('save rejects an invalid base URL', async () => {
    const fakeDb = { get: jest.fn().mockRejectedValue({ status: 404 }), put: jest.fn() };
    await expect(saveBusinessQrConfig(fakeDb, { baseUrl: 'javascript:alert(1)' })).rejects.toThrow();
    expect(fakeDb.put).not.toHaveBeenCalled();
  });

  test('save writes a new config doc and returns normalized values', async () => {
    const fakeDb = {
      get: jest.fn().mockRejectedValue({ status: 404 }),
      put: jest.fn().mockResolvedValue({ rev: '1-abc' }),
    };
    const saved = await saveBusinessQrConfig(fakeDb, { baseUrl: '192.168.1.10:5173', enabled: true });
    expect(fakeDb.put).toHaveBeenCalledTimes(1);
    expect(saved.baseUrl).toBe('192.168.1.10:5173');
    expect(saved._rev).toBe('1-abc');
    expect(saved.appliesTo).toBe('business_clearance');
  });
});
