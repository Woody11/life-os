const express = require('express');
const { getDb } = require('../db/init');
const router = express.Router();

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ results: [] });
  const like = `%${q}%`;
  const db = getDb();
  const results = [];

  db.prepare(`SELECT id, agent as title, prompt as excerpt, status, 'dispatch' as type FROM dispatches WHERE agent LIKE ? OR prompt LIKE ? ORDER BY created_at DESC LIMIT 10`).all(like, like)
    .forEach(r => results.push(r));
  db.prepare(`SELECT id, title, description as excerpt, domain, 'kanban' as type FROM kanban_cards WHERE title LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT 10`).all(like, like)
    .forEach(r => results.push(r));
  db.prepare(`SELECT id, title, description as excerpt, status, 'goal' as type FROM goals WHERE title LIKE ? OR description LIKE ? ORDER BY updated_at DESC LIMIT 10`).all(like, like)
    .forEach(r => results.push(r));
  db.prepare(`SELECT id, name as title, NULL as excerpt, 'habit' as type FROM habits WHERE name LIKE ? ORDER BY created_at DESC LIMIT 5`).all(like)
    .forEach(r => results.push(r));

  res.json({ results, query: q });
});

module.exports = router;
