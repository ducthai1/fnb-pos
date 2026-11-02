-- The unit a weighed line's quantity is counted in and its price is per, kept on the line as
-- it was priced. Slips used to read the product's unit as it is now, so changing a product
-- from per kg to per 100 g while an order was open, or reprinting yesterday's bill after the
-- change, printed 0,35 "kg" for a line priced per 100 g. Set on weighed items and the lines
-- that copy them (a void's or a refund's negative item); null on everything else.
ALTER TABLE sales_order_line
  ADD COLUMN measure_unit text
    CONSTRAINT sales_order_line_measure_unit_known CHECK (measure_unit IN ('kg', '100g')),
  ADD CONSTRAINT sales_order_line_measure_unit_on_items
    CHECK (measure_unit IS NULL OR line_type = 'item');

-- Weighed lines sold before this migration get the unit their product had when the line was
-- written: the product's copy in the change feed at or before that moment, which carries the
-- unit since 0036. Without such a copy (a line older than the feed's copies of its product)
-- a line of a product weighed now was priced per kg, the only unit before 0036. A copy that
-- names no unit (the product was not weighed then) leaves the line without one. Paid and
-- cancelled orders are closed documents that refuse changes to their lines; this fills a
-- label the line always meant and changes no amount, so their trigger is held off for it.
-- Every tenant's rows at once, so row level security is held off too, as 0038 does.
ALTER TABLE sales_order_line DISABLE TRIGGER sales_order_line_closed_is_immutable;
ALTER TABLE sales_order_line DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order DISABLE ROW LEVEL SECURITY;
ALTER TABLE product DISABLE ROW LEVEL SECURITY;
ALTER TABLE change_log DISABLE ROW LEVEL SECURITY;

UPDATE sales_order_line l SET measure_unit = picked.unit
FROM (
  SELECT line.id,
    CASE
      WHEN copy.snapshot IS NOT NULL AND copy.snapshot ? 'measureUnit'
        THEN copy.snapshot ->> 'measureUnit'
      WHEN copy.snapshot IS NULL AND p.pricing_mode = 'weighed' THEN 'kg'
    END AS unit
  FROM sales_order_line line
  JOIN sales_order o ON o.tenant_id = line.tenant_id AND o.id = line.order_id
  JOIN product p ON p.tenant_id = line.tenant_id AND p.id = line.product_id
  LEFT JOIN LATERAL (
    SELECT c.snapshot FROM change_log c
    WHERE c.tenant_id = line.tenant_id AND c.branch_id = o.branch_id
      AND c.entity = 'catalog_product' AND c.entity_id = line.product_id
      AND c.created_at <= line.created_at AND jsonb_typeof(c.snapshot) = 'object'
    ORDER BY c.change_seq DESC
    LIMIT 1
  ) copy ON true
  WHERE line.line_type = 'item'
) picked
WHERE l.id = picked.id AND picked.unit IN ('kg', '100g');

-- A negative line (a void's, a refund's) counts its quantity in the unit of the line it takes
-- back, whatever the product's unit was by the time it was written.
UPDATE sales_order_line back SET measure_unit = taken.measure_unit
FROM sales_order_line taken
WHERE back.reverses_line_id = taken.id AND back.tenant_id = taken.tenant_id
  AND back.measure_unit IS DISTINCT FROM taken.measure_unit;

ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log FORCE ROW LEVEL SECURITY;
ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_order_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_line FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_order_line ENABLE TRIGGER sales_order_line_closed_is_immutable;
