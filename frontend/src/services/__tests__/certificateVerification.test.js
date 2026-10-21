// src/services/__tests__/certificateVerification.test.js
//
// Tests for the client half of the secure QR verification flow:
//   - a token is minted by the server and stored on the certificate
//   - an existing token is presented so the server can reuse it
//   - an OFFLINE device never fabricates a token (it reports "pending")
//   - the server's refusal is surfaced, not swallowed
import { requestVerificationToken, ensureVerificationToken } from '../certificateVerification';

const realFetch = global.fetch;

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
  text: jest.fn().mockResolvedValue(JSON.stringify(body)),
});

const TOKEN = 'x'.repeat(43);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('bustrac_session_token', 'sess_test');
});

afterEach(() => {
  global.fetch = realFetch;
});

describe('requestVerificationToken', () => {
  test('posts the certificate id and returns the token', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, token: TOKEN }));

    const result = await requestVerificationToken('brgy_clearance_1');

    expect(result.ok).toBe(true);
    expect(result.token).toBe(TOKEN);

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/certificates\/verification-token$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.certificateId).toBe('brgy_clearance_1');
    expect(body.verificationToken).toBeUndefined();
  });

  test('presents an existing token so the server can reuse it', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, token: TOKEN, reused: true }));

    const result = await requestVerificationToken('brgy_clearance_1', TOKEN);

    expect(result.reused).toBe(true);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.verificationToken).toBe(TOKEN);
  });

  test('a server refusal is surfaced, not swallowed', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(409, { success: false, message: 'This certificate is not in a verifiable issued state.' })
    );

    const result = await requestVerificationToken('CERT-pending');

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not in a verifiable issued state');
  });

  test('an unreachable server never produces a token', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await requestVerificationToken('brgy_clearance_1');

    expect(result.ok).toBe(false);
    expect(result.token).toBeUndefined();
  });

  test('a malformed token from the server is rejected', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, token: 'short' }));

    const result = await requestVerificationToken('brgy_clearance_1');

    expect(result.ok).toBe(false);
    expect(result.token).toBeUndefined();
  });
});

describe('ensureVerificationToken', () => {
  test('stores the minted token on the certificate document', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, token: TOKEN }));

    const put = jest.fn().mockResolvedValue({ ok: true, id: 'brgy_clearance_1', rev: '2-x' });
    const db = { get: jest.fn().mockResolvedValue({ _id: 'brgy_clearance_1', _rev: '1-a' }), put };

    const result = await ensureVerificationToken({ _id: 'brgy_clearance_1' }, { db });

    expect(result.status).toBe('issued');
    expect(result.token).toBe(TOKEN);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0].verificationToken).toBe(TOKEN);
    expect(put.mock.calls[0][0]._rev).toBe('1-a');
  });

  test('reports "pending" when the device is offline — it never fabricates a token', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const put = jest.fn();
    const db = { get: jest.fn(), put };

    const result = await ensureVerificationToken({ _id: 'brgy_clearance_1' }, { db });

    expect(result.status).toBe('pending');
    expect(result.token).toBeUndefined();
    expect(put).not.toHaveBeenCalled();
  });

  test('reuses an existing token without rewriting the document', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { success: true, token: TOKEN, reused: true }));

    const put = jest.fn();
    const db = { get: jest.fn(), put };

    const result = await ensureVerificationToken({ _id: 'brgy_clearance_1', verificationToken: TOKEN }, { db });

    expect(result.status).toBe('reused');
    expect(result.token).toBe(TOKEN);
    expect(put).not.toHaveBeenCalled();
  });

  test('a certificate without an id is rejected', async () => {
    const result = await ensureVerificationToken({}, { db: { get: jest.fn(), put: jest.fn() } });
    expect(result.status).toBe('failed');
  });
});
