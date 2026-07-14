function formatCurrencyAud(value, decimals, fallback) {
  if (value == null || !Number.isFinite(Number(value))) return fallback;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value));
}

// Whole-dollar AUD, e.g. portfolio summary figures on Home. Returns null on
// invalid input so callers can decide their own conditional-render fallback.
export function formatAud(value) {
  return formatCurrencyAud(value, 0, null);
}

// Cent-precision AUD for SMSF holdings/transactions, where rounding to whole
// dollars would hide real differences. Falls back to an em dash.
export function formatAudPrecise(value) {
  return formatCurrencyAud(value, 2, '—');
}
