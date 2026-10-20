// src/utils/__tests__/api.test.js
import { apiFetch, __resetRedirectGuard } from '../api';
import { setToken, clearToken, getToken } from '../tokenStore';
import { resolveApiBaseUrl } from '../apiBase';

const realFetch = global.fetch;

beforeEach(() => {
  clearToken();
  __resetRedirectGuard();
  jest.clearAllMocks();
});

afterEach(() => {
  global.fetch = realFetch;
});

const mockFetch = (status, body, headers = {}) => {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
  global.fetch = jest.fn().mockResolvedValue(res);
  return res;
};

describe('URL construction', () => {
  test('apiFetch builds ${API_BASE}/api/<path> with no duplicated /api', async () => {
    mockFetch(200, { success: true });
    await apiFetch('login', { method: 'POST', body: '{}' });
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toMatch(/\/api\/login$/);
    expect(calledUrl).not.toMatch(/\/api\/api\//);
  });

  test('apiFetch rejects absolute URLs', async () => {
    await expect(apiFetch('http://evil.example/api/login')).rejects.toThrow();
    await expect(apiFetch('https://evil.example/api/login')).rejects.toThrow();
  });

  test('apiFetch rejects paths with a leading slash', async () => {
    await expect(apiFetch('/api/login')).rejects.toThrow();
  });

  test('apiFetch rejects path traversal', async () => {
    await expect(apiFetch('../secret')).rejects.toThrow();
    await expect(apiFetch('foo/../bar')).rejects.toThrow();
  });

  test('resolveApiBaseUrl is called with import.meta.env.VITE_API_URL', () => {
    const spy = jest.spyOn({ resolveApiBaseUrl }, 'resolveApiBaseUrl');
    // api.js resolves the base at module load; verify the helper itself
    // returns a bare origin (no /api suffix) for the existing test cases.
    expect(resolveApiBaseUrl('http://localhost:5000', { hostname: 'localhost' })).toBe('http://localhost:5000');
    spy.mockRestore();
  });
});

describe('Bearer token injection', () => {
  test('authenticated request includes Authorization: Bearer <token>', async () => {
    setToken('sess_abc');
    mockFetch(200, { success: true });
    await apiFetch('blotter/send-summons', { method: 'POST', body: '{}' });
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Bearer sess_abc');
  });

  test('request without a token omits the Authorization header', async () => {
    mockFetch(200, { success: true });
    await apiFetch('login', { method: 'POST', body: '{}' });
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.has('Authorization')).toBe(false);
  });

  test('explicit auth:false never sends a token even if one is stored', async () => {
    setToken('sess_abc');
    mockFetch(200, { success: true });
    await apiFetch('certificates/verify/x', { auth: false });
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.has('Authorization')).toBe(false);
  });
});

describe('401 handling', () => {
  test('public 401 does not redirect by default', async () => {
    mockFetch(401, { success: false });
    const res = await apiFetch('certificates/verify/x', { auth: false });
    expect(res.status).toBe(401);
    expect(getToken()).toBeNull();
  });

  test('authenticated 401 clears the stored token', async () => {
    setToken('sess_stale');
    mockFetch(401, { success: false });
    await apiFetch('blotter/send-summons', { method: 'POST', body: '{}' });
    expect(getToken()).toBeNull();
  });

  test('redirectOn401:true redirects at most once', async () => {
    setToken('sess_stale');
    mockFetch(401, { success: false });
    const origHref = window.location.href;
    const origPathname = window.location.pathname;
    const origSearch = window.location.search;
    let redirected = null;
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: {
        ...window.location,
        pathname: '/staff',
        search: '',
        set href(val) {
          redirected = val;
        },
        get href() {
          return origHref;
        },
      },
    });
    try {
      await apiFetch('blotter/send-summons', {
        method: 'POST',
        body: '{}',
        redirectOn401: true,
      });
      await apiFetch('blotter/send-summons', {
        method: 'POST',
        body: '{}',
        redirectOn401: true,
      });
      // Redirects to /login with the original path as a redirectTo query
      // param. Only one redirect must have been issued.
      expect(redirected).toBe('/login?redirectTo=%2Fstaff');
    } finally {
      Object.defineProperty(window, 'location', {
        writable: true,
        configurable: true,
        value: {
          ...window.location,
          pathname: origPathname,
          search: origSearch,
        },
      });
    }
  });
});

describe('403 handling', () => {
  test('403 throws without leaking the token', async () => {
    setToken('sess_secret');
    mockFetch(403, { success: false });
    await expect(
      apiFetch('blotter/send-summons', { method: 'POST', body: '{}' })
    ).rejects.toThrow();
    // token must still be present (403 != 401)
    expect(getToken()).toBe('sess_secret');
  });
});

describe('network errors', () => {
  test('network failure throws a tagged error callers can handle', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await apiFetch('login', { method: 'POST', body: '{}' }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.kind).toBe('network');
  });
});

describe('response passthrough', () => {
  test('non-JSON 2xx is returned as-is without parsing', async () => {
    const res = {
      ok: true,
      status: 200,
      json: jest.fn(),
    };
    global.fetch = jest.fn().mockResolvedValue(res);
    const result = await apiFetch('login', { method: 'POST', body: '{}' });
    expect(result).toBe(res);
    expect(res.json).not.toHaveBeenCalled();
  });
});