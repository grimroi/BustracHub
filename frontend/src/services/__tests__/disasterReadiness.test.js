// src/services/__tests__/disasterReadiness.test.js
//
// Tests for the read-only disaster-readiness assessment.
//
// The policy layer is what is proven here; the admin card that renders it is
// verified in the CDP runtime check.
import {
  assessDisasterReadiness,
  getBatteryStatus,
  collectDisasterReadinessChecks,
  READINESS_CHECKS,
  CRITICAL_CHECK_IDS,
  MIN_BATTERY_PERCENT,
} from '../disasterReadiness';

const ALL_PASSING = READINESS_CHECKS.reduce((acc, check) => {
  acc[check.id] = true;
  return acc;
}, {});

const totalWeight = READINESS_CHECKS.reduce((sum, c) => sum + c.weight, 0);
const criticalWeight = CRITICAL_CHECK_IDS.reduce(
  (sum, id) => sum + READINESS_CHECKS.find((c) => c.id === id).weight,
  0
);
const nonCriticalWeight = totalWeight - criticalWeight;

describe('assessDisasterReadiness — weights', () => {
  test('the three critical checks carry 25 points each and the rest 5', () => {
    READINESS_CHECKS.forEach((check) => {
      expect(check.weight).toBe(check.critical ? 25 : 5);
    });
    expect(criticalWeight).toBe(75);
    expect(nonCriticalWeight).toBe(20);
    expect(totalWeight).toBe(95);
  });

  test('the score is normalised to 100', () => {
    const result = assessDisasterReadiness({ checks: ALL_PASSING });
    expect(result.score).toBe(100);
  });
});

describe('assessDisasterReadiness — all checks pass', () => {
  test('is ready, scores 100 and recommends deployment', () => {
    const result = assessDisasterReadiness({ checks: ALL_PASSING });

    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
    expect(result.recommendation).toBe('Ready for deployment');
    expect(result.recommendation).toMatch(/^Ready/);
  });

  test('returns one entry per check, in definition order', () => {
    const result = assessDisasterReadiness({ checks: ALL_PASSING });

    expect(result.checks).toHaveLength(READINESS_CHECKS.length);
    expect(result.checks.map((c) => c.id)).toEqual(READINESS_CHECKS.map((c) => c.id));
    result.checks.forEach((check) => {
      expect(check.passed).toBe(true);
      expect(check.critical).toBe(CRITICAL_CHECK_IDS.includes(check.id));
      expect(typeof check.label).toBe('string');
      expect(typeof check.detail).toBe('string');
      expect(check.detail.length).toBeGreaterThan(0);
    });
  });
});

describe('assessDisasterReadiness — a critical check fails', () => {
  test('a missing offline credential makes the device not ready and is named', () => {
    const checks = { ...ALL_PASSING, offline_auth_cached: false };
    const result = assessDisasterReadiness({ checks });

    expect(result.ready).toBe(false);
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBe(Math.round(((totalWeight - 25) / totalWeight) * 100));
    expect(result.recommendation).toContain('Needs attention:');
    expect(result.recommendation).toContain('Offline credential cached');
  });

  test('a missing service worker makes the device not ready', () => {
    const checks = { ...ALL_PASSING, service_worker_active: false };
    const result = assessDisasterReadiness({ checks });

    expect(result.ready).toBe(false);
    expect(result.score).toBe(Math.round(((totalWeight - 25) / totalWeight) * 100));
    expect(result.recommendation).toContain('Service worker active');
  });

  test('an unhealthy local database makes the device not ready', () => {
    const checks = { ...ALL_PASSING, local_db_healthy: false };
    const result = assessDisasterReadiness({ checks });

    expect(result.ready).toBe(false);
    expect(result.recommendation).toContain('Local database healthy');
  });

  test('the failing critical check is reported as not passed', () => {
    const result = assessDisasterReadiness({ checks: { ...ALL_PASSING, offline_auth_cached: false } });
    const failed = result.checks.find((c) => c.id === 'offline_auth_cached');

    expect(failed.passed).toBe(false);
    expect(failed.critical).toBe(true);
  });
});

