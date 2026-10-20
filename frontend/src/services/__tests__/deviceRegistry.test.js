// src/services/__tests__/deviceRegistry.test.js
//
// Tests for the client half of the device registry:
//   - a stable per-device id is generated once and reused
//   - the heartbeat reports the CURRENT pending-change count to the server
//   - the heartbeat payload carries every field the registry needs
//   - a failing heartbeat never breaks the caller (offline tolerance)
//   - the admin list is fetched from the server endpoint
import { localDb } from '../db';
import {
  getDeviceId,
  getDeviceLabel,
  setDeviceLabel,
  recordHeartbeat,
  sendHeartbeat,
  fetchRegisteredDevices,
} from '../deviceRegistry';
import { setToken, clearToken } from '../../utils/tokenStore';

const realFetch = global.fetch;

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue(body),
  text: jest.fn().mockResolvedValue(JSON.stringify(body)),
});

const mockFetch = (status = 200, body = { success: true }) => {
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(status, body));
  return global.fetch;
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localDb.get.mockResolvedValue({});
  localDb.put.mockResolvedValue({ rev: '1-mock' });
  localDb.allDocs.mockResolvedValue({ rows: [] });
  mockFetch();
});

afterEach(() => {
  global.fetch = realFetch;
  clearToken();
});

describe('device id', () => {
  test('is generated on first use and persisted', () => {
    const id = getDeviceId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(localStorage.getItem('bustrac_device_id')).toBe(id);
  });

  test('is stable across calls (the same device keeps the same id)', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  test('survives a reload because it is read back from localStorage', () => {
    localStorage.setItem('bustrac_device_id', 'dev_persisted');
    expect(getDeviceId()).toBe('dev_persisted');
  });

  test('has a user-settable label with a sensible default', () => {
    expect(getDeviceLabel()).toBeTruthy();
    setDeviceLabel('Barangay Tablet 1');
    expect(getDeviceLabel()).toBe('Barangay Tablet 1');
  });
});

describe('sendHeartbeat', () => {
  test('posts the device id, label and pending count to the server', async () => {
    setToken('sess_abc');
    mockFetch(200, { success: true, device: {} });

    const ok = await sendHeartbeat({
      pendingCount: 6,
      lastSyncedAt: '2026-10-20T11:00:00.000Z',
    });

    expect(ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/devices\/heartbeat$/);
    expect(init.method).toBe('POST');
    expect(init.headers.get('Authorization')).toBe('Bearer sess_abc');

    const body = JSON.parse(init.body);
    expect(body.deviceId).toBe(getDeviceId());
    expect(body.label).toBeTruthy();
    expect(body.pendingChangeCount).toBe(6);
    expect(body.lastSuccessfulSyncAt).toBe('2026-10-20T11:00:00.000Z');
  });

  test('normalises a missing pending count to zero', async () => {
    mockFetch(200, { success: true });
    await sendHeartbeat({});
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.pendingChangeCount).toBe(0);
  });

  test('returns false when the server rejects the heartbeat', async () => {
    mockFetch(403, { success: false });
    const ok = await sendHeartbeat({ pendingCount: 1 });
    expect(ok).toBe(false);
  });

  test('returns false and never throws when the network is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(sendHeartbeat({ pendingCount: 1 })).resolves.toBe(false);
  });
});

describe('recordHeartbeat', () => {
  test('writes the local heartbeat and reports to the server', async () => {
    mockFetch(200, { success: true });

    const result = await recordHeartbeat({
      pendingCount: 3,
      lastSyncedAt: '2026-10-20T11:00:00.000Z',
      force: true,
    });

    // Local _local/ copy (device-local, never replicated)
    const localPut = localDb.put.mock.calls.find((c) => c[0]._id === '_local/bustrac_heartbeat');
    expect(localPut).toBeTruthy();
    expect(localPut[0].pendingCount).toBe(3);
    expect(localPut[0].lastSyncedAt).toBe('2026-10-20T11:00:00.000Z');

    // Server registry report
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.pendingChangeCount).toBe(3);

    expect(result.reportedToServer).toBe(true);
  });

  test('still writes the local copy when the server is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    const result = await recordHeartbeat({ pendingCount: 2, force: true });

    const localPut = localDb.put.mock.calls.find((c) => c[0]._id === '_local/bustrac_heartbeat');
    expect(localPut).toBeTruthy();
    expect(localPut[0].pendingCount).toBe(2);
    expect(result.reportedToServer).toBe(false);
  });

  test('throttles repeated heartbeats but still reports a changed pending count', async () => {
    mockFetch(200, { success: true });

    await recordHeartbeat({ pendingCount: 1, force: true });
    global.fetch.mockClear();

    // Same count inside the throttle window -> no new report.
    const throttled = await recordHeartbeat({ pendingCount: 1 });
    expect(throttled).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();

    // A changed count is always reported, so the server never keeps a stale
    // pending count for a device.
    const changed = await recordHeartbeat({ pendingCount: 9 });
    expect(changed).not.toBeNull();
    expect(global.fetch).toHaveBeenCalled();
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.pendingChangeCount).toBe(9);
  });
});

describe('fetchRegisteredDevices', () => {
  test('returns the device list and summary from the server', async () => {
    setToken('sess_abc');
    mockFetch(200, {
      success: true,
      staleHours: 24,
      summary: { total: 1, possiblyLost: 1, devicesHoldingUnsynced: 1 },
      devices: [
        {
          deviceId: 'dev_lost',
          label: 'Tablet',
          assignedUser: 'mgcortero',
          lastHeartbeatAt: '2026-10-18T00:00:00.000Z',
          pendingChangeCount: 4,
          lastSuccessfulSyncAt: '2026-10-18T00:00:00.000Z',
          status: 'possibly-lost',
        },
      ],
    });

    const result = await fetchRegisteredDevices();

    expect(result.staleHours).toBe(24);
    expect(result.devices).toHaveLength(1);
    expect(result.devices[0].status).toBe('possibly-lost');
    expect(result.devices[0].pendingChangeCount).toBe(4);
    expect(result.summary.devicesHoldingUnsynced).toBe(1);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/devices$/);
  });

  test('passes a staleness override to the server', async () => {
    mockFetch(200, { success: true, devices: [] });
    await fetchRegisteredDevices({ staleHours: 6 });
    const [url] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/api\/devices\?staleHours=6$/);
  });

  test('returns null when the request fails', async () => {
    mockFetch(403, { success: false });
    await expect(fetchRegisteredDevices()).resolves.toBeNull();
  });

  test('returns null when the network is unavailable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchRegisteredDevices()).resolves.toBeNull();
  });
});
