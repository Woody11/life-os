import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Format an AUD amount as "$142,500" (no cents — the dashboard shows round
// figures). Returns a dash for null/undefined so callers can render "unavailable".
function formatAud(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(Number(value));
}

// "2026-07-05" -> "5 Jul 2026". Parsed as a plain date to avoid TZ shifting.
function formatPublishDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatUpdated(iso) {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

function Card({ children, className = '' }) {
  return <div className={`rounded-lg bg-slate-800 p-6 ${className}`}>{children}</div>;
}

export default function HomeTab() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/home');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-slate-400">Loading…</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-red-300">
          Failed to load Home data: {error}
        </div>
      </div>
    );
  }

  const portfolio = data?.portfolio ?? null;
  const mbs = data?.mbs_focus ?? null;
  const tasks = data?.agent_tasks_today;
  const costBasis = portfolio ? formatAud(portfolio.total_cost_basis_aud) : null;

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">LIFE OS</h1>
        {data?.last_updated && (
          <span className="text-xs text-slate-500">
            Last updated: {formatUpdated(data.last_updated)}
          </span>
        )}
      </div>

      {data?.partial && (
        <div className="mb-6 rounded-lg border border-yellow-700 bg-yellow-950/50 p-3 text-sm text-yellow-300">
          Some data unavailable — check service status.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Portfolio */}
        <Card>
          <div className="text-sm font-medium text-slate-400">Portfolio</div>
          <div className="mt-2 text-4xl font-bold text-white">
            {costBasis ?? <span className="text-slate-500">unavailable</span>}
          </div>
          <div className="mt-1 text-xs text-slate-500">(cost basis)</div>
          <div className="mt-3 text-sm text-slate-400">
            P&amp;L: <span className="text-slate-500">unavailable</span>
          </div>
        </Card>

        {/* Agent tasks today */}
        <Card>
          <div className="text-sm font-medium text-slate-400">Agent Tasks Today</div>
          <div className="mt-2 text-4xl font-bold text-white">
            {tasks == null ? <span className="text-slate-500">—</span> : tasks}
          </div>
          <div className="mt-1 text-xs text-slate-500">tasks completed</div>
        </Card>
      </div>

      {/* MBS this week */}
      <Card className="mt-4">
        <div className="text-sm font-medium text-slate-400">MBS This Week</div>
        {mbs ? (
          <>
            <div className="mt-2 text-xl font-semibold text-white">
              {mbs.label}: {mbs.title}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              Target publish: {formatPublishDate(mbs.target_publish)}
            </div>
          </>
        ) : (
          <div className="mt-2 text-slate-500">No scheduled video available.</div>
        )}
      </Card>

      {/* Quick nav */}
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-500">Quick Nav:</span>
        {[
          { to: '/smsf', label: 'SMSF' },
          { to: '/mbs', label: 'MBS' },
          { to: '/dispatch', label: 'Dispatch' },
          { to: '/kanban', label: 'Kanban' },
        ].map((n) => (
          <button
            key={n.to}
            onClick={() => navigate(n.to)}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700"
          >
            {n.label}
          </button>
        ))}
      </div>
    </div>
  );
}
