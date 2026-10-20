-- Closing a branch's business day, and the day's invoices sent on to the tax authority.
--
-- A day is closed once: no cash shift of it still open, and every invoice of its sales out
-- of the queue. The close is kept as it was (append-only), with the day's figures as they
-- stood, so a sale synced later can never move what was reported as closed. The batch
-- sending the day's issued invoices on (the regime asks for it daily, with a fine for late
-- data) is queued work like an invoice: a provider that is down when the day is closed
-- gets it later.

CREATE TABLE einvoice_daily_batch (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  business_date date NOT NULL,
  provider text NOT NULL,
  regime_version text NOT NULL,
  -- The seller the batch's invoices were issued as.
  seller jsonb NOT NULL,
  invoice_count integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  last_error_code text,
  reference text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT einvoice_daily_batch_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT einvoice_daily_batch_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT einvoice_daily_batch_status_known CHECK (
    status IN ('pending', 'submitted', 'failed_retryable', 'failed_permanent')
  ),
  CONSTRAINT einvoice_daily_batch_queued_has_a_due_time CHECK (
    (status IN ('pending', 'failed_retryable')) = (next_attempt_at IS NOT NULL)
  ),
  CONSTRAINT einvoice_daily_batch_submitted_has_a_receipt CHECK (
    (status = 'submitted') = (reference IS NOT NULL AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT einvoice_daily_batch_failure_says_why CHECK (
    status <> 'failed_permanent' OR last_error_code IS NOT NULL
  ),
  CONSTRAINT einvoice_daily_batch_attempts_not_negative CHECK (attempts >= 0),
  CONSTRAINT einvoice_daily_batch_invoice_count_not_negative CHECK (invoice_count >= 0),
  CONSTRAINT einvoice_daily_batch_provider_key CHECK (provider ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT einvoice_daily_batch_seller_is_object CHECK (jsonb_typeof(seller) = 'object')
);

CREATE INDEX einvoice_daily_batch_tenant_id_branch_id_business_date_idx
  ON einvoice_daily_batch (tenant_id, branch_id, business_date);

ALTER TABLE einvoice_daily_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE einvoice_daily_batch FORCE ROW LEVEL SECURITY;
CREATE POLICY einvoice_daily_batch_tenant_isolation ON einvoice_daily_batch
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Waiting batches are found by the worker the way waiting invoices are.
CREATE TRIGGER einvoice_daily_batch_queued_work
  AFTER INSERT OR DELETE OR UPDATE OF status, next_attempt_at ON einvoice_daily_batch
  FOR EACH ROW EXECUTE FUNCTION fnb_jobs.index_queued_work();

-- The batch an issued invoice was sent in; an invoice is sent in one batch at most.
ALTER TABLE einvoice
  ADD COLUMN batch_id uuid,
  ADD CONSTRAINT einvoice_batch_fkey FOREIGN KEY (tenant_id, batch_id)
    REFERENCES einvoice_daily_batch (tenant_id, id),
  ADD CONSTRAINT einvoice_batched_when_issued CHECK (batch_id IS NULL OR status = 'issued');

CREATE INDEX einvoice_tenant_id_batch_id_idx ON einvoice (tenant_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE TABLE day_close (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  business_date date NOT NULL,
  closed_by_app_user_id uuid NOT NULL,
  -- By the API's clock.
  closed_at timestamptz NOT NULL,
  -- The day's report as it stood at the close.
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT day_close_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT day_close_once_per_branch_day UNIQUE (tenant_id, branch_id, business_date),
  CONSTRAINT day_close_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT day_close_closed_by_fkey FOREIGN KEY (tenant_id, closed_by_app_user_id)
    REFERENCES app_user (tenant_id, id),
  CONSTRAINT day_close_summary_is_object CHECK (jsonb_typeof(summary) = 'object')
);

ALTER TABLE day_close ENABLE ROW LEVEL SECURITY;
ALTER TABLE day_close FORCE ROW LEVEL SECURITY;
CREATE POLICY day_close_tenant_isolation ON day_close
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Append-only, as the audit trail: privileges stop the app role, the statement trigger
-- (refuse_append_only_change, from the audit migration) stops the owner as well.
REVOKE UPDATE, DELETE, TRUNCATE ON day_close FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid = 'day_close'::regclass
      AND acl.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON day_close FROM %I', grantee_name);
  END LOOP;
END
$$;

CREATE TRIGGER day_close_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON day_close
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
