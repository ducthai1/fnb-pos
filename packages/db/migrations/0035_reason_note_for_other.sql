-- A void, a cancel or a refund whose reason is none of the shop's list ("other") says what
-- happened in a few words of the staff member's own: a cancelled draft and a refund keep the
-- note on their order, a void on its record. Rows written before carry none.
ALTER TABLE sales_order
  ADD COLUMN reason_note text,
  ADD CONSTRAINT sales_order_reason_note_length
    CHECK (reason_note IS NULL OR char_length(reason_note) BETWEEN 1 AND 120);

ALTER TABLE line_void_record
  ADD COLUMN reason_note text,
  ADD CONSTRAINT line_void_record_reason_note_length
    CHECK (reason_note IS NULL OR char_length(reason_note) BETWEEN 1 AND 120);
