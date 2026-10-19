-- Every tenant table only shows and accepts rows of the tenant set for the current
-- transaction (withTenant sets app.tenant_id with is_local = true). No tenant set means the
-- predicate is NULL, so nothing is visible and nothing can be written: fail closed.
--
-- FORCE makes the policy bind the table owner as well, so a job or migration running as the
-- owner role cannot read across tenants by accident. Only superusers and BYPASSRLS roles
-- escape it, and the app role is neither.
--
-- NULLIF: after a pooled connection has run one tenant transaction, the unset setting
-- reads back as '' rather than NULL, and ''::uuid would raise instead of matching nothing.

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_tenant_isolation ON organization
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE brand ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand FORCE ROW LEVEL SECURITY;
CREATE POLICY brand_tenant_isolation ON brand
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch FORCE ROW LEVEL SECURITY;
CREATE POLICY branch_tenant_isolation ON branch
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE area ENABLE ROW LEVEL SECURITY;
ALTER TABLE area FORCE ROW LEVEL SECURITY;
CREATE POLICY area_tenant_isolation ON area
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE dining_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE dining_table FORCE ROW LEVEL SECURITY;
CREATE POLICY dining_table_tenant_isolation ON dining_table
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE device ENABLE ROW LEVEL SECURITY;
ALTER TABLE device FORCE ROW LEVEL SECURITY;
CREATE POLICY device_tenant_isolation ON device
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
CREATE POLICY app_user_tenant_isolation ON app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
