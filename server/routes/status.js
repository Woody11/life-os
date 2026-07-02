const express = require('express');
const https = require('node:https');
const { getDb } = require('../db/init');

const router = express.Router();

// Per-check timeout. Kept short so a single dead service can't stall the whole
// status response — the UI polls this and needs to stay responsive.
const CHECK_TIMEOUT_MS = 3000;

// Reusable HTTPS agent that tolerates self-signed certs. Obsidian's Local REST
// API ships a self-signed cert, so a normal fetch would reject with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE. We scope this ONLY to the Obsidian check.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Probe a base URL with a GET and a hard timeout.
 *
 * WHY it never throws: /api/status is a dashboard health endpoint. A single
 * unreachable dependency must degrade to "error", not crash the request. We
 * treat any non-network-error HTTP response (even 4xx/5xx) as "ok" because it
 * proves the service is reachable and listening — distinguishing liveness from
 * full health is deliberately out of scope for Block 0.
 *
 * @param {string} url        Base URL to probe (undefined/empty => "error").
 * @param {object} [opts]
 * @param {https.Agent} [opts.agent]   Custom agent (used for Obsidian TLS).
 * @param {object} [opts.headers]      Extra request headers (e.g. auth token).
 * @returns {Promise<'ok'|'error'>}
 */
async function checkService(url, { agent, headers } = {}) {
  if (!url) return 'error';

  // AbortController enforces the timeout regardless of where fetch stalls
  // (DNS, connect, or waiting on the response).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers,
      // Node's fetch (undici) accepts a custom dispatcher for TLS overrides,
      // but the simplest cross-version path for a self-signed cert is the
      // https.Agent below via the `agent`-style option. undici uses `dispatcher`,
      // so we fall back to a raw https request when an agent is supplied.
      ...(agent ? {} : {}),
    });
    return 'ok';
  } catch {
    // If fetch failed AND we have a custom agent (Obsidian/self-signed), retry
    // via the raw https module which honours rejectUnauthorized:false reliably
    // across Node versions.
    if (agent) {
      const viaHttps = await checkViaHttps(url, agent, headers);
      return viaHttps;
    }
    return 'error';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Raw https GET used as the fallback path for self-signed endpoints, where the
 * built-in fetch cannot easily be told to skip cert verification. Resolves to
 * 'ok' on any HTTP response, 'error' on network failure or timeout.
 */
function checkViaHttps(url, agent, headers) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    try {
      const req = https.get(url, { agent, headers, timeout: CHECK_TIMEOUT_MS }, (res) => {
        // Drain and discard the body so the socket can be freed.
        res.resume();
        done('ok');
      });
      req.on('timeout', () => {
        req.destroy();
        done('error');
      });
      req.on('error', () => done('error'));
    } catch {
      done('error');
    }
  });
}

/**
 * GET /api/status — dashboard health snapshot.
 *
 * Runs the DB check synchronously (a trivial query proves the connection is
 * live) and all external checks in parallel so total latency is bounded by the
 * single slowest check (≤ CHECK_TIMEOUT_MS), not their sum.
 */
router.get('/', async (_req, res) => {
  // DB check: a cheap query that touches the connection. If getDb() or the
  // query throws, the DB is not usable => "error".
  let dbStatus = 'error';
  try {
    getDb().prepare('SELECT 1').get();
    dbStatus = 'ok';
  } catch {
    dbStatus = 'error';
  }

  const [wealthcanvas, lego_studio, obsidian, openclaw] = await Promise.all([
    checkService(process.env.WEALTHCANVAS_URL),
    checkService(process.env.LEGO_STUDIO_URL),
    checkService(process.env.OBSIDIAN_URL, {
      agent: insecureAgent,
      // Obsidian Local REST API expects a bearer token; sending it lets the
      // check pass even when the API rejects anonymous requests.
      headers: process.env.OBSIDIAN_TOKEN
        ? { Authorization: `Bearer ${process.env.OBSIDIAN_TOKEN}` }
        : undefined,
    }),
    checkService(process.env.OPENCLAW_GATEWAY_URL),
  ]);

  res.json({ db: dbStatus, wealthcanvas, lego_studio, obsidian, openclaw });
});

module.exports = router;
