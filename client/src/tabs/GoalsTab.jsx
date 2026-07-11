import { useEffect, useState } from 'react';
import { RadialBarChart, RadialBar, Cell } from 'recharts';
import Toast from '../components/Toast.jsx';

const DOMAIN_COLORS = {
  SMSF:     'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  MBS:      'bg-violet-500/20 text-violet-300 border-violet-500/30',
  Personal: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  Dev:      'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const AGENTS = ['Bazza', 'Sherlock', 'Buffet', 'Shakespeare', 'Jarvis', 'Maverick', 'Statty', 'Linus'];
const DOMAINS = ['SMSF', 'MBS', 'Personal', 'Dev'];
const STATUSES = ['active', 'completed', 'paused'];

function ProgressRing({ value }) {
  const data = [{ value }];
  return (
    <RadialBarChart width={56} height={56} cx={28} cy={28} innerRadius={20} outerRadius={28}
      startAngle={90} endAngle={-270} data={data}>
      <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'rgba(255,255,255,0.04)' }}>
        <Cell fill={value >= 100 ? '#34d399' : value >= 50 ? '#6366f1' : '#f59e0b'} />
      </RadialBar>
      <text x={28} y={28} textAnchor="middle" dominantBaseline="middle" className="fill-slate-200" style={{ fontSize: 11, fontWeight: 600 }}>
        {value}%
      </text>
    </RadialBarChart>
  );
}

