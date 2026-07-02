import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Shared UI atoms (inlined — same pattern as SmsfTab/MbsTab)
// ---------------------------------------------------------------------------

function Card({ children, className = '' }) {
  return <div className={`rounded-lg bg-slate-800 p-6 ${className}`}>{children}</div>;
}

function SectionSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 py-8 text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function SectionError({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-red-800 bg-red-950/60 p-4 text-sm text-red-300">
      <div>{message || 'Something went wrong.'}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-md bg-red-900 px-3 py-1.5 text-xs font-medium text-red-100 transition-colors hover:bg-red-800"
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
  pending:  'bg-yellow-900/60 text-yellow-300 border border-yellow-700',
  running:  'bg-sky-900/60 text-sky-300 border border-sky-700 animate-pulse',
  done:     'bg-emerald-900/60 text-emerald-300 border border-emerald-700',
  error:    'bg-red-900/60 text-red-300 border border-red-700',
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
// Relative time helper ("2 minutes ago")
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
  const [agent, setAgent] = useState('');
  const [prompt, setPrompt] = useState('');
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
      <p className="mt-1 text-sm text-slate-400">Send a one-off task to any agent in the team.</p>

      <div className="mt-5 space-y-4">
        {/* Agent selector */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Agent
          </label>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            {agents.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name} — {a.role}
              </option>
            ))}
          </select>
          {selectedAgent && (
            <p className="mt-1 text-xs text-slate-500">{selectedAgent.role}</p>
          )}
        </div>

        {/* Prompt */}
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Task
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="Describe the task…"
            className="w-full resize-y rounded-md border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
          />
        </div>

        <button
          onClick={handleDispatch}
          disabled={submitting || !agent || !prompt.trim()}
          className="rounded-md bg-sky-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Dispatching…' : `Dispatch to ${agent || '…'}`}
        </button>

        {feedback?.type === 'success' && (
          <div className="rounded-md border border-emerald-800 bg-emerald-950/60 p-3 text-sm text-emerald-300">
            {feedback.text}
          </div>
        )}
        {feedback?.type === 'error' && (
          <div className="rounded-md border border-red-800 bg-red-950/60 p-3 text-sm text-red-300">
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
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
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
          <span className="text-xs text-slate-500">Loading…</span>
        )}
      </div>

      {state.status === 'loading' && !rows.length && (
        <SectionSpinner label="Loading dispatches…" />
      )}

      {state.status === 'error' && !rows.length && (
        <div className="mt-4">
          <SectionError message={`Failed to load: ${state.error}`} onRetry={() => load(new AbortController().signal)} />
        </div>
      )}

      {rows.length === 0 && state.status === 'ready' && (
        <p className="mt-6 text-sm text-slate-500">No dispatches yet. Send one above.</p>
      )}

      {rows.length > 0 && (
        <div className="mt-4 divide-y divide-slate-700">
          {rows.map((d) => {
            const isOpen = expanded === d.id;
            const shortPrompt = d.prompt.length > 80 ? d.prompt.slice(0, 80) + '…' : d.prompt;
            return (
              <div key={d.id} className="py-3">
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  className="flex w-full items-start gap-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{d.agent}</span>
                      <StatusBadge status={d.status} />
                      <span className="text-xs text-slate-500 ml-auto">{relativeTime(d.created_at)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 truncate">
                      {isOpen ? d.prompt : shortPrompt}
                    </p>
                  </div>
                  <span className="text-slate-500 text-xs mt-0.5 shrink-0">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="mt-3 ml-0 space-y-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Full prompt</div>
                      <p className="rounded bg-slate-900 p-3 text-xs text-slate-300 whitespace-pre-wrap">{d.prompt}</p>
                    </div>
                    {d.result && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Result</div>
                        <p className="rounded bg-slate-900 p-3 text-xs text-slate-300 whitespace-pre-wrap">{d.result}</p>
                      </div>
                    )}
                    {d.completed_at && (
                      <p className="text-xs text-slate-500">
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

      <p className="mt-4 text-xs text-slate-600">Auto-refreshes every 10 seconds</p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab shell
// ---------------------------------------------------------------------------

export default function DispatchTab() {
  const [agents, setAgents] = useState([]);
  const [agentsError, setAgentsError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch('/api/dispatch/agents')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => setAgents(json.agents ?? []))
      .catch((err) => setAgentsError(err.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Dispatch</h1>

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
