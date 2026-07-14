// Shared cost-basis-in-AUD computation for WealthCanvas holdings.
//
// Previously home.js (computePortfolio) and smsf.js (computeSummary) each
// reimplemented this independently — same qty × avg_cost × FX-if-USD math,
// two separate call sites, no shared source of truth. That's exactly how
// they could silently drift apart (e.g. one picking up a live FX rate
// change and the other not). Both routes now build on this single function.

const { getUsdToAud } = require('./fx');

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Compute per-holding cost basis in AUD (and the portfolio total) from a
 * WealthCanvas holdings payload, using the current live-or-fallback USD→AUD
 * rate for US_* asset classes.
 *
 * A holding with a non-numeric quantity/cost is marked invalid and excluded
 * from the total rather than propagating NaN — one malformed upstream
 * record must not poison the whole portfolio total.
 *
 * Returns { rows, total_cost_basis_aud, usd_to_aud }.
 */
async function computeCostBasis(holdingsPayload) {
  const holdings = holdingsPayload?.data ?? [];
  const usdToAud = await getUsdToAud();

  const rows = holdings.map((h) => {
    const qty = Number(h.total_quantity);
    const avg = Number(h.average_cost);
    const valid = Number.isFinite(qty) && Number.isFinite(avg);
    const isUsd = String(h.asset_class).startsWith('US_');
    const costNative = valid ? round2(qty * avg) : null;
    const costAud = valid ? round2(costNative * (isUsd ? usdToAud : 1)) : null;
    return {
      ticker: h.ticker,
      name: h.name,
      asset_class: h.asset_class,
      currency: h.currency,
      total_quantity: Number.isFinite(qty) ? qty : null,
      average_cost: Number.isFinite(avg) ? avg : null,
      cost_basis_native: costNative,
      cost_basis_aud: costAud,
      target_allocation: h.target_allocation,
      valid,
    };
  });

  const totalAud = rows.reduce((sum, r) => sum + (r.valid ? r.cost_basis_aud : 0), 0);

  return { rows, total_cost_basis_aud: round2(totalAud), usd_to_aud: usdToAud };
}

module.exports = { computeCostBasis, round2 };