describe('assessDisasterReadiness — a non-critical check fails', () => {
  test('a low battery fails the check but the device can still be ready', () => {
    // battery_ok carries weight 5 and is NOT critical, so it lowers the score
    // without blocking deployment.
    const checks = { ...ALL_PASSING, battery_ok: false };
    const result = assessDisasterReadiness({ checks });

    expect(result.checks.find((c) => c.id === 'battery_ok').passed).toBe(false);
    expect(result.ready).toBe(true);
    expect(result.score).toBe(Math.round(((totalWeight - 5) / totalWeight) * 100));
    expect(result.score).toBeLessThan(100);
  });

  test('a low battery is still named in the recommendation', () => {
    const result = assessDisasterReadiness({ checks: { ...ALL_PASSING, battery_ok: false } });
    expect(result.recommendation).toContain('Battery level adequate');
  });

  test('a stale sync and pending changes also leave the device ready', () => {
    const checks = { ...ALL_PASSING, recent_sync: false, no_pending_changes: false };
    const result = assessDisasterReadiness({ checks });

    expect(result.ready).toBe(true);
    expect(result.score).toBe(Math.round(((totalWeight - 10) / totalWeight) * 100));
  });
});

describe('assessDisasterReadiness — input handling', () => {
  test('a missing check counts as failed', () => {
    const result = assessDisasterReadiness({ checks: {} });

    expect(result.ready).toBe(false);
    expect(result.score).toBe(0);
    expect(result.checks.every((c) => c.passed === false)).toBe(true);
  });

  test('a { passed, detail } object is accepted and its detail is used', () => {
    const result = assessDisasterReadiness({
      checks: { ...ALL_PASSING, recent_sync: { passed: false, detail: 'Synced 3 days ago.' } },
    });

    const check = result.checks.find((c) => c.id === 'recent_sync');
    expect(check.passed).toBe(false);
    expect(check.detail).toBe('Synced 3 days ago.');
  });

  test('a non-boolean value does not count as passed', () => {
    const result = assessDisasterReadiness({ checks: { ...ALL_PASSING, battery_ok: 'yes' } });
    expect(result.checks.find((c) => c.id === 'battery_ok').passed).toBe(false);
  });

  test('calling it with no argument does not throw', () => {
    expect(() => assessDisasterReadiness()).not.toThrow();
    expect(assessDisasterReadiness().ready).toBe(false);
  });
});

describe('getBatteryStatus', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  const setNavigator = (value) => {
    Object.defineProperty(global, 'navigator', {
      value,
      configurable: true,
      writable: true,
    });
  };

  test('returns supported:false cleanly when the API is undefined', async () => {
    setNavigator({});

    const result = await getBatteryStatus();

    expect(result.supported).toBe(false);
    expect(result.level).toBeNull();
    expect(result.charging).toBeNull();
  });

  test('never throws when navigator.getBattery rejects', async () => {
    setNavigator({
      getBattery: () => Promise.reject(new Error('denied')),
    });

    await expect(getBatteryStatus()).resolves.toEqual({
      level: null,
      charging: null,
      supported: false,
    });
  });

  test('never throws when navigator.getBattery throws synchronously', async () => {
    setNavigator({
      getBattery: () => {
        throw new Error('boom');
      },
    });

    await expect(getBatteryStatus()).resolves.toEqual({
      level: null,
      charging: null,
      supported: false,
    });
  });

  test('reports the level as a percentage and the charging flag', async () => {
    setNavigator({
      getBattery: () => Promise.resolve({ level: 0.87, charging: true }),
    });

    const result = await getBatteryStatus();

    expect(result.supported).toBe(true);
    expect(result.level).toBe(87);
    expect(result.charging).toBe(true);
  });
});

