const express = require('express');
const { getDb } = require('../db/init');
const { todayAdelaide } = require('../lib/adelaideTime');

const router = express.Router();

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function computeStreak(completedSet, todayStr) {
  let streak = 0;
  let cursor = todayStr;
  while (completedSet.has(cursor)) {
    streak++;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function buildHabitPayload(habit) {
  const db = getDb();
  const today = todayAdelaide();

  // Last 60 days of completions for streak calculation
  const since = shiftDate(today, -59);
  const rows = db
    .prepare('SELECT completed_date FROM habit_completions WHERE habit_id = ? AND completed_date >= ? ORDER BY completed_date DESC')
    .all(habit.id, since);

  const completedSet = new Set(rows.map((r) => r.completed_date));

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const date = shiftDate(today, -(6 - i));
    return { date, completed: completedSet.has(date) };
  });

  return {
    ...habit,
    completed_today: completedSet.has(today),
    current_streak:  computeStreak(completedSet, today),
    last_7_days:     last7,
  };
}

// GET /api/habits
router.get('/', (_req, res) => {
  try {
    const habits = getDb()
      .prepare('SELECT * FROM habits WHERE active = 1 ORDER BY created_at ASC')
      .all();
    res.json({ habits: habits.map(buildHabitPayload) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load habits' });
  }
});

// POST /api/habits
router.post('/', (req, res) => {
  const { name, emoji } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const info = getDb()
      .prepare('INSERT INTO habits (name, emoji) VALUES (?, ?)')
      .run(name.trim(), emoji?.trim() ?? null);
    const habit = getDb().prepare('SELECT * FROM habits WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(buildHabitPayload(habit));
  } catch {
    res.status(500).json({ error: 'Failed to create habit' });
  }
});

// PATCH /api/habits/:id
router.patch('/:id', (req, res) => {
  const { name, emoji, active } = req.body ?? {};
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    db.prepare('UPDATE habits SET name = ?, emoji = ?, active = ? WHERE id = ?').run(
      name  ?? existing.name,
      emoji !== undefined ? emoji : existing.emoji,
      active !== undefined ? (active ? 1 : 0) : existing.active,
      req.params.id,
    );
    const updated = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    res.json(buildHabitPayload(updated));
  } catch {
    res.status(500).json({ error: 'Failed to update habit' });
  }
});

// POST /api/habits/:id/toggle — toggle today's completion
router.post('/:id/toggle', (req, res) => {
  const today = todayAdelaide();
  const db = getDb();
  try {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    if (!habit) return res.status(404).json({ error: 'Not found' });

    const existing = db
      .prepare('SELECT id FROM habit_completions WHERE habit_id = ? AND completed_date = ?')
      .get(req.params.id, today);

    if (existing) {
      db.prepare('DELETE FROM habit_completions WHERE habit_id = ? AND completed_date = ?').run(req.params.id, today);
    } else {
      db.prepare('INSERT OR IGNORE INTO habit_completions (habit_id, completed_date) VALUES (?, ?)').run(req.params.id, today);
    }

    res.json(buildHabitPayload(db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id)));
  } catch {
    res.status(500).json({ error: 'Failed to toggle habit' });
  }
});

// DELETE /api/habits/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  try {
    const habit = db.prepare('SELECT * FROM habits WHERE id = ?').get(req.params.id);
    if (!habit) return res.status(404).json({ error: 'Not found' });

    const completions = db.prepare('SELECT COUNT(*) as n FROM habit_completions WHERE habit_id = ?').get(req.params.id).n;
    if (completions > 0) {
      return res.status(409).json({ error: 'Habit has completion history — archive it instead (PATCH active: false)' });
    }
    db.prepare('DELETE FROM habits WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete habit' });
  }
});

module.exports = router;
