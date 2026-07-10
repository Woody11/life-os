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
