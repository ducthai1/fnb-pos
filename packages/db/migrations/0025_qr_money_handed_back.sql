-- Money the bank brought for a QR that no sale counts (a QR paid short or over, or paid for
-- an order that then closed another way) is the customer's. A person hands it back, in
-- cash or by a transfer back, and marks the QR so: who, when, how, why, and the branch's
-- business day it happened on, which reports it beside the sales, never inside them. The
-- amount is what the bank brought (received_amount): no part of it paid anything.
ALTER TABLE payment_intent
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refunded_by_app_user_id uuid,
  ADD COLUMN refund_method text,
  ADD COLUMN refund_note text,
  ADD COLUMN refund_business_date date,
  ADD CONSTRAINT payment_intent_refunded_by_fkey FOREIGN KEY (tenant_id, refunded_by_app_user_id)
    REFERENCES app_user (tenant_id, id),
  ADD CONSTRAINT payment_intent_refund_complete CHECK (
    (refunded_at IS NULL) = (refunded_by_app_user_id IS NULL)
    AND (refunded_at IS NULL) = (refund_method IS NULL)
    AND (refunded_at IS NULL) = (refund_note IS NULL)
    AND (refunded_at IS NULL) = (refund_business_date IS NULL)
  ),
  ADD CONSTRAINT payment_intent_refund_method_known CHECK (refund_method IN ('cash', 'bank_transfer')),
  ADD CONSTRAINT payment_intent_refund_note_written CHECK (
    btrim(refund_note) <> '' AND length(refund_note) <= 500
  ),
  -- Only money that came can go back.
  ADD CONSTRAINT payment_intent_refunded_when_settled CHECK (
    refunded_at IS NULL OR matched_transaction_id IS NOT NULL
  );

CREATE INDEX payment_intent_tenant_id_branch_id_refund_business_date_idx
  ON payment_intent (tenant_id, branch_id, refund_business_date)
  WHERE refunded_at IS NOT NULL;

-- Money handed back stays handed back: once marked, the marking is never changed or taken
-- back, by the app or the owner (a row trigger binds both). A mistake is for the audit
-- trail and a person, as money that left the shop cannot be un-sent by editing a row.
CREATE FUNCTION refuse_payment_intent_refund_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.refunded_at IS NULL OR (
    NEW.refunded_at, NEW.refunded_by_app_user_id, NEW.refund_method, NEW.refund_note,
    NEW.refund_business_date
  ) IS NOT DISTINCT FROM (
    OLD.refunded_at, OLD.refunded_by_app_user_id, OLD.refund_method, OLD.refund_note,
    OLD.refund_business_date
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'payment_intent % was handed back: % of the refund is not allowed', OLD.id, TG_OP;
END;
$$;

CREATE TRIGGER payment_intent_refund_is_kept
  BEFORE UPDATE ON payment_intent
  FOR EACH ROW EXECUTE FUNCTION refuse_payment_intent_refund_change();
