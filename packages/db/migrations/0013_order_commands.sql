-- What the order commands of till sync store beyond the order tables: how much of a line
-- the kitchen has, discounts given on a whole line, refunds that go back into stock, why an
-- order was cancelled or refunded, and which on-the-spot approvals were already used.

-- Units of the line sent to the kitchen so far, cancelled ones included. Voiding takes
-- unsent units first and needs an approver for the rest, so this is what decides whether
-- a cancel ticket is printed. Sending to the kitchen raises it; nothing else does.
ALTER TABLE sales_order_line ADD COLUMN sent_quantity numeric(12,3) NOT NULL DEFAULT 0;
ALTER TABLE sales_order_line ADD CONSTRAINT sales_order_line_sent_quantity_not_negative
  CHECK (sent_quantity >= 0);

-- A discount under an item whose quantity is for the item's line as a whole, not per unit:
-- "10.000 đ off the line" of three cups has no per-cup price in whole đồng.
ALTER TABLE sales_order_line ADD COLUMN whole_parent_line boolean NOT NULL DEFAULT false;
ALTER TABLE sales_order_line ADD CONSTRAINT sales_order_line_whole_parent_line_is_line_discount
  CHECK (NOT whole_parent_line OR (line_type = 'discount' AND parent_line_id IS NOT NULL));

-- On a refund's negative item: whether the goods go back into stock (an unopened bottle)
-- or are written off (a spilt tea). Stock is moved from it when stock tracking comes.
ALTER TABLE sales_order_line ADD COLUMN restock boolean;
ALTER TABLE sales_order_line ADD CONSTRAINT sales_order_line_restock_on_reversal
  CHECK (restock IS NULL OR reverses_line_id IS NOT NULL);

-- Why a draft was cancelled or a sale refunded: a key from the shop's list, so reports
-- can count refunds by reason.
ALTER TABLE sales_order ADD COLUMN reason_code text;
ALTER TABLE sales_order ADD CONSTRAINT sales_order_reason_code_not_empty CHECK (reason_code <> '');

-- Voiding every unsent unit of a line removes the line, and its void record must outlive
-- it: the record is the trace of food rung up and taken off again. The record keeps the
-- line id it voided and now hangs off the order instead of the line.
ALTER TABLE line_void_record DROP CONSTRAINT line_void_record_line_fkey;
ALTER TABLE line_void_record ADD CONSTRAINT line_void_record_order_fkey
  FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id);
CREATE INDEX line_void_record_tenant_id_line_id_idx ON line_void_record (tenant_id, line_id);

-- An on-the-spot approval is good for one action. The command that relies on it adds a
-- row here in its own transaction, so a second command naming the same approval fails on
-- the unique key even when both arrive at once. No foreign key into approval_log or
-- applied_command: a reference into an append-only table makes TRUNCATE of it fail on
-- the reference instead of on its trigger. Rows are evidence, so they are only added.
CREATE TABLE approval_use (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  command_id uuid NOT NULL,
  -- What the command used it for (command type, order), for whoever reads the trail.
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_use_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT approval_use_once UNIQUE (tenant_id, approval_id),
  CONSTRAINT approval_use_organization_fkey FOREIGN KEY (tenant_id) REFERENCES organization (id)
);

ALTER TABLE approval_use ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_use FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_use_tenant_isolation ON approval_use
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE UPDATE, DELETE, TRUNCATE ON approval_use FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid = 'approval_use'::regclass
      AND acl.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON approval_use FROM %I', grantee_name);
  END LOOP;
END
$$;

CREATE TRIGGER approval_use_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON approval_use
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
