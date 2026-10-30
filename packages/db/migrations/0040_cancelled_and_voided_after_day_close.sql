-- 0022 marks an order paid into a business day the branch had already closed, so that the
-- day's report keeps agreeing with the figures the close kept. Orders cancelled and units
-- voided reach the server late in the same way (a till offline through the close tells the
-- server afterwards), and the report counted them: the voids of a closed day, and its
-- cancelled orders, kept changing after the close while its sales did not. They are marked
-- the same way, by the database when the change is written, so no clock decides it.
ALTER TABLE sales_order ADD COLUMN cancelled_after_day_close boolean NOT NULL DEFAULT false;
ALTER TABLE line_void_record ADD COLUMN after_day_close boolean NOT NULL DEFAULT false;

CREATE FUNCTION mark_order_cancelled_after_day_close() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.cancelled_after_day_close := EXISTS (
    SELECT 1 FROM day_close d
    WHERE d.tenant_id = NEW.tenant_id
      AND d.branch_id = NEW.branch_id
      AND d.business_date = NEW.business_date
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_order_cancelled_after_day_close
  BEFORE UPDATE OF status ON sales_order
  FOR EACH ROW WHEN (OLD.status <> 'cancelled' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION mark_order_cancelled_after_day_close();

CREATE FUNCTION mark_void_after_day_close() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.after_day_close := EXISTS (
    SELECT 1 FROM sales_order o
    JOIN day_close d
      ON d.tenant_id = o.tenant_id AND d.branch_id = o.branch_id AND d.business_date = o.business_date
    WHERE o.tenant_id = NEW.tenant_id AND o.id = NEW.order_id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER line_void_record_after_day_close
  BEFORE INSERT ON line_void_record
  FOR EACH ROW EXECUTE FUNCTION mark_void_after_day_close();
