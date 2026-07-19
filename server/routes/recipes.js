const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { getDb } = require('../db/init');
const { asyncHandler } = require('../lib/asyncHandler');
const { extractRecipe } = require('../lib/recipeExtractor');

const router = express.Router();

// Photos live next to the DB file (same data/ dir, so the existing Docker
// volume mount covers both with zero compose changes) unless overridden.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'lifeos.db');
const PHOTO_DIR = process.env.RECIPE_PHOTO_PATH || path.join(path.dirname(DB_PATH), 'recipe-photos');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const MIME_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: MAX_PHOTOS, fileSize: MAX_PHOTO_BYTES },
  fileFilter: (_req, file, cb) => {
    cb(null, Object.prototype.hasOwnProperty.call(MIME_EXT, file.mimetype));
  },
});

function toJsonArray(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? JSON.stringify(parsed) : JSON.stringify([]);
    } catch {
      return JSON.stringify([]);
    }
  }
  return JSON.stringify([]);
}

function parseJsonArray(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Row -> API shape: JSON-text columns become real arrays.
function hydrateRecipe(row) {
  if (!row) return row;
  return {
    ...row,
    course: parseJsonArray(row.course),
    main_ingredient: parseJsonArray(row.main_ingredient),
    dietary_tags: parseJsonArray(row.dietary_tags),
    tags: parseJsonArray(row.tags),
  };
}

function photoToApiShape(photo) {
  return {
    id: photo.id,
    url: `/api/recipes/photos/${photo.file_name}`,
    original_name: photo.original_name,
    sort_order: photo.sort_order,
  };
}

/** GET /api/recipes — list/search */
router.get('/', asyncHandler((req, res) => {
  const { q, tag, cuisine, status } = req.query;
  const db = getDb();

  const clauses = [];
  const params = [];
  if (q?.trim()) {
    clauses.push('(title LIKE ? OR source_book LIKE ?)');
    params.push(`%${q.trim()}%`, `%${q.trim()}%`);
  }
  if (tag?.trim()) {
    // JSON-as-TEXT substring match — fine at personal-collection scale.
    clauses.push("(tags LIKE ? OR course LIKE ? OR main_ingredient LIKE ? OR dietary_tags LIKE ?)");
    const like = `%"${tag.trim()}"%`;
    params.push(like, like, like, like);
  }
  if (cuisine?.trim()) {
    clauses.push('cuisine = ?');
    params.push(cuisine.trim());
  }
  if (status?.trim()) {
    clauses.push('extraction_status = ?');
    params.push(status.trim());
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT r.*,
           (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = r.id) AS ingredient_count,
           (SELECT file_name FROM recipe_photos WHERE recipe_id = r.id ORDER BY sort_order LIMIT 1) AS cover_photo_file
    FROM recipes r
    ${where}
    ORDER BY (extraction_status != 'saved') DESC, updated_at DESC
  `).all(...params);

  const recipes = rows.map((row) => {
    const { cover_photo_file, ...rest } = row;
    return {
      ...hydrateRecipe(rest),
      cover_photo: cover_photo_file ? `/api/recipes/photos/${cover_photo_file}` : null,
    };
  });

  res.json({ recipes });
}));

/** GET /api/recipes/photos/:fileName — serve a photo */
router.get('/photos/:fileName', (req, res) => {
  const fileName = path.basename(req.params.fileName);
  const filePath = path.join(PHOTO_DIR, fileName);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).json({ error: 'Photo not found' });
  });
});

/** GET /api/recipes/:id — full detail */
router.get('/:id', asyncHandler((req, res) => {
  const db = getDb();
  const recipe = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });

  const ingredients = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order').all(recipe.id);
  const steps = db.prepare('SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number').all(recipe.id);
  const photos = db.prepare('SELECT * FROM recipe_photos WHERE recipe_id = ? ORDER BY sort_order').all(recipe.id);

  res.json({
    recipe: hydrateRecipe(recipe),
    ingredients,
    steps,
    photos: photos.map(photoToApiShape),
  });
}));

/**
 * POST /api/recipes — create from photos, kicks off AI extraction.
 *
 * With OPENCLAW_GATEWAY_URL/OPENCLAW_GATEWAY_TOKEN configured, the recipe
 * starts in extraction_status='processing' and extractRecipe() runs
 * fire-and-forget after the response is sent — it never throws, only ever
 * resolving into a 'review' or 'failed' terminal state. Without those it
 * degrades straight to 'review' with empty fields (manual entry, same
 * screen either way).
 */
router.post('/', upload.array('photos', MAX_PHOTOS), asyncHandler((req, res) => {
  if (!req.files?.length) {
    return res.status(400).json({ error: 'At least one photo is required' });
  }

  const { source_book, page_number } = req.body ?? {};
  const db = getDb();
  const hasExtraction = Boolean(process.env.OPENCLAW_GATEWAY_URL && process.env.OPENCLAW_GATEWAY_TOKEN);

  const recipe = db.transaction(() => {
    const info = db.prepare(
      `INSERT INTO recipes (title, source_book, page_number, extraction_status)
       VALUES (?, ?, ?, ?)`,
    ).run('Untitled recipe', source_book?.trim() || null, page_number?.trim() || null, hasExtraction ? 'processing' : 'review');
    const recipeId = info.lastInsertRowid;

    req.files.forEach((file, index) => {
      const ext = MIME_EXT[file.mimetype];
      const fileName = `${recipeId}-${index}-${Date.now()}${ext}`;
      fs.writeFileSync(path.join(PHOTO_DIR, fileName), file.buffer);
      db.prepare(
        `INSERT INTO recipe_photos (recipe_id, file_name, original_name, mime_type, size_bytes, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(recipeId, fileName, file.originalname ?? null, file.mimetype, file.size, index);
    });

    return db.prepare('SELECT * FROM recipes WHERE id = ?').get(recipeId);
  })();

  res.status(201).json({ recipe: hydrateRecipe(recipe) });

  if (hasExtraction) extractRecipe(recipe.id);
}));

