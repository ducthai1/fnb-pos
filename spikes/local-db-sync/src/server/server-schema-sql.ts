export const SERVER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY,
  device_id text NOT NULL,
  business_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'paid')),
  total_vnd bigint NOT NULL,
  version integer NOT NULL,
  updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS order_lines (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders (id),
  item_id text NOT NULL,
  name text NOT NULL,
  qty_thousandths bigint NOT NULL,
  unit_price_vnd bigint NOT NULL,
  line_total_vnd bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS order_lines_by_order ON order_lines (order_id);
-- Every outcome is kept, rejections included: a retried command must get the same answer
-- it got the first time, not a fresh evaluation against state that has moved on.
CREATE TABLE IF NOT EXISTS applied_command (
  command_id uuid PRIMARY KEY,
  device_id text NOT NULL,
  device_seq bigint NOT NULL,
  type text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted', 'rejected')),
  code text,
  order_id uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, device_seq)
);
CREATE TABLE IF NOT EXISTS device_cursor (
  device_id text PRIMARY KEY,
  last_seq bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS change_log (
  change_seq bigserial PRIMARY KEY,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  data jsonb NOT NULL,
  command_id uuid NOT NULL
);
-- A running aggregate that a double-applied command would inflate even where primary keys
-- hide the duplicate rows; the scenarios compare it with the rows it summarises.
CREATE TABLE IF NOT EXISTS business_day_total (
  business_date date PRIMARY KEY,
  order_count integer NOT NULL,
  paid_count integer NOT NULL,
  paid_vnd bigint NOT NULL
);
`;
