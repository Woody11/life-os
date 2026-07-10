const { getDb } = require('../db/init');

function wakeOpenClaw(text) {
  const url   = process.env.OPENCLAW_GATEWAY_URL;
  const token = process.env.OPENCLAW_HOOK_TOKEN;
  if (!url || !token) return;
  fetch(`${url}/hooks/wake`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, mode: 'now' }),
  }).catch(() => {});
}

// Insert a pending dispatch and wake Bazza. Returns the new dispatch row.
function dispatchAgent(agent, prompt) {
  const info = getDb()
    .prepare('INSERT INTO dispatches (agent, prompt, status) VALUES (?, ?, ?)')
    .run(agent.trim(), prompt.trim(), 'pending');
  wakeOpenClaw(`New dispatch #${info.lastInsertRowid}: ${agent} — ${prompt.slice(0, 120)}`);
  return {
    id:     info.lastInsertRowid,
    agent:  agent.trim(),
    prompt: prompt.trim(),
    status: 'pending',
  };
}

module.exports = { dispatchAgent, wakeOpenClaw };
