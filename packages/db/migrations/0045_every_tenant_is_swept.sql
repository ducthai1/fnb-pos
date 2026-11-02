-- The cleanup job sweeps every tenant, not only those someone can still sign in to. It found
-- the tenants to sweep in the global indexes of sign-in rows (account_tenant, pairing code
-- routes), so a tenant whose memberships were all removed dropped out of it once its last
-- pairing code was purged: its expired staff sessions, and now its change feed, were never
-- cleaned again. A global index of organizations, kept by a trigger like the others, lists
-- them all. It holds ids only, as the other indexes do.

CREATE TABLE fnb_auth.swept_tenant (
  tenant_id uuid PRIMARY KEY REFERENCES organization (id) ON DELETE CASCADE
);

CREATE FUNCTION fnb_auth.index_organization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  INSERT INTO fnb_auth.swept_tenant (tenant_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION fnb_auth.index_organization() FROM PUBLIC;

CREATE TRIGGER organization_swept
  AFTER INSERT ON organization
  FOR EACH ROW EXECUTE FUNCTION fnb_auth.index_organization();

-- Every tenant's organization at once, so row level security is held off for the copy and
-- put back at once, as 0038 and 0042 do.
ALTER TABLE organization DISABLE ROW LEVEL SECURITY;
INSERT INTO fnb_auth.swept_tenant (tenant_id) SELECT id FROM organization ON CONFLICT DO NOTHING;
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION fnb_auth.tenants_to_sweep() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT tenant_id FROM fnb_auth.swept_tenant
  UNION
  SELECT tenant_id FROM fnb_auth.account_tenant
  UNION
  SELECT tenant_id FROM fnb_auth.pairing_code_route
  ORDER BY 1
$$;
