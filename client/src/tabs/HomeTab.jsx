import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAud(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatPublishDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function formatUpdated(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString('en-AU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Good Morning';
  if (h >= 12 && h < 18) return 'Good Afternoon';
  if (h >= 18 && h < 23) return 'Good Evening';
  return 'Good Night';
}

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, accent = false, children }) {
  return (
    <div className={`
      relative overflow-hidden rounded-2xl border p-6 transition-all
      ${accent
        ? 'border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 to-violet-500/5'
        : 'border-white/5 bg-white/[0.03]'}
    `}>
      <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</div>
      {value !== undefined && (
        <div className="mt-3 text-4xl font-bold tracking-tight text-white">{value}</div>
      )}
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home tab
// ---------------------------------------------------------------------------

export default function HomeTab() {
  const navigate  = useNavigate();
  const clock     = useClock();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/home');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const greeting  = getGreeting();
  const timeStr   = clock.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr   = clock.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const portfolio = data?.portfolio ?? null;
  const mbs       = data?.mbs_focus ?? null;
  const tasks     = data?.agent_tasks_today;
  const costBasis = portfolio ? formatAud(portfolio.total_cost_basis_aud) : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">

      {/* ── Hero header ── */}
      <div className="mb-10 flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-400">{dateStr}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">
            {greeting}, Woody
          </h1>
        </div>

        {/* Digital clock */}
        <div className="flex flex-col items-end">
          <div className="font-mono text-3xl font-semibold tabular-nums text-white">
            {timeStr}
          </div>
          {data?.last_updated && (
            <span className="mt-1 text-xs text-slate-600">
              data {formatUpdated(data.last_updated)}
            </span>
          )}
        </div>
      </div>

      {/* Partial data warning */}
      {data?.partial && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          <span>⚠</span>
          <span>Some upstream services are unavailable — data may be incomplete.</span>
        </div>
      )}

      {/* ── Stats grid ── */}
      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-300">
          Failed to load: {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Portfolio */}
            <StatCard
              label="SMSF Portfolio"
              value={costBasis ?? <span className="text-slate-600 text-2xl">—</span>}
              sub="cost basis · live prices not configured"
              accent
            />

            {/* Agent tasks */}
            <StatCard
              label="Agent Tasks Today"
              value={tasks ?? <span className="text-slate-600">—</span>}
              sub="dispatches completed"
            />

            {/* MBS focus */}
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] p-6">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">MBS This Week</div>
              {mbs ? (
                <>
                  <div className="mt-3 text-sm font-semibold text-indigo-400 uppercase tracking-wide">
                    {mbs.label}
                  </div>
                  <div className="mt-1 text-xl font-bold text-white leading-snug">{mbs.title}</div>
                  <div className="mt-2 text-xs text-slate-500">
                    Target publish: {formatPublishDate(mbs.target_publish) ?? '—'}
                  </div>
                </>
              ) : (
                <div className="mt-3 text-sm text-slate-600">No scheduled video.</div>
              )}
            </div>
          </div>

          {/* ── Quick nav ── */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600">Quick nav</p>
            <div className="flex flex-wrap gap-2">
              {[
                { to: '/smsf',     label: 'SMSF',     icon: '📈' },
                { to: '/mbs',      label: 'MBS',       icon: '🎬' },
                { to: '/dispatch', label: 'Dispatch',  icon: '🤖' },
                { to: '/kanban',   label: 'Kanban',    icon: '📋' },
              ].map((n) => (
                <button
                  key={n.to}
                  onClick={() => navigate(n.to)}
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-white"
                >
                  <span>{n.icon}</span>
                  {n.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
