-- Sales orders, their lines, payments, voids and refund amounts, and the shift skeleton.
--
-- An order is a document: once paid it is closed, and a mistake is corrected by a refund
-- (a reversing order), never by editing what was already collected. The domain enforces
-- that on the till and on the server; the triggers at the end of this file repeat it so a
-- row written around the API, or by a job running as the owner, cannot rewrite a closed
-- order either.
--
-- Money is bigint đồng, rates integer basis points, quantities numeric(12,3), as in the
-- domain package. The CHECK constraints repeat the domain's cheapest rules; rules spanning
-- several rows (the line tree, totals) stay in the domain.

CREATE TABLE sales_order (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  -- The till the order was opened on; it numbered the order offline with device_order_no.
  device_id uuid NOT NULL,
  status text NOT NULL,
  service_type text NOT NULL,
  channel_key text,
  business_date date NOT NULL,
  refund_of_order_id uuid,
  device_order_no bigint NOT NULL,
  -- Assigned later: the invoice number from the tax series, the number called at pickup.
  official_no text,
  call_number text,
  table_id uuid,
  -- The pricing rules the order was computed with (tax-inclusive prices, service charge).
  -- Kept on the order because a branch may change them later, and a refund or a reprint
  -- must still reproduce the amounts the customer paid.
  charge_profile jsonb NOT NULL,
  -- Set on a refund built from a sale: how the sale priced tax, so the refund gives back
  -- the same shares whatever the branch's profile is today.
  refund_prices_include_tax boolean,
  refund_service_charge_tax_rate_bp integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT sales_order_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT sales_order_device_order_no_once UNIQUE (tenant_id, device_id, device_order_no),
  CONSTRAINT sales_order_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT sales_order_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT sales_order_refund_of_fkey FOREIGN KEY (tenant_id, refund_of_order_id)
    REFERENCES sales_order (tenant_id, id),
  CONSTRAINT sales_order_table_fkey FOREIGN KEY (tenant_id, table_id) REFERENCES dining_table (tenant_id, id),
  CONSTRAINT sales_order_status_known CHECK (status IN ('draft', 'paid', 'posted', 'cancelled')),
  CONSTRAINT sales_order_service_type_known CHECK (
    service_type IN ('dine_in', 'takeaway', 'delivery_self', 'delivery_platform')
  ),
  CONSTRAINT sales_order_channel_key_not_empty CHECK (channel_key <> ''),
  CONSTRAINT sales_order_not_its_own_refund CHECK (refund_of_order_id <> id),
  CONSTRAINT sales_order_device_order_no_positive CHECK (device_order_no > 0),
  CONSTRAINT sales_order_charge_profile_is_object CHECK (jsonb_typeof(charge_profile) = 'object'),
  CONSTRAINT sales_order_refund_amounts_only_on_refunds CHECK (
    (refund_prices_include_tax IS NULL) = (refund_service_charge_tax_rate_bp IS NULL)
    AND (refund_prices_include_tax IS NULL OR refund_of_order_id IS NOT NULL)
  ),
  CONSTRAINT sales_order_refund_tax_rate_range CHECK (refund_service_charge_tax_rate_bp BETWEEN 0 AND 10000)
);

CREATE INDEX sales_order_tenant_id_branch_id_business_date_idx ON sales_order (tenant_id, branch_id, business_date);
CREATE INDEX sales_order_tenant_id_refund_of_idx ON sales_order (tenant_id, refund_of_order_id) WHERE refund_of_order_id IS NOT NULL;
CREATE INDEX sales_order_tenant_id_table_id_idx ON sales_order (tenant_id, table_id) WHERE table_id IS NOT NULL;

