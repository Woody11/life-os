const express = require('express');
const { execFile } = require('node:child_process');

const router = express.Router();
const GOG_BIN = process.env.GOG_BIN || '/usr/local/bin/gog';
const TIMEOUT_MS = 10000;

function runGog(args) {
  return new Promise((resolve, reject) => {
    execFile(GOG_BIN, args, { timeout: TIMEOUT_MS, env: process.env }, (err, stdout, stderr) => {
      if (err) {
        console.error(`[google] gog ${args[0]} failed:`, stderr || err.message);
        return reject(new Error(stderr || err.message));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        console.error(`[google] gog ${args[0]} non-JSON output:`, stdout.slice(0, 200));
        reject(new Error('gog returned non-JSON output'));
      }
    });
  });
}

// Score a thread for "requires attention" — higher = more urgent.
// Ignores pure promo/newsletter noise, surfaces real people and transactional mail.
function attentionScore(thread) {
  const labels = thread.labels ?? [];
  const from   = (thread.from ?? '').toLowerCase();
  const subj   = (thread.subject ?? '').toLowerCase();

  // Hard exclude
  if (labels.includes('CATEGORY_PROMOTIONS')) return -1;
  if (/aliexpress|newsletter|noreply@.*\.com\.au$/.test(from) && !labels.includes('IMPORTANT')) return -1;

  let score = 0;
  if (labels.includes('IMPORTANT'))           score += 30;
  if (labels.includes('UNREAD'))              score += 10;
  if (labels.includes('CATEGORY_PERSONAL'))   score += 20;
  if (labels.includes('CATEGORY_UPDATES'))    score += 5;

  // Boost government, financial, legal
  if (/\.gov\.au|defence|ato\.gov|treasury/.test(from))  score += 25;
  if (/amex|americanexpress|anz|commbank|westpac|ing|nab|superhero/.test(from)) score += 15;
  if (/invoice|statement|payment|receipt|order|deliver/.test(subj)) score += 10;

  return score;
}

// GET /api/google/debug — raw gog doctor output for diagnosing auth issues
router.get('/debug', async (_req, res) => {
  const { execFile: ef } = require('node:child_process');
  const checks = await Promise.allSettled([
    new Promise((ok, fail) => ef(GOG_BIN, ['--version'], { env: process.env }, (e, out, err) => e ? fail(err||e.message) : ok(out.trim()))),
    new Promise((ok, fail) => ef(GOG_BIN, ['auth', 'doctor', '--check', '--no-input'], { env: process.env, timeout: 10000 }, (e, out, err) => ok({ exit: e?.code, stdout: out, stderr: err }))),
  ]);
  res.json({
    gog_bin: GOG_BIN,
    gog_home: process.env.GOG_HOME,
    keyring_backend: process.env.GOG_KEYRING_BACKEND,
    keyring_password_set: !!process.env.GOG_KEYRING_PASSWORD,
    version: checks[0].status === 'fulfilled' ? checks[0].value : checks[0].reason,
    doctor: checks[1].status === 'fulfilled' ? checks[1].value : checks[1].reason,
  });
});

// GET /api/google — returns today's calendar events + top 5 attention emails
router.get('/', async (_req, res) => {
  const results = await Promise.allSettled([
    runGog(['calendar', 'events', '--today', '--all', '--max', '20', '--json']),
    runGog(['gmail', 'search', 'in:inbox is:unread', '--max', '30', '--json']),
  ]);

  const calResult   = results[0];
  const gmailResult = results[1];

  let calendar = null;
  if (calResult.status === 'fulfilled') {
    const events = calResult.value.events ?? [];
    calendar = events.map((e) => ({
      id:       e.id,
      summary:  e.summary || '(No title)',
      start:    e.start?.dateTime || e.start?.date || null,
      end:      e.end?.dateTime   || e.end?.date   || null,
      allDay:   !e.start?.dateTime,
      location: e.location || null,
      calendar: e.calendarId || null,
    }));
  }

  let emails = null;
  if (gmailResult.status === 'fulfilled') {
    const threads = gmailResult.value.threads ?? [];
    emails = threads
      .map((t) => ({ ...t, _score: attentionScore(t) }))
      .filter((t) => t._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5)
      .map(({ _score, ...t }) => ({
        id:      t.id,
        from:    t.from,
        subject: t.subject,
        date:    t.date,
        labels:  t.labels,
      }));
  }

  res.json({
    calendar,
    emails,
    partial: calendar === null || emails === null,
    fetched_at: new Date().toISOString(),
  });
});

module.exports = router;
