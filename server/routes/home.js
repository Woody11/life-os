const express = require('express');
const { getDb } = require('../db/init');
const { USD_TO_AUD } = require('../config');
const { gatherPrices } = require('../lib/yahoo');
const { todayAdelaide, adelaideDayBounds } = require('../lib/adelaideTime');

const router = express.Router();

// Per-upstream fetch timeout. Kept short so one dead dependency can't stall the
// aggregated Home response — the tab polls this and must stay responsive.
const FETCH_TIMEOUT_MS = 5000;

/**
 * GET JSON from a URL with a hard timeout. Resolves to the parsed body, or
 * throws on network error / non-2xx / timeout so the caller can degrade the
 * relevant slice to null and mark the response partial.
 */
async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

/**
 * Compute total portfolio cost basis in AUD from WealthCanvas holdings.
 * cost basis = Σ (total_quantity × average_cost), with US_* asset classes
 * treated as USD and converted at the fixed fallback rate.
 */
function computePortfolio(holdingsPayload) {
  const holdings = holdingsPayload?.data ?? [];
  let totalAud = 0;
  for (const h of holdings) {
    const cost = Number(h.total_quantity) * Number(h.average_cost);
    if (!Number.isFinite(cost)) continue;
    const inAud = String(h.asset_class).startsWith('US_') ? cost * USD_TO_AUD : cost;
    totalAud += inAud;
  }
  return {
    total_cost_basis_aud: Math.round(totalAud * 100) / 100,
    total_market_value_aud: null,
    pnl_today_aud: null,
    pnl_today_pct: null,
    note: 'Showing cost basis only — live prices not configured',
  };
}

const STATUS_LABELS = {
  scripting: 'Scripting',
  filming: 'Filming',
  editing: 'Editing',
  published: 'Published',
};

// Title-case an arbitrary status string as the fallback label.
function titleCase(str) {
  return String(str)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Pick the "this week" MBS focus video: the nearest upcoming targetPublishDate
 * that hasn't passed and isn't already published. If none qualify, fall back to
 * the most recently dated video overall.
 */
function computeMbsFocus(schedule) {
  if (!Array.isArray(schedule) || schedule.length === 0) return null;

  // Compare on date only (YYYY-MM-DD) using Adelaide time to avoid midnight DST drift.
  const today = todayAdelaide();

  const upcoming = schedule
    .filter(
      (v) =>
        v.status !== 'published' &&
        typeof v.targetPublishDate === 'string' &&
        v.targetPublishDate >= today,
    )
    .sort((a, b) => a.targetPublishDate.localeCompare(b.targetPublishDate));

  let pick = upcoming[0];
  if (!pick) {
    // No upcoming — most recently dated video (published or not).
    pick = [...schedule]
      .filter((v) => typeof v.targetPublishDate === 'string')
      .sort((a, b) => b.targetPublishDate.localeCompare(a.targetPublishDate))[0];
  }
  if (!pick) return null;

  return {
    label: STATUS_LABELS[pick.status] || titleCase(pick.status),
    title: pick.title,
    target_publish: pick.targetPublishDate,
  };
}

/**
 * GET /api/home — aggregated Home-tab snapshot.
 *
 * Fetches WealthCanvas holdings + Lego Studio schedule concurrently and reads
 * the local dispatch counter synchronously. Never returns 500: any upstream
 * failure degrades its slice to null and flips `partial` to true.
 */
router.get('/', async (_req, res) => {
  const wcUrl = `${process.env.WEALTHCANVAS_URL}/api/holdings`;
  const legoUrl = `${process.env.LEGO_STUDIO_URL}/api/schedule`;

  // Promise.allSettled so one rejection doesn't reject the whole batch — we
  // want whatever data is available, not all-or-nothing.
  const [holdingsSettled, scheduleSettled] = await Promise.allSettled([
    fetchJson(wcUrl),
    fetchJson(legoUrl),
  ]);
  const holdingsResult = holdingsSettled.status === 'fulfilled' ? holdingsSettled.value : { __error: holdingsSettled.reason };
  const scheduleResult = scheduleSettled.status === 'fulfilled' ? scheduleSettled.value : { __error: scheduleSettled.reason };

  let partial = false;

  let portfolio = null;
  if (holdingsResult && !holdingsResult.__error) {
    portfolio = computePortfolio(holdingsResult);
    // Overlay live prices when available. A pricing failure is non-fatal — the
    // portfolio slice still returns cost basis; live fields simply stay null.
    try {
      const { totals } = await gatherPrices(holdingsResult);
      if (totals.priced_count > 0) {
        portfolio.total_market_value_aud = totals.total_market_value_aud;
        portfolio.pnl_today_aud = totals.day_pnl_aud;
        portfolio.pnl_today_pct = totals.day_pnl_pct;
        portfolio.note =
          totals.priced_count === totals.holdings_count
            ? 'Live prices — market value and today’s change'
            : `Live prices for ${totals.priced_count}/${totals.holdings_count} holdings`;
      }
    } catch {
      /* keep cost-basis-only portfolio */
    }
  } else {
    partial = true;
  }

  let mbs_focus = null;
  if (scheduleResult && !scheduleResult.__error) {
    mbs_focus = computeMbsFocus(scheduleResult);
  } else {
    partial = true;
  }

  // Local DB reads are synchronous (better-sqlite3). Failures here degrade
  // individual slices to null rather than 500-ing the whole response.
  let agent_tasks_today = 0;
  let spend_today = null;
  try {
    const { start, end } = adelaideDayBounds(todayAdelaide());
    const db = getDb();
    const countRow = db
      .prepare(`SELECT COUNT(*) as count FROM dispatches WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`)
      .get(start, end);
    agent_tasks_today = countRow?.count ?? 0;

    const spendRow = db
      .prepare(
        `SELECT
           COUNT(*) as completed_count,
           COALESCE(SUM(input_tokens),  0) as total_input_tokens,
           COALESCE(SUM(output_tokens), 0) as total_output_tokens,
           COALESCE(SUM(cost_aud),      0) as total_cost_aud
         FROM dispatches
         WHERE status = 'done' AND completed_at >= ? AND completed_at < ?`,
      )
      .get(start, end);
    spend_today = spendRow ?? null;
  } catch {
    agent_tasks_today = null;
    partial = true;
  }

  res.json({
    portfolio,
    agent_tasks_today,
    spend_today,
    mbs_focus,
    last_updated: new Date().toISOString(),
    partial,
  });
});

module.exports = router;
