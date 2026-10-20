-- Electronic invoices from the cash register: one per paid sale (and, when the branch's
-- profile asks for it, one adjusting the sale's invoice per refund), queued at payment and
-- issued through the branch's invoice provider by a worker, so a provider that is slow or
-- down never holds up the counter and no sale is ever left without its invoice or a record
-- of why it has none.
--
-- The rules come from secondary sources on Decree 254/2026 and Circular 91/2026, not yet
-- checked against the official text: each invoice keeps the regime_version it was queued
-- under, and nothing here encodes a date the law takes effect.

-- When the till took the money, by its own clock (an order paid offline is dated when it
-- was paid, not when it synced): reports bucket sales by it and invoices are dated by it.
-- What the customer asked to be printed on the invoice, while the order is still a draft.
ALTER TABLE sales_order
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN einvoice_buyer jsonb,
  ADD CONSTRAINT sales_order_einvoice_buyer_is_object CHECK (jsonb_typeof(einvoice_buyer) = 'object');

CREATE TABLE einvoice (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  business_date date NOT NULL,
  kind text NOT NULL DEFAULT 'sale',
  adjusts_einvoice_id uuid,
  status text NOT NULL DEFAULT 'pending',
  -- Calls made to the provider so far, and when the next one is due. The worker claims a
  -- row by moving next_attempt_at past a lease, so a crashed worker's row comes back.
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error_code text,
  -- The profile as it stood when the sale was paid: a later change of seller, provider or
  -- regime never rewrites who sold what under which rules.
  provider text NOT NULL,
  regime_version text NOT NULL,
  template_symbol text NOT NULL,
  seller jsonb NOT NULL,
  buyer jsonb,
  sold_at timestamptz NOT NULL,
  -- The goods lines and the totals by tax rate, as the domain computed them for the order.
  amounts jsonb NOT NULL,
  number text,
  tax_authority_code text,
  lookup_code text,
  lookup_url text,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT einvoice_tenant_id_id_key UNIQUE (tenant_id, id),
  -- One invoice per paid order: a second one would invoice the same money twice.
  CONSTRAINT einvoice_once_per_order UNIQUE (tenant_id, order_id),
  CONSTRAINT einvoice_order_fkey FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id),
  CONSTRAINT einvoice_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT einvoice_adjusts_fkey FOREIGN KEY (tenant_id, adjusts_einvoice_id)
    REFERENCES einvoice (tenant_id, id),
  CONSTRAINT einvoice_kind_known CHECK (kind IN ('sale', 'adjustment')),
  CONSTRAINT einvoice_adjustment_names_its_invoice CHECK (
    (kind = 'adjustment') = (adjusts_einvoice_id IS NOT NULL)
  ),
  CONSTRAINT einvoice_status_known CHECK (
    status IN ('pending', 'issued', 'failed_retryable', 'failed_permanent')
  ),
  CONSTRAINT einvoice_attempts_not_negative CHECK (attempts >= 0),
  -- Waiting for the provider exactly while it is queued.
  CONSTRAINT einvoice_queued_has_a_due_time CHECK (
    (status IN ('pending', 'failed_retryable')) = (next_attempt_at IS NOT NULL)
  ),
  CONSTRAINT einvoice_issued_is_complete CHECK (
    (status = 'issued') = (number IS NOT NULL AND lookup_code IS NOT NULL AND issued_at IS NOT NULL)
  ),
  CONSTRAINT einvoice_lookup_has_a_page CHECK ((lookup_code IS NULL) = (lookup_url IS NULL)),
  CONSTRAINT einvoice_failure_says_why CHECK (status <> 'failed_permanent' OR last_error_code IS NOT NULL),
  CONSTRAINT einvoice_provider_key CHECK (provider ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT einvoice_seller_is_object CHECK (jsonb_typeof(seller) = 'object'),
  CONSTRAINT einvoice_buyer_is_object CHECK (jsonb_typeof(buyer) = 'object'),
  CONSTRAINT einvoice_amounts_is_object CHECK (jsonb_typeof(amounts) = 'object')
);

-- A provider numbers each template's invoices once; two rows with one number are one
-- invoice recorded twice.
CREATE UNIQUE INDEX einvoice_number_once ON einvoice (tenant_id, provider, template_symbol, number)
  WHERE number IS NOT NULL;
CREATE INDEX einvoice_tenant_id_branch_id_business_date_idx ON einvoice (tenant_id, branch_id, business_date);
CREATE INDEX einvoice_due_idx ON einvoice (tenant_id, next_attempt_at)
  WHERE status IN ('pending', 'failed_retryable');
CREATE INDEX einvoice_tenant_id_adjusts_idx ON einvoice (tenant_id, adjusts_einvoice_id)
  WHERE adjusts_einvoice_id IS NOT NULL;

ALTER TABLE einvoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice FORCE ROW LEVEL SECURITY;
CREATE POLICY einvoice_tenant_isolation ON einvoice
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- An issued invoice is a document the customer holds: what it says never changes (being
-- listed in a day's batch is all that may still happen to it). No invoice row is ever
-- deleted, issued or not: a sale must keep its invoice, or the record of why it has none.
CREATE FUNCTION refuse_issued_einvoice_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'einvoice % cannot be deleted', OLD.id;
  END IF;
  IF OLD.status = 'issued'
     AND to_jsonb(NEW) - ARRAY['batch_id', 'version', 'updated_at']
       <> to_jsonb(OLD) - ARRAY['batch_id', 'version', 'updated_at'] THEN
    RAISE EXCEPTION 'einvoice % is issued: its content cannot change', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER einvoice_issued_is_immutable
  BEFORE UPDATE OR DELETE ON einvoice
  FOR EACH ROW EXECUTE FUNCTION refuse_issued_einvoice_change();

-- Work waiting for an outside service, across tenants. The worker has to find which
-- tenants have something due before it can open any tenant's rows, and row level security
-- shows it none until it does. This index holds only (what, which row, whose, which lane,
-- when), kept by a trigger running as the owner; the app role has no privilege on it and
-- asks through one function that answers tenant ids, never the rows. The lane is the
-- provider the work goes to: a worker asks only for the lanes it has an adapter for, so
-- workers can be split by provider and none ever burns attempts on work it cannot do.
CREATE SCHEMA fnb_jobs;
GRANT USAGE ON SCHEMA fnb_jobs TO PUBLIC;

CREATE TABLE fnb_jobs.queued_work (
  kind text NOT NULL,
  subject_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES organization (id),
  lane text NOT NULL,
  due_at timestamptz NOT NULL,
  PRIMARY KEY (kind, subject_id)
);

CREATE INDEX queued_work_lane_due_at_idx ON fnb_jobs.queued_work (lane, due_at);

-- A row is listed while its status is pending or failed_retryable, under its table's name.
CREATE FUNCTION fnb_jobs.index_queued_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM fnb_jobs.queued_work WHERE kind = TG_TABLE_NAME AND subject_id = OLD.id;
  ELSIF NEW.status IN ('pending', 'failed_retryable') THEN
    INSERT INTO fnb_jobs.queued_work (kind, subject_id, tenant_id, lane, due_at)
    VALUES (TG_TABLE_NAME, NEW.id, NEW.tenant_id, NEW.provider, NEW.next_attempt_at)
    ON CONFLICT (kind, subject_id) DO UPDATE SET due_at = EXCLUDED.due_at;
  ELSE
    DELETE FROM fnb_jobs.queued_work WHERE kind = TG_TABLE_NAME AND subject_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER einvoice_queued_work
  AFTER INSERT OR DELETE OR UPDATE OF status, next_attempt_at ON einvoice
  FOR EACH ROW EXECUTE FUNCTION fnb_jobs.index_queued_work();

-- The tenants with work due by p_now in one of p_lanes, the longest-waiting first. The
-- caller passes the time, as everywhere: the API's clock is the only clock.
CREATE FUNCTION fnb_jobs.tenants_with_due_work(p_now timestamptz, p_lanes text[], p_limit integer)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT tenant_id FROM fnb_jobs.queued_work WHERE due_at <= p_now AND lane = ANY (p_lanes)
  GROUP BY tenant_id ORDER BY min(due_at), tenant_id LIMIT p_limit
$$;

-- Who may call it is the deployment's grant, as for fnb_auth.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA fnb_jobs FROM PUBLIC;
