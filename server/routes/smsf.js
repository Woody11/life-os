const express = require('express');
const { USD_TO_AUD } = require('../config');
const { gatherPrices, gatherDividends } = require('../lib/yahoo');

const router = express.Router();

// Slightly longer than the Home aggregate timeout: this is a direct passthrough
// the SMSF tab depends on, so give the upstream a bit more room before failing.
const FETCH_TIMEOUT_MS = 5000;

/**
 * GET JSON from a URL with a hard timeout. Throws on network error / non-2xx /
 * timeout so callers can uniformly degrade to a 502.
 */
async function fetchJson(url) {
  const upstream = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
  return await upstream.json();
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

/**
 * GET /api/smsf/prices — live prices + unrealised P&L per holding.
 *
 * Reads WealthCanvas holdings, fetches each ticker's live price from Yahoo, and
 * returns per-holding market value / P&L plus portfolio totals. Individual
 * tickers that fail pricing degrade to null live fields (see gatherPrices).
 * Only a WealthCanvas failure yields a 502.
 */
router.get('/prices', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.WEALTHCANVAS_URL}/api/holdings`);
    const { rows, totals } = await gatherPrices(data);
    res.json({
      holdings: rows,
      total_market_value_aud: totals.total_market_value_aud,
      total_cost_basis_aud: totals.total_cost_basis_aud,
      total_pnl_aud: totals.total_pnl_aud,
      total_pnl_pct: totals.total_pnl_pct,
      day_pnl_aud: totals.day_pnl_aud,
      day_pnl_pct: totals.day_pnl_pct,
      priced_count: totals.priced_count,
      holdings_count: totals.holdings_count,
    });
  } catch {
    res.status(502).json({ error: 'WealthCanvas unavailable' });
  }
});

/**
 * GET /api/smsf/dividends — dividend + earnings calendar per holding.
 *
 * Reads WealthCanvas holdings and returns each ticker's annual dividend rate,
 * ex-dividend date, payment date and next earnings/report date from Yahoo.
 * Tickers Yahoo can't answer for degrade to nulls; only a WealthCanvas failure
 * yields a 502.
 */
router.get('/dividends', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.WEALTHCANVAS_URL}/api/holdings`);
    const dividends = await gatherDividends(data);

    // Attach share count so the frontend can compute annual dividend totals.
    const qtyByTicker = {};
    for (const h of data.data ?? []) {
      qtyByTicker[h.ticker] = Number(h.total_quantity ?? 0) || null;
    }

    const enriched = dividends.map((d) => ({
      ...d,
      total_quantity: qtyByTicker[d.ticker] ?? null,
    }));

    res.json({ dividends: enriched });
  } catch {
    res.status(502).json({ error: 'WealthCanvas unavailable' });
  }
});

module.exports = router;
