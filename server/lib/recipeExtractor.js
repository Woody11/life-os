const fs = require('node:fs');
const path = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db/init');
const { emit } = require('./sseEmitter');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'lifeos.db');
const PHOTO_DIR = process.env.RECIPE_PHOTO_PATH || path.join(path.dirname(DB_PATH), 'recipe-photos');
const MODEL = process.env.RECIPE_VISION_MODEL || 'claude-opus-4-8';

const SYSTEM_PROMPT = `You are a recipe transcription assistant. You extract structured recipe data from photographs of cookbook pages and handwritten recipe cards. You always respond with JSON matching the provided schema, and nothing else. You transcribe faithfully — you do not invent ingredients, quantities, or steps that are not visible in the photos.`;

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'ingredients', 'steps', 'servings', 'prep_time_min', 'cook_time_min', 'cuisine', 'course', 'main_ingredient', 'dietary_tags', 'tags', 'transcription_notes'],
  properties: {
    title: { type: 'string' },
    servings: { type: ['string', 'null'] },
    prep_time_min: { type: ['integer', 'null'] },
    cook_time_min: { type: ['integer', 'null'] },
    cuisine: { type: ['string', 'null'] },
    course: { type: 'array', items: { type: 'string' } },
    main_ingredient: { type: 'array', items: { type: 'string' } },
    dietary_tags: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ingredient', 'quantity', 'unit', 'note'],
        properties: {
          ingredient: { type: 'string' },
          quantity: { type: ['string', 'null'] },
          unit: { type: ['string', 'null'] },
          note: { type: ['string', 'null'] },
        },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    transcription_notes: { type: ['string', 'null'] },
  },
};

function userPrompt(pageCount, hints) {
  const hintLine = hints ? `\nThe user says this is from «${hints}».` : '';
  return `These ${pageCount} images are consecutive pages of ONE recipe from a physical cookbook, in page order. Extract the single recipe they describe as JSON.

RULES:
1. Transcribe quantities exactly as printed ("½", "2-3", "a pinch") into \`quantity\` as a string; put the measure word in \`unit\` ("cup", "g", "tbsp") or null when there is none ("2 eggs").
2. Split ingredient qualifiers into \`note\` ("softened", "plus extra for dusting") — keep \`ingredient\` to the bare item name so it is searchable.
3. One instruction per \`steps\` entry, in order. Merge a sentence split across a page break into one step; do not duplicate content that repeats across pages.
4. Times go in minutes as integers ("1 hr 20 min" -> 80). Null anything not printed on the page — do not guess or invent.
5. Suggest, but do not force: \`cuisine\` (free text, e.g. "Thai" — null if unclear), \`course\` (array, e.g. ["dinner"] or ["side","entertaining"] — a dish can span more than one), \`main_ingredient\` (array, e.g. ["chicken"] — the dominant protein/ingredient, empty array if none obvious), \`dietary_tags\` (array, e.g. ["vegetarian","gluten-free"] — only ones clearly true from the ingredients, never guessed), \`tags\` (array, catch-all for anything else — method, occasion, "quick" — max 5). All lowercase.
6. If any region is illegible or cropped, transcribe what you can and describe the gap in \`transcription_notes\` (null if fully legible). Never fill a gap with a plausible guess.${hintLine}`;
}

function markFailed(recipeId, message) {
  const db = getDb();
  db.prepare(`UPDATE recipes SET extraction_status = 'failed', extraction_error = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(message.slice(0, 2000), recipeId);
  emit('recipe_extraction', { id: recipeId, status: 'failed' });
}

// Fire-and-forget: callers never await this for the HTTP response — it only
// ever resolves after writing a terminal 'review' or 'failed' state, and
// never throws (every failure path is caught and persisted internally).
async function extractRecipe(recipeId) {
  const db = getDb();

  if (!process.env.ANTHROPIC_API_KEY) {
    markFailed(recipeId, 'ANTHROPIC_API_KEY is not configured');
    return;
  }

  const photos = db.prepare('SELECT * FROM recipe_photos WHERE recipe_id = ? ORDER BY sort_order').all(recipeId);
  if (!photos.length) {
    markFailed(recipeId, 'No photos to extract from');
    return;
  }

  const recipe = db.prepare('SELECT source_book, page_number FROM recipes WHERE id = ?').get(recipeId);
  const hints = [recipe?.source_book, recipe?.page_number ? `page ${recipe.page_number}` : null].filter(Boolean).join(', ');

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...photos.map((p) => ({
            type: 'image',
            source: { type: 'base64', media_type: p.mime_type, data: fs.readFileSync(path.join(PHOTO_DIR, p.file_name)).toString('base64') },
          })),
          { type: 'text', text: userPrompt(photos.length, hints) },
        ],
      }],
    });

    if (response.stop_reason === 'refusal') {
      markFailed(recipeId, 'Model declined to transcribe this photo');
      return;
    }
    if (response.stop_reason === 'max_tokens') {
      markFailed(recipeId, 'Recipe was too long to transcribe in one pass');
      return;
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      markFailed(recipeId, 'Model returned no transcription');
      return;
    }
    const extracted = JSON.parse(textBlock.text);

    db.transaction(() => {
      db.prepare(`
        UPDATE recipes SET
          title = ?, servings = ?, prep_time_min = ?, cook_time_min = ?, cuisine = ?,
          course = ?, main_ingredient = ?, dietary_tags = ?, tags = ?,
          extraction_status = 'review', extraction_error = NULL, extraction_model = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        extracted.title || 'Untitled recipe',
        extracted.servings ?? null,
        Number.isInteger(extracted.prep_time_min) ? extracted.prep_time_min : null,
        Number.isInteger(extracted.cook_time_min) ? extracted.cook_time_min : null,
        extracted.cuisine ?? null,
        JSON.stringify(Array.isArray(extracted.course) ? extracted.course : []),
        JSON.stringify(Array.isArray(extracted.main_ingredient) ? extracted.main_ingredient : []),
        JSON.stringify(Array.isArray(extracted.dietary_tags) ? extracted.dietary_tags : []),
        JSON.stringify(Array.isArray(extracted.tags) ? extracted.tags : []),
        MODEL,
        recipeId,
      );

      db.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').run(recipeId);
      (extracted.ingredients || []).forEach((ing, index) => {
        if (!ing?.ingredient) return;
        db.prepare(
          `INSERT INTO recipe_ingredients (recipe_id, ingredient, quantity, unit, note, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(recipeId, ing.ingredient, ing.quantity ?? null, ing.unit ?? null, ing.note ?? null, index);
      });

      db.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').run(recipeId);
      (extracted.steps || []).forEach((instruction, index) => {
        if (!instruction) return;
        db.prepare('INSERT INTO recipe_steps (recipe_id, step_number, instruction) VALUES (?, ?, ?)')
          .run(recipeId, index + 1, instruction);
      });
    })();

    emit('recipe_extraction', { id: recipeId, status: 'review' });
  } catch (err) {
    markFailed(recipeId, err?.message || 'Extraction failed');
  }
}

module.exports = { extractRecipe };
