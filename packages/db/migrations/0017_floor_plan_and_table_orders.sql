-- The floor plan (where each table stands, its shape and seats) and orders seated at a
-- table or carrying a table tag.
--
-- A table that orders were ever seated at is archived, never deleted: those orders, and
-- the reports grouping sales by table, keep pointing at it. Areas are archived likewise
-- once a table of theirs is.

ALTER TABLE area
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN archived_at timestamptz,
  ADD CONSTRAINT area_name_not_blank CHECK (btrim(name) <> '');

-- Position and size are in the floor editor's own units, from the plan's top left corner;
-- the POS scales the plan to its screen, so no unit here is a pixel of any device.
ALTER TABLE dining_table
  ADD COLUMN x integer NOT NULL DEFAULT 0,
  ADD COLUMN y integer NOT NULL DEFAULT 0,
  ADD COLUMN width integer NOT NULL DEFAULT 80,
  ADD COLUMN height integer NOT NULL DEFAULT 80,
  ADD COLUMN shape text NOT NULL DEFAULT 'rectangle',
  ADD COLUMN seats integer NOT NULL DEFAULT 4,
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN archived_at timestamptz,
  ADD CONSTRAINT dining_table_name_not_blank CHECK (btrim(name) <> ''),
  ADD CONSTRAINT dining_table_position_not_negative CHECK (x >= 0 AND y >= 0),
  ADD CONSTRAINT dining_table_size_positive CHECK (width > 0 AND height > 0),
  ADD CONSTRAINT dining_table_shape_known CHECK (shape IN ('rectangle', 'circle')),
  ADD CONSTRAINT dining_table_seats_positive CHECK (seats > 0);

-- table_id (already there) is the table a dine-in order holds; the name is kept as it was
-- when the order sat down, so a receipt reprinted after the table is renamed still says
-- where the guests sat. table_tag is a counter order's table number written down so the
-- drink is brought over: it holds no table, and two counter orders may carry one tag.
-- pre_bill_printed_version is the order version a pre-bill was printed for; any later
-- change bumps the version, so "waiting to pay" can never outlive the bill it showed.
ALTER TABLE sales_order
  ADD COLUMN table_name_snapshot text,
  ADD COLUMN table_tag text,
  ADD COLUMN pre_bill_printed_version integer,
  ADD CONSTRAINT sales_order_table_name_with_table CHECK (
    (table_id IS NULL) = (table_name_snapshot IS NULL)
  ),
  ADD CONSTRAINT sales_order_table_or_tag CHECK (table_id IS NULL OR table_tag IS NULL),
  ADD CONSTRAINT sales_order_table_tag_not_blank CHECK (btrim(table_tag) <> ''),
  ADD CONSTRAINT sales_order_table_only_dine_in CHECK (
    (table_id IS NULL AND table_tag IS NULL) OR service_type = 'dine_in'
  ),
  ADD CONSTRAINT sales_order_pre_bill_version_positive CHECK (pre_bill_printed_version > 0);

-- One open order per table. Two tills seating guests at one table at once would otherwise
-- each keep a bill for it, and whichever is paid first leaves the other's items unpaid;
-- the second save fails on this index instead of overwriting or splitting the table.
-- A paid or cancelled order leaves the index, which is what frees the table.
CREATE UNIQUE INDEX sales_order_one_draft_per_table ON sales_order (tenant_id, table_id)
  WHERE status = 'draft' AND table_id IS NOT NULL;
