import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatAud(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

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
// Shared UI atoms
// ---------------------------------------------------------------------------

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-white/5 bg-white/[0.03] p-6 ${className}`}>
      {children}
    </div>
  );
}

function SectionSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function SectionError({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
      <div>{message || 'Something went wrong.'}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section A — Allocation Overview
// ---------------------------------------------------------------------------

function AllocationSection() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  const load = useCallback(async (signal) => {
    setState({ status: 'loading', data: null, error: null });
    try {
      const res = await fetch('/api/smsf/summary', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setState({ status: 'ready', data: json, error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState({ status: 'error', data: null, error: err.message || 'Failed to load' });
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

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Allocation Overview</h2>
      <p className="mt-1 text-xs text-slate-500">
        Cost basis only — live prices not configured
      </p>

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
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-widest text-slate-500">
                  <th className="py-2 pr-4 font-medium">Ticker</th>
                  <th className="py-2 pr-4 font-medium">Asset Class</th>
                  <th className="py-2 pr-4 font-medium">Currency</th>
                  <th className="py-2 pr-4 text-right font-medium">Shares</th>
                  <th className="py-2 pr-4 text-right font-medium">Avg Cost</th>
                  <th className="py-2 pr-4 text-right font-medium">Cost Basis (AUD)</th>
                  <th className="py-2 pr-4 text-right font-medium">Actual %</th>
                  <th className="py-2 pr-4 text-right font-medium">Target %</th>
                  <th className="py-2 text-right font-medium">Deviation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr
                    key={h.ticker}
                    className="border-b border-white/[0.04] text-slate-200 last:border-0 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="py-2.5 pr-4 font-semibold text-white">{h.ticker}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{h.asset_class}</td>
                    <td className="py-2.5 pr-4 text-slate-400">{h.currency}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{h.total_quantity}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatMoney(h.average_cost)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatAud(h.cost_basis_aud)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{formatPct(h.actual_allocation_pct)}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-slate-400">{formatPct(h.target_allocation)}</td>
                    <td className={`py-2.5 text-right font-medium tabular-nums ${deviationClass(h.deviation)}`}>
                      {formatSignedPct(h.deviation)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 border-t border-white/[0.06] pt-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Total portfolio cost basis
            </div>
            <div className="mt-1 text-3xl font-bold text-white">
              {formatAud(state.data?.total_cost_basis_aud)}{' '}
              <span className="text-lg font-medium text-slate-400">AUD</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section B — Transaction History
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
          <div className="mt-4 overflow-x-auto">
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
// Section C — Dispatch Buffet
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
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-400">Portfolio</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">SMSF</h1>
      </div>

      <div className="space-y-6">
        <AllocationSection />

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
