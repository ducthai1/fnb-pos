-- Cash shifts: the opening and closing counts, cash moved in and out of the drawer outside
-- sales, and which shift's drawer each payment went into.
--
-- A shift belongs to the till that opened it (its drawer). Other tills of the branch may
-- take payments into it by naming it, the way a waiter's handheld settles at the counter.
-- A closed shift is a document: its closing figures never change, and a sale made during
-- it that reaches the server only after the close is recorded as an adjustment to it
-- (payment.recorded_after_shift_close), never by rewriting the close.

ALTER TABLE shift DROP CONSTRAINT shift_status_known;
ALTER TABLE shift
  ADD COLUMN closed_at timestamptz,
  ADD COLUMN closed_by_staff_id uuid,
  ADD COLUMN counted_cash bigint,
  ADD COLUMN expected_cash bigint,
  ADD COLUMN difference bigint,
  -- No foreign key into approval_log, as for void records: a reference into the trail
  -- would make TRUNCATE of it fail on the reference instead of on its append-only trigger.
  ADD COLUMN close_approval_id uuid,
  -- Drafts still open on the till at the close; they are paid later, into the next shift.
  ADD COLUMN open_orders_carried integer,
  ADD CONSTRAINT shift_status_known CHECK (status IN ('opening', 'open', 'closing', 'closed')),
  ADD CONSTRAINT shift_closed_by_fkey FOREIGN KEY (tenant_id, closed_by_staff_id) REFERENCES staff (tenant_id, id),
  ADD CONSTRAINT shift_close_is_recorded CHECK (
    (status = 'closed') = (
      closed_at IS NOT NULL AND closed_by_staff_id IS NOT NULL AND counted_cash IS NOT NULL
      AND expected_cash IS NOT NULL AND difference IS NOT NULL AND open_orders_carried IS NOT NULL
    )
  ),
  ADD CONSTRAINT shift_difference_adds_up CHECK (difference = counted_cash - expected_cash),
  ADD CONSTRAINT shift_counted_cash_not_negative CHECK (counted_cash >= 0),
  ADD CONSTRAINT shift_open_orders_carried_not_negative CHECK (open_orders_carried >= 0);

-- One drawer, one shift at a time: two open shifts on one till would split its cash
-- between two counts that can each balance while the drawer does not.
CREATE UNIQUE INDEX shift_one_unclosed_per_device ON shift (tenant_id, device_id)
  WHERE status <> 'closed';
CREATE UNIQUE INDEX shift_close_approval_used_once ON shift (tenant_id, close_approval_id)
  WHERE close_approval_id IS NOT NULL;

-- Cash put into or taken out of the drawer outside a sale. Amount is a magnitude; kind
-- says which way it went.
CREATE TABLE cash_move (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  kind text NOT NULL,
  amount bigint NOT NULL,
  reason text NOT NULL,
  staff_id uuid NOT NULL,
  -- Checked by the command (same action, same staff, same till, enough amount); no
  -- foreign key into approval_log, for the reason given on shift.close_approval_id.
  approval_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT cash_move_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT cash_move_shift_fkey FOREIGN KEY (tenant_id, shift_id) REFERENCES shift (tenant_id, id),
  CONSTRAINT cash_move_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
  CONSTRAINT cash_move_kind_known CHECK (kind IN ('in', 'out')),
  CONSTRAINT cash_move_amount_positive CHECK (amount > 0),
  CONSTRAINT cash_move_reason_not_empty CHECK (reason <> '')
);

CREATE INDEX cash_move_tenant_id_shift_id_idx ON cash_move (tenant_id, shift_id);
CREATE UNIQUE INDEX cash_move_approval_used_once ON cash_move (tenant_id, approval_id)
  WHERE approval_id IS NOT NULL;

-- The notes counted at the opening and at the close, one row per denomination.
CREATE TABLE shift_count (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  shift_id uuid NOT NULL,
  stage text NOT NULL,
  denomination bigint NOT NULL,
  pieces integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT shift_count_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT shift_count_once_per_denomination UNIQUE (tenant_id, shift_id, stage, denomination),
  CONSTRAINT shift_count_shift_fkey FOREIGN KEY (tenant_id, shift_id) REFERENCES shift (tenant_id, id),
  CONSTRAINT shift_count_stage_known CHECK (stage IN ('opening', 'closing')),
  CONSTRAINT shift_count_denomination_in_circulation CHECK (
    denomination IN (500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000)
  ),
  CONSTRAINT shift_count_pieces_not_negative CHECK (pieces >= 0)
);

-- The shift whose drawer took the payment, and the shift an order was settled in. Null for
-- payments taken before shifts existed, or on a till that opened none.
ALTER TABLE sales_order
  ADD COLUMN shift_id uuid,
  ADD CONSTRAINT sales_order_shift_fkey FOREIGN KEY (tenant_id, shift_id) REFERENCES shift (tenant_id, id);
ALTER TABLE payment
  ADD COLUMN shift_id uuid,
  ADD COLUMN recorded_after_shift_close boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT payment_shift_fkey FOREIGN KEY (tenant_id, shift_id) REFERENCES shift (tenant_id, id),
  ADD CONSTRAINT payment_late_names_its_shift CHECK (NOT recorded_after_shift_close OR shift_id IS NOT NULL);

CREATE INDEX sales_order_tenant_id_shift_id_idx ON sales_order (tenant_id, shift_id) WHERE shift_id IS NOT NULL;
CREATE INDEX payment_tenant_id_shift_id_idx ON payment (tenant_id, shift_id) WHERE shift_id IS NOT NULL;

ALTER TABLE cash_move ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_move FORCE ROW LEVEL SECURITY;
CREATE POLICY cash_move_tenant_isolation ON cash_move
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shift_count ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_count FORCE ROW LEVEL SECURITY;
CREATE POLICY shift_count_tenant_isolation ON shift_count
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- A closed shift keeps its row as it was closed, and nothing is added, changed or removed
-- under it: what was counted, expected and accepted is the record the books rest on. Row
-- triggers bind the owner role too. The shift row is read FOR SHARE so a close running at
-- the same moment cannot slip between this check and the write.
CREATE FUNCTION refuse_closed_shift_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'closed' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'shift % is closed: % is not allowed', OLD.id, TG_OP;
END;
$$;

CREATE TRIGGER shift_closed_is_immutable
  BEFORE UPDATE OR DELETE ON shift
  FOR EACH ROW EXECUTE FUNCTION refuse_closed_shift_change();

CREATE FUNCTION refuse_change_under_closed_shift() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  shift_status text;
BEGIN
  FOR shift_status IN
    SELECT s.status FROM shift s
    WHERE (TG_OP <> 'INSERT' AND s.tenant_id = OLD.tenant_id AND s.id = OLD.shift_id)
       OR (TG_OP <> 'DELETE' AND s.tenant_id = NEW.tenant_id AND s.id = NEW.shift_id)
    FOR SHARE
  LOOP
    IF shift_status = 'closed' THEN
      RAISE EXCEPTION '% of a closed shift: % is not allowed', TG_TABLE_NAME, TG_OP;
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER cash_move_closed_shift_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON cash_move
  FOR EACH ROW EXECUTE FUNCTION refuse_change_under_closed_shift();
CREATE TRIGGER shift_count_closed_shift_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON shift_count
  FOR EACH ROW EXECUTE FUNCTION refuse_change_under_closed_shift();
