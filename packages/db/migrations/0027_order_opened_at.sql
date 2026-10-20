-- When an order was opened, as the server decided it: the effective time of the command
-- that opened it (the till's time kept within what the server accepts), not when it
-- reached the server, so a table opened while the shop was offline shows how long its
-- guests have really sat. Null on orders opened before the server kept it; readers fall
-- back to created_at.
ALTER TABLE sales_order ADD COLUMN opened_at timestamptz;
