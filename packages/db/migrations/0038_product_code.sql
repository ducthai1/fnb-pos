-- A product's code (mã hàng): what a shop's own sheets, a spreadsheet import and a barcode
-- label name it by, kept apart from its name so a rename never splits its sales history. 1 to
-- 40 letters, digits, dots, underscores and dashes, unique within a brand ignoring case among
-- the products still on the menu (an archived product gives its code back).
--
-- Products that already exist are given SP00001, SP00002... per brand, oldest first. The
-- migration runs as the table owner, which the row-level security policy binds too (FORCE),
-- so a plain UPDATE would see no rows: the owner switches the policy off for the duration of
-- this transaction and on again before it commits, no other session sees the table open.
ALTER TABLE product ADD COLUMN code text;

ALTER TABLE product DISABLE ROW LEVEL SECURITY;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY tenant_id, brand_id ORDER BY created_at, id) AS n
  FROM product
)
UPDATE product
SET code = 'SP' || lpad(numbered.n::text, 5, '0')
FROM numbered
WHERE product.id = numbered.id;

ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product FORCE ROW LEVEL SECURITY;

ALTER TABLE product
  ALTER COLUMN code SET NOT NULL,
  ADD CONSTRAINT product_code_format CHECK (code ~ '^[A-Za-z0-9._-]{1,40}$');

CREATE UNIQUE INDEX product_brand_code_key
  ON product (tenant_id, brand_id, lower(code))
  WHERE archived_at IS NULL;
