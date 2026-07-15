import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toast from '../components/Toast.jsx';
import { useSse } from '../components/SseContext.jsx';
import { X, Settings } from 'lucide-react';
import KanbanColumnShell from '../components/KanbanColumnShell.jsx';

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_STYLES = {
  pending: 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20',
  running: 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 animate-pulse',
  review:  'bg-purple-500/10 text-purple-300 border border-purple-500/20',
  done:    'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20',
  error:   'bg-red-500/10 text-red-300 border border-red-500/20',
};

// Solid dot colors for rosters / feed / cards
const STATUS_DOT = {
  pending: 'bg-yellow-400',
  running: 'bg-indigo-400',
  review:  'bg-purple-400',
  done:    'bg-emerald-400',
  error:   'bg-red-400',
};

// Column header accent per status
const COLUMN_ACCENT = {
  pending: 'text-yellow-300',
  running: 'text-indigo-300',
  review:  'text-purple-300',
  done:    'text-emerald-300',
  error:   'text-red-300',
};

const COLUMNS = [
  { key: 'pending', label: 'Pending' },
  { key: 'running', label: 'Running' },
  { key: 'review',  label: 'Review' },
  { key: 'done',    label: 'Done' },
  { key: 'error',   label: 'Error' },
];

// ---------------------------------------------------------------------------
// Helpers
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

function StatusBadge({ status }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {status ?? 'pending'}
    </span>
  );
}

function Dot({ status, className = '' }) {
  const color = STATUS_DOT[status] ?? 'bg-slate-600';
  const pulse = status === 'running' ? 'animate-pulse' : '';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color} ${pulse} ${className}`} />;
}

// ---------------------------------------------------------------------------
// Agent roster (left)
// ---------------------------------------------------------------------------

function AgentRoster({ agents, busyAgents, onPick }) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Agents</span>
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          {agents.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {agents.map((a) => {
          const busy = busyAgents.has(a.name);
          return (
            <button
              key={a.name}
              onClick={() => onPick(a.name)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
            >
              <span
                className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                  busy ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-100">{a.name}</span>
                <span className="block truncate text-[11px] text-slate-500">{a.role}</span>
              </span>
            </button>
          );
        })}
        {agents.length === 0 && (
          <p className="px-2.5 py-4 text-xs text-slate-600">No agents.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban card + column
// ---------------------------------------------------------------------------

function DispatchCard({ d, busyAgents, onOpen }) {
  const busy = busyAgents.has(d.agent);
  const shortPrompt = d.prompt && d.prompt.length > 80 ? d.prompt.slice(0, 80) + '…' : d.prompt;
  const stamp = d.completed_at || d.created_at;
  return (
    <button
      onClick={() => onOpen(d)}
      className="w-full rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition-colors hover:bg-white/[0.06]"
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            busy ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
          }`}
        />
        <span className="truncate text-sm font-medium text-slate-100">{d.agent}</span>
        <span className="ml-auto shrink-0">
          <StatusBadge status={d.status} />
        </span>
      </div>
      <p className="mt-2 line-clamp-3 text-xs text-slate-400">{shortPrompt}</p>
      {d.status === 'error' && d.error && (
        <p className="mt-2 line-clamp-2 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-[11px] text-red-300">
          {d.error}
        </p>
      )}
      <div className="mt-2 text-right text-[10px] text-slate-600">{relativeTime(stamp)}</div>
    </button>
  );
}

function KanbanColumn({ col, items, busyAgents, onOpen }) {
  return (
    <KanbanColumnShell
      label={col.label}
      labelClassName={COLUMN_ACCENT[col.key]}
      count={items.length}
      isEmpty={items.length === 0}
    >
      {items.map((d) => (
        <DispatchCard key={d.id} d={d} busyAgents={busyAgents} onOpen={onOpen} />
      ))}
    </KanbanColumnShell>
  );
}

// ---------------------------------------------------------------------------
// Live feed (right)
// ---------------------------------------------------------------------------

