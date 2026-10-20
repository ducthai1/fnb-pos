-- The server decides when a payment happened: paid_at and sold_at hold the till's time kept
-- within what the server accepts (no later than when it received the command, no more than
-- 12 hours before). Beside them, what the till's clock showed and when the server received
-- the command, so a figure in a report or on an invoice can always be traced to both clocks.
-- Null on rows written before the server began keeping them.
ALTER TABLE sales_order
  ADD COLUMN paid_at_device timestamptz,
  ADD COLUMN paid_received_at timestamptz;

ALTER TABLE einvoice
  ADD COLUMN sold_at_device timestamptz,
  ADD COLUMN sold_received_at timestamptz;
