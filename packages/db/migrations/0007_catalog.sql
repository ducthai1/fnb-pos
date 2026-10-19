-- The menu: what a brand sells, how each item can be customised, and where it is made.
--
-- Money is bigint đồng and rates are integer basis points (10000 = 100%), as in the domain
-- package. The CHECK constraints repeat the domain's cheapest configuration rules (limits in
-- order, no negative prices), so a row written around the API still cannot break them;
-- rules spanning several rows (a minimum the options cannot reach) stay in the domain.
--
-- Products, variants and modifier options are never deleted: past orders, kitchen tickets
-- and reports keep pointing at them. Taking one off the menu sets archived_at instead, and
-- DELETE is revoked from every role but the owner at the end of this file. The rows that
-- only arrange a product (its groups, rules and combo slots) are replaced freely.

CREATE TABLE station (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT station_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT station_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id)
);

CREATE INDEX station_tenant_id_branch_id_idx ON station (tenant_id, branch_id);

CREATE TABLE category (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT category_tenant_id_id_key UNIQUE (tenant_id, id),
  -- Lets a product require a category of its own brand.
  CONSTRAINT category_tenant_id_brand_id_id_key UNIQUE (tenant_id, brand_id, id),
  CONSTRAINT category_brand_fkey FOREIGN KEY (tenant_id, brand_id) REFERENCES brand (tenant_id, id)
);

CREATE TABLE product (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  category_id uuid,
  kind text NOT NULL,
  name text NOT NULL,
  -- Null only where the variants carry the prices, or the cashier enters one.
  base_price bigint,
  pricing_mode text NOT NULL,
  tax_rate_bp integer NOT NULL DEFAULT 0,
  station_id uuid,
  track_stock boolean NOT NULL DEFAULT false,
  earns_points boolean NOT NULL DEFAULT true,
  print_cup_label boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT product_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT product_brand_fkey FOREIGN KEY (tenant_id, brand_id) REFERENCES brand (tenant_id, id),
  CONSTRAINT product_category_fkey FOREIGN KEY (tenant_id, brand_id, category_id)
    REFERENCES category (tenant_id, brand_id, id),
  CONSTRAINT product_station_fkey FOREIGN KEY (tenant_id, station_id) REFERENCES station (tenant_id, id),
  CONSTRAINT product_kind_known CHECK (
    kind IN ('prepared_item', 'prepared_drink', 'retail_item', 'combo', 'service')
  ),
  CONSTRAINT product_pricing_mode_known CHECK (pricing_mode IN ('fixed', 'open_price', 'weighed')),
  CONSTRAINT product_base_price_not_negative CHECK (base_price >= 0),
  CONSTRAINT product_tax_rate_bp_range CHECK (tax_rate_bp BETWEEN 0 AND 10000)
);

CREATE INDEX product_tenant_id_brand_id_idx ON product (tenant_id, brand_id);
CREATE INDEX product_tenant_id_category_id_idx ON product (tenant_id, category_id) WHERE category_id IS NOT NULL;
CREATE INDEX product_tenant_id_station_id_idx ON product (tenant_id, station_id) WHERE station_id IS NOT NULL;

CREATE TABLE product_variant (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL,
  -- Null: sells at the product's base price.
  price bigint,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT product_variant_tenant_id_id_key UNIQUE (tenant_id, id),
  -- Lets a combo option require a variant of the very product it names.
  CONSTRAINT product_variant_tenant_id_product_id_id_key UNIQUE (tenant_id, product_id, id),
  CONSTRAINT product_variant_product_fkey FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id),
  CONSTRAINT product_variant_price_not_negative CHECK (price >= 0)
);

-- Shared by every product it is attached to, so editing "Toppings" once updates them all.
CREATE TABLE modifier_group (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  min_select integer NOT NULL,
  max_select integer NOT NULL,
  allow_duplicates boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT modifier_group_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT modifier_group_limits CHECK (min_select >= 0 AND max_select >= 1 AND min_select <= max_select)
);

CREATE TABLE modifier_option (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  modifier_group_id uuid NOT NULL,
  name text NOT NULL,
  price_delta bigint NOT NULL DEFAULT 0,
  max_quantity integer,
  sort_order integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT modifier_option_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT modifier_option_group_fkey FOREIGN KEY (tenant_id, modifier_group_id)
    REFERENCES modifier_group (tenant_id, id),
  CONSTRAINT modifier_option_price_delta_not_negative CHECK (price_delta >= 0),
  CONSTRAINT modifier_option_max_quantity_positive CHECK (max_quantity >= 1)
);

CREATE INDEX modifier_option_tenant_id_group_id_idx ON modifier_option (tenant_id, modifier_group_id);

CREATE TABLE product_modifier_group (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  modifier_group_id uuid NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT product_modifier_group_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT product_modifier_group_once_per_product UNIQUE (tenant_id, product_id, modifier_group_id),
  CONSTRAINT product_modifier_group_product_fkey FOREIGN KEY (tenant_id, product_id)
    REFERENCES product (tenant_id, id),
  CONSTRAINT product_modifier_group_group_fkey FOREIGN KEY (tenant_id, modifier_group_id)
    REFERENCES modifier_group (tenant_id, id)
);

CREATE INDEX product_modifier_group_tenant_id_group_id_idx ON product_modifier_group (tenant_id, modifier_group_id);