/** POST /api/recipes/:id/extract — (re)run extraction against stored photos */
router.post('/:id/extract', asyncHandler((req, res) => {
  const db = getDb();
  const recipe = db.prepare('SELECT id, extraction_status FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });
  if (recipe.extraction_status === 'processing') return res.status(409).json({ error: 'Extraction already in progress' });

  const photoCount = db.prepare('SELECT COUNT(*) AS n FROM recipe_photos WHERE recipe_id = ?').get(req.params.id).n;
  if (!photoCount) return res.status(400).json({ error: 'No photos to extract from' });

  db.prepare(`UPDATE recipes SET extraction_status = 'processing', extraction_error = NULL, updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
  const updated = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);

  res.status(202).json({ recipe: hydrateRecipe(updated) });

  extractRecipe(Number(req.params.id));
}));

/** PUT /api/recipes/:id — the review/edit save (full replace of ingredients/steps) */
router.put('/:id', asyncHandler((req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM recipes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    title, source_book, page_number, servings, prep_time_min, cook_time_min,
    cuisine, course, main_ingredient, dietary_tags, tags, notes,
    ingredients, steps,
  } = req.body ?? {};

  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!Array.isArray(ingredients)) {
    return res.status(400).json({ error: 'ingredients must be an array' });
  }
  if (!Array.isArray(steps)) {
    return res.status(400).json({ error: 'steps must be an array' });
  }

  const recipe = db.transaction(() => {
    db.prepare(`
      UPDATE recipes SET
        title = ?, source_book = ?, page_number = ?, servings = ?,
        prep_time_min = ?, cook_time_min = ?, cuisine = ?,
        course = ?, main_ingredient = ?, dietary_tags = ?, tags = ?, notes = ?,
        extraction_status = 'saved', extraction_error = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      title.trim(),
      source_book?.trim() || null,
      page_number?.trim() || null,
      servings?.trim() || null,
      Number.isFinite(prep_time_min) ? prep_time_min : null,
      Number.isFinite(cook_time_min) ? cook_time_min : null,
      cuisine?.trim() || null,
      toJsonArray(course),
      toJsonArray(main_ingredient),
      toJsonArray(dietary_tags),
      toJsonArray(tags),
      notes?.trim() || null,
      req.params.id,
    );

    db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(req.params.id);
    ingredients.forEach((ing, index) => {
      if (!ing?.ingredient?.trim()) return;
      db.prepare(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient, quantity, unit, note, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(req.params.id, ing.ingredient.trim(), ing.quantity?.trim() || null, ing.unit?.trim() || null, ing.note?.trim() || null, index);
    });

    db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(req.params.id);
    steps.forEach((instruction, index) => {
      if (!instruction?.trim()) return;
      db.prepare('INSERT INTO recipe_steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)')
        .run(req.params.id, index + 1, instruction.trim());
    });

    return db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  })();

  const hydratedIngredients = db.prepare('SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order').all(req.params.id);
  const hydratedSteps = db.prepare('SELECT * FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number').all(req.params.id);
  const photos = db.prepare('SELECT * FROM recipe_photos WHERE recipe_id = ? ORDER BY sort_order').all(req.params.id);

  res.json({
    recipe: hydrateRecipe(recipe),
    ingredients: hydratedIngredients,
    steps: hydratedSteps,
    photos: photos.map(photoToApiShape),
  });
}));

/** DELETE /api/recipes/:id */
router.delete('/:id', asyncHandler((req, res) => {
  const db = getDb();
  const recipe = db.prepare('SELECT id FROM recipes WHERE id = ?').get(req.params.id);
  if (!recipe) return res.status(404).json({ error: 'Not found' });

  const photos = db.prepare('SELECT file_name FROM recipe_photos WHERE recipe_id = ?').all(req.params.id);
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id); // CASCADE clears ingredients/steps/photos rows

  // Best-effort file cleanup — never fail the response over a stray file.
  for (const { file_name } of photos) {
    try { fs.unlinkSync(path.join(PHOTO_DIR, file_name)); } catch { /* already gone, fine */ }
  }

  res.json({ ok: true });
}));

// Multer errors (file too large, too many files) land here rather than the
// generic error handler so they get a clear 400 instead of a 500.
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
