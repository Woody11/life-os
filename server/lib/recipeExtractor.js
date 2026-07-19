const fs = require('node:fs');
const path = require('node:path');
const { getDb } = require('../db/init');
const { emit } = require('./sseEmitter');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'lifeos.db');
const PHOTO_DIR = process.env.RECIPE_PHOTO_PATH || path.join(path.dirname(DB_PATH), 'recipe-photos');

// Which OpenClaw agent handles extraction requests — see the "Agent-first
// model contract" in the gateway's OpenAI-compatible endpoint docs.
// "openclaw/default" runs the configured default agent's own default model;
// RECIPE_VISION_MODEL_OVERRIDE (optional) pins a specific backend model via
// the x-openclaw-model header instead.
const AGENT_TARGET = process.env.RECIPE_EXTRACTION_AGENT || 'openclaw/default';

const SYSTEM_PROMPT = `You are a recipe transcription assistant. You extract structured recipe data from photographs of cookbook pages and handwritten recipe cards. You always call the submit_recipe tool with the transcription — never respond with plain text. You transcribe faithfully — you do not invent ingredients, quantities, or steps that are not visible in the photos.`;

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

const SUBMIT_RECIPE_TOOL = {
  type: 'function',
  function: {
    name: 'submit_recipe',
    description: 'Submit the transcribed recipe as structured data.',
    parameters: RECIPE_SCHEMA,
  },
};

function userPrompt(pageCount, hints) {
  const hintLine = hints ? `\nThe user says this is from «${hints}».` : '';
  return `These ${pageCount} images are consecutive pages of ONE recipe from a physical cookbook, in page order. Extract the single recipe they describe by calling submit_recipe.

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

async function callGateway(photos, hints) {
  const url = `${process.env.OPENCLAW_GATEWAY_URL.replace(/\/$/, '')}/v1/chat/completions`;
  const headers = {
    Authorization: `Bearer ${process.env.OPENCLAW_GATEWAY_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (process.env.RECIPE_VISION_MODEL_OVERRIDE) {
    headers['x-openclaw-model'] = process.env.RECIPE_VISION_MODEL_OVERRIDE;
  }

  const body = {
    model: AGENT_TARGET,
    temperature: 0,
    max_completion_tokens: 16000,
    tools: [SUBMIT_RECIPE_TOOL],
    tool_choice: { type: 'function', function: { name: 'submit_recipe' } },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          ...photos.map((p) => ({
            type: 'image_url',
            image_url: { url: `data:${p.mime_type};base64,${fs.readFileSync(path.join(PHOTO_DIR, p.file_name)).toString('base64')}` },
          })),
          { type: 'text', text: userPrompt(photos.length, hints) },
        ],
      },
    ],
  };

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gateway returned ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];
  if (choice?.finish_reason !== 'tool_calls') {
    throw new Error(`Model did not return a structured recipe (finish_reason=${choice?.finish_reason ?? 'unknown'}): ${(choice?.message?.content || 'no content').slice(0, 300)}`);
  }
  const call = choice.message.tool_calls?.find((c) => c.function?.name === 'submit_recipe');
  if (!call) throw new Error('Model did not call submit_recipe');

  return JSON.parse(call.function.arguments);
}

// Fire-and-forget: callers never await this for the HTTP response — it only
// ever resolves after writing a terminal 'review' or 'failed' state, and
// never throws (every failure path is caught and persisted internally).
async function extractRecipe(recipeId) {
  const db = getDb();

  if (!process.env.OPENCLAW_GATEWAY_URL || !process.env.OPENCLAW_GATEWAY_TOKEN) {
    markFailed(recipeId, 'OPENCLAW_GATEWAY_URL/OPENCLAW_GATEWAY_TOKEN is not configured');
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
    const extracted = await callGateway(photos, hints);

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
        AGENT_TARGET,
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
