// One SQL dialect for every till: these statements run unchanged on native SQLite and WASM.

export const LOCAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- AUTOINCREMENT, not a plain rowid: a plain rowid hands the highest number out again once
-- that row is deleted, and the server would then see two commands with one device_seq.
-- A rolled back insert also rolls back the counter, so the numbers stay without gaps.
CREATE TABLE IF NOT EXISTS outbox (
  device_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  envelope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  result_code TEXT
);
CREATE INDEX IF NOT EXISTS outbox_by_status ON outbox (status, device_seq);
CREATE INDEX IF NOT EXISTS outbox_by_entity ON outbox (entity, entity_id, status);
-- Two copies per row at most: the newest the server sent, and the till's own expectation
-- while one of its commands on the row is pending. A NULL snapshot is a server deletion.
CREATE TABLE IF NOT EXISTS entity_snapshot (
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('server', 'optimistic')),
  version INTEGER NOT NULL,
  snapshot TEXT,
  PRIMARY KEY (entity, entity_id, source)
);
CREATE TABLE IF NOT EXISTS rejected_command (
  command_id TEXT PRIMARY KEY,
  device_seq INTEGER NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  code TEXT NOT NULL,
  envelope TEXT NOT NULL,
  server_snapshot TEXT
);
`;

export const READ_META_SQL = "SELECT value FROM sync_meta WHERE key = ?";
export const WRITE_META_SQL =
  "INSERT INTO sync_meta (key, value) VALUES (?, ?) " +
  "ON CONFLICT (key) DO UPDATE SET value = excluded.value";

export const INSERT_OUTBOX_SQL =
  "INSERT INTO outbox (command_id, type, entity, entity_id, envelope) VALUES (?, ?, ?, ?, ?) " +
  "RETURNING device_seq";
export const FIND_OUTBOX_SQL = "SELECT device_seq FROM outbox WHERE command_id = ?";
export const READ_PENDING_SQL =
  "SELECT device_seq, envelope FROM outbox WHERE status = 'pending' ORDER BY device_seq LIMIT ?";
export const COUNT_PENDING_SQL = "SELECT count(*) AS n FROM outbox WHERE status = 'pending'";

export const UPSERT_OPTIMISTIC_SQL =
  "INSERT INTO entity_snapshot (entity, entity_id, source, version, snapshot) " +
  "VALUES (?, ?, 'optimistic', ?, ?) ON CONFLICT (entity, entity_id, source) DO UPDATE SET " +
  "version = excluded.version, snapshot = excluded.snapshot";
export const READ_ENTITY_SQL =
  "SELECT source, version, snapshot FROM entity_snapshot WHERE entity = ? AND entity_id = ?";
export const READ_ENTITY_IDS_SQL =
  "SELECT DISTINCT entity_id FROM entity_snapshot WHERE entity = ? ORDER BY entity_id";

export const READ_REJECTED_SQL =
  "SELECT device_seq, entity, entity_id, code, envelope, server_snapshot FROM rejected_command " +
  "ORDER BY device_seq";
