import { parseMoney, formatMoney, formatCurrency, MAX_MONEY_AMOUNT } from '../money';

describe('parseMoney', () => {
  test('accepts valid non-negative values and rounds to 2 decimals', () => {
    expect(parseMoney('100')).toEqual({ ok: true, value: 100 });
    expect(parseMoney('100.5')).toEqual({ ok: true, value: 100.5 });
    expect(parseMoney('0')).toEqual({ ok: true, value: 0 });
    expect(parseMoney(25)).toEqual({ ok: true, value: 25 });
  });

  test('rejects malformed values', () => {
    for (const bad of ['abc', '12,000', '1e3', '1.2.3', '--5', '$100', 'NaN']) {
      expect(parseMoney(bad).ok).toBe(false);
    }
  });

  test('rejects negative values', () => {
    expect(parseMoney('-1').ok).toBe(false);
    expect(parseMoney('-0.01').error).toMatch(/negative/i);
  });

  test('rejects more than 2 decimal places', () => {
    expect(parseMoney('1.234').ok).toBe(false);
  });

  test('rejects excessively large values', () => {
    expect(parseMoney(String(MAX_MONEY_AMOUNT + 1)).ok).toBe(false);
    expect(parseMoney(String(MAX_MONEY_AMOUNT)).ok).toBe(true);
  });

  test('empty handling depends on `required`', () => {
    expect(parseMoney('')).toEqual({ ok: true, value: null });
    expect(parseMoney('', { required: true }).ok).toBe(false);
    expect(parseMoney(undefined, { required: true }).ok).toBe(false);
  });
});

describe('formatMoney', () => {
  test('formats to fixed 2 decimals', () => {
    expect(formatMoney('100')).toBe('100.00');
    expect(formatMoney('0.5')).toBe('0.50');
    expect(formatMoney('garbage')).toBe('0.00');
    expect(formatMoney(undefined)).toBe('0.00');
  });
});

describe('formatCurrency', () => {
  test('formats with peso sign, grouping and 2 decimals', () => {
    expect(formatCurrency('100')).toBe('₱100.00');
    expect(formatCurrency('1234.5')).toBe('₱1,234.50');
    expect(formatCurrency('1000000')).toBe('₱1,000,000.00');
  });

  test('falls back to ₱0.00 for invalid / empty values', () => {
    expect(formatCurrency('garbage')).toBe('₱0.00');
    expect(formatCurrency(undefined)).toBe('₱0.00');
    expect(formatCurrency('')).toBe('₱0.00');
  });
});
