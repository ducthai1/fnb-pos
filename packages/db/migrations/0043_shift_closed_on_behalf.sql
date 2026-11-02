-- A shift a manager closed from the backoffice on behalf of a till that was revoked while
-- the shift was open. Only the till's own shift.close used to settle a shift, and a revoked
-- till can send none (pairing it again makes a new device), so its shift stayed open for
-- good and the branch's business day could never close. The manager counts the drawer and
-- the close records who did it: a backoffice user instead of a staff member, never both.
-- No row changes: every closed shift so far was closed by its staff member.
ALTER TABLE shift
  ADD COLUMN closed_by_app_user_id uuid,
  ADD CONSTRAINT shift_closed_by_app_user_fkey FOREIGN KEY (tenant_id, closed_by_app_user_id)
    REFERENCES app_user (tenant_id, id),
  DROP CONSTRAINT shift_close_is_recorded,
  ADD CONSTRAINT shift_close_is_recorded CHECK (
    (status = 'closed') = (
      closed_at IS NOT NULL
      AND (closed_by_staff_id IS NOT NULL) <> (closed_by_app_user_id IS NOT NULL)
      AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL AND difference IS NOT NULL
      AND open_orders_carried IS NOT NULL
    )
  ),
  ADD CONSTRAINT shift_closed_by_app_user_only_when_closed CHECK (
    closed_by_app_user_id IS NULL OR status = 'closed'
  );
