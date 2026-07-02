const express = require('express');

const router = express.Router();

// Slightly longer than the Home aggregate timeout: this is a direct passthrough
// the SMSF tab depends on, so give the upstream a bit more room before failing.
const FETCH_TIMEOUT_MS = 6000;

/**
 * GET /api/smsf/holdings — verbatim proxy of WealthCanvas holdings.
 *
 * Forwards the upstream JSON unchanged so the SMSF tab (Block 2) can consume the
 * canonical shape. On any upstream failure returns 502 with a stable error body
 * rather than leaking the raw exception.
 */
router.get('/holdings', async (_req, res) => {
  const url = `${process.env.WEALTHCANVAS_URL}/api/holdings`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    const data = await upstream.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'WealthCanvas unavailable' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
