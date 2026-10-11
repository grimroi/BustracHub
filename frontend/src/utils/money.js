// src/utils/money.js
// Shared money parsing/validation for clearance forms. Values are returned as
// numbers rounded to 2 decimal places; malformed / negative / oversized values
// are rejected instead of being silently coerced.

export const MAX_MONEY_AMOUNT = 10000000; // ₱10,000,000 upper bound

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

// Parses a user-entered amount.
//   required   - when true, an empty value is an error
//   max        - upper bound (inclusive)
// Returns { ok: true, value: number|null } or { ok: false, error: string }.
export const parseMoney = (value, { required = false, max = MAX_MONEY_AMOUNT } = {}) => {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (required) return { ok: false, error: 'This amount is required.' };
    return { ok: true, value: null };
  }

  const raw = String(value).trim();
  if (!NUMERIC_RE.test(raw)) {
    return { ok: false, error: 'Enter a valid number.' };
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return { ok: false, error: 'Enter a valid number.' };
  }
  if (num < 0) {
    return { ok: false, error: 'Amount cannot be negative.' };
  }
  if (num > max) {
    return { ok: false, error: `Amount must not exceed ₱${max.toLocaleString('en-PH')}.` };
  }

  const cents = Math.round(num * 100);
  if (Math.abs(num * 100 - cents) > 1e-6) {
    return { ok: false, error: 'Use at most 2 decimal places.' };
  }

  return { ok: true, value: cents / 100 };
};

// Normalises a raw amount to a fixed 2-decimal string (defaults to '0.00').
export const formatMoney = (value) => {
  const parsed = parseMoney(value);
  const num = parsed.ok && parsed.value !== null ? parsed.value : 0;
  return num.toFixed(2);
};

// Display helper: pesos sign + thousands separators + 2 decimals.
// Invalid / empty values render as ₱0.00 so tables never show NaN.
export const formatCurrency = (value) => {
  const parsed = parseMoney(value);
  const num = parsed.ok && parsed.value !== null ? parsed.value : 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