function ProgressBar({ value, onChange }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => { setLocalValue(value); }, [value]);

  function commit(e) {
    onChange(Number(e.target.value));
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>Progress</span>
        <span>{localValue}%</span>
      </div>
      <input
        type="range" min={0} max={100} value={localValue}
        onChange={(e) => setLocalValue(Number(e.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}

function AgentDispatchButton({ goalId, agentRow, onDispatched }) {
  const [state, setState] = useState('idle'); // idle | loading | done

  async function fire() {
    setState('loading');
    try {
      const res = await fetch(`/api/goals/${goalId}/dispatch/${agentRow.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentRow.model ? { model: agentRow.model } : {}),
      });
      if (res.ok) {
        setState('done');
        onDispatched?.(agentRow.agent_name);
        setTimeout(() => setState('idle'), 3000);
      } else {
        setState('idle');
      }
    } catch {
      setState('idle');
    }
  }

  return (
    <button
      onClick={fire}
      disabled={state !== 'idle'}
      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
        state === 'done'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-indigo-500/30 hover:text-indigo-300 disabled:opacity-50'
      }`}
    >
      {state === 'loading' ? '…' : state === 'done' ? `✓ ${agentRow.agent_name}` : agentRow.button_label}
    </button>
  );
}

function GoalCard({ goal, onUpdate, onDelete, onToast, models }) {
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ agent_name: AGENTS[0], prompt_template: '', button_label: '', model: '' });

  async function patchProgress(progress) {
    const res = await fetch(`/api/goals/${goal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ progress }),
    });
    if (res.ok) onUpdate(await res.json());
  }

  async function patchStatus(status) {
    const res = await fetch(`/api/goals/${goal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) onUpdate(await res.json());
  }

  async function addAgent(e) {
    e.preventDefault();
    if (!newAgent.prompt_template.trim() || !newAgent.button_label.trim()) return;
    const res = await fetch(`/api/goals/${goal.id}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newAgent),
    });
    if (res.ok) {
      const added = await res.json();
      onUpdate({ ...goal, agents: [...(goal.agents ?? []), { ...added, model: newAgent.model || added.model } ] });
      setNewAgent({ agent_name: AGENTS[0], prompt_template: '', button_label: '', model: '' });
      setShowAddAgent(false);
    }
  }

  async function removeAgent(agentId) {
    const res = await fetch(`/api/goals/${goal.id}/agents/${agentId}`, { method: 'DELETE' });
    if (res.ok) onUpdate({ ...goal, agents: (goal.agents ?? []).filter((a) => a.id !== agentId) });
  }

  function handleDispatched(agentName) {
    onToast(`Dispatched to ${agentName}`);
  }

  function handleDelete() {
    if (!confirm('Delete this goal?')) return;
    onDelete(goal.id);
  }

  const domainCls = DOMAIN_COLORS[goal.domain] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30';

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${domainCls}`}>
              {goal.domain}
            </span>
            {goal.target_date && (
              <span className="text-[10px] text-slate-600">
                {new Date(goal.target_date + 'T00:00:00Z').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </span>
            )}
          </div>
          <h3 className="mt-2 text-base font-semibold text-white">{goal.title}</h3>
          {goal.description && (
            <p className="mt-1 text-sm text-slate-500">{goal.description}</p>
          )}
        </div>
        <div className="shrink-0"><ProgressRing value={goal.progress} /></div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={goal.status}
            onChange={(e) => patchStatus(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300 focus:outline-none"
          >
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={handleDelete}
            className="text-slate-700 hover:text-red-400 transition-colors text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      <ProgressBar value={goal.progress} onChange={patchProgress} />

      {/* Agent dispatch buttons */}
      {(goal.agents?.length > 0 || showAddAgent) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {goal.agents?.map((a) => (
            <div key={a.id} className="flex items-center gap-1">
              <AgentDispatchButton goalId={goal.id} agentRow={a} onDispatched={handleDispatched} />
              <button onClick={() => removeAgent(a.id)} className="text-[10px] text-slate-700 hover:text-red-400">✕</button>
            </div>
          ))}
        </div>
      )}

      {showAddAgent ? (
        <form onSubmit={addAgent} className="mt-4 space-y-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Add Agent Button</p>
          <div className="flex gap-2">
            <select
              value={newAgent.agent_name}
              onChange={(e) => setNewAgent((p) => ({ ...p, agent_name: e.target.value }))}
              className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              {AGENTS.map((a) => <option key={a}>{a}</option>)}
            </select>
            <input
              value={newAgent.button_label}
              onChange={(e) => setNewAgent((p) => ({ ...p, button_label: e.target.value }))}
              placeholder="Button label…"
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none"
            />
          </div>
          <textarea
            value={newAgent.prompt_template}
            onChange={(e) => setNewAgent((p) => ({ ...p, prompt_template: e.target.value }))}
            placeholder="Prompt template… use {{goal_title}} and {{goal_description}}"
            rows={2}
            className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
          />
          <div>
            <label className="mb-1 block text-[10px] text-slate-600">Model override</label>
            <select
              value={newAgent.model}
              onChange={(e) => setNewAgent((p) => ({ ...p, model: e.target.value }))}
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="">Default (system)</option>
              {models?.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-500/20">Save</button>
            <button type="button" onClick={() => setShowAddAgent(false)} className="text-xs text-slate-600 hover:text-slate-400">Cancel</button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAddAgent(true)}
          className="mt-3 text-[11px] text-slate-700 hover:text-indigo-400 transition-colors"
        >
          + Add agent button
        </button>
      )}
    </div>
  );
}

function AddGoalForm({ onAdd }) {
  const [form, setForm] = useState({ title: '', description: '', domain: DOMAINS[0], target_date: '', status: 'active' });
  const [open, setOpen]   = useState(false);
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm((p) => ({ ...p, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_date: form.target_date || null }),
      });
      if (res.ok) {
        onAdd(await res.json());
        setForm({ title: '', description: '', domain: DOMAINS[0], target_date: '', status: 'active' });
        setOpen(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl border border-dashed border-white/10 py-4 text-sm text-slate-600 transition-all hover:border-indigo-500/30 hover:text-indigo-400"
      >
        + New Goal
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-white/5 bg-white/[0.03] p-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-600">New Goal</p>
      <input
        value={form.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="Goal title…"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none"
      />
      <textarea
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        placeholder="Description (optional)…"
        rows={2}
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none resize-none"
      />
      <div className="flex gap-3">
        <select value={form.domain} onChange={(e) => set('domain', e.target.value)}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 focus:outline-none">
          {DOMAINS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)}
          className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 focus:outline-none" />
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={!form.title.trim() || saving}
          className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-40">
          Create
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-600 hover:text-slate-400">Cancel</button>
      </div>
    </form>
  );
}

const FILTER_TABS = ['all', 'active', 'completed', 'paused'];
const DOMAIN_FILTERS = ['all', ...DOMAINS];

function GoalsStats({ goals }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);

  const active = goals.filter((g) => g.status === 'active');
  const overdue = active.filter((g) => g.target_date && g.target_date < today);

  const onTrack = active.filter((g) => {
    if (!g.target_date || !g.created_at) return g.progress >= 100;
    const start = new Date(g.created_at).getTime();
    const end = new Date(g.target_date + 'T00:00:00Z').getTime();
    const now = Date.now();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return g.progress >= 100;
    const expected = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    return g.progress >= expected;
  });

  const completedThisMonth = goals.filter(
    (g) => g.status === 'completed' && (g.updated_at ?? '').slice(0, 7) === monthPrefix,
  );

  const stats = [
    { label: 'Active goals', value: active.length },
    { label: 'On track', value: onTrack.length },
    { label: 'Overdue', value: overdue.length, warn: overdue.length > 0 },
    { label: 'Completed this month', value: completedThisMonth.length },
  ];

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
          <p className={`text-xl font-bold ${s.warn ? 'text-amber-400' : 'text-white'}`}>{s.value}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{s.label}</p>
        </div>
      ))}
    </div>
  );
}

