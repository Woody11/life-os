const express = require('express');

const router = express.Router();

// Shared timeout for every upstream Lego Studio call.
const FETCH_TIMEOUT_MS = 6000;

// The canonical pipeline stages, left-to-right. The board renders these in
// order; any schedule item whose status doesn't match one of these still gets
// surfaced (see buildPipeline) so nothing silently disappears.
const PIPELINE_STAGES = [
  'idea',
  'scripting',
  'building',
  'filming',
  'editing',
  'published',
];

/**
 * Fetch JSON from an upstream URL with an abort timeout.
 * Throws on non-2xx or network/timeout failure.
 */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, { signal: controller.signal });
    if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);
    return await upstream.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/mbs/schedule — verbatim proxy of the Lego Studio schedule.
 * On any upstream failure returns 502 with a stable error body.
 */
router.get('/schedule', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.LEGO_STUDIO_URL}/api/schedule`);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Lego Studio unavailable' });
  }
});

/**
 * GET /api/mbs/sets — verbatim proxy of the Lego Studio set library.
 */
router.get('/sets', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.LEGO_STUDIO_URL}/api/sets`);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Lego Studio unavailable' });
  }
});

/**
 * GET /api/mbs/stats — verbatim proxy of the Lego Studio stats object.
 */
router.get('/stats', async (_req, res) => {
  try {
    const data = await fetchJson(`${process.env.LEGO_STUDIO_URL}/api/stats`);
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Lego Studio unavailable' });
  }
});

// Whole days from today (UTC) until an ISO "YYYY-MM-DD" date. Negative if past.
function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86400000);
}

/**
 * Reduce the raw schedule into stage buckets + the next thing shipping.
 * Buckets are keyed by the canonical stages; any unknown status becomes its
 * own bucket so unexpected data is still visible rather than dropped.
 */
function buildPipeline(schedule) {
  const pipeline = {};
  for (const stage of PIPELINE_STAGES) pipeline[stage] = [];

  for (const item of Array.isArray(schedule) ? schedule : []) {
    const status = (item.status || 'idea').toLowerCase();
    const slim = {
      id: item.id,
      title: item.title,
      targetPublishDate: item.targetPublishDate,
    };
    if (!pipeline[status]) pipeline[status] = [];
    pipeline[status].push(slim);
  }

  // Next publish = soonest future (or today) target among not-yet-published
  // items. Falls back to the overall soonest if nothing is upcoming.
  const candidates = (Array.isArray(schedule) ? schedule : [])
    .filter((i) => (i.status || '').toLowerCase() !== 'published' && i.targetPublishDate)
    .sort((a, b) => a.targetPublishDate.localeCompare(b.targetPublishDate));

  const upcoming = candidates.find((i) => daysUntil(i.targetPublishDate) >= 0) || candidates[0];
  const nextPublish = upcoming
    ? {
        title: upcoming.title,
        targetPublishDate: upcoming.targetPublishDate,
        daysUntil: daysUntil(upcoming.targetPublishDate),
      }
    : null;

  return { pipeline, next_publish: nextPublish };
}

/**
 * GET /api/mbs/pipeline — schedule grouped into production stages, plus the
 * next video due to publish. Derived from the live schedule proxy.
 */
router.get('/pipeline', async (_req, res) => {
  try {
    const schedule = await fetchJson(`${process.env.LEGO_STUDIO_URL}/api/schedule`);
    res.json(buildPipeline(schedule));
  } catch {
    res.status(502).json({ error: 'Lego Studio unavailable' });
  }
});

module.exports = router;
