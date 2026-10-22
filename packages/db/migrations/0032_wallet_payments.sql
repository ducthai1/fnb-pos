-- Payment through an e-wallet (ZaloPay first; MoMo, VNPay later): the server asks the
-- wallet for a payment of the order's amount, the customer scans the wallet's QR and
-- confirms in the wallet's app, and the wallet's signed notice (or the server asking it
-- again) settles the intent. A wallet intent is a payment_intent like a VietQR one: one
-- live intent per order, the same statuses, the same rule that only an exact payment
-- closes the order, and the money it brought kept in bank_transaction under the wallet's
-- key, so the lists of money no sale counts cover wallets too.

-- wallet: the wallet's key, null for a bank transfer to the branch's VietQR. gateway_ref:
-- the server's id for the payment at the wallet (ZaloPay's app_trans_id), unique per
-- wallet so a notice names one intent. wallet_qr: what the customer scans (or the
-- wallet's payment page), shown again if the till asks twice. next_query_at: when the
-- server next asks the wallet about a pending intent, since a wallet's notice may never
-- arrive (a sandbox cannot reach a shop's server at all); null once nothing is pending.
ALTER TABLE payment_intent
  ADD COLUMN wallet text,
  ADD COLUMN gateway_ref text,
  ADD COLUMN wallet_qr text,
  ADD COLUMN next_query_at timestamptz,
  ADD COLUMN query_attempts integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT payment_intent_wallet_key CHECK (wallet ~ '^[a-z][a-z0-9_]{0,31}$'),
  ADD CONSTRAINT payment_intent_wallet_ref_together CHECK ((wallet IS NULL) = (gateway_ref IS NULL)),
  ADD CONSTRAINT payment_intent_wallet_only_fields CHECK (
    wallet IS NOT NULL OR (wallet_qr IS NULL AND next_query_at IS NULL)
  ),
  ADD CONSTRAINT payment_intent_gateway_ref_not_blank CHECK (btrim(gateway_ref) <> ''),
  ADD CONSTRAINT payment_intent_query_attempts_counted CHECK (query_attempts >= 0),
  ADD CONSTRAINT payment_intent_once_per_wallet_ref UNIQUE (tenant_id, wallet, gateway_ref);

-- A branch turns a wallet on or off without losing the keys it saved. The wallet's keys
-- live where the bank gateways' secrets do (sealed by the server's key, one row per branch
-- and gateway); a bank gateway's row is always on.
ALTER TABLE payment_webhook_endpoint
  ADD COLUMN enabled boolean NOT NULL DEFAULT true;

-- Pending wallet intents are found by the poller across tenants the way waiting invoices
-- are: through fnb_jobs.queued_work, in the wallet's lane, due when it is next asked.
CREATE FUNCTION fnb_jobs.index_wallet_intent_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM fnb_jobs.queued_work WHERE kind = TG_TABLE_NAME AND subject_id = OLD.id;
  ELSIF NEW.wallet IS NOT NULL AND NEW.status = 'pending' AND NEW.next_query_at IS NOT NULL THEN
    INSERT INTO fnb_jobs.queued_work (kind, subject_id, tenant_id, lane, due_at)
    VALUES (TG_TABLE_NAME, NEW.id, NEW.tenant_id, NEW.wallet, NEW.next_query_at)
    ON CONFLICT (kind, subject_id) DO UPDATE SET due_at = EXCLUDED.due_at;
  ELSE
    DELETE FROM fnb_jobs.queued_work WHERE kind = TG_TABLE_NAME AND subject_id = NEW.id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER payment_intent_wallet_queued_work
  AFTER INSERT OR DELETE OR UPDATE OF status, next_query_at ON payment_intent
  FOR EACH ROW EXECUTE FUNCTION fnb_jobs.index_wallet_intent_work();

REVOKE EXECUTE ON FUNCTION fnb_jobs.index_wallet_intent_work() FROM PUBLIC;