describe('collectDisasterReadinessChecks', () => {
  test('collects every check from the injected dependencies', async () => {
    const checks = await collectDisasterReadinessChecks({
      db: { info: async () => ({ doc_count: 42 }) },
      getPendingCount: async () => 0,
      getLastSyncedAt: () => new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      hasOfflineAuthCache: () => true,
      getServiceWorkerController: () => ({}),
      estimateStorage: async () => ({ quota: 2 * 1024 * 1024 * 1024, usage: 1024 * 1024 * 1024 }),
      battery: { level: 80, charging: false, supported: true },
    });

    const result = assessDisasterReadiness({ checks });
    expect(result.ready).toBe(true);
    expect(result.score).toBe(100);
  });

  test('an unavailable battery API does not fail the battery check', async () => {
    const checks = await collectDisasterReadinessChecks({
      db: { info: async () => ({ doc_count: 1 }) },
      getPendingCount: async () => 0,
      getLastSyncedAt: () => new Date().toISOString(),
      hasOfflineAuthCache: () => true,
      getServiceWorkerController: () => ({}),
      estimateStorage: async () => ({ quota: 2 * 1024 * 1024 * 1024, usage: 0 }),
      battery: { level: null, charging: null, supported: false },
    });

    expect(checks.battery_ok.passed).toBe(true);
  });

  test('a battery at or below the threshold fails the battery check', async () => {
    const below = await collectDisasterReadinessChecks({
      db: { info: async () => ({ doc_count: 1 }) },
      getPendingCount: async () => 0,
      getLastSyncedAt: () => new Date().toISOString(),
      hasOfflineAuthCache: () => true,
      getServiceWorkerController: () => ({}),
      estimateStorage: async () => ({ quota: 2 * 1024 * 1024 * 1024, usage: 0 }),
      battery: { level: MIN_BATTERY_PERCENT - 10, charging: false, supported: true },
    });
    expect(below.battery_ok.passed).toBe(false);

    const at = await collectDisasterReadinessChecks({
      db: { info: async () => ({ doc_count: 1 }) },
      getPendingCount: async () => 0,
      getLastSyncedAt: () => new Date().toISOString(),
      hasOfflineAuthCache: () => true,
      getServiceWorkerController: () => ({}),
      estimateStorage: async () => ({ quota: 2 * 1024 * 1024 * 1024, usage: 0 }),
      battery: { level: MIN_BATTERY_PERCENT, charging: false, supported: true },
    });
    // The threshold is ">=", so exactly 20% still passes.
    expect(at.battery_ok.passed).toBe(true);
  });

  test('a failing local database is reported as a failed critical check', async () => {
    const checks = await collectDisasterReadinessChecks({
      db: {
        info: async () => {
          throw new Error('db down');
        },
      },
      getPendingCount: async () => 0,
      getLastSyncedAt: () => new Date().toISOString(),
      hasOfflineAuthCache: () => true,
      getServiceWorkerController: () => ({}),
      estimateStorage: async () => ({ quota: 2 * 1024 * 1024 * 1024, usage: 0 }),
      battery: { level: 90, charging: false, supported: true },
    });

    expect(checks.local_db_healthy.passed).toBe(false);
    expect(assessDisasterReadiness({ checks }).ready).toBe(false);
  });

  test('a stale last-sync is reported with its age', async () => {
    const checks = await collectDisasterReadinessChecks({
      db: { info: async () => ({ doc_count: 1 }) },
      getPendingCount: async () => 3,
      getLastSyncedAt: () => new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      hasOfflineAuthCache: () => false,
      getServiceWorkerController: () => null,
      estimateStorage: async () => ({ quota: 1024 * 1024, usage: 1024 * 1024 }),
      battery: { level: 5, charging: false, supported: true },
    });

    expect(checks.recent_sync.passed).toBe(false);
    expect(checks.recent_sync.detail).toMatch(/48h ago/);
    expect(checks.no_pending_changes.passed).toBe(false);
    expect(checks.offline_auth_cached.passed).toBe(false);
    expect(checks.service_worker_active.passed).toBe(false);
    expect(checks.storage_available.passed).toBe(false);
  });
});