CREATE TABLE sales_order_line (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  -- Lines are read back in the order they were rung up; totals and receipts list them so.
  position integer NOT NULL,
  parent_line_id uuid,
  line_type text NOT NULL,
  product_id uuid,
  variant_id uuid,
  modifier_option_id uuid,
  name_snapshot text NOT NULL,
  unit_price bigint NOT NULL,
  -- On a child line this is per one unit of its parent line.
  quantity numeric(12,3) NOT NULL,
  tax_rate_bp integer NOT NULL,
  note text,
  price_source text NOT NULL,
  -- A negative item taking back units of another line: of this order for a void, of the
  -- refunded order for a refund.
  reverses_line_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT sales_order_line_tenant_id_id_key UNIQUE (tenant_id, id),
  -- Lets a child line, a void record or a refund amount require a line of the same order.
  CONSTRAINT sales_order_line_tenant_id_order_id_id_key UNIQUE (tenant_id, order_id, id),
  CONSTRAINT sales_order_line_order_fkey FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id),
  CONSTRAINT sales_order_line_parent_fkey FOREIGN KEY (tenant_id, order_id, parent_line_id)
    REFERENCES sales_order_line (tenant_id, order_id, id),
  CONSTRAINT sales_order_line_reverses_fkey FOREIGN KEY (tenant_id, reverses_line_id)
    REFERENCES sales_order_line (tenant_id, id),
  CONSTRAINT sales_order_line_product_fkey FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id),
  CONSTRAINT sales_order_line_variant_fkey FOREIGN KEY (tenant_id, product_id, variant_id)
    REFERENCES product_variant (tenant_id, product_id, id),
  CONSTRAINT sales_order_line_modifier_option_fkey FOREIGN KEY (tenant_id, modifier_option_id)
    REFERENCES modifier_option (tenant_id, id),
  CONSTRAINT sales_order_line_type_known CHECK (line_type IN ('item', 'modifier', 'combo_component', 'discount')),
  CONSTRAINT sales_order_line_price_source_known CHECK (price_source IN ('base', 'price_list', 'manual', 'promotion')),
  CONSTRAINT sales_order_line_position_not_negative CHECK (position >= 0),
  CONSTRAINT sales_order_line_quantity_not_zero CHECK (quantity <> 0),
  CONSTRAINT sales_order_line_tax_rate_bp_range CHECK (tax_rate_bp BETWEEN 0 AND 10000),
  CONSTRAINT sales_order_line_item_is_root CHECK (line_type <> 'item' OR parent_line_id IS NULL),
  CONSTRAINT sales_order_line_reversal_is_negative_item CHECK (
    reverses_line_id IS NULL OR (line_type = 'item' AND quantity < 0)
  )
);

CREATE INDEX sales_order_line_tenant_id_reverses_idx ON sales_order_line (tenant_id, reverses_line_id) WHERE reverses_line_id IS NOT NULL;

-- Order.refundAmounts: what each line of a refund gives back, fixed when the refund is built
-- (negative amounts, like the refund's lines).
CREATE TABLE refund_line_amount (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  line_id uuid NOT NULL,
  sold_line_id uuid NOT NULL,
  gross bigint NOT NULL,
  discount_allocated bigint NOT NULL,
  tax bigint NOT NULL,
  service_charge bigint NOT NULL,
  service_charge_tax bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT refund_line_amount_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT refund_line_amount_once_per_line UNIQUE (tenant_id, line_id),
  CONSTRAINT refund_line_amount_order_fkey FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id),
  CONSTRAINT refund_line_amount_line_fkey FOREIGN KEY (tenant_id, order_id, line_id)
    REFERENCES sales_order_line (tenant_id, order_id, id),
  CONSTRAINT refund_line_amount_sold_line_fkey FOREIGN KEY (tenant_id, sold_line_id)
    REFERENCES sales_order_line (tenant_id, id)
);

CREATE INDEX refund_line_amount_tenant_id_sold_line_id_idx ON refund_line_amount (tenant_id, sold_line_id);

CREATE TABLE payment (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  -- A key the shop configures ("cash", "card", "momo"), like a channel key.
  method text NOT NULL,
  amount bigint NOT NULL,
  received_by_staff_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT payment_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_order_fkey FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id),
  CONSTRAINT payment_received_by_fkey FOREIGN KEY (tenant_id, received_by_staff_id) REFERENCES staff (tenant_id, id),
  CONSTRAINT payment_method_key CHECK (method ~ '^[a-z][a-z0-9_]{0,31}$')
);

CREATE INDEX payment_tenant_id_order_id_idx ON payment (tenant_id, order_id);
CREATE INDEX payment_tenant_id_received_by_idx ON payment (tenant_id, received_by_staff_id);

-- The domain's VoidRecord: who cancelled which units of a line, why, and who approved it.
CREATE TABLE line_void_record (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  line_id uuid NOT NULL,
  quantity numeric(12,3) NOT NULL,
  from_unsent numeric(12,3) NOT NULL,
  from_sent numeric(12,3) NOT NULL,
  reason_code text NOT NULL,
  staff_id uuid NOT NULL,
  approved_by_staff_id uuid,
  -- No foreign key into approval_log: a table referencing it would make TRUNCATE of the
  -- trail fail on the reference instead of on its append-only trigger, and the void
  -- command checks the approval itself (same action, same staff, not used twice).
  approval_id uuid,
  reversal_line_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT line_void_record_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT line_void_record_line_fkey FOREIGN KEY (tenant_id, order_id, line_id)
    REFERENCES sales_order_line (tenant_id, order_id, id),
  CONSTRAINT line_void_record_reversal_line_fkey FOREIGN KEY (tenant_id, order_id, reversal_line_id)
    REFERENCES sales_order_line (tenant_id, order_id, id),
  CONSTRAINT line_void_record_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
  CONSTRAINT line_void_record_approved_by_fkey FOREIGN KEY (tenant_id, approved_by_staff_id)
    REFERENCES staff (tenant_id, id),
  CONSTRAINT line_void_record_quantity_positive CHECK (quantity > 0),
  CONSTRAINT line_void_record_split_adds_up CHECK (
    from_unsent >= 0 AND from_sent >= 0 AND from_unsent + from_sent = quantity
  ),
  CONSTRAINT line_void_record_reason_not_empty CHECK (reason_code <> ''),
  -- Units the kitchen saw come back through a negative line, and only those.
  CONSTRAINT line_void_record_reversal_matches_sent CHECK ((from_sent = 0) = (reversal_line_id IS NULL)),
  CONSTRAINT line_void_record_not_self_approved CHECK (approved_by_staff_id <> staff_id)
);

