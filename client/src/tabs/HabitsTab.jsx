import { useEffect, useRef, useState } from 'react';
import Toast from '../components/Toast.jsx';
import { todayAdelaide } from '../lib/adelaideDate';

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const HISTORY_WEEKS = 12;
const HISTORY_DAYS = HISTORY_WEEKS * 7;

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const sinceMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - sinceMonday);
  return d;
}

function shortDate(d) {
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// Arranges a flat list of { date, completed } entries into a 12-week x 7-day
// grid (Mon-Sun rows, oldest week left / newest week right), independent of
// whatever order/range the history endpoint actually returns them in.
function buildHeatmapGrid(entries, todayStr) {
  const currentMonday = mondayOf(todayStr);
  const grid = Array.from({ length: HISTORY_WEEKS }, () => Array(7).fill(null));
  const weekMondays = Array(HISTORY_WEEKS).fill(null);

  for (const entry of entries) {
    if (!entry?.date) continue;
    const entryMonday = mondayOf(entry.date);
    const weekOffset = Math.round((currentMonday - entryMonday) / (7 * 86400000));
    const col = HISTORY_WEEKS - 1 - weekOffset;
    if (col < 0 || col >= HISTORY_WEEKS) continue;
    const d = new Date(entry.date + 'T00:00:00Z');
    const row = (d.getUTCDay() + 6) % 7;
    grid[col][row] = entry.completed;
    weekMondays[col] = entryMonday;
  }

  return { grid, weekMondays };
}

function HistoryHeatmap({ habitId }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | unavailable
  const [entries, setEntries] = useState([]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && status === 'idle') {
      setStatus('loading');
      try {
        const res = await fetch(`/api/habits/${habitId}/history?days=${HISTORY_DAYS}`);
        if (!res.ok) throw new Error('not ok');
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.history ?? data.days ?? []);
        setEntries(list);
        setStatus('ready');
      } catch {
        setStatus('unavailable');
      }
    }
  }

  const today = todayAdelaide();
  const { grid, weekMondays } = status === 'ready' ? buildHeatmapGrid(entries, today) : { grid: null, weekMondays: [] };

  return (
    <div className="mt-3">
      <button
        onClick={toggleOpen}
        className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
      >
        📅 History {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-white/5 bg-black/20 p-3">
          {status === 'loading' && (
            <p className="text-xs text-slate-600">Loading history…</p>
          )}
          {status === 'unavailable' && (
            <p className="text-xs text-slate-600">History coming soon</p>
          )}
          {status === 'ready' && (
            <div className="flex gap-1.5 overflow-x-auto">
              <div className="flex flex-col gap-[3px] pr-1">
                {WEEKDAY_LABELS.map((label, i) => (
                  <span key={i} className="h-3 text-[8px] leading-3 text-slate-700">
                    {label}
                  </span>
                ))}
              </div>
              {grid.map((col, colIdx) => (
                <div key={colIdx} className="flex flex-col items-center gap-[3px]">
                  {col.map((completed, rowIdx) => (
                    <div
                      key={rowIdx}
                      className={`h-3 w-3 rounded-sm ${
                        completed === null
                          ? 'bg-white/[0.02]'
                          : completed
                          ? 'bg-emerald-500/70'
                          : 'bg-slate-700/50'
                      }`}
                    />
                  ))}
                  <span className="mt-0.5 text-[7px] text-slate-700 whitespace-nowrap">
                    {colIdx % 2 === 0 && weekMondays[colIdx] ? shortDate(weekMondays[colIdx]) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ArchiveControl({ habitId, onArchive }) {
  const [confirming, setConfirming] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function startConfirm() {
    setConfirming(true);
    timerRef.current = setTimeout(() => setConfirming(false), 2000);
  }

  function cancel() {
    clearTimeout(timerRef.current);
    setConfirming(false);
  }

  function confirm() {
    clearTimeout(timerRef.current);
    setConfirming(false);
    onArchive(habitId);
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-slate-500">Confirm archive?</span>
        <button onClick={confirm} className="text-rose-400 hover:text-rose-300 transition-colors">
          Yes
        </button>
        <button onClick={cancel} className="text-slate-600 hover:text-slate-400 transition-colors">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={startConfirm}
      className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors"
    >
      Archive
    </button>
  );
}

function HabitCard({ habit, onToggle, onArchive, onToast }) {
  const [toggling, setToggling] = useState(false);

  async function toggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/habits/${habit.id}/toggle`, { method: 'POST' });
      if (res.ok) onToggle(await res.json());
      else onToast('Action failed — please try again');
    } catch {
      onToast('Action failed — please try again');
    } finally {
      setToggling(false);
    }
  }

  const completedCount = habit.last_7_days.filter((d) => d.completed).length;
  const totalDays = habit.last_7_days.length;
  const rate = totalDays > 0 ? Math.round((completedCount / totalDays) * 100) : 0;

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-2xl">{habit.emoji || '✅'}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{habit.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
              {habit.current_streak > 0 && (
                <span>🔥 {habit.current_streak} day{habit.current_streak !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={toggling}
          className={`shrink-0 h-9 w-9 rounded-xl border text-lg transition-all ${
            habit.completed_today
              ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-400'
              : 'border-white/10 bg-white/[0.04] text-slate-600 hover:border-indigo-500/40 hover:text-indigo-400'
          }`}
        >
          {habit.completed_today ? '✓' : '○'}
        </button>
      </div>

      {/* 7-day heatmap */}
      <div className="mt-4 flex gap-1.5">
        {habit.last_7_days.map((day) => (
          <div key={day.date} className="flex flex-col items-center gap-1">
            <div
              className={`h-6 w-6 rounded-md ${
                day.completed ? 'bg-emerald-500/70' : 'bg-white/[0.04]'
              }`}
            />
            <span className="text-[9px] text-slate-700">
              {new Date(day.date + 'T00:00:00Z').toLocaleDateString('en-AU', { weekday: 'narrow', timeZone: 'UTC' })}
            </span>
          </div>
        ))}
      </div>

      {/* Weekly completion rate */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-600">
          <span>This week: {completedCount}/{totalDays} days</span>
          <span>{rate}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-white/[0.04]">
          <div
            className="h-1.5 rounded-full bg-emerald-500/60 transition-all"
            style={{ width: `${rate}%` }}
          />
        </div>
      </div>

      <HistoryHeatmap habitId={habit.id} />

      <div className="mt-3 flex justify-end">
        <ArchiveControl habitId={habit.id} onArchive={onArchive} />
      </div>
    </div>
  );
}

function AddHabitForm({ onAdd, onToast }) {
  const [name, setName]   = useState('');
  const [emoji, setEmoji] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), emoji: emoji.trim() || null }),
      });
      if (res.ok) {
        onAdd(await res.json());
        setName('');
        setEmoji('');
      } else {
        onToast('Action failed — please try again');
      }
    } catch {
      onToast('Action failed — please try again');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        placeholder="emoji"
        maxLength={4}
        className="w-16 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none"
      />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New habit name…"
        className="flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white placeholder-slate-600 focus:border-indigo-500/50 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!name.trim() || saving}
        className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-300 transition-all hover:bg-indigo-500/20 disabled:opacity-40"
      >
        Add
      </button>
    </form>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function StatsPanel({ habits }) {
  if (habits.length === 0) return null;

  const bestStreak = Math.max(0, ...habits.map((h) => h.current_streak || 0));

  const totalCompletionsThisWeek = habits.reduce(
    (sum, h) => sum + h.last_7_days.filter((d) => d.completed).length,
    0,
  );

  const referenceToday = habits[0]?.last_7_days?.slice(-1)[0]?.date ?? todayAdelaide();
  const currentMonth = referenceToday.slice(0, 7);
  const totalCompletionsThisMonth = habits.reduce(
    (sum, h) => sum + h.last_7_days.filter((d) => d.completed && d.date.slice(0, 7) === currentMonth).length,
    0,
  );

  const referenceDates = habits[0]?.last_7_days.map((d) => d.date) ?? [];
  const perfectDaysThisWeek = referenceDates.filter((date) =>
    habits.every((h) => h.last_7_days.find((d) => d.date === date)?.completed),
  ).length;

  return (
    <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <StatCard label="Best streak" value={`🔥 ${bestStreak}`} />
      <StatCard label="Done this week" value={totalCompletionsThisWeek} />
      <StatCard label="Done this month" value={totalCompletionsThisMonth} />
      <StatCard label="Perfect days (week)" value={perfectDaysThisWeek} />
    </div>
  );
}

export default function HabitsTab() {
  const [habits, setHabits]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [toast, setToast]     = useState(null);

  useEffect(() => {
    fetch('/api/habits')
      .then((r) => r.json())
      .then((d) => setHabits(d.habits ?? []))
      .catch(() => setError('Failed to load habits'))
      .finally(() => setLoading(false));
  }, []);

  function handleToggle(updated) {
    setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  }

  function handleAdd(habit) {
    setHabits((prev) => [...prev, habit]);
  }

  async function handleArchive(id) {
    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (res.ok) setHabits((prev) => prev.filter((h) => h.id !== id));
      else setToast('Action failed — please try again');
    } catch {
      setToast('Action failed — please try again');
    }
  }

  const completedToday = habits.filter((h) => h.completed_today).length;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Habits</h1>
          {!loading && habits.length > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              {completedToday}/{habits.length} done today
            </p>
          )}
        </div>
      </div>

      {!loading && !error && <StatsPanel habits={habits} />}

      <div className="mb-6">
        <AddHabitForm onAdd={handleAdd} onToast={setToast} />
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : error ? (
        <p className="py-16 text-center text-sm text-rose-400">{error}</p>
      ) : habits.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-600">No habits yet — add one above.</p>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} onToggle={handleToggle} onArchive={handleArchive} onToast={setToast} />
          ))}
        </div>
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
