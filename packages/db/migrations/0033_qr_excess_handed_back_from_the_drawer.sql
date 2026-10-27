-- A customer who transferred more than the order closes the order with the QR at its own
-- amount, and the cashier hands the excess back in cash from the drawer. What went back is
-- then an amount of its own (only the excess, not all the bank brought), done by a member
-- of staff at the till rather than a backoffice user, and taken out of the shift's drawer as
-- a cash move linked to the QR. Rows handed back before kept all the bank brought: an empty
-- refund_amount reads as received_amount.
ALTER TABLE payment_intent
  ADD COLUMN refund_amount bigint,
  ADD COLUMN refunded_by_staff_id uuid,
  ADD CONSTRAINT payment_intent_refunded_by_staff_fkey FOREIGN KEY (tenant_id, refunded_by_staff_id)
    REFERENCES staff (tenant_id, id),
  ADD CONSTRAINT payment_intent_refund_amount_within_received CHECK (
    refund_amount IS NULL OR (refunded_at IS NOT NULL AND refund_amount > 0
      AND refund_amount <= received_amount)
  );

ALTER TABLE payment_intent DROP CONSTRAINT payment_intent_refund_complete;
ALTER TABLE payment_intent ADD CONSTRAINT payment_intent_refund_complete CHECK (
  (refunded_at IS NULL) = (refunded_by_app_user_id IS NULL AND refunded_by_staff_id IS NULL)
  AND (refunded_by_app_user_id IS NULL OR refunded_by_staff_id IS NULL)
  AND (refunded_at IS NULL) = (refund_method IS NULL)
  AND (refunded_at IS NULL) = (refund_note IS NULL)
  AND (refunded_at IS NULL) = (refund_business_date IS NULL)
);

-- 'cash' is cash from outside any drawer (the owner's pocket, the safe); 'cash_from_drawer'
-- came out of a shift's drawer, which a cash move of that shift records.
ALTER TABLE payment_intent DROP CONSTRAINT payment_intent_refund_method_known;
ALTER TABLE payment_intent ADD CONSTRAINT payment_intent_refund_method_known
  CHECK (refund_method IN ('cash', 'cash_from_drawer', 'bank_transfer'));

-- The cash that left a drawer to hand a QR's money back: one move per QR, always out.
ALTER TABLE cash_move
  ADD COLUMN payment_intent_id uuid,
  ADD CONSTRAINT cash_move_payment_intent_fkey FOREIGN KEY (tenant_id, payment_intent_id)
    REFERENCES payment_intent (tenant_id, id),
  ADD CONSTRAINT cash_move_hand_back_goes_out CHECK (payment_intent_id IS NULL OR kind = 'out');

CREATE UNIQUE INDEX cash_move_one_per_payment_intent ON cash_move (tenant_id, payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

-- The amount and who handed it back are part of the handing back, kept as the rest of it.
CREATE OR REPLACE FUNCTION refuse_payment_intent_refund_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.refunded_at IS NULL OR (
    NEW.refunded_at, NEW.refunded_by_app_user_id, NEW.refunded_by_staff_id, NEW.refund_method,
    NEW.refund_note, NEW.refund_business_date, NEW.refunded_after_day_close, NEW.refund_amount
  ) IS NOT DISTINCT FROM (
    OLD.refunded_at, OLD.refunded_by_app_user_id, OLD.refunded_by_staff_id, OLD.refund_method,
    OLD.refund_note, OLD.refund_business_date, OLD.refunded_after_day_close, OLD.refund_amount
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'payment_intent % was handed back: % of the refund is not allowed', OLD.id, TG_OP;
END;
$$;
