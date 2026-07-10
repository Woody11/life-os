const express = require('express');
const { getDb } = require('../db/init');

const router = express.Router();

function readCache(key) {
  try {
    const row = getDb().prepare('SELECT data, cached_at FROM google_cache WHERE key = ?').get(key);
    if (!row) return null;
    return { data: JSON.parse(row.data), cached_at: row.cached_at };
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  getDb()
    .prepare('INSERT INTO google_cache (key, data, cached_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET data = excluded.data, cached_at = excluded.cached_at')
    .run(key, JSON.stringify(data));
}

// POST /api/google/cache — OpenClaw pushes fresh data here (any key accepted)
router.post('/cache', (req, res) => {
  const { calendar, emails, morning_brief, ...rest } = req.body ?? {};
  if (calendar       !== undefined) writeCache('calendar',       calendar);
  if (emails         !== undefined) writeCache('emails',         emails);
  if (morning_brief  !== undefined) writeCache('morning_brief',  morning_brief);
  // Accept arbitrary extra keys for future extensions
  for (const [k, v] of Object.entries(rest)) {
    if (typeof k === 'string' && k.length > 0) writeCache(k, v);
  }
  res.json({ ok: true, cached_at: new Date().toISOString() });
});

// GET /api/google/cache/:key — generic single-key cache read
router.get('/cache/:key', (req, res) => {
  const entry = readCache(req.params.key);
  if (!entry) return res.status(404).json({ error: 'Not cached' });
  res.json({ key: req.params.key, data: entry.data, cached_at: entry.cached_at });
});

// GET /api/google — serve calendar + emails from cache
router.get('/', (_req, res) => {
  const cal   = readCache('calendar');
  const email = readCache('emails');
  res.json({
    calendar:   cal?.data   ?? null,
    emails:     email?.data ?? null,
    cached_at:  cal?.cached_at ?? email?.cached_at ?? null,
    partial:    cal === null || email === null,
  });
});

module.exports = router;
