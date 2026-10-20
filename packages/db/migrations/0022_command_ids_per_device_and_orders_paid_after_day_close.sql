-- A command id belongs to the till that made it. The server answers a command sent again by
-- its id, so with ids unique across the tenant a till that drew an id another till had used
-- (a cloned install, a broken generator, a till probing) was handed that till's answer and
-- its order, and its own sequence stalled on a command it believed applied. Each till now
-- keeps its own ids; a till sending an id another till already used is refused on its own
-- sequence, and the lookup by id alone finds who used it first.
ALTER TABLE applied_command DROP CONSTRAINT applied_command_once;
ALTER TABLE applied_command
  ADD CONSTRAINT applied_command_once_per_device UNIQUE (tenant_id, device_id, command_id);
CREATE INDEX applied_command_tenant_id_command_id_idx ON applied_command (tenant_id, command_id);

-- An order settled into a business day the branch has already closed. The close keeps the
-- day's figures as they stood, and the day's report must keep agreeing with them, so such an
-- order is marked when it is paid and the report lists it beside the day, not in it. Cash
-- taken by a till that was offline at the close cannot be refused, so it is marked, not
-- stopped. Set by the database whoever settles the order (a sale or a refund).
ALTER TABLE sales_order ADD COLUMN paid_after_day_close boolean NOT NULL DEFAULT false;

CREATE FUNCTION mark_order_paid_after_day_close() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.paid_after_day_close := EXISTS (
    SELECT 1 FROM day_close d
    WHERE d.tenant_id = NEW.tenant_id
      AND d.branch_id = NEW.branch_id
      AND d.business_date = NEW.business_date
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_paid_after_day_close
  BEFORE UPDATE OF status ON sales_order
  FOR EACH ROW WHEN (OLD.status = 'draft' AND NEW.status = 'paid')
  EXECUTE FUNCTION mark_order_paid_after_day_close();
