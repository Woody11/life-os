-- Life OS v2 schema. Idempotent: every statement uses IF NOT EXISTS so it can
-- run on every boot against an existing or fresh database without error.

CREATE TABLE IF NOT EXISTS dispatches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  agent       TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  session_id  TEXT,
  result      TEXT,
  error       TEXT,
  model       TEXT,
  obsidian_synced INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain      TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  stage       TEXT NOT NULL,
  notes       TEXT,
  agent_pending INTEGER DEFAULT 0,
  obsidian_synced INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kanban_card_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  note        TEXT NOT NULL,
  dispatch_id INTEGER REFERENCES dispatches(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kanban_stage_dispatches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  dispatch_id INTEGER NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS obsidian_sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  payload     TEXT NOT NULL,
  vault_path  TEXT NOT NULL UNIQUE,
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  next_attempt_at TEXT
);

-- Google data cache (pushed from OpenClaw heartbeat via POST /api/google/cache)
CREATE TABLE IF NOT EXISTS google_cache (
  key        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  cached_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Habits
CREATE TABLE IF NOT EXISTS habits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  emoji      TEXT,
  frequency  TEXT    NOT NULL DEFAULT 'daily',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_completions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id       INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  completed_date TEXT    NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(habit_id, completed_date)
);

-- Goals
CREATE TABLE IF NOT EXISTS goals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT,
  domain      TEXT    NOT NULL CHECK(domain IN ('SMSF','MBS','Personal','Dev')),
  target_date TEXT,
  progress    INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','paused')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goal_agents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id         INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  agent_name      TEXT    NOT NULL,
  prompt_template TEXT    NOT NULL,
  button_label    TEXT    NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  model           TEXT
);

-- Per-agent default model config
CREATE TABLE IF NOT EXISTS agent_models (
  agent_name  TEXT PRIMARY KEY,
  model       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Recipes (photo-imported cookbook recipes — see vault "Life OS - Recipe
-- Tracker - Detailed Build Plan" for the full design).
CREATE TABLE IF NOT EXISTS recipes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT    NOT NULL DEFAULT 'Untitled recipe',
  source_book       TEXT,
  page_number       TEXT,               -- TEXT: "112-113", "back cover"
  servings          TEXT,               -- TEXT: "4", "4-6", "makes 24"
  prep_time_min     INTEGER,
  cook_time_min     INTEGER,
  cuisine           TEXT,               -- free text, e.g. "Thai" — not a fixed list
  course            TEXT,               -- JSON array, e.g. '["dinner","side"]' — can span multiple
  main_ingredient   TEXT,               -- JSON array, e.g. '["chicken"]'
  dietary_tags      TEXT,               -- JSON array, e.g. '["vegetarian","gluten-free"]'
  tags              TEXT,               -- JSON array, free-form catch-all
  notes             TEXT,               -- Woody's own notes ("used less chilli, great")
  extraction_status TEXT NOT NULL DEFAULT 'saved'
                    CHECK(extraction_status IN ('processing','review','saved','failed')),
  extraction_error  TEXT,               -- populated when status='failed'
  extraction_model  TEXT,               -- audit: which model produced the draft
  transcription_notes TEXT,             -- model's own note on illegible/cropped regions, null if fully legible
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id  INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient TEXT    NOT NULL,          -- "plain flour"
  quantity   TEXT,                      -- TEXT, not REAL: "1/2", "2-3", "a pinch"
  unit       TEXT,                      -- "cup", "g", "tbsp", NULL for "2 eggs"
  note       TEXT,                      -- "softened", "plus extra for dusting"
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  instruction TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  file_name     TEXT    NOT NULL,       -- server-generated, e.g. "12-0-1721361600000.jpg"
  original_name TEXT,
  mime_type     TEXT    NOT NULL,
  size_bytes    INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,  -- page order
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for frequent query patterns
CREATE INDEX IF NOT EXISTS idx_dispatches_status          ON dispatches(status, created_at);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_domain        ON kanban_cards(domain, updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_next            ON obsidian_sync_queue(attempts, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_habit_completions_hab_date ON habit_completions(habit_id, completed_date);
CREATE INDEX IF NOT EXISTS idx_goals_status               ON goals(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_recipes_status              ON recipes(extraction_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe   ON recipe_ingredients(recipe_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_name     ON recipe_ingredients(ingredient);
CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe         ON recipe_steps(recipe_id, step_number);
CREATE INDEX IF NOT EXISTS idx_recipe_photos_recipe        ON recipe_photos(recipe_id, sort_order);
