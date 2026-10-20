import { isLoopbackHost, resolveApiBaseUrl } from '../apiBase';

const loc = (protocol, hostname, port) => ({ protocol, hostname, port });

describe('isLoopbackHost', () => {
  test('detects loopback names and 127.x addresses', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(true);
  });

  test('rejects LAN and public hosts', () => {
    expect(isLoopbackHost('192.168.1.2')).toBe(false);
    expect(isLoopbackHost('bustrachub.gov.ph')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });
});

describe('resolveApiBaseUrl', () => {
  test('rewrites a bundled localhost API URL to the page host when viewed remotely', () => {
    expect(resolveApiBaseUrl('http://localhost:5000', loc('http:', '192.168.1.2', '5174'))).toBe(
      'http://192.168.1.2:5000'
    );
  });

  test('keeps localhost API URL when the page is also local (dev machine)', () => {
    expect(resolveApiBaseUrl('http://localhost:5000', loc('http:', 'localhost', '5174'))).toBe(
      'http://localhost:5000'
    );
  });

  test('keeps an explicit non-loopback API URL untouched', () => {
    expect(resolveApiBaseUrl('https://api.bustrachub.gov.ph', loc('https:', '192.168.1.2', '5174'))).toBe(
      'https://api.bustrachub.gov.ph'
    );
  });

  test('derives host:5000 from the page when no env URL is set', () => {
    expect(resolveApiBaseUrl('', loc('http:', '192.168.1.2', '5174'))).toBe('http://192.168.1.2:5000');
  });

  test('strips trailing slashes', () => {
    expect(resolveApiBaseUrl('http://localhost:5000/', loc('http:', 'localhost', '5174'))).toBe(
      'http://localhost:5000'
    );
  });

  test('falls back to localhost when location is unavailable', () => {
    expect(resolveApiBaseUrl('', null)).toBe('http://localhost:5000');
  });
});
