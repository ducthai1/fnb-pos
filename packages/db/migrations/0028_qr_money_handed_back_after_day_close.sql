-- QR money handed back once its business day was closed: the close froze that day's
-- figures (its handed-back QR money included), so a later handing back is marked and the
-- day's live report leaves it out, listing it beside the close instead, as it does for an
-- order paid after the close. The money did go back that day; it is not moved to another.
-- Set by the database when the refund is marked, whoever marks it.
ALTER TABLE payment_intent
  ADD COLUMN refunded_after_day_close boolean NOT NULL DEFAULT false;

CREATE FUNCTION mark_qr_refunded_after_day_close() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.refunded_after_day_close := EXISTS (
    SELECT 1 FROM day_close d
    WHERE d.tenant_id = NEW.tenant_id
      AND d.branch_id = NEW.branch_id
      AND d.business_date = NEW.refund_business_date
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_intent_refunded_after_day_close
  BEFORE UPDATE OF refunded_at ON payment_intent
  FOR EACH ROW WHEN (OLD.refunded_at IS NULL AND NEW.refunded_at IS NOT NULL)
  EXECUTE FUNCTION mark_qr_refunded_after_day_close();

-- The mark is part of the handing back, kept as it is like the rest of it.
CREATE OR REPLACE FUNCTION refuse_payment_intent_refund_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.refunded_at IS NULL OR (
    NEW.refunded_at, NEW.refunded_by_app_user_id, NEW.refund_method, NEW.refund_note,
    NEW.refund_business_date, NEW.refunded_after_day_close
  ) IS NOT DISTINCT FROM (
    OLD.refunded_at, OLD.refunded_by_app_user_id, OLD.refund_method, OLD.refund_note,
    OLD.refund_business_date, OLD.refunded_after_day_close
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'payment_intent % was handed back: % of the refund is not allowed', OLD.id, TG_OP;
END;
$$;
