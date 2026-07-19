// Life OS v2 — Express entry point.
// Load .env first so every downstream module (db init, status checks) sees the
// configured values. In Docker the env is injected directly, but dotenv is a
// no-op harmlessly when no .env file is present.
require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { initDb } = require('./db/init');
const { addClient, removeClient } = require('./lib/sseEmitter');
const statusRouter = require('./routes/status');
const homeRouter = require('./routes/home');
const smsfRouter = require('./routes/smsf');
const mbsRouter = require('./routes/mbs');
const dispatchRouter = require('./routes/dispatch');
const kanbanRouter  = require('./routes/kanban');
const googleRouter  = require('./routes/google');
const weatherRouter = require('./routes/weather');
const habitsRouter  = require('./routes/habits');
const goalsRouter   = require('./routes/goals');
const recipesRouter = require('./routes/recipes');
const { startObsidianSync } = require('./sync/obsidian');

const PORT = process.env.PORT || 3030;

// Warn (don't crash) on missing integration config — a dead DB is fatal, but
// a missing upstream URL should just degrade that one dashboard card rather
// than take the whole app down. This makes misconfiguration visible in logs
// immediately instead of only when a user opens the affected tab.
for (const key of ['WEALTHCANVAS_URL', 'LEGO_STUDIO_URL', 'OBSIDIAN_URL', 'OBSIDIAN_TOKEN', 'OPENCLAW_GATEWAY_URL', 'OPENCLAW_HOOK_TOKEN', 'GOOGLE_ACTIONS_URL', 'GOOGLE_ACTIONS_TOKEN', 'OPENCLAW_GATEWAY_TOKEN']) {
  if (!process.env[key]) console.warn(`[life-os] ${key} is not set — related features will be degraded/disabled`);
}

// Initialise the database BEFORE wiring routes. If the schema can't be created
// the process should crash immediately (fail fast) rather than serve a broken
// app — a dead DB is unrecoverable at request time.
initDb();

const app = express();
// CSP is left disabled: the built SPA hasn't been audited against a strict
// policy, and a bad CSP silently breaks the whole app for a marginal LAN-only
// benefit. The other Helmet defaults (frame/sniffing/referrer protection)
// carry no such risk.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// SSE stream — registered before the static handler (and before other API
// routes, since it needs to set streaming headers itself rather than go
// through JSON body handling).
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  addClient(res);
  // Heartbeat comment every 30s to keep intermediary proxies from closing the
  // connection during quiet periods.
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { clearInterval(hb); } }, 30_000);
  req.on('close', () => { removeClient(res); clearInterval(hb); });
});

// API routes are mounted before the static handler so /api/* is never shadowed
// by the SPA fallback below.
app.use('/api/status', statusRouter);
app.use('/api/home', homeRouter);
app.use('/api/smsf', smsfRouter);
app.use('/api/mbs', mbsRouter);
app.use('/api/dispatch', dispatchRouter);
app.use('/api/kanban',  kanbanRouter);
app.use('/api/google',  googleRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/habits',  habitsRouter);
app.use('/api/goals',   goalsRouter);
app.use('/api/recipes', recipesRouter);
app.use('/api/search',  require('./routes/search'));

// Serve the built frontend. In production the client is compiled to
// client/dist by Vite and copied into the image; Express serves it as static
// files from the same origin (which is why no CORS config is needed).
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

// SPA fallback: any non-API GET returns index.html so client-side routing works
// once Block 1+ adds it. Express 5 uses path-to-regexp v6 where a bare '*' is
// invalid; the '/*splat' named wildcard is the v5-correct catch-all.
app.get('/*splat', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Global error handler — catches anything routes didn't handle themselves
// (including async rejections forwarded via asyncHandler) so the process
// never crashes and the client always gets a JSON response.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[life-os] server listening on port ${PORT}`);
  startObsidianSync();
});