-- A variant's override of a group's limits; unset limits inherit the group's.
CREATE TABLE modifier_group_variant_rule (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  modifier_group_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  min_select integer,
  max_select integer,
  hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT modifier_group_variant_rule_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT modifier_group_variant_rule_once UNIQUE (tenant_id, modifier_group_id, variant_id),
  CONSTRAINT modifier_group_variant_rule_group_fkey FOREIGN KEY (tenant_id, modifier_group_id)
    REFERENCES modifier_group (tenant_id, id),
  CONSTRAINT modifier_group_variant_rule_variant_fkey FOREIGN KEY (tenant_id, variant_id)
    REFERENCES product_variant (tenant_id, id),
  CONSTRAINT modifier_group_variant_rule_limits CHECK (
    min_select >= 0 AND max_select >= 1 AND min_select <= max_select
  )
);

CREATE INDEX modifier_group_variant_rule_tenant_id_variant_id_idx ON modifier_group_variant_rule (tenant_id, variant_id);

CREATE TABLE combo_slot (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL,
  min_select integer NOT NULL,
  max_select integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT combo_slot_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT combo_slot_product_fkey FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id),
  CONSTRAINT combo_slot_limits CHECK (min_select >= 0 AND max_select >= 1 AND min_select <= max_select)
);

CREATE INDEX combo_slot_tenant_id_product_id_idx ON combo_slot (tenant_id, product_id);

CREATE TABLE combo_slot_option (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  combo_slot_id uuid NOT NULL,
  product_id uuid NOT NULL,
  -- Null: the product is sold without variants.
  variant_id uuid,
  upcharge bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT combo_slot_option_tenant_id_id_key UNIQUE (tenant_id, id),
  -- A pick is matched on product and variant, so a second identical option would never be charged.
  CONSTRAINT combo_slot_option_once_per_slot UNIQUE NULLS NOT DISTINCT (tenant_id, combo_slot_id, product_id, variant_id),
  CONSTRAINT combo_slot_option_slot_fkey FOREIGN KEY (tenant_id, combo_slot_id) REFERENCES combo_slot (tenant_id, id),
  CONSTRAINT combo_slot_option_product_fkey FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id),
  CONSTRAINT combo_slot_option_variant_fkey FOREIGN KEY (tenant_id, product_id, variant_id)
    REFERENCES product_variant (tenant_id, product_id, id),
  CONSTRAINT combo_slot_option_upcharge_not_negative CHECK (upcharge >= 0)
);

CREATE INDEX combo_slot_option_tenant_id_product_id_idx ON combo_slot_option (tenant_id, product_id);

-- Manual "86": a product a branch has run out of, on every channel (channel_key null) or on
-- one, until a time or (unavailable_until null) until someone puts it back. No row means
-- available, so putting a product back deletes its row.
CREATE TABLE product_availability (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  product_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  channel_key text,
  unavailable_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT product_availability_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT product_availability_once UNIQUE NULLS NOT DISTINCT (tenant_id, product_id, branch_id, channel_key),
  CONSTRAINT product_availability_product_fkey FOREIGN KEY (tenant_id, product_id) REFERENCES product (tenant_id, id),
  CONSTRAINT product_availability_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT product_availability_channel_key_not_empty CHECK (channel_key <> '')
);

CREATE INDEX product_availability_tenant_id_branch_id_idx ON product_availability (tenant_id, branch_id);

ALTER TABLE station ENABLE ROW LEVEL SECURITY;
ALTER TABLE station FORCE ROW LEVEL SECURITY;
CREATE POLICY station_tenant_isolation ON station
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE category ENABLE ROW LEVEL SECURITY;
ALTER TABLE category FORCE ROW LEVEL SECURITY;
CREATE POLICY category_tenant_isolation ON category
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE product ENABLE ROW LEVEL SECURITY;
ALTER TABLE product FORCE ROW LEVEL SECURITY;
CREATE POLICY product_tenant_isolation ON product
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE product_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant FORCE ROW LEVEL SECURITY;
CREATE POLICY product_variant_tenant_isolation ON product_variant
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE modifier_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_group FORCE ROW LEVEL SECURITY;
CREATE POLICY modifier_group_tenant_isolation ON modifier_group
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE modifier_option ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_option FORCE ROW LEVEL SECURITY;
CREATE POLICY modifier_option_tenant_isolation ON modifier_option
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE product_modifier_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_modifier_group FORCE ROW LEVEL SECURITY;
CREATE POLICY product_modifier_group_tenant_isolation ON product_modifier_group
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE modifier_group_variant_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE modifier_group_variant_rule FORCE ROW LEVEL SECURITY;
CREATE POLICY modifier_group_variant_rule_tenant_isolation ON modifier_group_variant_rule
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE combo_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_slot FORCE ROW LEVEL SECURITY;
CREATE POLICY combo_slot_tenant_isolation ON combo_slot
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE combo_slot_option ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_slot_option FORCE ROW LEVEL SECURITY;
CREATE POLICY combo_slot_option_tenant_isolation ON combo_slot_option
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE product_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_availability FORCE ROW LEVEL SECURITY;
CREATE POLICY product_availability_tenant_isolation ON product_availability
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Default privileges hand the app role DELETE on every new table; take it back on the
-- rows history points at. Grantees are looked up rather than named, as for the audit log,
-- so the migration does not depend on what a deployment calls its app role.
REVOKE DELETE, TRUNCATE ON product, product_variant, modifier_option FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid IN ('product'::regclass, 'product_variant'::regclass, 'modifier_option'::regclass)
      AND acl.privilege_type IN ('DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE DELETE, TRUNCATE ON product, product_variant, modifier_option FROM %I', grantee_name);
  END LOOP;
END
$$;
