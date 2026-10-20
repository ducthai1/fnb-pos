-- What till sync records beyond the orders and shifts themselves: who sent each command,
-- and which kitchen tickets the stations were given.

-- The staff member signed in on the till when it sent the command, so "who did this?" is
-- answered from the ledger itself, rejections included (a refused void is evidence too).
-- Null for commands recorded before the column existed: their sender was never stored,
-- and guessing it from sessions could name the wrong person.
ALTER TABLE applied_command
  ADD COLUMN staff_id uuid,
  ADD CONSTRAINT applied_command_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id);

-- The note of a line as the stations last saw it printed, beside sent_quantity: a note
-- changed since goes out again as a "note changed" ticket line. Null while nothing was sent.
ALTER TABLE sales_order_line ADD COLUMN sent_note text;

-- A kitchen ticket a till printed, recorded only once the printer took it: a ticket lost to
-- a jammed printer is never recorded, so the next send prints its dishes again. The id is
-- made on the till (it is printed on the slip), and what the till reported is kept as sent.
CREATE TABLE kitchen_ticket (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  device_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  command_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_ticket_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT kitchen_ticket_order_fkey FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id),
  CONSTRAINT kitchen_ticket_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT kitchen_ticket_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id)
);

CREATE INDEX kitchen_ticket_tenant_id_order_id_idx ON kitchen_ticket (tenant_id, order_id);

-- One line of a ticket: units of an order line a station was told to make, to stop making,
-- or to make with a changed note. It names its ticket without a foreign key, because a key
-- into an append-only table makes TRUNCATE of that table fail before its own trigger says
-- why. The order line must exist on the same order, and a line the kitchen has is never
-- removed from a draft (a save keeps it, a void cancels it with a negative line), so the
-- key into sales_order_line holds for as long as the ticket does. `detail` keeps the name
-- and toppings as the server held them when the ticket was recorded.
CREATE TABLE kitchen_ticket_line (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  ticket_id uuid NOT NULL,
  order_id uuid NOT NULL,
  line_id uuid NOT NULL,
  station_id uuid NOT NULL,
  kind text NOT NULL,
  quantity numeric(12,3) NOT NULL,
  note text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_ticket_line_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT kitchen_ticket_line_once_per_kind UNIQUE (tenant_id, ticket_id, line_id, kind),
  CONSTRAINT kitchen_ticket_line_order_line_fkey FOREIGN KEY (tenant_id, order_id, line_id)
    REFERENCES sales_order_line (tenant_id, order_id, id),
  CONSTRAINT kitchen_ticket_line_station_fkey FOREIGN KEY (tenant_id, station_id) REFERENCES station (tenant_id, id),
  CONSTRAINT kitchen_ticket_line_kind_known CHECK (kind IN ('new', 'cancel', 'note_changed')),
  CONSTRAINT kitchen_ticket_line_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX kitchen_ticket_line_tenant_id_order_id_idx ON kitchen_ticket_line (tenant_id, order_id);
CREATE INDEX kitchen_ticket_line_tenant_id_station_id_idx ON kitchen_ticket_line (tenant_id, station_id);

ALTER TABLE kitchen_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_ticket FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_ticket_tenant_isolation ON kitchen_ticket
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE kitchen_ticket_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_ticket_line FORCE ROW LEVEL SECURITY;
CREATE POLICY kitchen_ticket_line_tenant_isolation ON kitchen_ticket_line
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Append-only, as the audit trail: privileges stop the app role, the statement trigger
-- stops the owner as well.
REVOKE UPDATE, DELETE, TRUNCATE ON kitchen_ticket, kitchen_ticket_line FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid IN ('kitchen_ticket'::regclass, 'kitchen_ticket_line'::regclass)
      AND acl.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON kitchen_ticket, kitchen_ticket_line FROM %I', grantee_name);
  END LOOP;
END
$$;

CREATE TRIGGER kitchen_ticket_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON kitchen_ticket
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
CREATE TRIGGER kitchen_ticket_line_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON kitchen_ticket_line
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();

-- A paid order still has its kitchen ticket printed: a counter that takes the money first
-- sends the drinks to the bar after the payment. So the lines of a paid order take one
-- change: sent_quantity growing and sent_note following it, nothing else on the row. That
-- is the kitchen's bookkeeping, not the document: the amounts, units and names stay as paid.
-- A posted or cancelled order takes none, and anything else follows the rule of the other
-- rows under a closed order (refuse_change_under_closed_sales_order).
CREATE FUNCTION refuse_closed_sales_order_line_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  order_status text;
  kitchen_only boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    kitchen_only := NEW.sent_quantity >= OLD.sent_quantity
      AND to_jsonb(NEW) - ARRAY['sent_quantity', 'sent_note', 'version', 'updated_at']
        = to_jsonb(OLD) - ARRAY['sent_quantity', 'sent_note', 'version', 'updated_at'];
  END IF;
  FOR order_status IN
    SELECT o.status FROM sales_order o
    WHERE (TG_OP <> 'INSERT' AND o.tenant_id = OLD.tenant_id AND o.id = OLD.order_id)
       OR (TG_OP <> 'DELETE' AND o.tenant_id = NEW.tenant_id AND o.id = NEW.order_id)
    FOR SHARE
  LOOP
    IF order_status <> 'draft' AND NOT (kitchen_only AND order_status = 'paid') THEN
      RAISE EXCEPTION '% of a closed sales_order (%): % is not allowed', TG_TABLE_NAME, order_status, TG_OP;
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER sales_order_line_closed_is_immutable ON sales_order_line;
CREATE TRIGGER sales_order_line_closed_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sales_order_line
  FOR EACH ROW EXECUTE FUNCTION refuse_closed_sales_order_line_change();

-- The header of a paid order takes its version moving alone, nothing else on the row: the
-- kitchen's bookkeeping above changes the order's snapshot, and a till keeps a server copy
-- only when its version is strictly newer, so without the version moving the tills (the one
-- that printed included) would keep the old sent state and print the same dishes again.
-- paid → posted stays the one status change, and a posted or cancelled order takes nothing.
CREATE OR REPLACE FUNCTION refuse_closed_sales_order_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status IN ('paid', 'posted')
     AND to_jsonb(NEW) - ARRAY['status', 'version', 'updated_at']
       = to_jsonb(OLD) - ARRAY['status', 'version', 'updated_at'] THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'sales_order % is closed (%): % is not allowed', OLD.id, OLD.status, TG_OP;
END;
$$;
