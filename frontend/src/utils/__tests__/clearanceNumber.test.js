import {
  formatClearanceNo,
  nextAvailableClearanceNo,
  nextAvailableBusinessId,
  collisionSafeId,
} from '../clearanceNumber';

describe('formatClearanceNo', () => {
  test('pads the sequence to 4 digits', () => {
    expect(formatClearanceNo(2026, 1)).toBe('BC-2026-0001');
    expect(formatClearanceNo(2026, 153)).toBe('BC-2026-0153');
  });
});

describe('nextAvailableClearanceNo', () => {
  test('keeps a free candidate unchanged', () => {
    expect(nextAvailableClearanceNo(['BC-2026-0001'], 'BC-2026-0002', 2026)).toBe('BC-2026-0002');
  });

  test('bumps a duplicate candidate to the next free number', () => {
    const existing = ['BC-2026-0001', 'BC-2026-0002', 'BC-2026-0005'];
    const result = nextAvailableClearanceNo(existing, 'BC-2026-0002', 2026);
    expect(result).toBe('BC-2026-0006');
    expect(existing).not.toContain(result);
  });

  test('skips the reserved BC-2026-0001 when the list is empty of it', () => {
    // Regression: the old preview fallback hard-coded BC-2026-0001.
    const existing = ['BC-2026-0001'];
    expect(nextAvailableClearanceNo(existing, 'BC-2026-0001', 2026)).toBe('BC-2026-0002');
  });
});

describe('nextAvailableBusinessId', () => {
  test('keeps a free candidate', () => {
    expect(nextAvailableBusinessId(['0156'], '0157')).toBe('0157');
  });

  test('bumps duplicates to the next free id', () => {
    const existing = ['0156', '0157', '0159'];
    expect(nextAvailableBusinessId(existing, '0157')).toBe('0160');
  });
});

describe('collisionSafeId', () => {
  test('produces distinct ids even at the same millisecond', () => {
    const a = collisionSafeId('brgy_clearance_', 1000, 0.1);
    const b = collisionSafeId('brgy_clearance_', 1000, 0.9);
    expect(a).not.toBe(b);
    expect(a.startsWith('brgy_clearance_1000_')).toBe(true);
  });
});
