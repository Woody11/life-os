const express = require('express');
const { getDb } = require('../db/init');

const router = express.Router();

// Canonical roster of dispatchable agents. The UI reads this list (rather than
// hardcoding names) so adding an agent is a one-line change here. Full OpenClaw
// integration — actually running the agent — lands in Block 4; for now dispatch
// just records the request.
const AGENTS = [
  'Bazza',
  'Jarvis',
  'Sherlock',
  'Maverick',
  'Shakespeare',
  'Statty',
  'Linus',
  'Buffet',
];

/**
 * GET /api/dispatch/agents — the roster the Dispatch UI populates from.
 */
router.get('/agents', (_req, res) => {
  res.json({ agents: AGENTS });
});

/**
 * POST /api/dispatch — record a dispatch request (Block 2 stub).
 *
 * Inserts a pending row into `dispatches` and echoes the new id/status/agent.
 * Real agent execution is wired in Block 4; this only persists the intent.
 */
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
      dispatch_id: info.lastInsertRowid,
      status: 'pending',
      agent: agent.trim(),
    });
  } catch {
    res.status(500).json({ error: 'Failed to record dispatch' });
  }
});

module.exports = router;
