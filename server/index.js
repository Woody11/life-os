// Life OS v2 — Express entry point.
// Load .env first so every downstream module (db init, status checks) sees the
// configured values. In Docker the env is injected directly, but dotenv is a
// no-op harmlessly when no .env file is present.
require('dotenv').config();

const path = require('node:path');
const express = require('express');
const { initDb } = require('./db/init');
const statusRouter = require('./routes/status');
const homeRouter = require('./routes/home');
const smsfRouter = require('./routes/smsf');
const mbsRouter = require('./routes/mbs');
const dispatchRouter = require('./routes/dispatch');

const PORT = process.env.PORT || 3030;

// Initialise the database BEFORE wiring routes. If the schema can't be created
// the process should crash immediately (fail fast) rather than serve a broken
// app — a dead DB is unrecoverable at request time.
initDb();

const app = express();
app.use(express.json());

// API routes are mounted before the static handler so /api/* is never shadowed
// by the SPA fallback below.
app.use('/api/status', statusRouter);
app.use('/api/home', homeRouter);
app.use('/api/smsf', smsfRouter);
app.use('/api/mbs', mbsRouter);
app.use('/api/dispatch', dispatchRouter);

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

app.listen(PORT, () => {
  console.log(`[life-os] server listening on port ${PORT}`);
});
