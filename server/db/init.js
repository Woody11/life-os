const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

// Single shared connection for the whole process. better-sqlite3 is synchronous
// and a single connection is the recommended pattern — no pool needed.
let db = null;

/**
 * Initialise (or return the already-initialised) SQLite database.
 *
 * WHY this shape:
 *  - We resolve DB_PATH from env with a sensible default so the same code runs
 *    in Docker (/data/lifeos.db on a mounted volume) and locally.
 *  - We ensure the parent directory exists first, because better-sqlite3 will
 *    NOT create missing directories and would throw an opaque "unable to open
 *    database file" error otherwise.
 *  - We enable foreign_keys — SQLite defaults it OFF per connection, and the
 *    schema relies on ON DELETE CASCADE for kanban_card_log / stage_dispatches.
 *  - We run schema.sql via exec(); every statement is idempotent (IF NOT
 *    EXISTS) so calling this on every boot is safe.
 */
function initDb() {
  if (db) return db;

  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'lifeos.db');

  // Ensure the directory exists before opening the file.
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);

  // WAL gives us better read/write concurrency and durability for a long-lived
  // server process; foreign_keys is required for the CASCADE deletes to work.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Additive column migrations — idempotent via PRAGMA table_info check.
  const dispatchCols = new Set(db.pragma('table_info(dispatches)').map((c) => c.name));
  if (!dispatchCols.has('input_tokens'))  db.prepare('ALTER TABLE dispatches ADD COLUMN input_tokens  INTEGER').run();
  if (!dispatchCols.has('output_tokens')) db.prepare('ALTER TABLE dispatches ADD COLUMN output_tokens INTEGER').run();
  if (!dispatchCols.has('cost_aud'))      db.prepare('ALTER TABLE dispatches ADD COLUMN cost_aud      REAL').run();
  if (!dispatchCols.has('model'))         db.prepare('ALTER TABLE dispatches ADD COLUMN model         TEXT').run();

  const recipeCols = new Set(db.pragma('table_info(recipes)').map((c) => c.name));
  if (!recipeCols.has('transcription_notes')) db.prepare('ALTER TABLE recipes ADD COLUMN transcription_notes TEXT').run();

  const syncQueueCols = new Set(db.pragma('table_info(obsidian_sync_queue)').map((c) => c.name));
  if (!syncQueueCols.has('status')) {
    db.prepare("ALTER TABLE obsidian_sync_queue ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run();
  }
  // Add UNIQUE(vault_path) to obsidian_sync_queue if missing — requires table rebuild in SQLite.
  const syncIndexes = db.pragma('index_list(obsidian_sync_queue)');
  const hasUniqueVaultPath = syncIndexes.some((idx) =>
    idx.unique === 1 &&
    db.pragma(`index_info(${idx.name})`).some((col) => col.name === 'vault_path'),
  );
  if (!hasUniqueVaultPath) {
    db.exec(`
      CREATE TABLE obsidian_sync_queue_new (
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
      INSERT OR IGNORE INTO obsidian_sync_queue_new
        SELECT id, entity_type, entity_id, payload, vault_path, attempts, last_error,
               COALESCE(status, 'pending'), created_at, next_attempt_at
        FROM obsidian_sync_queue
        ORDER BY created_at DESC;
      DROP TABLE obsidian_sync_queue;
      ALTER TABLE obsidian_sync_queue_new RENAME TO obsidian_sync_queue;
      CREATE INDEX IF NOT EXISTS idx_sync_queue_next ON obsidian_sync_queue(attempts, next_attempt_at);
    `);
  }

  // Add model column to goal_agents if missing.
  const goalAgentCols = new Set(db.pragma('table_info(goal_agents)').map((c) => c.name));
  if (!goalAgentCols.has('model')) {
    db.prepare('ALTER TABLE goal_agents ADD COLUMN model TEXT').run();
  }

  // Add ON DELETE CASCADE to kanban_stage_dispatches.dispatch_id if missing.
  const stageFks = db.pragma('foreign_key_list(kanban_stage_dispatches)');
  const hasDispatchCascade = stageFks.some((fk) => fk.from === 'dispatch_id' && fk.on_delete === 'CASCADE');
  if (!hasDispatchCascade) {
    db.exec(`
      CREATE TABLE kanban_stage_dispatches_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id     INTEGER NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
        stage       TEXT NOT NULL,
        dispatch_id INTEGER NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO kanban_stage_dispatches_new SELECT * FROM kanban_stage_dispatches;
      DROP TABLE kanban_stage_dispatches;
      ALTER TABLE kanban_stage_dispatches_new RENAME TO kanban_stage_dispatches;
    `);
  }

  const kanbanCols = new Set(db.pragma('table_info(kanban_cards)').map((c) => c.name));
  if (!kanbanCols.has('notes')) db.prepare('ALTER TABLE kanban_cards ADD COLUMN notes TEXT').run();

  return db;
}

/**
 * Accessor for the shared connection. Throws if called before initDb() so
 * mis-ordered imports fail loudly instead of silently opening a second db.
 */
function getDb() {
  if (!db) throw new Error('Database not initialised — call initDb() first.');
  return db;
}

module.exports = { initDb, getDb };
