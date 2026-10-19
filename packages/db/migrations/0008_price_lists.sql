-- Price lists: rules that change a catalog price for some products at some branches,
-- channels and times ("Grab price", "happy hour 20% off drinks, Mon–Fri 14:00–17:00").
-- The columns mirror the domain's PriceListItem, and the CHECK constraints repeat its
-- per-item rules, so an item the domain would refuse cannot be stored either.

CREATE TABLE price_list (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT price_list_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT price_list_brand_fkey FOREIGN KEY (tenant_id, brand_id) REFERENCES brand (tenant_id, id)
);

CREATE INDEX price_list_tenant_id_brand_id_idx ON price_list (tenant_id, brand_id);

CREATE TABLE price_list_item (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  scope_kind text NOT NULL,
  -- Null exactly for the global scope.
  scope_id uuid,
  -- scope_id names a row of a different table per scope_kind, which no single foreign key
  -- can check. These columns split it by kind so each gets a real (tenant_id, id) key, as
  -- for config_value: without them an item could price another tenant's product by its id.
  variant_id uuid GENERATED ALWAYS AS (CASE WHEN scope_kind = 'variant' THEN scope_id END) STORED,
  product_id uuid GENERATED ALWAYS AS (CASE WHEN scope_kind = 'product' THEN scope_id END) STORED,
  category_id uuid GENERATED ALWAYS AS (CASE WHEN scope_kind = 'category' THEN scope_id END) STORED,
  branch_id uuid,
  channel_key text,
  valid_from timestamptz,
  valid_to timestamptz,
  -- 0 = Sunday … 6 = Saturday, in the branch's local time.
  days_of_week integer[],
  -- Minutes of the branch's local day; the end is excluded and may be 1440 (midnight).
  -- A start after the end crosses midnight.
  start_minute integer,
  end_minute integer,
  effect_kind text NOT NULL,
  fixed_price bigint,
  percent_off_bp integer,
  rounding text,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT price_list_item_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT price_list_item_price_list_fkey FOREIGN KEY (tenant_id, price_list_id)
    REFERENCES price_list (tenant_id, id),
  CONSTRAINT price_list_item_variant_fkey FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variant (tenant_id, id),
  CONSTRAINT price_list_item_product_fkey FOREIGN KEY (tenant_id, product_id)
    REFERENCES product (tenant_id, id),
  CONSTRAINT price_list_item_category_fkey FOREIGN KEY (tenant_id, category_id)
    REFERENCES category (tenant_id, id),
  CONSTRAINT price_list_item_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT price_list_item_scope_known CHECK (
    scope_kind IN ('variant', 'product', 'category', 'global')
    AND (scope_kind = 'global') = (scope_id IS NULL)
  ),
  CONSTRAINT price_list_item_channel_key_not_empty CHECK (channel_key <> ''),
  CONSTRAINT price_list_item_validity_ordered CHECK (valid_from < valid_to),
  CONSTRAINT price_list_item_days_of_week_range CHECK (
    cardinality(days_of_week) >= 1 AND days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
  ),
  CONSTRAINT price_list_item_time_window CHECK (
    (start_minute IS NULL) = (end_minute IS NULL)
    AND start_minute BETWEEN 0 AND 1439
    AND end_minute BETWEEN 0 AND 1440
    AND start_minute <> end_minute
  ),
  -- One effect, with exactly the columns it needs. A fixed price for a whole category or
  -- menu would flatten items that cost different amounts, so it needs a narrow scope.
  -- IS NOT NULL is spelled out: a comparison with NULL would let the CHECK pass.
  CONSTRAINT price_list_item_effect CHECK (
    (effect_kind = 'fixed_price' AND fixed_price IS NOT NULL AND fixed_price >= 0
      AND percent_off_bp IS NULL AND rounding IS NULL AND scope_kind IN ('variant', 'product'))
    OR (effect_kind = 'percent_off' AND fixed_price IS NULL
      AND percent_off_bp IS NOT NULL AND percent_off_bp BETWEEN 0 AND 10000
      AND rounding IS NOT NULL AND rounding IN ('down', 'up', 'half-up', 'half-even'))
  )
);

CREATE INDEX price_list_item_tenant_id_price_list_id_idx ON price_list_item (tenant_id, price_list_id);
CREATE INDEX price_list_item_tenant_id_variant_id_idx ON price_list_item (tenant_id, variant_id) WHERE variant_id IS NOT NULL;
CREATE INDEX price_list_item_tenant_id_product_id_idx ON price_list_item (tenant_id, product_id) WHERE product_id IS NOT NULL;
CREATE INDEX price_list_item_tenant_id_category_id_idx ON price_list_item (tenant_id, category_id) WHERE category_id IS NOT NULL;

ALTER TABLE price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list FORCE ROW LEVEL SECURITY;
CREATE POLICY price_list_tenant_isolation ON price_list
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE price_list_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_item FORCE ROW LEVEL SECURITY;
CREATE POLICY price_list_item_tenant_isolation ON price_list_item
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
