// Live AUD/USD FX rate, sourced from Yahoo Finance's chart endpoint — the
// same zero-auth v8/chart surface already used for stock prices in yahoo.js,
// so this needs no new provider or API key.
//
// Cached in-process with a TTL (FX doesn't need per-request freshness for
// portfolio display) and falls back to the static config rate if Yahoo is
// unreachable — money math must never throw, matching the degrade-gracefully
// philosophy the rest of the pricing code follows.

const { USD_TO_AUD: FALLBACK_USD_TO_AUD } = require('../config');

const UA = 'Mozilla/5.0';
const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

let cached = null; // { rate, fetchedAt }

async function fetchLiveRate() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/AUDUSD=X', {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const audUsd = Number(json?.chart?.result?.[0]?.meta?.regularMarketPrice);
    if (!Number.isFinite(audUsd) || audUsd <= 0) throw new Error('Invalid AUDUSD rate');
    // AUDUSD=X quotes "1 AUD = X USD" — invert for "1 USD = Y AUD".
    return 1 / audUsd;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Current USD→AUD conversion rate. Refreshes from Yahoo every CACHE_TTL_MS;
 * on failure, serves the last known-good rate if one exists (an hour-old
 * live rate is still more accurate than one frozen at file-write time),
 * otherwise falls back to the static config constant.
 */
async function getUsdToAud() {
  const now = Date.now();
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached.rate;
  try {
    const rate = await fetchLiveRate();
    cached = { rate, fetchedAt: now };
    return rate;
  } catch {
    return cached ? cached.rate : FALLBACK_USD_TO_AUD;
  }
}

module.exports = { getUsdToAud };
