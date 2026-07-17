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

// ---------------------------------------------------------------------------
// Gmail actions — thin proxy to google-sync/action-api.js (a separate
// service on the Mac mini that holds the actual Gmail OAuth clients). Kept
// server-side so the bearer token never reaches the browser. Read-only cache
// above is unaffected by these — archiving/reading a message here doesn't
// touch the cached list; the frontend removes it from its own local state.
// ---------------------------------------------------------------------------

async function actionsFetch(path, body) {
  if (!process.env.GOOGLE_ACTIONS_URL || !process.env.GOOGLE_ACTIONS_TOKEN) {
    throw Object.assign(new Error('Gmail actions are not configured'), { status: 503 });
  }
  const res = await fetch(`${process.env.GOOGLE_ACTIONS_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GOOGLE_ACTIONS_TOKEN}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

async function handleAction(req, res, path, body) {
  try {
    res.json(await actionsFetch(path, body));
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message });
  }
}

// POST /api/google/gmail/:accountEmail/messages/:id/archive
router.post('/gmail/:accountEmail/messages/:id/archive', (req, res) =>
  handleAction(
    req, res,
    `/gmail/${encodeURIComponent(req.params.accountEmail)}/messages/${encodeURIComponent(req.params.id)}/archive`
  )
);

// POST /api/google/gmail/:accountEmail/messages/:id/read
router.post('/gmail/:accountEmail/messages/:id/read', (req, res) =>
  handleAction(
    req, res,
    `/gmail/${encodeURIComponent(req.params.accountEmail)}/messages/${encodeURIComponent(req.params.id)}/read`
  )
);

// POST /api/google/gmail/:accountEmail/drafts — creates a Gmail draft, never
// sends. { replyToMessageId, body } threads it as a reply (to/subject are
// auto-derived from the original message by action-api.js).
router.post('/gmail/:accountEmail/drafts', (req, res) => {
  const { replyToMessageId, to, subject, body } = req.body ?? {};
  return handleAction(
    req, res,
    `/gmail/${encodeURIComponent(req.params.accountEmail)}/drafts`,
    { replyToMessageId, to, subject, body }
  );
});

module.exports = router;
