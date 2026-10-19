-- Settings that inherit: a value set for a brand applies to all its branches, a branch
-- value overrides it for that branch, and a device value overrides both on one till. The
-- built-in defaults live in code as the system layer, so this table only holds what a
-- shop changed, and deleting a row is how a setting goes back to inheriting.
--
-- updated_by, like created_by, is the user who saved the value, kept without a foreign key
-- so a value saved offline never waits on the user row.

CREATE TABLE config_value (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  scope_kind text NOT NULL,
  scope_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  -- scope_id names a row of a different table per scope_kind, which no single foreign key
  -- can check. These columns split it by kind so each gets a real (tenant_id, id) key:
  -- without them a tenant could hang settings under another tenant's device by its id,
  -- or keep settings for a branch that no longer exists. Only one is ever non-null.
  brand_id uuid GENERATED ALWAYS AS (CASE WHEN scope_kind = 'brand' THEN scope_id END) STORED,
  branch_id uuid GENERATED ALWAYS AS (CASE WHEN scope_kind = 'branch' THEN scope_id END) STORED,
  device_id uuid GENERATED ALWAYS AS (CASE WHEN scope_kind = 'device' THEN scope_id END) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT config_value_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT config_value_tenant_id_scope_key_key UNIQUE (tenant_id, scope_kind, scope_id, key),
  CONSTRAINT config_value_scope_kind_known CHECK (scope_kind IN ('brand', 'branch', 'device')),
  CONSTRAINT config_value_brand_fkey FOREIGN KEY (tenant_id, brand_id) REFERENCES brand (tenant_id, id),
  CONSTRAINT config_value_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT config_value_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id)
);

-- For the foreign key checks when a brand, branch or device is deleted.
CREATE INDEX config_value_tenant_id_brand_id_idx ON config_value (tenant_id, brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX config_value_tenant_id_branch_id_idx ON config_value (tenant_id, branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX config_value_tenant_id_device_id_idx ON config_value (tenant_id, device_id) WHERE device_id IS NOT NULL;

ALTER TABLE config_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE config_value FORCE ROW LEVEL SECURITY;
CREATE POLICY config_value_tenant_isolation ON config_value
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
