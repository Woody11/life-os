const express = require('express');
const { getDb } = require('../db/init');
const { asyncHandler } = require('../lib/asyncHandler');

const router = express.Router();

// Stage definitions and agent assignments per domain.
// Moving a card to a stage that has an agent triggers a dispatch (with confirmation modal on the frontend).
const PIPELINES = {
  mbs: {
    stages: ['Idea', 'Research', 'Scripted', 'Filming', 'Editing', 'Published'],
    agents: { Research: 'Sherlock', Scripted: 'Shakespeare' },
  },
  smsf: {
    stages: ['Flagged', 'Research', 'Analysis', 'Decision', 'Actioned'],
    agents: { Research: 'Sherlock', Analysis: 'Buffet' },
  },
};

/** GET /api/kanban/pipelines — pipeline config for the UI */
router.get('/pipelines', asyncHandler((_req, res) => {
  res.json({ pipelines: PIPELINES });
}));

/** GET /api/kanban — all cards, optionally filtered by domain */
router.get('/', asyncHandler((req, res) => {
  try {
    const { domain } = req.query;
    const db = getDb();
    const rows = domain
      ? db.prepare('SELECT * FROM kanban_cards WHERE domain = ? ORDER BY updated_at DESC').all(domain)
      : db.prepare('SELECT * FROM kanban_cards ORDER BY domain, updated_at DESC').all();
    res.json({ cards: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load cards' });
  }
}));

/** POST /api/kanban — create a new card */
router.post('/', asyncHandler((req, res) => {
  const { domain, title, description } = req.body ?? {};

  if (!domain || !PIPELINES[domain]) {
    return res.status(400).json({ error: 'domain must be one of: ' + Object.keys(PIPELINES).join(', ') });
  }
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const firstStage = PIPELINES[domain].stages[0];

  try {
    const db = getDb();
    const info = db
      .prepare(
        'INSERT INTO kanban_cards (domain, title, description, stage) VALUES (?, ?, ?, ?)',
      )
      .run(domain, title.trim(), description?.trim() ?? null, firstStage);

    const card = db.prepare('SELECT * FROM kanban_cards WHERE id = ?').get(info.lastInsertRowid);

    queueObsidianSync(db, 'kanban_card', card.id, card);

    res.status(201).json({ card });
  } catch {
    res.status(500).json({ error: 'Failed to create card' });
  }
}));

/** PATCH /api/kanban/:id/stage — move card to a new stage, record dispatch if agent assigned */
router.patch('/:id/stage', asyncHandler((req, res) => {
  const { stage } = req.body ?? {};
  const db = getDb();

  const card = db.prepare('SELECT * FROM kanban_cards WHERE id = ?').get(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const pipeline = PIPELINES[card.domain];
  if (!pipeline) return res.status(400).json({ error: 'Unknown domain' });
  // Stages are domain-specific (mbs vs smsf pipelines differ), so validation
  // is against this card's own pipeline rather than a single global enum.
  if (!pipeline.stages.includes(stage)) {
    return res.status(400).json({ error: `Invalid stage for ${card.domain}: ${stage}` });
  }

  try {
    const agentName = pipeline.agents[stage] ?? null;
    let dispatchId = null;
    let updated;

    db.transaction(() => {
      db.prepare(
        "UPDATE kanban_cards SET stage = ?, updated_at = datetime('now'), agent_pending = 0 WHERE id = ?",
      ).run(stage, card.id);

      if (agentName) {
        const prompt = buildAgentPrompt(card, stage, agentName);
        const dispInfo = db
          .prepare('INSERT INTO dispatches (agent, prompt, status) VALUES (?, ?, ?)')
          .run(agentName, prompt, 'pending');
        dispatchId = dispInfo.lastInsertRowid;

        db.prepare('INSERT INTO kanban_stage_dispatches (card_id, stage, dispatch_id) VALUES (?, ?, ?)').run(
          card.id, stage, dispatchId,
        );
        db.prepare('INSERT INTO kanban_card_log (card_id, agent, note, dispatch_id) VALUES (?, ?, ?, ?)').run(
          card.id, agentName, `Moved to ${stage} — dispatch #${dispatchId} created`, dispatchId,
        );
        db.prepare("UPDATE kanban_cards SET agent_pending = 1 WHERE id = ?").run(card.id);
      } else {
        db.prepare('INSERT INTO kanban_card_log (card_id, agent, note) VALUES (?, ?, ?)').run(
          card.id, 'Jarvis', `Moved to ${stage}`,
        );
      }

      updated = db.prepare('SELECT * FROM kanban_cards WHERE id = ?').get(card.id);
    })();

    queueObsidianSync(db, 'kanban_card', card.id, updated);
    res.json({ card: updated, dispatch_id: dispatchId, agent: agentName });
  } catch {
    res.status(500).json({ error: 'Failed to move card' });
  }
}));

/** DELETE /api/kanban/:id */
router.delete('/:id', asyncHandler((req, res) => {
  try {
    const info = getDb().prepare('DELETE FROM kanban_cards WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Card not found' });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete card' });
  }
}));

/** GET /api/kanban/:id/log */
router.get('/:id/log', asyncHandler((req, res) => {
  try {
    const rows = getDb()
      .prepare('SELECT * FROM kanban_card_log WHERE card_id = ? ORDER BY created_at DESC')
      .all(req.params.id);
    res.json({ log: rows });
  } catch {
    res.status(500).json({ error: 'Failed to load log' });
  }
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAgentPrompt(card, stage, agent) {
  const domainLabel = card.domain === 'mbs' ? 'Macro Bricks Studio' : 'SMSF';
  const prompts = {
    Sherlock: `Research task for ${domainLabel} project: "${card.title}".\n\nProvide a thorough research brief covering all relevant background, key facts, and any information needed before production proceeds. Include sources.${card.description ? `\n\nContext: ${card.description}` : ''}`,
    Shakespeare: `Scripting task for Macro Bricks Studio video: "${card.title}".\n\nWrite a complete video script including intro hook, build narration segments, and outro. Optimise for ASMR/build tone. Include SEO-friendly title suggestions and description.${card.description ? `\n\nContext: ${card.description}` : ''}`,
    Buffet: `SMSF analysis task: "${card.title}".\n\nAnalyse this item against the current SMSF strategy. Review relevant holdings, assess risk/opportunity, and provide a clear recommendation with reasoning.${card.description ? `\n\nContext: ${card.description}` : ''}`,
  };
  return prompts[agent] ?? `Task for ${agent}: "${card.title}" has moved to the ${stage} stage. Please action this for ${domainLabel}.`;
}

function queueObsidianSync(db, entityType, entityId, payload) {
  const vaultPath = entityType === 'kanban_card'
    ? `60 Agent System/Kanban/${payload.domain?.toUpperCase() ?? 'CARD'} — ${payload.title ?? entityId}.md`
    : `60 Agent System/Dispatches/${entityId}.md`;
  try {
    db.prepare(
      `INSERT INTO obsidian_sync_queue (entity_type, entity_id, payload, vault_path)
       VALUES (?, ?, ?, ?)`,
    ).run(entityType, entityId, JSON.stringify(payload), vaultPath);
  } catch {
    // sync is fire-and-forget; never block the main response
  }
}

module.exports = router;
