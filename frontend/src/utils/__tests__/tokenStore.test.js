// src/utils/__tests__/tokenStore.test.js
import { getToken, setToken, clearToken } from '../tokenStore';

describe('tokenStore', () => {
  beforeEach(() => {
    clearToken();
    jest.clearAllMocks();
  });

  test('getToken returns null when no token has been set', () => {
    expect(getToken()).toBeNull();
  });

  test('setToken/getToken round-trip stores the token', () => {
    setToken('sess_abc123');
    expect(getToken()).toBe('sess_abc123');
  });

  test('setToken with empty string clears the token', () => {
    setToken('sess_abc123');
    setToken('   ');
    expect(getToken()).toBeNull();
  });

  test('setToken with null clears the token', () => {
    setToken('sess_abc123');
    setToken(null);
    expect(getToken()).toBeNull();
  });

  test('clearToken is idempotent', () => {
    expect(() => clearToken()).not.toThrow();
    expect(() => clearToken()).not.toThrow();
    expect(getToken()).toBeNull();
  });

  test('the token is never written to console', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    setToken('sess_secret');
    const calls = logSpy.mock.calls.map((args) => args.join(' '));
    expect(calls.some((c) => c.includes('sess_secret'))).toBe(false);
    logSpy.mockRestore();
  });
});