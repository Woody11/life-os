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
  dispatch_id INTEGER REFERENCES dispatches(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kanban_stage_dispatches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  stage       TEXT NOT NULL,
  dispatch_id INTEGER NOT NULL REFERENCES dispatches(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS obsidian_sync_queue (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  payload     TEXT NOT NULL,
  vault_path  TEXT NOT NULL,
  attempts    INTEGER DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  next_attempt_at TEXT
);
