const express = require('express');
const { USD_TO_AUD } = require('../config');

const router = express.Router();

// Slightly longer than the Home aggregate timeout: this is a direct passthrough
// the SMSF tab depends on, so give the upstream a bit more room before failing.
const FETCH_TIMEOUT_MS = 6000;

/**
 * GET JSON from a URL with a hard timeout. Throws on network error / non-2xx /
 * timeout so callers can uniformly degrade to a 502.
 */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    return await upstream.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/smsf/holdings — verbatim proxy of WealthCanvas holdings.
 *
 * Forwards the upstream JSON unchanged so the SMSF tab (Block 2) can consume the
 * canonical shape. On any upstream failure returns 502 with a stable error body
 * rather than leaking the raw exception.
 */
router.get('/holdings', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.WEALTHCANVAS_URL}/api/holdings`);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'WealthCanvas unavailable' });
  }
});

/**
 * GET /api/smsf/transactions — proxy of WealthCanvas transactions.
 *
 * Forwards the upstream JSON. Optional `?limit=N` slices the data array to the
 * first N items after fetching (WealthCanvas has no server-side pagination and
 * returns newest-first). A non-positive / non-numeric limit is ignored.
 */
router.get('/transactions', async (req, res) => {
  try {
    const data = await fetchJson(`${process.env.WEALTHCANVAS_URL}/api/transactions`);

    const limit = Number.parseInt(req.query.limit, 10);
    if (Number.isFinite(limit) && limit > 0 && Array.isArray(data?.data)) {
      return res.json({ ...data, data: data.data.slice(0, limit) });
    }
    res.json(data);
  } catch {
    res.status(502).json({ error: 'WealthCanvas unavailable' });
  }
});

/**
 * Round to 2 decimal places, guarding against FP drift.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute allocation analysis from WealthCanvas holdings.
 *
 * For each holding: cost basis (native = qty × avg cost), converted to AUD with
 * the fixed fallback FX rate for US_* asset classes. Actual allocation % is the
 * holding's AUD cost basis over the portfolio total; deviation is actual minus
 * the holding's target_allocation.
 */
function computeSummary(holdingsPayload) {
  const holdings = holdingsPayload?.data ?? [];

  // First pass: native + AUD cost basis, and the running portfolio total.
  const rows = holdings.map((h) => {
    const qty = Number(h.total_quantity);
    const avg = Number(h.average_cost);
    const costNative = round2(qty * avg);
    const isUsd = String(h.asset_class).startsWith('US_');
    const costAud = round2(costNative * (isUsd ? USD_TO_AUD : 1));
    return {
      ticker: h.ticker,
      name: h.name,
      asset_class: h.asset_class,
      currency: h.currency,
      total_quantity: qty,
      average_cost: avg,
      cost_basis_native: costNative,
      cost_basis_aud: costAud,
      target_allocation: h.target_allocation,
    };
  });

  const totalAud = rows.reduce((sum, r) => sum + r.cost_basis_aud, 0);

  // Second pass: allocation % + deviation now that the total is known.
  const withAllocation = rows.map((r) => {
    const actual = totalAud > 0 ? round2((r.cost_basis_aud / totalAud) * 100) : 0;
    const target = Number(r.target_allocation);
    const deviation = round2(actual - (Number.isFinite(target) ? target : 0));
    return { ...r, actual_allocation_pct: actual, deviation };
  });

  return {
    total_cost_basis_aud: round2(totalAud),
    holdings: withAllocation,
    note: 'Allocation based on cost basis — live prices not configured',
  };
}

/**
 * GET /api/smsf/summary — computed allocation analysis from live holdings.
 * On any upstream failure returns 502 with a stable error body.
 */
router.get('/summary', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.WEALTHCANVAS_URL}/api/holdings`);
    res.json(computeSummary(data));
  } catch {
    res.status(502).json({ error: 'WealthCanvas unavailable' });
  }
});

module.exports = router;