function LiveFeed({ dispatches }) {
  const feed = useMemo(() => {
    return [...dispatches]
      .sort((a, b) => {
        const ta = new Date(a.completed_at || a.created_at).getTime();
        const tb = new Date(b.completed_at || b.created_at).getTime();
        return tb - ta;
      })
      .slice(0, 30);
  }, [dispatches]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03]">
      <div className="border-b border-white/5 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Live Feed</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {feed.map((d) => {
          const stamp = d.completed_at || d.created_at;
          const summary = d.prompt && d.prompt.length > 65 ? d.prompt.slice(0, 65) + '…' : d.prompt;
          return (
            <div key={d.id} className="rounded-lg px-2.5 py-2 hover:bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <Dot status={d.status} />
                <span className="min-w-0 flex-1 truncate text-xs text-slate-300">
                  <span className="font-medium text-slate-100">{d.agent}</span>
                  <span className="text-slate-600"> · </span>
                  <span className="text-slate-400">{d.status}</span>
                </span>
                <span className="shrink-0 text-[10px] text-slate-600">{relativeTime(stamp)}</span>
              </div>
              {summary && (
                <p className="mt-0.5 ml-[18px] truncate text-[11px] text-slate-600">{summary}</p>
              )}
            </div>
          );
        })}
        {feed.length === 0 && (
          <p className="px-2.5 py-4 text-xs text-slate-600">No activity yet.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Dispatch slide-in panel
// ---------------------------------------------------------------------------

function NewDispatchPanel({ open, agents, initialAgent, onClose, onDispatched, onToast }) {
  const [agent, setAgent]           = useState('');
  const [prompt, setPrompt]         = useState('');
  const [model, setModel]           = useState('');
  const [models, setModels]         = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback]     = useState(null);
  const initializedRef = useRef(false);

  // Initialize the agent field once per open cycle, not on every render —
  // including `agent` in this effect's own deps (as it used to) meant every
  // manual dropdown selection re-triggered the effect and snapped the value
  // straight back to initialAgent.
  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (initialAgent) setAgent(initialAgent);
    else if (agents.length) setAgent(agents[0].name);
  }, [open, initialAgent, agents]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/dispatch/models')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => setModels(json.models ?? []))
      .catch(() => setModels([]));
  }, [open]);

  async function handleDispatch() {
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, prompt, model }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setPrompt('');
      setModel('');
      setFeedback(null);
      onDispatched?.();
      onToast?.(`Dispatched to ${agent}`, 'success');
      onClose();
    } catch (err) {
      setFeedback({ type: 'error', text: `Dispatch failed: ${err.message}` });
      onToast?.('Send failed — please try again', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;
  const selectedAgent = agents.find((a) => a.name === agent);
  const selectedModel = models.find((m) => m.id === model);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[var(--bg-surface)] shadow-2xl animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-semibold text-white">New Dispatch</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Agent
            </label>
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 transition-colors focus:border-indigo-500/50 focus:outline-none"
            >
              {agents.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} — {a.role}
                </option>
              ))}
            </select>
            {selectedAgent && <p className="mt-1.5 text-xs text-slate-500">{selectedAgent.role}</p>}
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 transition-colors focus:border-indigo-500/50 focus:outline-none"
            >
              <option value="">System default</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {selectedModel ? selectedModel.label : 'Using agent/system default model'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500">
              Task
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              placeholder="Describe the task…"
              className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-100 placeholder-slate-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
            />
          </div>

          {feedback?.type === 'error' && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
              {feedback.text}
            </div>
          )}
        </div>

        <div className="border-t border-white/5 p-5">
          <button
            onClick={handleDispatch}
            disabled={submitting || !agent || !prompt.trim()}
            className="w-full rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Dispatching…' : `Dispatch to ${agent || '…'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dispatch detail panel
// ---------------------------------------------------------------------------

