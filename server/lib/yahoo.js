// Yahoo Finance helpers — live prices + dividend/earnings calendar.
//
// Two Yahoo surfaces are used:
//   - chart (v8)         → regularMarketPrice / previousClose. No auth needed.
//   - quoteSummary (v10) → dividend + earnings metadata. Requires a cookie+crumb
//     pair, so we fetch one lazily and cache it for the process lifetime,
//     refreshing on the "Invalid Crumb" failure.
//
// All outbound requests send a browser-ish User-Agent to reduce 429s and carry a
// hard per-request timeout so one slow ticker can't stall an aggregate response.

const { USD_TO_AUD } = require('../config');

const UA = 'Mozilla/5.0';
const YAHOO_TIMEOUT_MS = 5000;

/** True for holdings priced in USD (US_* asset classes). */
function isUsd(holding) {
  return String(holding.asset_class).startsWith('US_');
}

/** Yahoo ticker: AU shares carry an `.AX` suffix, US shares are bare. */
function yahooSymbol(holding) {
  return isUsd(holding) ? holding.ticker : `${holding.ticker}.AX`;
}

/** Round to 2dp, guarding against FP drift. */
function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Unix seconds → ISO date (YYYY-MM-DD), or null if absent/invalid. */
function unixToIsoDate(secs) {
  if (secs == null || !Number.isFinite(Number(secs))) return null;
  const dt = new Date(Number(secs) * 1000);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/** fetch(url) with a browser UA and hard timeout. Throws on non-2xx/timeout. */
async function fetchWithTimeout(url, extra = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);
  const { headers: extraHeaders, ...rest } = extra;
  try {
    const res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      // Merge headers last so a caller-supplied Cookie can't clobber the
      // User-Agent — Yahoo 429s requests without a browser UA.
      headers: { 'User-Agent': UA, ...(extraHeaders || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Live prices (chart endpoint)
// ---------------------------------------------------------------------------

/**
 * Fetch price metadata for one holding from the Yahoo chart endpoint.
 * Returns { price, previousClose, currency } in the holding's native currency,
 * or null on any failure (caller degrades that ticker gracefully).
 */
async function fetchPriceMeta(holding) {
  const sym = yahooSymbol(holding);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}`;
  try {
    const res = await fetchWithTimeout(url);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || !Number.isFinite(Number(meta.regularMarketPrice))) return null;
    return {
      price: Number(meta.regularMarketPrice),
      previousClose: Number.isFinite(Number(meta.chartPreviousClose))
        ? Number(meta.chartPreviousClose)
        : Number(meta.previousClose),
      currency: meta.currency ?? holding.currency,
    };
  } catch {
    return null;
  }
}

/**
 * Enrich holdings with live prices and derived AUD figures.
 *
 * For each holding computes cost basis, market value, unrealised P&L (vs cost)
 * and today's P&L (vs previous close), all converted to AUD via the fixed FX
 * fallback for USD positions. Missing prices leave the live fields null.
 *
 * Returns { rows, totals } where totals aggregate over priced holdings only
 * (so P&L% stays meaningful when a ticker is missing).
 */
async function gatherPrices(holdingsPayload) {
  const holdings = holdingsPayload?.data ?? [];

  const rows = await Promise.all(
    holdings.map(async (h) => {
      const usd = isUsd(h);
      const fx = usd ? USD_TO_AUD : 1;
      const qty = Number(h.total_quantity);
      const avg = Number(h.average_cost);
      // A non-numeric quantity/cost is left as a null cost basis (which is
      // addition-safe) instead of NaN, which would otherwise poison every
      // portfolio total it gets summed into.
      const validCost = Number.isFinite(qty) && Number.isFinite(avg);
      const costBasisAud = validCost ? round2(qty * avg * fx) : null;

      const meta = await fetchPriceMeta(h);

      if (!meta || !validCost) {
        return {
          ticker: h.ticker,
          price: meta ? round2(meta.price) : null,
          currency: meta?.currency ?? h.currency,
          market_value_aud: null,
          cost_basis_aud: costBasisAud,
          pnl_aud: null,
          pnl_pct: null,
          day_pnl_aud: null,
        };
      }

      const marketValueAud = round2(qty * meta.price * fx);
      const pnlAud = round2(marketValueAud - costBasisAud);
      const pnlPct = costBasisAud > 0 ? round2((pnlAud / costBasisAud) * 100) : null;
      const dayPnlAud = Number.isFinite(meta.previousClose)
        ? round2(qty * (meta.price - meta.previousClose) * fx)
        : null;

      return {
        ticker: h.ticker,
        price: round2(meta.price),
        currency: meta.currency,
        market_value_aud: marketValueAud,
        cost_basis_aud: costBasisAud,
        pnl_aud: pnlAud,
        pnl_pct: pnlPct,
        day_pnl_aud: dayPnlAud,
      };
    }),
  );

  const priced = rows.filter((r) => r.price != null);
  const totalMarket = round2(priced.reduce((s, r) => s + r.market_value_aud, 0));
  const pricedCost = round2(priced.reduce((s, r) => s + r.cost_basis_aud, 0));
  const totalCost = round2(rows.reduce((s, r) => s + r.cost_basis_aud, 0));
  const totalPnl = round2(totalMarket - pricedCost);
  const totalPnlPct = pricedCost > 0 ? round2((totalPnl / pricedCost) * 100) : null;
  const dayPnl = priced.some((r) => r.day_pnl_aud != null)
    ? round2(priced.reduce((s, r) => s + (r.day_pnl_aud ?? 0), 0))
    : null;
  const dayBase = round2(totalMarket - (dayPnl ?? 0));
  const dayPnlPct = dayPnl != null && dayBase > 0 ? round2((dayPnl / dayBase) * 100) : null;

  return {
    rows,
    totals: {
      total_market_value_aud: priced.length ? totalMarket : null,
      total_cost_basis_aud: totalCost,
      total_pnl_aud: priced.length ? totalPnl : null,
      total_pnl_pct: priced.length ? totalPnlPct : null,
      day_pnl_aud: dayPnl,
      day_pnl_pct: dayPnlPct,
      priced_count: priced.length,
      holdings_count: rows.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Dividends / earnings (quoteSummary endpoint — needs cookie + crumb)
// ---------------------------------------------------------------------------

let cachedPair = null;
let inflightPair = null;

/**
 * Obtain (and cache) a Yahoo cookie + crumb pair. quoteSummary rejects requests
 * without a matching pair ("Invalid Crumb").
 *
 * The pair is cached for the process lifetime and the in-flight acquisition is
 * memoized, so a burst of concurrent callers triggers exactly one seed+crumb
 * round-trip instead of one each (which would trip Yahoo's rate limiter). Pass
 * force=true to discard the cache and refresh after a rejection.
 */
function getCrumb(force = false) {
  if (!force && cachedPair) return Promise.resolve(cachedPair);
  if (!force && inflightPair) return inflightPair;

  inflightPair = acquireCrumb()
    .then((pair) => {
      cachedPair = pair;
      return pair;
    })
    .finally(() => {
      inflightPair = null;
    });
  return inflightPair;
}

/** Perform the actual cookie-seed + crumb fetch. */
async function acquireCrumb() {
  // Prime a session cookie. fc.yahoo.com answers 404 but still sets the cookie
  // we need, so read the header directly rather than via fetchWithTimeout (which
  // rejects non-2xx). Multiple Set-Cookie lines are joined into one Cookie header.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);
  let cookiePairs = [];
  try {
    const seed = await fetch('https://fc.yahoo.com', {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });
    const jar = seed.headers.getSetCookie
      ? seed.headers.getSetCookie()
      : [seed.headers.get('set-cookie')].filter(Boolean);
    cookiePairs = jar.map((c) => c.split(';')[0]);
  } catch {
    cookiePairs = [];
  } finally {
    clearTimeout(timer);
  }
  const cookie = cookiePairs.join('; ');

  const res = await fetchWithTimeout(
    'https://query1.finance.yahoo.com/v1/test/getcrumb',
    { headers: cookie ? { Cookie: cookie } : {} },
  );
  const crumb = (await res.text()).trim();
  return { crumb, cookie };
}

/**
 * Fetch dividend + earnings calendar fields for one holding.
 * Returns { dividend_amount, ex_div_date, pay_date, next_report_date } with
 * nulls where unavailable; all-null on any failure.
 */
async function fetchDividend(holding) {
  const sym = yahooSymbol(holding);
  const nulls = {
    ticker: holding.ticker,
    dividend_amount: null,
    ex_div_date: null,
    pay_date: null,
    next_report_date: null,
  };

  async function attempt(force) {
    const { crumb, cookie } = await getCrumb(force);
    const url =
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${sym}` +
      `?modules=summaryDetail,calendarEvents,defaultKeyStatistics&crumb=${encodeURIComponent(crumb)}`;
    const res = await fetchWithTimeout(url, {
      headers: cookie ? { Cookie: cookie } : {},
    });
    return res.json();
  }

  try {
    let json;
    try {
      json = await attempt(false);
    } catch (e) {
      // quoteSummary rate-limits bursts (429). Back off briefly and retry once.
      if (/HTTP 429/.test(e.message)) {
        await sleep(1200);
        json = await attempt(false);
      } else {
        throw e;
      }
    }
    // A stale crumb surfaces as a finance.error rather than an HTTP error.
    if (json?.finance?.error) {
      json = await attempt(true);
    }
    const result = json?.quoteSummary?.result?.[0];
    if (!result) return nulls;

    const sd = result.summaryDetail ?? {};
    const ks = result.defaultKeyStatistics ?? {};
    const earnings = result.calendarEvents?.earnings ?? {};
    const nextReport = Array.isArray(earnings.earningsDate)
      ? earnings.earningsDate[0]?.raw
      : null;

    // Yahoo's summaryDetail.dividendDate is unreliable for non-US stocks;
    // fall back to defaultKeyStatistics.lastDividendDate when it's missing.
    const payDate =
      unixToIsoDate(sd.dividendDate?.raw) ??
      unixToIsoDate(ks.lastDividendDate?.raw);

    return {
      ticker: holding.ticker,
      dividend_amount: Number.isFinite(Number(sd.dividendRate?.raw))
        ? Number(sd.dividendRate.raw)
        : null,
      ex_div_date: unixToIsoDate(sd.exDividendDate?.raw),
      pay_date: payDate,
      next_report_date: unixToIsoDate(nextReport),
    };
  } catch {
    return nulls;
  }
}

/** Resolve after `ms` milliseconds. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch dividend rows for every holding.
 *
 * Sequential with a small inter-request gap: the quoteSummary endpoint 429s on
 * concurrent bursts (unlike the chart endpoint used for prices), and the crumb
 * is fetched once up front so each ticker is a single request.
 */
async function gatherDividends(holdingsPayload) {
  const holdings = holdingsPayload?.data ?? [];
  const out = [];
  for (let i = 0; i < holdings.length; i += 1) {
    if (i > 0) await sleep(300);
    out.push(await fetchDividend(holdings[i]));
  }
  return out;
}

module.exports = { gatherPrices, gatherDividends };
