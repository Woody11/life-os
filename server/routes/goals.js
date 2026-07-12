const express = require('express');
const { getDb } = require('../db/init');
const { dispatchAgent } = require('../lib/dispatchAgent');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

const VALID_DOMAINS = ['SMSF', 'MBS', 'Personal', 'Dev'];
const VALID_STATUSES = ['active', 'completed', 'paused'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getGoalWithAgents(id) {
  const db = getDb();
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  if (!goal) return null;
  goal.agents = db
    .prepare('SELECT * FROM goal_agents WHERE goal_id = ? ORDER BY sort_order ASC, id ASC')
    .all(id);
  return goal;
}

// GET /api/goals
router.get('/', asyncHandler((req, res) => {
  try {
    const db = getDb();
    const { status } = req.query;
    const goals = status
      ? db.prepare('SELECT * FROM goals WHERE status = ? ORDER BY updated_at DESC').all(status)
      : db.prepare('SELECT * FROM goals ORDER BY updated_at DESC').all();

    const agentRows = db.prepare('SELECT * FROM goal_agents ORDER BY goal_id, sort_order ASC, id ASC').all();
    const agentsByGoal = {};
    for (const row of agentRows) {
      (agentsByGoal[row.goal_id] ??= []).push(row);
    }

    res.json({ goals: goals.map((g) => ({ ...g, agents: agentsByGoal[g.id] ?? [] })) });
  } catch {
    res.status(500).json({ error: 'Failed to load goals' });
  }
}));

// GET /api/goals/:id
router.get('/:id', asyncHandler((req, res) => {
  try {
    const goal = getGoalWithAgents(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Not found' });
    res.json(goal);
  } catch {
    res.status(500).json({ error: 'Failed to load goal' });
  }
}));

// POST /api/goals
router.post('/', asyncHandler((req, res) => {
  const { title, description, domain, target_date, status = 'active' } = req.body ?? {};
  if (!title?.trim())            return res.status(400).json({ error: 'title is required' });
  if (!VALID_DOMAINS.includes(domain)) return res.status(400).json({ error: `domain must be one of: ${VALID_DOMAINS.join(', ')}` });
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  try {
    const info = getDb()
      .prepare('INSERT INTO goals (title, description, domain, target_date, status) VALUES (?, ?, ?, ?, ?)')
      .run(title.trim(), description?.trim() ?? null, domain, target_date ?? null, status);
    res.status(201).json(getGoalWithAgents(info.lastInsertRowid));
  } catch {
    res.status(500).json({ error: 'Failed to create goal' });
  }
}));

// PATCH /api/goals/:id
router.patch('/:id', asyncHandler((req, res) => {
  const db = getDb();
  try {
    const existing = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { title, description, domain, target_date, progress, status } = req.body ?? {};
    if (domain  !== undefined && !VALID_DOMAINS.includes(domain))   return res.status(400).json({ error: `domain must be one of: ${VALID_DOMAINS.join(', ')}` });
    if (status  !== undefined && !VALID_STATUSES.includes(status))  return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    if (progress !== undefined && (!Number.isFinite(progress) || progress < 0 || progress > 100)) {
      return res.status(400).json({ error: 'progress must be a number 0–100' });
    }
    if (title !== undefined && !title?.trim()) return res.status(400).json({ error: 'title cannot be empty' });
    if (target_date != null && !DATE_RE.test(target_date)) {
      return res.status(400).json({ error: 'target_date must be YYYY-MM-DD' });
    }

    db.prepare(
      `UPDATE goals SET
         title       = ?,
         description = ?,
         domain      = ?,
         target_date = ?,
         progress    = ?,
         status      = ?,
         updated_at  = datetime('now')
       WHERE id = ?`,
    ).run(
      title       ?? existing.title,
      description !== undefined ? description : existing.description,
      domain      ?? existing.domain,
      target_date !== undefined ? target_date : existing.target_date,
      progress    !== undefined ? progress    : existing.progress,
      status      ?? existing.status,
      req.params.id,
    );
    res.json(getGoalWithAgents(req.params.id));
  } catch {
    res.status(500).json({ error: 'Failed to update goal' });
  }
}));

// DELETE /api/goals/:id
router.delete('/:id', asyncHandler((req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM goals WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  res.json({ ok: true });
}));

// POST /api/goals/:id/agents
router.post('/:id/agents', asyncHandler((req, res) => {
  const { agent_name, prompt_template, button_label, sort_order = 0, model } = req.body ?? {};
  if (!agent_name?.trim() || !prompt_template?.trim() || !button_label?.trim()) {
    return res.status(400).json({ error: 'agent_name, prompt_template, and button_label are required' });
  }
  try {
    const goal = getDb().prepare('SELECT id FROM goals WHERE id = ?').get(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const info = getDb()
      .prepare('INSERT INTO goal_agents (goal_id, agent_name, prompt_template, button_label, sort_order, model) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.params.id, agent_name.trim(), prompt_template.trim(), button_label.trim(), sort_order, model?.trim() || null);
    res.status(201).json(getDb().prepare('SELECT * FROM goal_agents WHERE id = ?').get(info.lastInsertRowid));
  } catch {
    res.status(500).json({ error: 'Failed to add agent' });
  }
}));

// DELETE /api/goals/:id/agents/:agentId
router.delete('/:id/agents/:agentId', asyncHandler((req, res) => {
  try {
    const row = getDb().prepare('SELECT * FROM goal_agents WHERE id = ? AND goal_id = ?').get(req.params.agentId, req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    getDb().prepare('DELETE FROM goal_agents WHERE id = ?').run(req.params.agentId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete agent' });
  }
}));

// POST /api/goals/:id/dispatch/:agentId
router.post('/:id/dispatch/:agentId', asyncHandler((req, res) => {
  try {
    const db = getDb();
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
    if (!goal) return res.status(404).json({ error: 'Goal not found' });
    const agentRow = db.prepare('SELECT * FROM goal_agents WHERE id = ? AND goal_id = ?').get(req.params.agentId, req.params.id);
    if (!agentRow) return res.status(404).json({ error: 'Agent not found' });

    const prompt = agentRow.prompt_template
      .replace(/\{\{goal_title\}\}/g, goal.title)
      .replace(/\{\{goal_description\}\}/g, goal.description ?? '');

    const dispatch = dispatchAgent(agentRow.agent_name, prompt, agentRow.model || null);
    res.status(201).json(dispatch);
  } catch {
    res.status(500).json({ error: 'Failed to dispatch agent' });
  }
}));

module.exports = router;
