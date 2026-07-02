const express = require('express');
const { getDb } = require('../db/init');

const router = express.Router();

const AGENTS = [
  { name: 'Bazza',       role: 'System coordinator & front door' },
  { name: 'Jarvis',      role: 'Ops & project manager' },
  { name: 'Sherlock',    role: 'Deep research' },
  { name: 'Maverick',    role: 'Marketing strategy' },
  { name: 'Shakespeare', role: 'Content writing & SEO' },
  { name: 'Statty',      role: 'YouTube analytics' },
  { name: 'Linus',       role: 'Full-stack dev & automation' },
  { name: 'Buffet',      role: 'SMSF financial analyst' },
];

/** GET /api/dispatch/agents */
router.get('/agents', (_req, res) => {
  res.json({ agents: AGENTS });
});

/** GET /api/dispatch/pending — oldest pending dispatches for Bazza to pick up and run */
router.get('/pending', (_req, res) => {
  try {
    const rows = getDb()
      .prepare(`SELECT * FROM dispatches WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10`)
      .all();
    res.json({ dispatches: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load pending dispatches' });
  }
});

/** GET /api/dispatch — recent dispatches, newest first */
router.get('/', (_req, res) => {
  try {
    const rows = getDb()
      .prepare(
        `SELECT id, agent, prompt, status, created_at, completed_at, result
         FROM dispatches ORDER BY created_at DESC LIMIT 50`,
      )
      .all();
    res.json({ dispatches: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load dispatches' });
  }
});

/** PATCH /api/dispatch/:id — update status + result (called by Bazza after agent completes) */
router.patch('/:id', (req, res) => {
  const { status, result, error: errMsg } = req.body ?? {};
  const allowed = ['running', 'done', 'error'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    db.prepare(
      `UPDATE dispatches
       SET status = ?,
           result = ?,
           error = ?,
           completed_at = CASE WHEN ? IN ('done','error') THEN datetime('now') ELSE completed_at END
       WHERE id = ?`,
    ).run(status, result ?? null, errMsg ?? null, status, req.params.id);

    const updated = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update dispatch' });
  }
});

/** GET /api/dispatch/:id — single dispatch */
router.get('/:id', (req, res) => {
  try {
    const row = getDb()
      .prepare('SELECT * FROM dispatches WHERE id = ?')
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Failed to load dispatch' });
  }
});

/** POST /api/dispatch — record a new dispatch */
router.post('/', (req, res) => {
  const { agent, prompt } = req.body ?? {};

  if (typeof agent !== 'string' || !agent.trim() || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'agent and prompt are required' });
  }

  try {
    const info = getDb()
      .prepare('INSERT INTO dispatches (agent, prompt, status) VALUES (?, ?, ?)')
      .run(agent.trim(), prompt.trim(), 'pending');

    res.status(201).json({
      id: info.lastInsertRowid,
      dispatch_id: info.lastInsertRowid,
      status: 'pending',
      agent: agent.trim(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to record dispatch' });
  }
});

module.exports = router;
