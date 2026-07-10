const express = require('express');

const router = express.Router();
const CACHE_TTL_MS = 30 * 60 * 1000;
const WTTR_URL = 'https://wttr.in/Adelaide?format=j1';

let cache = { data: null, fetchedAt: 0 };

async function fetchWeather() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(WTTR_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const json = JSON.parse(text); // throws if wttr returns HTML
    const cc = json.current_condition?.[0];
    const today = json.weather?.[0];
    if (!cc || !today) throw new Error('Unexpected wttr.in shape');
    return {
      tempC:       Number(cc.temp_C),
      feelsLikeC:  Number(cc.FeelsLikeC),
      condition:   cc.weatherDesc?.[0]?.value ?? 'Unknown',
      highC:       Number(today.maxtempC),
      lowC:        Number(today.mintempC),
      cachedAt:    new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/weather
router.get('/', async (_req, res) => {
  const stale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
  if (!stale && cache.data) return res.json(cache.data);

  try {
    cache.data = await fetchWeather();
    cache.fetchedAt = Date.now();
    res.json(cache.data);
  } catch {
    if (cache.data) return res.json({ ...cache.data, stale: true });
    res.status(503).json({ error: 'Weather unavailable' });
  }
});

module.exports = router;
