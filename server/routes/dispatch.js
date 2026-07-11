const express = require('express');
const { getDb } = require('../db/init');
const { dispatchAgent } = require('../lib/dispatchAgent');
const { emit } = require('../lib/sseEmitter');

const router = express.Router();


function enqueueVaultSync(db, dispatch) {
  const date = (dispatch.completed_at || dispatch.created_at || '').slice(0, 10);
  const slug = `${dispatch.id}-${dispatch.agent}`;
  const vaultPath = `60 Agent System/Dispatches/${date}-${slug}.md`;
  db.prepare(
    `INSERT OR IGNORE INTO obsidian_sync_queue (entity_type, entity_id, payload, vault_path)
     VALUES ('dispatch', ?, ?, ?)`,
  ).run(dispatch.id, JSON.stringify(dispatch), vaultPath);
}

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

/** GET /api/dispatch/models — curated list of models available for dispatch */
router.get('/models', (_req, res) => {
  res.json({ models: [
    { id: '', label: 'Default (system)' },
    { id: 'xai/grok-4.5', label: 'Grok 4.5' },
    { id: 'xai/grok-4.3', label: 'Grok 4.3' },
    { id: 'openai/gpt-5.6-sol', label: 'GPT-5.6 Sol' },
    { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna' },
    { id: 'openai/gpt-5.6-terra', label: 'GPT-5.6 Terra' },
    { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'anthropic/claude-opus-4-8', label: 'Claude Opus 4.8' },
    { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { id: 'xai/grok-4.20-beta-latest-reasoning', label: 'Grok 4.20 Reasoning' },
  ]});
});

/** GET /api/dispatch/agent-models — per-agent default model config */
router.get('/agent-models', (_req, res) => {
  try {
    const rows = getDb().prepare('SELECT * FROM agent_models').all();
    res.json({ agentModels: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load agent models' });
  }
});

/** PUT /api/dispatch/agent-models/:agentName — upsert default model for an agent */
router.put('/agent-models/:agentName', (req, res) => {
  const { model } = req.body ?? {};
  if (typeof model !== 'string' || !model.trim()) {
    return res.status(400).json({ error: 'model is required' });
  }

  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO agent_models (agent_name, model, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(agent_name) DO UPDATE SET model = excluded.model, updated_at = datetime('now')`,
    ).run(req.params.agentName, model.trim());

    const row = db.prepare('SELECT * FROM agent_models WHERE agent_name = ?').get(req.params.agentName);
    res.json(row);
  } catch {
    res.status(500).json({ error: 'Failed to update agent model' });
  }
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

/** GET /api/dispatch/stats — summary counts for the Mission Control top bar */
router.get('/stats', (_req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare(`SELECT status, COUNT(*) as count FROM dispatches GROUP BY status`)
      .all();

    const byStatus = { pending: 0, running: 0, review: 0, done: 0, error: 0 };
    let total = 0;
    for (const { status, count } of rows) {
      if (status in byStatus) byStatus[status] = count;
      else byStatus[status] = count;
      total += count;
    }

    const activeAgents = db
      .prepare(`SELECT COUNT(DISTINCT agent) as n FROM dispatches WHERE status = 'running'`)
      .get().n;

    res.json({ total, byStatus, activeAgents });
  } catch {
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

/** PATCH /api/dispatch/:id — update status + result (called by Bazza after agent completes) */
router.patch('/:id', (req, res) => {
  const { status, result, error: errMsg, input_tokens, output_tokens, cost_aud } = req.body ?? {};
  const allowed = ['running', 'review', 'done', 'error'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const closes = status === 'done' || status === 'error';
    db.prepare(
      `UPDATE dispatches
       SET status        = ?,
           result        = ?,
           error         = ?,
           input_tokens  = COALESCE(?, input_tokens),
           output_tokens = COALESCE(?, output_tokens),
           cost_aud      = COALESCE(?, cost_aud),
           completed_at  = ${closes ? "datetime('now')" : 'completed_at'}
       WHERE id = ?`,
    ).run(status, result ?? null, errMsg ?? null, input_tokens ?? null, output_tokens ?? null, cost_aud ?? null, req.params.id);

    const updated = db.prepare('SELECT * FROM dispatches WHERE id = ?').get(req.params.id);

    if (status === 'done') {
      enqueueVaultSync(db, updated);
    }

    emit('dispatch_updated', { id: Number(req.params.id), status, agent: updated.agent });

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
  const { agent, prompt, model } = req.body ?? {};

  if (typeof agent !== 'string' || !agent.trim() || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'agent and prompt are required' });
  }

  try {
    const dispatch = dispatchAgent(agent, prompt, model);
    res.status(201).json({ ...dispatch, dispatch_id: dispatch.id });
  } catch {
    res.status(500).json({ error: 'Failed to record dispatch' });
  }
});

module.exports = router;
