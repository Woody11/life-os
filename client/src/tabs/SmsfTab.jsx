import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, SectionSpinner, SectionError } from '../components/ui.jsx';
import { formatAudPrecise as formatAud } from '../lib/format.js';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function formatPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

function formatSignedPct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function deviationClass(deviation) {
  const abs = Math.abs(Number(deviation) || 0);
  if (abs <= 2) return 'text-emerald-400';
  if (abs <= 5) return 'text-yellow-400';
  return 'text-red-400';
}

// ---------------------------------------------------------------------------
// Section A — Allocation Overview
// ---------------------------------------------------------------------------

function pnlClass(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 'text-slate-300';
  return n > 0 ? 'text-emerald-400' : 'text-red-400';
}

function formatSignedAud(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatAud(n)}`;
}

function AllocationSection({ dividends }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  // Live prices load independently and never block the allocation table.
  const [prices, setPrices] = useState({ status: 'loading', byTicker: {}, totals: null });

  // Compute annual dividend total from the shared dividends prop.
  const annualDivTotal = (() => {
    if (!Array.isArray(dividends)) return null;
    const total = dividends.reduce((sum, d) => {
      if (d.dividend_amount != null && d.total_quantity != null) {
        return sum + d.dividend_amount * d.total_quantity;
      }
      return sum;
    }, 0);
    return total > 0 ? Math.round(total * 100) / 100 : null;
  })();

  const load = useCallback(async (signal) => {
    setState({ status: 'loading', data: null, error: null });
    setPrices({ status: 'loading', byTicker: {}, totals: null });

    // Allocation (cost basis / deviation) is the primary payload.
    try {
      const res = await fetch('/api/smsf/summary', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setState({ status: 'ready', data: json, error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState({ status: 'error', data: null, error: err.message || 'Failed to load' });
    }

    // Live prices — best-effort overlay; failure degrades to em-dashes.
    try {
      const res = await fetch('/api/smsf/prices', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const byTicker = {};
      for (const p of json.holdings ?? []) byTicker[p.ticker] = p;
      setPrices({ status: 'ready', byTicker, totals: json });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setPrices({ status: 'error', byTicker: {}, totals: null });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const rows = [...(state.data?.holdings ?? [])].sort(
    (a, b) => b.cost_basis_aud - a.cost_basis_aud,
  );

  const totals = prices.totals;
  const hasLive = prices.status === 'ready' && (totals?.priced_count ?? 0) > 0;
  const subtitle =
    prices.status === 'loading'
      ? 'Loading live prices…'
      : hasLive
        ? totals.priced_count === totals.holdings_count
          ? 'Live prices — market value & unrealised P&L'
          : `Live prices for ${totals.priced_count}/${totals.holdings_count} holdings · cost basis for the rest`
        : 'Live prices unavailable — showing cost basis only';

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Allocation Overview</h2>
      <p className="mt-1 text-xs text-slate-500">{subtitle}</p>

      {state.status === 'loading' && <SectionSpinner label="Loading allocation…" />}

      {state.status === 'error' && (
        <div className="mt-4">
          <SectionError
            message={`Failed to load allocation: ${state.error}`}
            onRetry={() => load()}
          />
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-widest text-slate-500">
                  <th className="py-2 pr-4 font-medium">Ticker</th>
                  <th className="py-2 pr-4 font-medium">Asset Class</th>
                  <th className="py-2 pr-4 text-right font-medium">Shares</th>
                  <th className="py-2 pr-4 text-right font-medium">Avg Cost</th>
                  <th className="py-2 pr-4 text-right font-medium">Price</th>
                  <th className="py-2 pr-4 text-right font-medium">Cost Basis (AUD)</th>
                  <th className="py-2 pr-4 text-right font-medium">Market Value (AUD)</th>
                  <th className="py-2 pr-4 text-right font-medium">Unrealised P&amp;L</th>
                  <th className="py-2 pr-4 text-right font-medium">P&amp;L %</th>
                  <th className="py-2 pr-4 text-right font-medium">Actual %</th>
                  <th className="py-2 pr-4 text-right font-medium">Target %</th>
                  <th className="py-2 text-right font-medium">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const p = prices.byTicker[h.ticker];
                  const liveAllocationPct =
                    hasLive && p?.market_value_aud != null && totals?.total_market_value_aud > 0
                      ? Math.round((p.market_value_aud / totals.total_market_value_aud) * 10000) / 100
                      : null;
                  const displayAllocationPct = liveAllocationPct ?? h.actual_allocation_pct;
                  const target = Number(h.target_allocation);
                  const displayDeviation = Number.isFinite(target)
                    ? Math.round((displayAllocationPct - target) * 100) / 100
                    : h.deviation;

                  return (
                    <tr
                      key={h.ticker}
                      className="border-b border-white/[0.04] text-slate-200 last:border-0 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="py-2.5 pr-4 font-semibold text-white">{h.ticker}</td>
                      <td className="py-2.5 pr-4 text-slate-400">{h.asset_class}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{h.total_quantity}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(h.average_cost)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(p?.price)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatAud(h.cost_basis_aud)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatAud(p?.market_value_aud)}</td>
                      <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${pnlClass(p?.pnl_aud)}`}>
                        {formatSignedAud(p?.pnl_aud)}
                      </td>
                      <td className={`py-2.5 pr-4 text-right tabular-nums ${pnlClass(p?.pnl_pct)}`}>
                        {formatSignedPct(p?.pnl_pct)}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatPct(displayAllocationPct)}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums text-slate-400">{formatPct(h.target_allocation)}</td>
                      <td className={`py-2.5 text-right font-medium tabular-nums ${deviationClass(displayDeviation)}`}>
                        {formatSignedPct(displayDeviation)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-2 md:hidden">
            {rows.map((h) => {
              const p = prices.byTicker[h.ticker];
              const liveAllocationPct =
                hasLive && p?.market_value_aud != null && totals?.total_market_value_aud > 0
                  ? Math.round((p.market_value_aud / totals.total_market_value_aud) * 10000) / 100
                  : null;
              const displayAllocationPct = liveAllocationPct ?? h.actual_allocation_pct;
              const target = Number(h.target_allocation);
              const displayDeviation = Number.isFinite(target)
                ? Math.round((displayAllocationPct - target) * 100) / 100
                : h.deviation;

              return (
                <div key={h.ticker} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-white">{h.ticker}</div>
                      <div className="text-xs text-slate-400">{h.asset_class}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums text-white">{formatAud(p?.market_value_aud)}</div>
                      <div className={`text-xs font-medium tabular-nums ${pnlClass(p?.pnl_pct)}`}>
                        {formatSignedAud(p?.pnl_aud)} ({formatSignedPct(p?.pnl_pct)})
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                    <div>
                      <div className="text-slate-500">Shares</div>
                      <div className="tabular-nums text-slate-300">{h.total_quantity}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Avg Cost</div>
                      <div className="tabular-nums text-slate-300">{formatMoney(h.average_cost)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Price</div>
                      <div className="tabular-nums text-slate-300">{formatMoney(p?.price)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Actual %</div>
                      <div className="tabular-nums text-slate-300">{formatPct(displayAllocationPct)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Target %</div>
                      <div className="tabular-nums text-slate-300">{formatPct(h.target_allocation)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Deviation</div>
                      <div className={`tabular-nums font-medium ${deviationClass(displayDeviation)}`}>
                        {formatSignedPct(displayDeviation)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No holdings.</p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-end gap-x-12 gap-y-5 border-t border-white/[0.06] pt-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                {hasLive ? 'Total market value' : 'Total portfolio cost basis'}
              </div>
              <div className="mt-1 text-3xl font-bold text-white">
                {formatAud(hasLive ? totals.total_market_value_aud : state.data?.total_cost_basis_aud)}{' '}
                <span className="text-lg font-medium text-slate-400">AUD</span>
              </div>
              {hasLive && (
                <div className="mt-1 text-xs text-slate-500">
                  Cost basis {formatAud(totals.total_cost_basis_aud)}
                </div>
              )}
            </div>

            {hasLive && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Unrealised P&amp;L
                </div>
                <div className={`mt-1 text-3xl font-bold ${pnlClass(totals.total_pnl_aud)}`}>
                  {formatSignedAud(totals.total_pnl_aud)}
                </div>
                <div className={`mt-1 text-xs font-medium ${pnlClass(totals.total_pnl_pct)}`}>
                  {formatSignedPct(totals.total_pnl_pct)}
                </div>
              </div>
            )}

            {annualDivTotal != null && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  Annual Dividends
                </div>
                <div className="mt-1 text-3xl font-bold text-emerald-400">
                  {formatAud(annualDivTotal)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  est. annual income
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section B — Dividend Calendar
// ---------------------------------------------------------------------------

function DividendSection({ dividendsState, onRetry }) {
  const state = dividendsState;

  const rows = state.data ?? [];

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Dividend Calendar</h2>
      <p className="mt-1 text-xs text-slate-500">
        Ex-dividend, payment and next report dates per holding
      </p>

      {state.status === 'loading' && <SectionSpinner label="Loading dividends…" />}

      {state.status === 'error' && (
        <div className="mt-4">
          <SectionError
            message={`Failed to load dividends: ${state.error}`}
            onRetry={onRetry}
          />
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-widest text-slate-500">
                  <th className="py-2 pr-4 font-medium">Ticker</th>
                  <th className="py-2 pr-4 text-right font-medium">Shares</th>
                  <th className="py-2 pr-4 text-right font-medium">Annual Div/Share</th>
                  <th className="py-2 pr-4 text-right font-medium">Annual Total</th>
                  <th className="py-2 pr-4 font-medium">Ex-Div Date</th>
                  <th className="py-2 pr-4 font-medium">Pay Date</th>
                  <th className="py-2 font-medium">Next Report Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr
                    key={d.ticker}
                    className="border-b border-white/[0.04] text-slate-200 last:border-0 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-4 font-semibold text-white">{d.ticker}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-300">
                      {d.total_quantity ?? '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">
                      {d.dividend_amount == null ? '—' : formatMoney(d.dividend_amount)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-emerald-400 font-medium">
                      {d.dividend_amount != null && d.total_quantity != null
                        ? formatAud(Math.round(d.dividend_amount * d.total_quantity * 100) / 100)
                        : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-300">{formatDate(d.ex_div_date)}</td>
                    <td className="py-2.5 pr-4 text-slate-300">{formatDate(d.pay_date)}</td>
                    <td className="py-2.5 text-slate-300">{formatDate(d.next_report_date)}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No dividend data.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-2 md:hidden">
            {rows.map((d) => (
              <div key={d.ticker} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-start justify-between">
                  <div className="font-semibold text-white">{d.ticker}</div>
                  <div className="text-right">
                    <div className="tabular-nums font-medium text-emerald-400">
                      {d.dividend_amount != null && d.total_quantity != null
                        ? formatAud(Math.round(d.dividend_amount * d.total_quantity * 100) / 100)
                        : '—'}
                    </div>
                    <div className="text-xs text-slate-500">annual total</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div>
                    <div className="text-slate-500">Shares</div>
                    <div className="tabular-nums text-slate-300">{d.total_quantity ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Annual Div/Share</div>
                    <div className="tabular-nums text-slate-300">
                      {d.dividend_amount == null ? '—' : formatMoney(d.dividend_amount)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Ex-Div Date</div>
                    <div className="text-slate-300">{formatDate(d.ex_div_date)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Pay Date</div>
                    <div className="text-slate-300">{formatDate(d.pay_date)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-slate-500">Next Report Date</div>
                    <div className="text-slate-300">{formatDate(d.next_report_date)}</div>
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No dividend data.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section C — Transaction History
// ---------------------------------------------------------------------------

function TransactionSection() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [limit, setLimit] = useState(20);

  const load = useCallback(async (nextLimit, signal) => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const res = await fetch(`/api/smsf/transactions?limit=${nextLimit}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setState({ status: 'ready', data: json.data ?? [], error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState({ status: 'error', data: null, error: err.message || 'Failed to load' });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(limit, controller.signal);
    return () => controller.abort();
  }, [load, limit]);

  const txns = state.data ?? [];

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Transaction History</h2>

      {state.status === 'loading' && <SectionSpinner label="Loading transactions…" />}

      {state.status === 'error' && (
        <div className="mt-4">
          <SectionError
            message={`Failed to load transactions: ${state.error}`}
            onRetry={() => load(limit)}
          />
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-widest text-slate-500">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Ticker</th>
                  <th className="py-2 pr-4 text-right font-medium">Qty</th>
                  <th className="py-2 pr-4 text-right font-medium">Price</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => {
                  const isBuy = String(t.type).toUpperCase() === 'BUY';
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-white/[0.04] text-slate-200 last:border-0 border-l-2 transition-colors hover:bg-white/[0.02] ${
                        isBuy ? 'border-l-emerald-500' : 'border-l-red-500'
                      }`}
                    >
                      <td className="py-2.5 pl-3 pr-4 text-slate-300">{formatDate(t.date)}</td>
                      <td className={`py-2.5 pr-4 font-medium ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.type}
                      </td>
                      <td className="py-2.5 pr-4 font-semibold text-white">{t.ticker}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{t.quantity}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(t.price_per_share)}</td>
                      <td className="py-2.5 text-right tabular-nums">
                        {formatMoney(t.total_amount)}{' '}
                        <span className="text-xs text-slate-500">{t.currency}</span>
                      </td>
                    </tr>
                  );
                })}
                {txns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No transactions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 space-y-2 md:hidden">
            {txns.map((t) => {
              const isBuy = String(t.type).toUpperCase() === 'BUY';
              return (
                <div
                  key={t.id}
                  className={`rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 border-l-2 ${
                    isBuy ? 'border-l-emerald-500' : 'border-l-red-500'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className={`text-xs font-medium uppercase ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
                        {t.type}
                      </span>
                      <div className="font-semibold text-white">{t.ticker}</div>
                    </div>
                    <div className="text-right">
                      <div className="tabular-nums text-white">
                        {formatMoney(t.total_amount)} <span className="text-xs text-slate-500">{t.currency}</span>
                      </div>
                      <div className="text-xs text-slate-500">{formatDate(t.date)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs">
                    <span className="text-slate-500">Qty <span className="tabular-nums text-slate-300">{t.quantity}</span></span>
                    <span className="text-slate-500">Price <span className="tabular-nums text-slate-300">{formatMoney(t.price_per_share)}</span></span>
                  </div>
                </div>
              );
            })}
            {txns.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No transactions.</p>
            )}
          </div>

          {limit <= 20 && txns.length >= 20 && (
            <button
              onClick={() => setLimit(50)}
              className="mt-4 rounded-xl border border-white/5 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white"
            >
              Load more
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section D — Dispatch Buffet
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT =
  'Review current holdings against the SMSF strategy. Flag any allocation drift >3%, note any thesis-relevant developments, and provide a current view on each position.';

function DispatchSection() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (feedback?.type !== 'success') return undefined;
    const timer = setTimeout(() => setFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [feedback]);

  async function handleDispatch() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: 'Buffet', prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setFeedback({ type: 'success', text: `Dispatched — task #${json.dispatch_id} queued` });
    } catch (err) {
      setFeedback({ type: 'error', text: `Dispatch failed: ${err.message || 'unknown error'}` });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Dispatch Buffet</h2>
      <p className="mt-1 text-xs text-slate-500">
        Send current portfolio to Buffet for analysis
      </p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        className="mt-5 w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500/50 focus:outline-none transition-colors"
      />

      <button
        onClick={handleDispatch}
        disabled={submitting || !prompt.trim()}
        className="mt-3 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Dispatching…' : 'Dispatch'}
      </button>

      {feedback?.type === 'success' && (
        <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">
          {feedback.text}
        </div>
      )}
      {feedback?.type === 'error' && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
          {feedback.text}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab shell
// ---------------------------------------------------------------------------

export default function SmsfTab() {
  const [dividendsState, setDividendsState] = useState({ status: 'loading', data: null, error: null });

  const loadDividends = useCallback(async (signal) => {
    setDividendsState({ status: 'loading', data: null, error: null });
    try {
      const res = await fetch('/api/smsf/dividends', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setDividendsState({ status: 'ready', data: json.dividends ?? [], error: null });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setDividendsState({ status: 'error', data: null, error: err.message || 'Failed to load' });
    }
  }, []);

  // Track abort controller so retry can abort any in-flight request.
  const abortRef = useRef(null);
  const retryDividends = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    loadDividends(abortRef.current.signal);
  }, [loadDividends]);

  useEffect(() => {
    abortRef.current = new AbortController();
    loadDividends(abortRef.current.signal);
    return () => abortRef.current?.abort();
  }, [loadDividends]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-400">Portfolio</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">SMSF</h1>
      </div>

      <div className="space-y-6">
        <AllocationSection dividends={dividendsState.data} />

        <DividendSection dividendsState={dividendsState} onRetry={retryDividends} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <TransactionSection />
          </div>
          <div className="lg:col-span-1">
            <DispatchSection />
          </div>
        </div>
      </div>
    </div>
  );
}
