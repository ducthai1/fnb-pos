-- A manager in the backoffice hands QR money back with cash from a till's drawer: the cash
-- move that takes it out of that open shift is theirs, not a till staff member's, and it
-- always hands a QR's money back. Exactly one of the two names who moved the cash.
ALTER TABLE cash_move
  ALTER COLUMN staff_id DROP NOT NULL,
  ADD COLUMN app_user_id uuid,
  ADD CONSTRAINT cash_move_app_user_fkey FOREIGN KEY (tenant_id, app_user_id)
    REFERENCES app_user (tenant_id, id),
  ADD CONSTRAINT cash_move_moved_by_one CHECK ((staff_id IS NULL) <> (app_user_id IS NULL)),
  ADD CONSTRAINT cash_move_by_app_user_hands_back CHECK (
    app_user_id IS NULL OR payment_intent_id IS NOT NULL
  );
