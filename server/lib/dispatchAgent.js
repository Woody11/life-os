const { getDb } = require('../db/init');

const WAKE_TIMEOUT_MS = 5000;

function wakeOpenClaw(text) {
  const url   = process.env.OPENCLAW_GATEWAY_URL;
  const token = process.env.OPENCLAW_HOOK_TOKEN;
  if (!url || !token) {
    console.warn('[dispatchAgent] OPENCLAW_GATEWAY_URL or OPENCLAW_HOOK_TOKEN not set — dispatch created without waking OpenClaw');
    return;
  }
  fetch(`${url}/hooks/wake`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, mode: 'now' }),
    signal:  AbortSignal.timeout(WAKE_TIMEOUT_MS),
  }).catch((err) => {
    // Non-fatal: the dispatch row still exists and /api/dispatch/pending will
    // pick it up eventually, but log so a stalled wake doesn't go unnoticed.
    console.error('[dispatchAgent] wakeOpenClaw failed:', err.message ?? err);
  });
}

// Insert a pending dispatch and wake Bazza. Returns the new dispatch row.
function dispatchAgent(agent, prompt, model) {
  const info = getDb()
    .prepare('INSERT INTO dispatches (agent, prompt, status, model) VALUES (?, ?, ?, ?)')
    .run(agent.trim(), prompt.trim(), 'pending', model?.trim() || null);
  wakeOpenClaw(`New dispatch #${info.lastInsertRowid}: ${agent} — ${prompt.slice(0, 120)}`);
  return {
    id:     info.lastInsertRowid,
    agent:  agent.trim(),
    prompt: prompt.trim(),
    status: 'pending',
    model:  model?.trim() || null,
  };
}

module.exports = { dispatchAgent, wakeOpenClaw };
