// One SQL dialect for every till: these strings run unchanged on native SQLite and WASM.

export const LOCAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'paid')),
  total_vnd INTEGER NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  name TEXT NOT NULL,
  qty_thousandths INTEGER NOT NULL,
  unit_price_vnd INTEGER NOT NULL,
  line_total_vnd INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS order_lines_by_order ON order_lines (order_id);
-- AUTOINCREMENT, not a plain rowid: a plain rowid reuses the highest number after that row
-- is deleted, and the server would then see two different commands with one device_seq.
CREATE TABLE IF NOT EXISTS outbox (
  device_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  command_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_code TEXT
);
CREATE INDEX IF NOT EXISTS outbox_by_status ON outbox (status, device_seq);
CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export const UPSERT_ORDER_SQL = `
INSERT INTO orders (id, device_id, business_date, status, total_vnd, version, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  device_id = excluded.device_id, business_date = excluded.business_date,
  status = excluded.status, total_vnd = excluded.total_vnd,
  version = excluded.version, updated_at = excluded.updated_at`;

export const UPSERT_LINE_SQL = `
INSERT INTO order_lines (id, order_id, item_id, name, qty_thousandths, unit_price_vnd, line_total_vnd)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  order_id = excluded.order_id, item_id = excluded.item_id, name = excluded.name,
  qty_thousandths = excluded.qty_thousandths, unit_price_vnd = excluded.unit_price_vnd,
  line_total_vnd = excluded.line_total_vnd`;

export const FIND_QUEUED_COMMAND_SQL = "SELECT device_seq FROM outbox WHERE command_id = ?";
export const INSERT_OUTBOX_SQL =
  "INSERT INTO outbox (command_id, type, payload, created_at) VALUES (?, ?, ?, ?)";
export const READ_PENDING_SQL = `
SELECT device_seq, command_id, type, payload, created_at FROM outbox
WHERE status = 'pending' ORDER BY device_seq LIMIT ?`;
export const COUNT_PENDING_SQL = "SELECT count(*) AS n FROM outbox WHERE status = 'pending'";
export const COUNT_BY_STATUS_SQL = "SELECT status, count(*) AS n FROM outbox GROUP BY status";
export const MARK_ACCEPTED_SQL =
  "UPDATE outbox SET status = 'accepted' WHERE command_id = ? AND status = 'pending'";
export const MARK_REJECTED_SQL =
  "UPDATE outbox SET status = 'rejected', result_code = ? WHERE command_id = ?";
export const DELETE_ORDER_LINES_SQL = "DELETE FROM order_lines WHERE order_id = ?";
export const DELETE_ORDER_SQL = "DELETE FROM orders WHERE id = ?";
export const READ_CURSOR_SQL = "SELECT value FROM sync_state WHERE key = 'cursor'";
export const WRITE_CURSOR_SQL = `
INSERT INTO sync_state (key, value) VALUES ('cursor', ?)
ON CONFLICT (key) DO UPDATE SET value = excluded.value`;
export const SELECT_ORDER_SQL = "SELECT * FROM orders WHERE id = ?";
export const SELECT_ORDER_LINES_SQL = "SELECT * FROM order_lines WHERE order_id = ? ORDER BY id";
export const SELECT_ALL_ORDERS_SQL = "SELECT * FROM orders ORDER BY id";
export const SELECT_ALL_LINES_SQL = "SELECT * FROM order_lines ORDER BY order_id, id";
export const SELECT_ALL_COMMANDS_SQL =
  "SELECT command_id, type, payload, status, result_code FROM outbox ORDER BY device_seq";
