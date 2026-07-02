import { useCallback, useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatDate(iso) {
  if (!iso) return '—';
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

function checklistProgress(checklist) {
  if (!checklist) return null;
  if (Array.isArray(checklist)) {
    return { done: 0, total: checklist.length, unknownDone: true };
  }
  if (typeof checklist === 'object') {
    const values = Object.values(checklist);
    const done = values.filter(Boolean).length;
    return { done, total: values.length, unknownDone: false };
  }
  return null;
}

const STAGES = [
  { key: 'idea', label: 'Idea' },
  { key: 'scripting', label: 'Scripting' },
  { key: 'building', label: 'Building' },
  { key: 'filming', label: 'Filming' },
  { key: 'editing', label: 'Editing' },
  { key: 'published', label: 'Published' },
];

const STATUS_BADGE = {
  idea: 'bg-slate-600/60 text-slate-200 border border-slate-500/30',
  scripting: 'bg-violet-600/40 text-violet-200 border border-violet-500/30',
  building: 'bg-orange-600/40 text-orange-200 border border-orange-500/30',
  filming: 'bg-blue-600/40 text-blue-200 border border-blue-500/30',
  editing: 'bg-yellow-500/30 text-yellow-200 border border-yellow-500/30',
  published: 'bg-emerald-600/40 text-emerald-200 border border-emerald-500/30',
};

function StatusBadge({ status }) {
  const cls = STATUS_BADGE[(status || '').toLowerCase()] || 'bg-slate-600/40 text-slate-200 border border-white/10';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status || 'unknown'}
    </span>
  );
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

function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center gap-3 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-300">
      <span className="text-sm">{message || 'Something went wrong.'}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </h2>
  );
}

function useFetch(url) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            if (body?.error) msg = body.error;
          } catch { /* keep status message */ }
          throw new Error(msg);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [url, tick]);

  return { data, loading, error, reload };
}

// ---------------------------------------------------------------------------
// Section A — Pipeline Board
// ---------------------------------------------------------------------------

