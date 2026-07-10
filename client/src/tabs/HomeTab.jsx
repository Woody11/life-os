import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import WeatherCard from '../components/WeatherCard.jsx';
import MorningBriefCard from '../components/MorningBriefCard.jsx';

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

function relativeTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_DOT = {
  pending: 'bg-yellow-400',
  running: 'bg-indigo-400 animate-pulse',
  review:  'bg-purple-400',
  done:    'bg-emerald-400',
  error:   'bg-red-400',
};

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

// ---------------------------------------------------------------------------
// Google panel helpers
// ---------------------------------------------------------------------------

function formatEventTime(iso, allDay) {
  if (!iso) return null;
  if (allDay) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    });
  }
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fromDisplay(raw) {
  if (!raw) return raw;
  const match = raw.match(/^"?([^"<]+)"?\s*</);
  return match ? match[1].trim() : raw.replace(/<.*>/, '').trim();
}

function categoryBadge(labels = []) {
  if (labels.includes('CATEGORY_PERSONAL'))  return { text: 'Personal',     cls: 'bg-violet-500/20 text-violet-300' };
  if (labels.includes('CATEGORY_UPDATES'))   return { text: 'Update',       cls: 'bg-sky-500/20 text-sky-300' };
  return null;
}

export default function HomeTab() {
  const navigate  = useNavigate();
  const clock     = useClock();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [dispatches, setDispatches] = useState([]);
  const [google, setGoogle]       = useState(null);
  const [googleLoading, setGoogleLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dispatch')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => { if (!cancelled) setDispatches(json.dispatches ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch('/api/google');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setGoogle(json);
      } catch {
        // non-fatal — panels show empty state
      } finally {
        if (!cancelled) setGoogleLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const recentActivity = useMemo(() => {
    return [...dispatches]
      .sort((a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at))
      .slice(0, 8);
  }, [dispatches]);

  const greeting  = getGreeting();
  const timeStr   = clock.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const dateStr   = clock.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const portfolio  = data?.portfolio ?? null;
  const mbs        = data?.mbs_focus ?? null;
  const tasks      = data?.agent_tasks_today;
  const spendToday = data?.spend_today ?? null;
  const costBasis  = portfolio ? formatAud(portfolio.total_cost_basis_aud) : null;

  const spendAud = spendToday?.total_cost_aud > 0
    ? new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(spendToday.total_cost_aud)
    : null;
  const totalTokens = (spendToday?.total_input_tokens ?? 0) + (spendToday?.total_output_tokens ?? 0);
  const tokenStr = totalTokens >= 1_000_000
    ? `${(totalTokens / 1_000_000).toFixed(1)}M`
    : totalTokens >= 1000
    ? `${(totalTokens / 1000).toFixed(1)}k`
    : String(totalTokens);

  // Live overlay: prefer market value as the headline when prices are available.
  const marketValue = portfolio ? formatAud(portfolio.total_market_value_aud) : null;
  const pnlToday    = portfolio?.pnl_today_aud ?? null;
  const pnlTodayPct = portfolio?.pnl_today_pct ?? null;
  const hasLive     = marketValue != null && pnlToday != null;

  const portfolioValue = hasLive ? marketValue : costBasis;
  const pnlPositive = Number(pnlToday) >= 0;
  const pnlLine = hasLive
    ? `${pnlPositive ? '+' : ''}${formatAud(pnlToday)}` +
      (pnlTodayPct != null ? ` (${pnlPositive ? '+' : ''}${Number(pnlTodayPct).toFixed(2)}%)` : '') +
      ' today'
    : null;

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

      {/* Morning brief */}
      <MorningBriefCard />

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Portfolio */}
            <StatCard
              label="SMSF Portfolio"
              value={portfolioValue ?? <span className="text-slate-600 text-2xl">—</span>}
              sub={hasLive ? 'market value' : 'cost basis · live prices not configured'}
              accent
            >
              {pnlLine && (
                <div
                  className={`mt-2 text-sm font-semibold ${
                    pnlPositive ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {pnlLine}
                </div>
              )}
            </StatCard>

            {/* Weather */}
            <WeatherCard />

            {/* Agent tasks + AI spend */}
            <StatCard
              label="Agent Tasks Today"
              value={tasks ?? <span className="text-slate-600">—</span>}
              sub={spendAud ? `${spendAud} · ${tokenStr} tokens` : 'dispatches completed'}
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
                { to: '/habits',   label: 'Habits',    icon: '✅' },
                { to: '/goals',    label: 'Goals',     icon: '🎯' },
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

          {/* ── Google: Calendar + Email ── */}
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Left: Today's schedule */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Today's Schedule
              </p>
              {googleLoading ? (
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
                  Loading…
                </div>
              ) : !google?.calendar ? (
                <p className="text-sm text-slate-600">Calendar unavailable.</p>
              ) : google.calendar.length === 0 ? (
                <p className="text-sm text-slate-600">No events today.</p>
              ) : (
                <div className="space-y-2">
                  {google.calendar.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                      <div className="mt-0.5 shrink-0 text-center">
                        <div className="text-xs font-semibold tabular-nums text-indigo-400">
                          {formatEventTime(ev.start, ev.allDay)}
                        </div>
                        {!ev.allDay && ev.end && (
                          <div className="text-[10px] text-slate-600">
                            {formatEventTime(ev.end, false)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{ev.summary}</div>
                        {ev.location && (
                          <div className="mt-0.5 truncate text-xs text-slate-500">{ev.location}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Emails requiring attention */}
            <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Needs Attention
              </p>
              {googleLoading ? (
                <div className="flex items-center gap-2 text-slate-600 text-sm">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
                  Loading…
                </div>
              ) : !google?.emails ? (
                <p className="text-sm text-slate-600">Email unavailable.</p>
              ) : google.emails.length === 0 ? (
                <p className="text-sm text-slate-600">Inbox zero. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {google.emails.map((em) => {
                    const badge = categoryBadge(em.labels);
                    const unread = em.labels?.includes('UNREAD');
                    return (
                      <div key={em.id} className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                        <div className="flex items-center gap-2">
                          {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />}
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-300">
                            {fromDisplay(em.from)}
                          </span>
                          {badge && (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                              {badge.text}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm text-white">{em.subject}</div>
                        <div className="mt-0.5 text-[10px] text-slate-600">{em.date}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Recent activity ── */}
          <div className="mt-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-600">Recent Activity</p>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-600">No agent activity yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-white/5">
                {recentActivity.map((d, i) => {
                  const summary = d.prompt && d.prompt.length > 80 ? d.prompt.slice(0, 80) + '…' : d.prompt;
                  const stamp = d.completed_at || d.created_at;
                  const dot = STATUS_DOT[d.status] ?? 'bg-slate-600';
                  return (
                    <div
                      key={d.id}
                      onClick={() => navigate('/dispatch')}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] ${
                        i > 0 ? 'border-t border-white/5' : ''
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                      <span className="w-20 shrink-0 text-xs font-medium text-slate-200">{d.agent}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{summary}</span>
                      <span className="shrink-0 text-[10px] text-slate-600">{relativeTime(stamp)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
