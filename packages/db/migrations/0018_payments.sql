-- Payment by bank transfer to a VietQR the till shows: what the till asked for
-- (payment_intent), what a payment gateway reported arriving in the branch's account
-- (bank_transaction), and the secret each branch's gateway signs its notices with
-- (payment_webhook_endpoint). A sale is paid with an intent only once the bank's money
-- was matched to it, exactly.

-- The till draws the id and the transfer code, so a QR goes up while the shop is offline.
-- A matched transfer is named without a foreign key: bank_transaction is append-only, and
-- a reference into it would make TRUNCATE fail on the reference instead of its trigger.
CREATE TABLE payment_intent (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  order_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  device_id uuid NOT NULL,
  amount bigint NOT NULL,
  content_code text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  matched_transaction_id uuid,
  received_amount bigint,
  matched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT payment_intent_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_intent_order_fkey FOREIGN KEY (tenant_id, order_id) REFERENCES sales_order (tenant_id, id),
  CONSTRAINT payment_intent_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT payment_intent_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT payment_intent_amount_positive CHECK (amount > 0),
  CONSTRAINT payment_intent_status_known CHECK (
    status IN ('pending', 'paid', 'partial', 'overpaid', 'expired', 'cancelled')
  ),
  -- FNB and eight symbols of Crockford's base32, the alphabet without I, L, O and U.
  CONSTRAINT payment_intent_content_code_format CHECK (content_code ~ '^FNB[0-9A-HJKMNP-TV-Z]{8}$'),
  -- Settled exactly when a transfer was matched, and then with what that transfer brought.
  CONSTRAINT payment_intent_matched_when_settled CHECK (
    (matched_transaction_id IS NOT NULL) = (status IN ('paid', 'partial', 'overpaid'))
  ),
  CONSTRAINT payment_intent_received_with_match CHECK (
    (matched_transaction_id IS NULL) = (received_amount IS NULL)
    AND (matched_transaction_id IS NULL) = (matched_at IS NULL)
  ),
  CONSTRAINT payment_intent_received_positive CHECK (received_amount > 0),
  -- One transfer pays one intent: a second intent can never claim money already counted.
  CONSTRAINT payment_intent_one_per_transaction UNIQUE (tenant_id, matched_transaction_id)
);

-- A transfer is matched to the pending intent whose code it mentions, so a live code names
-- one intent of the shop. Settled and withdrawn intents leave the index.
CREATE UNIQUE INDEX payment_intent_live_content_code ON payment_intent (tenant_id, content_code)
  WHERE status = 'pending';
-- One live QR per order: two would let the customer pay the order twice.
CREATE UNIQUE INDEX payment_intent_one_pending_per_order ON payment_intent (tenant_id, order_id)
  WHERE status = 'pending';
CREATE INDEX payment_intent_tenant_id_order_id_idx ON payment_intent (tenant_id, order_id);
CREATE INDEX payment_intent_tenant_id_branch_id_idx ON payment_intent (tenant_id, branch_id);
CREATE INDEX payment_intent_tenant_id_device_id_idx ON payment_intent (tenant_id, device_id);

-- A transfer as the gateway reported it, kept whatever happens to it next: evidence for
-- the end-of-day reconciliation against the bank statement. reference_code is the
-- gateway's own id for the transfer, so a notice delivered again is the same row.
CREATE TABLE bank_transaction (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  gateway text NOT NULL,
  reference_code text NOT NULL,
  amount bigint NOT NULL,
  content text NOT NULL,
  transfer_type text NOT NULL,
  -- When the bank says the money moved, and when the notice reached the server: a QR is
  -- matched by the second, which a till's or a bank's clock cannot move.
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bank_transaction_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT bank_transaction_once_per_gateway_reference UNIQUE (tenant_id, gateway, reference_code),
  CONSTRAINT bank_transaction_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT bank_transaction_gateway_key CHECK (gateway ~ '^[a-z][a-z0-9_]{0,31}$'),
  CONSTRAINT bank_transaction_reference_not_blank CHECK (btrim(reference_code) <> ''),
  CONSTRAINT bank_transaction_amount_positive CHECK (amount > 0),
  CONSTRAINT bank_transaction_transfer_type_known CHECK (transfer_type IN ('in', 'out'))
);

CREATE INDEX bank_transaction_tenant_id_branch_id_received_at_idx
  ON bank_transaction (tenant_id, branch_id, received_at);

-- The secret a branch's gateway proves its notices with, encrypted by the server's key so a
-- copy of the database alone cannot forge a payment. One per branch and gateway.
CREATE TABLE payment_webhook_endpoint (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  gateway text NOT NULL,
  secret_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT payment_webhook_endpoint_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT payment_webhook_endpoint_once_per_branch_gateway UNIQUE (tenant_id, branch_id, gateway),
  CONSTRAINT payment_webhook_endpoint_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT payment_webhook_endpoint_gateway_key CHECK (gateway ~ '^[a-z][a-z0-9_]{0,31}$'),
  -- A versioned envelope (version, iv, tag, ciphertext), never the secret itself.
  CONSTRAINT payment_webhook_endpoint_secret_sealed CHECK (secret_ciphertext ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
);

-- The intent a QR transfer paid with. One-way on purpose: a refund may still hand money
-- back by transfer, which no intent stands behind.
ALTER TABLE payment
  ADD COLUMN payment_intent_id uuid,
  ADD CONSTRAINT payment_intent_fkey FOREIGN KEY (tenant_id, payment_intent_id) REFERENCES payment_intent (tenant_id, id),
  ADD CONSTRAINT payment_intent_only_for_qr_transfer CHECK (
    payment_intent_id IS NULL OR (method = 'qr_transfer' AND amount > 0)
  );

-- An intent's money is counted once, by one payment.
CREATE UNIQUE INDEX payment_one_per_intent ON payment (tenant_id, payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

ALTER TABLE payment_intent ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intent FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_intent_tenant_isolation ON payment_intent
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE bank_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transaction FORCE ROW LEVEL SECURITY;
CREATE POLICY bank_transaction_tenant_isolation ON bank_transaction
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE payment_webhook_endpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_webhook_endpoint FORCE ROW LEVEL SECURITY;
CREATE POLICY payment_webhook_endpoint_tenant_isolation ON payment_webhook_endpoint
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Append-only, as the audit trail: privileges stop the app role, the statement trigger
-- (refuse_append_only_change, from the audit migration) stops the owner as well.
REVOKE UPDATE, DELETE, TRUNCATE ON bank_transaction FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid = 'bank_transaction'::regclass
      AND acl.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON bank_transaction FROM %I', grantee_name);
  END LOOP;
END
$$;

CREATE TRIGGER bank_transaction_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON bank_transaction
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
