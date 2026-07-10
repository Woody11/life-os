import { useEffect, useState } from 'react';

function HabitCard({ habit, onToggle, onArchive }) {
  const [toggling, setToggling] = useState(false);

  async function toggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/habits/${habit.id}/toggle`, { method: 'POST' });
      if (res.ok) onToggle(await res.json());
    } finally {
      setToggling(false);
    }
  }

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

      <div className="mt-3 flex justify-end">
        <button
          onClick={() => onArchive(habit.id)}
          className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors"
        >
          Archive
        </button>
      </div>
    </div>
  );
}

function AddHabitForm({ onAdd }) {
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
      }
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

export default function HabitsTab() {
  const [habits, setHabits]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/habits')
      .then((r) => r.json())
      .then((d) => setHabits(d.habits ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleToggle(updated) {
    setHabits((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
  }

  function handleAdd(habit) {
    setHabits((prev) => [...prev, habit]);
  }

  async function handleArchive(id) {
    const res = await fetch(`/api/habits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    if (res.ok) setHabits((prev) => prev.filter((h) => h.id !== id));
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

      <div className="mb-6">
        <AddHabitForm onAdd={handleAdd} />
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
          <span className="text-sm">Loading…</span>
        </div>
      ) : habits.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-600">No habits yet — add one above.</p>
      ) : (
        <div className="space-y-3">
          {habits.map((h) => (
            <HabitCard key={h.id} habit={h} onToggle={handleToggle} onArchive={handleArchive} />
          ))}
        </div>
      )}
    </div>
  );
}