function PipelineBoard() {
  const { data, loading, error, reload } = useFetch('/api/mbs/pipeline');

  if (loading) return <Card><Spinner label="Loading pipeline…" /></Card>;
  if (error) return <ErrorBox message={`Pipeline: ${error}`} onRetry={reload} />;

  const pipeline = data?.pipeline || {};
  const next = data?.next_publish;

  const firstNonEmpty = STAGES.find((s) => (pipeline[s.key] || []).length > 0)?.key;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Pipeline</SectionTitle>
        {next && (
          <span className="mb-4 text-sm text-slate-400">
            Next up: <span className="text-slate-200">{next.title}</span>{' '}
            — {formatDate(next.targetPublishDate)}{' '}
            <span className="text-slate-500">
              ({next.daysUntil >= 0 ? `in ${next.daysUntil}d` : `${-next.daysUntil}d ago`})
            </span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STAGES.map((stage) => {
          const items = pipeline[stage.key] || [];
          const isActive = stage.key === firstNonEmpty;
          return (
            <div
              key={stage.key}
              className={[
                'rounded-xl border p-3 transition-all',
                isActive
                  ? 'border-indigo-500/30 bg-indigo-500/5 ring-1 ring-indigo-500/20'
                  : 'border-white/5 bg-white/[0.02]',
              ].join(' ')}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {stage.label}
                </span>
                <span className="rounded-full border border-white/5 bg-white/[0.06] px-1.5 py-0.5 text-xs text-slate-300">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <p className="py-2 text-center text-xs italic text-slate-600">Empty</p>
                ) : (
                  items.map((it) => (
                    <div key={it.id} className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-2">
                      <div className="text-sm font-medium text-slate-100">{it.title}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {formatDate(it.targetPublishDate)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section B — Schedule Detail
// ---------------------------------------------------------------------------

function SceneList({ scenes }) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return <p className="text-sm italic text-slate-600">No scenes listed.</p>;
  }
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
      {scenes.map((scene, i) => {
        if (typeof scene === 'string') return <li key={i}>{scene}</li>;
        const label = scene.description || scene.type || `Scene ${scene.sceneNum ?? i + 1}`;
        return (
          <li key={scene.id || i}>
            {scene.type && (
              <span className="mr-1 text-xs uppercase text-slate-500">[{scene.type}]</span>
            )}
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function ScheduleRow({ item, expanded, onToggle }) {
  const progress = checklistProgress(item.checklist);
  const breakdown = item.scriptBreakdown || {};
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-white/[0.05] transition-colors hover:bg-white/[0.02]"
      >
        <td className="px-3 py-2.5 text-sm text-slate-100">
          <span className="mr-2 text-slate-500">{expanded ? '▾' : '▸'}</span>
          {item.title}
        </td>
        <td className="px-3 py-2.5">
          <StatusBadge status={item.status} />
        </td>
        <td className="px-3 py-2.5 text-sm text-slate-400">{formatDate(item.buildDate)}</td>
        <td className="px-3 py-2.5 text-sm text-slate-400">{formatDate(item.filmingDate)}</td>
        <td className="px-3 py-2.5 text-sm text-slate-300">{formatDate(item.targetPublishDate)}</td>
        <td className="px-3 py-2.5 text-sm text-slate-400">
          {progress
            ? progress.unknownDone
              ? `${progress.total} items`
              : `${progress.done}/${progress.total}`
            : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-white/[0.05] bg-black/20">
          <td colSpan={6} className="px-6 py-4">
            {breakdown.notes ? (
              <p className="mb-3 text-sm text-slate-300">
                <span className="font-semibold text-slate-400">Notes: </span>
                {breakdown.notes}
              </p>
            ) : (
              <p className="mb-3 text-sm italic text-slate-600">No production notes.</p>
            )}
            <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Scenes
            </div>
            <SceneList scenes={breakdown.scenes} />
          </td>
        </tr>
      )}
    </>
  );
}

function ScheduleDetail() {
  const { data, loading, error, reload } = useFetch('/api/mbs/schedule');
  const [openId, setOpenId] = useState(null);

  if (loading) return <Card><Spinner label="Loading schedule…" /></Card>;
  if (error) return <ErrorBox message={`Schedule: ${error}`} onRetry={reload} />;

  const rows = (Array.isArray(data) ? [...data] : []).sort((a, b) =>
    (a.targetPublishDate || '').localeCompare(b.targetPublishDate || ''),
  );

  return (
    <div>
      <SectionTitle>Schedule Detail</SectionTitle>
      <Card className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm italic text-slate-500">No scheduled videos.</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06] text-left text-xs uppercase tracking-widest text-slate-500">
                <th className="px-3 py-3 font-medium">Title</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium">Build Date</th>
                <th className="px-3 py-3 font-medium">Filming Date</th>
                <th className="px-3 py-3 font-medium">Target Publish</th>
                <th className="px-3 py-3 font-medium">Checklist</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <ScheduleRow
                  key={item.id}
                  item={item}
                  expanded={openId === item.id}
                  onToggle={() => setOpenId((cur) => (cur === item.id ? null : item.id))}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section C — Quick Dispatch
// ---------------------------------------------------------------------------

const SHERLOCK_PROMPT =
  'Research this LEGO set for the Macro Bricks Studio YouTube channel. Find: ' +
  'community reception, interesting build techniques, story angles, and any ' +
  'notable features worth highlighting in an ASMR build video.';

const SHAKESPEARE_PROMPT =
  'Write a video script for this Macro Bricks Studio ASMR build video. Include: ' +
  'intro hook, box reveal narration, key build moments to highlight, detail shot ' +
  'suggestions, and outro. Keep tone calm and focused — this is ASMR content.';

function DispatchCard({ heading, agent, options, optionLabel, defaultPrompt, buttonClass }) {
  const [selected, setSelected] = useState('');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [state, setState] = useState({ status: 'idle', message: '' });

  useEffect(() => {
    if (state.status !== 'ok') return undefined;
    const t = setTimeout(() => setState({ status: 'idle', message: '' }), 3000);
    return () => clearTimeout(t);
  }, [state]);

  async function dispatch() {
    setState({ status: 'sending', message: '' });
    const chosen = options.find((o) => o.value === selected);
    const fullPrompt = chosen ? `${prompt}\n\nSubject: ${chosen.label}` : prompt;
    try {
      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, prompt: fullPrompt }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          if (body?.error) msg = body.error;
        } catch { /* keep status message */ }
        throw new Error(msg);
      }
      const body = await res.json().catch(() => ({}));
      const id = body?.id ?? body?.taskId ?? body?.task?.id ?? '?';
      setState({ status: 'ok', message: `Dispatched — task #${id} queued` });
    } catch (err) {
      setState({ status: 'err', message: err.message || 'Dispatch failed' });
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-white">{heading}</h3>

      <label className="text-xs font-medium uppercase tracking-widest text-slate-500">
        {optionLabel}
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-indigo-500/50 focus:outline-none transition-colors"
        >
          <option value="">— select —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={5}
        className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-200 focus:border-indigo-500/50 focus:outline-none transition-colors"
      />

      <button
        onClick={dispatch}
        disabled={state.status === 'sending'}
        className={`rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
      >
        {state.status === 'sending' ? 'Dispatching…' : `Dispatch ${agent}`}
      </button>

      {state.status === 'ok' && (
        <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-300">
          {state.message}
        </p>
      )}
      {state.status === 'err' && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-red-300">
          {state.message}
        </p>
      )}
    </Card>
  );
}

function QuickDispatch() {
  const sets = useFetch('/api/mbs/sets');
  const schedule = useFetch('/api/mbs/schedule');

  const setOptions = (Array.isArray(sets.data) ? sets.data : []).map((s) => ({
    value: String(s.id),
    label: s.setNumber ? `${s.name} (${s.setNumber})` : s.name || String(s.id),
  }));

  const scriptableStatuses = new Set(['scripting', 'building', 'filming']);
  const scheduleOptions = (Array.isArray(schedule.data) ? schedule.data : [])
    .filter((v) => scriptableStatuses.has((v.status || '').toLowerCase()))
    .map((v) => ({ value: String(v.id), label: `${v.title} · ${v.status}` }));

  return (
    <div>
      <SectionTitle>Quick Dispatch</SectionTitle>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sets.loading ? (
          <Card><Spinner label="Loading sets…" /></Card>
        ) : sets.error ? (
          <ErrorBox message={`Sets: ${sets.error}`} onRetry={sets.reload} />
        ) : (
          <DispatchCard
            heading="Research Set"
            agent="Sherlock"
            options={setOptions}
            optionLabel="LEGO set"
            defaultPrompt={SHERLOCK_PROMPT}
            buttonClass="bg-indigo-600 hover:bg-indigo-500"
          />
        )}

        {schedule.loading ? (
          <Card><Spinner label="Loading schedule…" /></Card>
        ) : schedule.error ? (
          <ErrorBox message={`Schedule: ${schedule.error}`} onRetry={schedule.reload} />
        ) : (
          <DispatchCard
            heading="Write Script"
            agent="Shakespeare"
            options={scheduleOptions}
            optionLabel="Scheduled video"
            defaultPrompt={SHAKESPEARE_PROMPT}
            buttonClass="bg-violet-600 hover:bg-violet-500"
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab root
// ---------------------------------------------------------------------------

export default function MbsTab() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8">
        <p className="text-sm font-medium text-indigo-400">Studio</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">Macro Bricks Studio</h1>
      </div>

      <div className="space-y-8">
        <PipelineBoard />
        <ScheduleDetail />
        <QuickDispatch />
      </div>
    </div>
  );
}
