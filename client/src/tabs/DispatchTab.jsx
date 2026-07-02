import { useCallback, useEffect, useRef, useState } from 'react';

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
// Status badge
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  pending: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20',
  running: 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 animate-pulse',
  done:    'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  error:   'bg-red-500/10 text-red-300 border border-red-500/20',
};

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status ?? 'pending'}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Section A — Dispatch form
// ---------------------------------------------------------------------------

function DispatchForm({ agents, onDispatched }) {
  const [agent, setAgent]       = useState('');
  const [prompt, setPrompt]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (agents.length && !agent) setAgent(agents[0].name);
  }, [agents, agent]);

  useEffect(() => {
    if (feedback?.type !== 'success') return;
    const t = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [feedback]);

  async function handleDispatch() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setFeedback({ type: 'success', text: `Dispatched to ${agent} — task #${json.id ?? json.dispatch_id}` });
      setPrompt('');
      onDispatched?.();
    } catch (err) {
      setFeedback({ type: 'error', text: `Dispatch failed: ${err.message}` });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAgent = agents.find((a) => a.name === agent);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-white">Dispatch Agent</h2>
      <p className="mt-1 text-sm text-slate-500">Send a one-off task to any agent in the team.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500">
            Agent
          </label>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-indigo-500/50 focus:outline-none transition-colors"
          >
            {agents.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} — {a.role}
              </option>
            ))}
          </select>
          {selectedAgent && (
            <p className="mt-1.5 text-xs text-slate-500">{selectedAgent.role}</p>
          )}
        </div>

        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500">
            Task
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the task…"
            className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none transition-colors"
          />
        </div>

        <button
          onClick={handleDispatch}
          disabled={submitting || !agent || !prompt.trim()}
          className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Dispatching…' : `Dispatch to ${agent || '…'}`}
        </button>

        {feedback?.type === 'success' && (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-sm text-emerald-300">
            {feedback.text}
          </div>
        )}
        {feedback?.type === 'error' && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
            {feedback.text}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section B — Recent dispatches
// ---------------------------------------------------------------------------

function DispatchHistory({ refreshTrigger }) {
  const [state, setState]   = useState({ status: 'loading', data: null, error: null });
  const [expanded, setExpanded] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async (signal) => {
    try {
      const res = await fetch('/api/dispatch', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setState({ status: 'ready', data: json.dispatches ?? [], error: null });
    } catch (err) {
      if (err.name === 'AbortError') return;
      setState((prev) => ({
        status: prev.data ? 'ready' : 'error',
        data: prev.data,
        error: err.message,
      }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, status: prev.data ? 'ready' : 'loading' }));
    load(controller.signal);

    intervalRef.current = setInterval(() => load(new AbortController().signal), 10_000);
    return () => {
      controller.abort();
      clearInterval(intervalRef.current);
    };
  }, [load, refreshTrigger]);

  const rows = state.data ?? [];

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Recent Dispatches</h2>
        {state.status === 'loading' && !rows.length && (
          <span className="text-xs text-slate-600">Loading…</span>
        )}
      </div>

      {state.status === 'loading' && !rows.length && (
        <SectionSpinner label="Loading dispatches…" />
      )}

      {state.status === 'error' && !rows.length && (
        <div className="mt-4">
          <SectionError
            message={`Failed to load: ${state.error}`}
            onRetry={() => load(new AbortController().signal)}
          />
        </div>
      )}

      {rows.length === 0 && state.status === 'ready' && (
        <p className="mt-6 text-sm text-slate-500">No dispatches yet. Send one above.</p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 divide-y divide-white/[0.05]">
          {rows.map((d) => {
            const isOpen = expanded === d.id;
            const shortPrompt = d.prompt.length > 80 ? d.prompt.slice(0, 80) + '…' : d.prompt;
            return (
              <div key={d.id} className="py-3">
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">{d.agent}</span>
                      <StatusBadge status={d.status} />
                      <span className="ml-auto text-xs text-slate-600">{relativeTime(d.created_at)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {isOpen ? d.prompt : shortPrompt}
                    </p>
                  </div>
                  <span className="mt-0.5 shrink-0 text-xs text-slate-600">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                        Full prompt
                      </div>
                      <p className="rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                        {d.prompt}
                      </p>
                    </div>
                    {d.result && (
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
                          Result
                        </div>
                        <p className="rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                          {d.result}
                        </p>
                      </div>
                    )}
                    {d.completed_at && (
                      <p className="text-xs text-slate-600">
                        Completed {relativeTime(d.completed_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-700">Auto-refreshes every 10 seconds</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab shell
// ---------------------------------------------------------------------------

export default function DispatchTab() {
  const [agents, setAgents]       = useState([]);
  const [agentsError, setAgentsError] = useState(null);
  const [refreshKey, setRefreshKey]   = useState(0);

  useEffect(() => {
    fetch('/api/dispatch/agents')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => setAgents(json.agents ?? []))
      .catch((err) => setAgentsError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-400">Agent System</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Dispatch</h1>
      </div>

      {agentsError && (
        <div className="mb-6">
          <SectionError message={`Could not load agent roster: ${agentsError}`} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <DispatchForm agents={agents} onDispatched={() => setRefreshKey((k) => k + 1)} />
        </div>
        <div className="lg:col-span-3">
          <DispatchHistory refreshTrigger={refreshKey} />
        </div>
      </div>
    </div>
  );
}
