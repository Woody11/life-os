const express = require('express');

const router = express.Router();

// Stub router for the MBS tab. Block 3 fleshes this out; for now it exposes a
// single verbatim proxy the schedule view can build against.
const FETCH_TIMEOUT_MS = 6000;

/**
 * GET /api/mbs/schedule — verbatim proxy of the Lego Studio schedule.
 * On any upstream failure returns 502 with a stable error body.
 */
router.get('/schedule', async (_req, res) => {
  const url = `${process.env.LEGO_STUDIO_URL}/api/schedule`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    const data = await upstream.json();
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Lego Studio unavailable' });
  } finally {
    clearTimeout(timer);
  }
});

module.exports = router;
