const express = require('express');
const { getDb } = require('../db/init');
const router = express.Router();

// Escape LIKE wildcards (% and _) so a literal search term like "50%" or
// "a_b" matches those literal characters instead of being interpreted as
// SQL wildcards.
function escapeLike(value) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

router.get('/', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json({ results: [] });
  const like = `%${escapeLike(q)}%`;
  const db = getDb();
  const results = [];

  db.prepare(`SELECT id, agent as title, prompt as excerpt, status, 'dispatch' as type FROM dispatches WHERE agent LIKE ? ESCAPE '\\' OR prompt LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 10`).all(like, like)
    .forEach(r => results.push(r));
  db.prepare(`SELECT id, title, description as excerpt, domain, 'kanban' as type FROM kanban_cards WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 10`).all(like, like)
    .forEach(r => results.push(r));
  db.prepare(`SELECT id, title, description as excerpt, status, 'goal' as type FROM goals WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 10`).all(like, like)
    .forEach(r => results.push(r));
  db.prepare(`SELECT id, name as title, NULL as excerpt, 'habit' as type FROM habits WHERE name LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT 5`).all(like)
    .forEach(r => results.push(r));
  db.prepare(`
    SELECT id, title, source_book as excerpt, 'recipe' as type
    FROM recipes
    WHERE title LIKE ? ESCAPE '\\'
       OR source_book LIKE ? ESCAPE '\\'
       OR EXISTS (SELECT 1 FROM recipe_ingredients WHERE recipe_id = recipes.id AND ingredient LIKE ? ESCAPE '\\')
    ORDER BY updated_at DESC LIMIT 10
  `).all(like, like, like)
    .forEach(r => results.push(r));

  res.json({ results, query: q });
});

module.exports = router;