function DetailPanel({ dispatch, onClose }) {
  if (!dispatch) return null;
  const d = dispatch;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[var(--bg-surface)] shadow-2xl animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-white">{d.agent}</span>
            <StatusBadge status={d.status} />
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Prompt</div>
            <p className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300">
              {d.prompt}
            </p>
          </div>
          {d.result && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Result</div>
              <p className="whitespace-pre-wrap rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300">
                {d.result}
              </p>
            </div>
          )}
          {d.error && (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Error</div>
              <p className="whitespace-pre-wrap rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
                {d.error}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
            <span>Created {relativeTime(d.created_at)}</span>
            {d.completed_at && <span>Completed {relativeTime(d.completed_at)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Models modal
// ---------------------------------------------------------------------------

function AgentModelsModal({ open, agents, onClose, onToast }) {
  const [models, setModels]           = useState([]);
  const [agentModels, setAgentModels] = useState({});
  const [loading, setLoading]         = useState(false);
  const [savingAgent, setSavingAgent] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch('/api/dispatch/models').then((r) => (r.ok ? r.json() : { models: [] })),
      fetch('/api/dispatch/agent-models').then((r) => (r.ok ? r.json() : { agentModels: [] })),
    ])
      .then(([mJson, amJson]) => {
        setModels(mJson.models ?? []);
        const map = {};
        for (const row of amJson.agentModels ?? []) map[row.agent_name] = row.model;
        setAgentModels(map);
      })
      .catch((err) => onToast?.(`Failed to load agent models: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [open, onToast]);

  async function handleChange(agentName, newModel) {
    setAgentModels((prev) => ({ ...prev, [agentName]: newModel }));
    setSavingAgent(agentName);
    try {
      const res = await fetch(`/api/dispatch/agent-models/${encodeURIComponent(agentName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: newModel }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onToast?.(`Default model updated for ${agentName}`, 'success');
    } catch (err) {
      onToast?.(`Failed to update ${agentName}: ${err.message}`, 'error');
    } finally {
      setSavingAgent(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[var(--bg-surface)] shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Agent Models</h2>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {loading && <p className="text-xs text-slate-500">Loading…</p>}
          {!loading && agents.length === 0 && (
            <p className="text-xs text-slate-600">No agents.</p>
          )}
          {!loading &&
            agents.map((a) => (
              <div
                key={a.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{a.name}</p>
                  <p className="truncate text-[11px] text-slate-500">{a.role}</p>
                </div>
                <select
                  value={agentModels[a.name] ?? ''}
                  onChange={(e) => handleChange(a.name, e.target.value)}
                  disabled={savingAgent === a.name}
                  className="w-40 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-100 transition-colors focus:border-indigo-500/50 focus:outline-none disabled:opacity-50"
                >
                  <option value="">System default</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter bar
// ---------------------------------------------------------------------------

function FilterBar({ agents, agentFilter, onAgentFilter, search, onSearch }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => onAgentFilter('')}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            agentFilter === ''
              ? 'bg-indigo-600 text-white'
              : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
          }`}
        >
          All agents
        </button>
        {agents.map((a) => (
          <button
            key={a.name}
            onClick={() => onAgentFilter(agentFilter === a.name ? '' : a.name)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              agentFilter === a.name
                ? 'bg-indigo-600 text-white'
                : 'bg-white/[0.04] text-slate-400 hover:bg-white/[0.08]'
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        placeholder="Search prompts…"
        className="ml-auto w-56 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 transition-colors focus:border-indigo-500/50 focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({ stats, agentCount, clock, onNew, onAgentModels }) {
  const total = stats?.total ?? 0;
  const active = stats?.activeAgents ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-white/5 px-6 py-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-indigo-400">Mission Control</p>
        <h1 className="text-xl font-bold tracking-tight text-white">Dispatch</h1>
      </div>

      <div className="flex items-center gap-5 text-sm">
        <span className="text-slate-500">
          Tasks: <span className="font-semibold text-slate-200">{total}</span>
        </span>
        <span className="text-slate-500">
          Agents: <span className="font-semibold text-slate-200">{active}/{agentCount}</span>
        </span>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <span className="font-mono text-sm tabular-nums text-slate-400">{clock}</span>
        <button
          onClick={onAgentModels}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
          <span className="inline-flex items-center gap-1.5"><Settings className="h-4 w-4" /> Agent Models</span>
        </button>
        <button
          onClick={onNew}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
        >
          + New Task
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab shell
// ---------------------------------------------------------------------------

export default function DispatchTab() {
  const [agents, setAgents]           = useState([]);
  const [agentsError, setAgentsError] = useState(null);
  const [dispatches, setDispatches]   = useState([]);
  const [stats, setStats]             = useState(null);
  const [loadError, setLoadError]     = useState(null);

  const [panelOpen, setPanelOpen]     = useState(false);
  const [pickedAgent, setPickedAgent] = useState('');
  const [detail, setDetail]           = useState(null);
  const [toast, setToast]             = useState(null);
  const showToast = useCallback((message, type = 'success') => setToast({ message, type }), []);
  const [agentModelsOpen, setAgentModelsOpen] = useState(false);

  const [agentFilter, setAgentFilter] = useState('');
  const [search, setSearch]           = useState('');

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());

  // Agents (once)
  useEffect(() => {
    fetch('/api/dispatch/agents')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => setAgents(json.agents ?? []))
      .catch((err) => setAgentsError(err.message));
  }, []);

  // Dispatches + stats (poll every 10s)
  const load = useCallback(async (signal) => {
    try {
      const [dRes, sRes] = await Promise.all([
        fetch('/api/dispatch', { signal }),
        fetch('/api/dispatch/stats', { signal }),
      ]);
      if (!dRes.ok) throw new Error(`HTTP ${dRes.status}`);
      const dJson = await dRes.json();
      setDispatches(dJson.dispatches ?? []);
      setLoadError(null);
      if (sRes.ok) setStats(await sRes.json());
    } catch (err) {
      if (err.name === 'AbortError') return;
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Real-time updates via shared SSE connection.
  const { subscribe } = useSse();
  useEffect(() => {
    const refresh = () => load(new AbortController().signal);
    const unsub1 = subscribe(refresh, 'dispatch_updated');
    const unsub2 = subscribe(refresh, 'dispatch_created');
    return () => { unsub1(); unsub2(); };
  }, [subscribe, load]);

  // Live clock (every second)
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Agents currently running something
  const busyAgents = useMemo(() => {
    const set = new Set();
    for (const d of dispatches) if (d.status === 'running') set.add(d.agent);
    return set;
  }, [dispatches]);

  // Filtered dispatches (agent + search text)
  const filteredDispatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dispatches.filter((d) => {
      if (agentFilter && d.agent !== agentFilter) return false;
      if (q && !(d.prompt ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [dispatches, agentFilter, search]);

  // Group dispatches into columns, newest first, Done capped at 10
  const columns = useMemo(() => {
    const byStatus = { pending: [], running: [], review: [], done: [], error: [] };
    for (const d of filteredDispatches) {
      if (byStatus[d.status]) byStatus[d.status].push(d);
    }
    const stamp = (d) => new Date(d.completed_at || d.created_at).getTime();
    for (const key of Object.keys(byStatus)) {
      byStatus[key].sort((a, b) => stamp(b) - stamp(a));
    }
    byStatus.done = byStatus.done.slice(0, 10);
    return byStatus;
  }, [filteredDispatches]);

  function pickAgent(name) {
    setPickedAgent(name);
    setPanelOpen(true);
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col">
      <TopBar
        stats={stats}
        agentCount={agents.length}
        clock={clock}
        onNew={() => {
          setPickedAgent('');
          setPanelOpen(true);
        }}
        onAgentModels={() => setAgentModelsOpen(true)}
      />

      {(agentsError || loadError) && (
        <div className="border-b border-red-500/20 bg-red-500/5 px-6 py-2 text-xs text-red-300">
          {agentsError ? `Agent roster: ${agentsError}` : `Feed: ${loadError}`}
        </div>
      )}

      <FilterBar
        agents={agents}
        agentFilter={agentFilter}
        onAgentFilter={setAgentFilter}
        search={search}
        onSearch={setSearch}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(180px,15%)_minmax(0,1fr)_minmax(240px,25%)]">
        {/* Left — roster */}
        <div className="min-h-0">
          <AgentRoster agents={agents} busyAgents={busyAgents} onPick={pickAgent} />
        </div>

        {/* Center — kanban */}
        <div className="flex min-h-0 gap-3 overflow-x-auto">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              col={col}
              items={columns[col.key] ?? []}
              busyAgents={busyAgents}
              onOpen={setDetail}
            />
          ))}
        </div>

        {/* Right — live feed */}
        <div className="min-h-0">
          <LiveFeed dispatches={dispatches} />
        </div>
      </div>

      <NewDispatchPanel
        open={panelOpen}
        agents={agents}
        initialAgent={pickedAgent}
        onClose={() => setPanelOpen(false)}
        onDispatched={() => load(new AbortController().signal)}
        onToast={showToast}
      />

      <DetailPanel dispatch={detail} onClose={() => setDetail(null)} />

      <AgentModelsModal
        open={agentModelsOpen}
        agents={agents}
        onClose={() => setAgentModelsOpen(false)}
        onToast={showToast}
      />

      <Toast message={toast?.message} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