export default function GoalsTab() {
  const [goals, setGoals]   = useState([]);
  const [filter, setFilter] = useState('active');
  const [domainFilter, setDomainFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [models, setModels] = useState([]);

  useEffect(() => {
    fetch('/api/goals')
      .then((r) => r.json())
      .then((d) => setGoals(d.goals ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/dispatch/models')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => setModels((json.models ?? []).filter((m) => m.id)))
      .catch(() => setModels([]));
  }, []);

  function handleAdd(goal)    { setGoals((p) => [goal, ...p]); }
  function handleUpdate(goal) { setGoals((p) => p.map((g) => g.id === goal.id ? goal : g)); }

  async function handleDelete(id) {
    const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
    if (res.ok) setGoals((p) => p.filter((g) => g.id !== id));
  }

  const filtered = goals
    .filter((g) => filter === 'all' || g.status === filter)
    .filter((g) => domainFilter === 'all' || g.domain === domainFilter);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">Goals</h1>
        <p className="mt-1 text-sm text-slate-500">{goals.filter((g) => g.status === 'active').length} active</p>
      </div>

      <GoalsStats goals={goals} />

      {/* Filter chips */}
      <div className="mb-3 flex gap-2">
        {FILTER_TABS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-all ${
              filter === f
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'border border-white/5 text-slate-500 hover:text-slate-300'
            }`}>
            {f}
          </button>
        ))}
      </div>

      {/* Domain filter chips */}
      <div className="mb-6 flex gap-2">
        {DOMAIN_FILTERS.map((d) => (
          <button key={d} onClick={() => setDomainFilter(d)}
            className={`rounded-xl px-3 py-1.5 text-xs font-medium capitalize transition-all ${
              domainFilter === d
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'border border-white/5 text-slate-500 hover:text-slate-300'
            }`}>
            {d === 'all' ? 'All domains' : d}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <AddGoalForm onAdd={handleAdd} />
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-600">
          {filter === 'all' ? 'No goals yet.' : `No ${filter} goals.`}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((g) => (
            <GoalCard key={g.id} goal={g} onUpdate={handleUpdate} onDelete={handleDelete} onToast={setToast} models={models} />
          ))}
        </div>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
