/**
 * Obsidian sync worker.
 *
 * Runs every SYNC_INTERVAL_MS and drains the obsidian_sync_queue table by
 * writing each pending item to the vault via the Obsidian Local REST API.
 *
 * Failure handling: exponential backoff (30s → 2m → 8m → 32m → give up after 5 attempts).
 * Completed items are deleted from the queue. Failed-past-max items are left
 * with attempts=5 and last_error set so the status route can surface them.
 */

const https = require('node:https');
const { getDb } = require('../db/init');

const SYNC_INTERVAL_MS  = 30_000;
const MAX_ATTEMPTS      = 5;
const BACKOFF_BASE_MS   = 30_000; // 30s, 2m, 8m, 32m

// Shared agent that skips TLS verification — Obsidian ships a self-signed cert.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

function buildKanbanCardNote(payload) {
  const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const domain = String(p.domain ?? '').toUpperCase();
  const lines = [
    `---`,
    `domain: ${p.domain ?? ''}`,
    `stage: ${p.stage ?? ''}`,
    `agent_pending: ${p.agent_pending ? 'true' : 'false'}`,
    `updated: ${(p.updated_at ?? p.created_at ?? '').slice(0, 10)}`,
    `---`,
    ``,
    `# ${p.title ?? 'Untitled card'}`,
    ``,
    `**Domain:** ${domain}`,
    `**Stage:** ${p.stage ?? '—'}`,
    ...(p.agent_pending ? [`**Agent:** dispatch pending`] : []),
    ``,
  ];
  if (p.description) {
    lines.push(`## Description`, ``, p.description, ``);
  }
  return lines.join('\n');
}

function buildDispatchNote(payload) {
  const p = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const lines = [
    `---`,
    `agent: ${p.agent ?? ''}`,
    `status: ${p.status ?? 'pending'}`,
    `created: ${(p.created_at ?? '').slice(0, 10)}`,
    `---`,
    ``,
    `# Dispatch #${p.id ?? '?'} — ${p.agent ?? 'Unknown'}`,
    ``,
    `**Status:** ${p.status ?? 'pending'}`,
    `**Agent:** ${p.agent ?? '—'}`,
    ``,
    `## Prompt`,
    ``,
    p.prompt ?? '',
    ``,
  ];
  if (p.result) {
    lines.push(`## Result`, ``, p.result, ``);
  }
  if (p.error) {
    lines.push(`## Error`, ``, p.error, ``);
  }
  return lines.join('\n');
}

function buildNote(entityType, payload) {
  if (entityType === 'kanban_card') return buildKanbanCardNote(payload);
  if (entityType === 'dispatch')    return buildDispatchNote(payload);
  // Fallback: dump JSON as a code block
  const p = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return `# ${entityType}\n\n\`\`\`json\n${p}\n\`\`\`\n`;
}

// ---------------------------------------------------------------------------
// Obsidian REST API write
// ---------------------------------------------------------------------------

async function writeToObsidian(vaultPath, markdown) {
  const baseUrl = process.env.OBSIDIAN_URL?.replace(/\/$/, '');
  const token   = process.env.OBSIDIAN_TOKEN;
  if (!baseUrl || !token) throw new Error('OBSIDIAN_URL or OBSIDIAN_TOKEN not set');

  // Obsidian Local REST API always uses a self-signed cert — skip native fetch
  // entirely and go straight to the raw https module which honours rejectUnauthorized:false.
  const encodedPath = vaultPath.split('/').map(encodeURIComponent).join('/');
  const url = `${baseUrl}/vault/${encodedPath}`;
  await writeViaHttps(url, token, markdown);
}

function writeViaHttps(url, token, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const buf    = Buffer.from(body, 'utf8');
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   'PUT',
      agent:    insecureAgent,
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Content-Type':   'text/markdown',
        'Content-Length': buf.length,
      },
      timeout: 10_000,
    };

    const req = https.request(opts, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Obsidian API returned ${res.statusCode}`));
      } else {
        resolve();
      }
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('Obsidian request timed out')); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

function backoffMs(attempts) {
  return BACKOFF_BASE_MS * Math.pow(4, attempts); // 30s, 2m, 8m, 32m
}

async function processBatch() {
  const db = getDb();
  const due = db
    .prepare(
      `SELECT * FROM obsidian_sync_queue
       WHERE attempts < ?
         AND (next_attempt_at IS NULL OR next_attempt_at <= datetime('now'))
       ORDER BY created_at ASC
       LIMIT 10`,
    )
    .all(MAX_ATTEMPTS);

  for (const item of due) {
    try {
      const markdown = buildNote(item.entity_type, item.payload);
      await writeToObsidian(item.vault_path, markdown);
      // Success — remove from queue
      db.prepare('DELETE FROM obsidian_sync_queue WHERE id = ?').run(item.id);
    } catch (err) {
      const nextAttempts = item.attempts + 1;
      const nextAt = nextAttempts < MAX_ATTEMPTS
        ? new Date(Date.now() + backoffMs(nextAttempts)).toISOString().replace('T', ' ').slice(0, 19)
        : null;
      db.prepare(
        `UPDATE obsidian_sync_queue
         SET attempts = ?, last_error = ?, next_attempt_at = ?
         WHERE id = ?`,
      ).run(nextAttempts, err.message ?? String(err), nextAt, item.id);
    }
  }
}

let _interval = null;

function startObsidianSync() {
  if (_interval) return;
  // First run after a short delay so the server is fully up
  setTimeout(() => {
    processBatch().catch(() => {});
    _interval = setInterval(() => processBatch().catch(() => {}), SYNC_INTERVAL_MS);
  }, 5_000);
  console.log('[life-os] Obsidian sync worker started (30s interval)');
}

module.exports = { startObsidianSync };
