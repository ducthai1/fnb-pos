-- What a weighed product's price is per: a kilogram, or 100 g (a "lạng"). The cashier types
-- the weight in whole grams and the line's quantity is that weight in this unit. Set on
-- weighed products only; one saved as weighed before units existed is priced per kilogram,
-- which is what its price meant until now (a weight in kilograms).
ALTER TABLE product
  ADD COLUMN measure_unit text
    CONSTRAINT product_measure_unit_known CHECK (measure_unit IN ('kg', '100g'));

UPDATE product SET measure_unit = 'kg' WHERE pricing_mode = 'weighed';

ALTER TABLE product
  ADD CONSTRAINT product_measure_unit_only_when_weighed
    CHECK ((pricing_mode = 'weighed') = (measure_unit IS NOT NULL));