CREATE INDEX line_void_record_tenant_id_order_id_idx ON line_void_record (tenant_id, order_id);

-- Only the frame of a cash shift; opening and closing rules come with the shift feature.
CREATE TABLE shift (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  -- Null for a shift that spans the branch's tills rather than one drawer.
  device_id uuid,
  status text NOT NULL,
  opened_by_staff_id uuid NOT NULL,
  opening_cash bigint NOT NULL,
  business_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT shift_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT shift_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT shift_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT shift_opened_by_fkey FOREIGN KEY (tenant_id, opened_by_staff_id) REFERENCES staff (tenant_id, id),
  CONSTRAINT shift_status_known CHECK (status IN ('open', 'closed')),
  CONSTRAINT shift_opening_cash_not_negative CHECK (opening_cash >= 0)
);

CREATE INDEX shift_tenant_id_branch_id_business_date_idx ON shift (tenant_id, branch_id, business_date);

ALTER TABLE sales_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_order_tenant_isolation ON sales_order
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE sales_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_line FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_order_line_tenant_isolation ON sales_order_line
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE refund_line_amount ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_line_amount FORCE ROW LEVEL SECURITY;
CREATE POLICY refund_line_amount_tenant_isolation ON refund_line_amount
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE payment ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_tenant_isolation ON payment
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE line_void_record ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_void_record FORCE ROW LEVEL SECURITY;
CREATE POLICY line_void_record_tenant_isolation ON line_void_record
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE shift ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift FORCE ROW LEVEL SECURITY;
CREATE POLICY shift_tenant_isolation ON shift
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- A closed order (paid, posted, cancelled) keeps its header as it was. The one change
-- allowed is paid → posted, when the shift's books are locked, and then nothing else on
-- the row may move with it. A draft is free to change and to be deleted. Row triggers
-- bind the owner role too, which privileges could not.
CREATE FUNCTION refuse_closed_sales_order_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status = 'posted'
     AND to_jsonb(NEW) - ARRAY['status', 'version', 'updated_at']
       = to_jsonb(OLD) - ARRAY['status', 'version', 'updated_at'] THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'sales_order % is closed (%): % is not allowed', OLD.id, OLD.status, TG_OP;
END;
$$;

CREATE TRIGGER sales_order_closed_is_immutable
  BEFORE UPDATE OR DELETE ON sales_order
  FOR EACH ROW EXECUTE FUNCTION refuse_closed_sales_order_change();

-- Lines, payments, voids and refund amounts belong to their order's document: none may be
-- added, changed or removed once the order is closed. The order row is read FOR SHARE so a
-- concurrent payment cannot close it between this check and the write. An order the
-- current tenant cannot see is left to the foreign key and row level security to refuse.
CREATE FUNCTION refuse_change_under_closed_sales_order() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  order_status text;
BEGIN
  FOR order_status IN
    SELECT o.status FROM sales_order o
    WHERE (TG_OP <> 'INSERT' AND o.tenant_id = OLD.tenant_id AND o.id = OLD.order_id)
       OR (TG_OP <> 'DELETE' AND o.tenant_id = NEW.tenant_id AND o.id = NEW.order_id)
    FOR SHARE
  LOOP
    IF order_status <> 'draft' THEN
      RAISE EXCEPTION '% of a closed sales_order (%): % is not allowed', TG_TABLE_NAME, order_status, TG_OP;
    END IF;
  END LOOP;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER sales_order_line_closed_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON sales_order_line
  FOR EACH ROW EXECUTE FUNCTION refuse_change_under_closed_sales_order();
CREATE TRIGGER refund_line_amount_closed_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON refund_line_amount
  FOR EACH ROW EXECUTE FUNCTION refuse_change_under_closed_sales_order();
CREATE TRIGGER payment_closed_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON payment
  FOR EACH ROW EXECUTE FUNCTION refuse_change_under_closed_sales_order();
CREATE TRIGGER line_void_record_closed_is_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON line_void_record
  FOR EACH ROW EXECUTE FUNCTION refuse_change_under_closed_sales_order();
