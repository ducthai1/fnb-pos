-- Housekeeping of short-lived sign-in rows: pairing codes past their expiry, and backoffice
-- and staff sessions some days past theirs. Evidence tables (audit, change log, approvals)
-- are not touched by anything here.
--
-- Backoffice sessions are global and the app role holds no privilege on fnb_auth.session,
-- so they are deleted by an owner function that takes nothing but a cut-off time: it can
-- only ever remove sessions that ended before it, never a live one, never a chosen one.
--
-- Pairing codes and staff sessions are tenant rows under FORCE row level security, which
-- binds the owner too, so no function can sweep across tenants (and none should). The job
-- runs as the app role instead, one withTenant transaction per tenant, where the policies
-- guarantee a mistake in its filter stays inside that tenant. It needs the tenants that may
-- hold such rows, read from the global indexes, which hold ids only: account_tenant (an
-- organization is created with its owner as a member) and pairing_code_route. Tenant ids
-- are no secret to the app role, which already chooses the tenant of every transaction it
-- opens, so the list widens nothing it can reach. Times come from the caller's clock.

CREATE FUNCTION fnb_auth.purge_expired_sessions(p_expired_before timestamptz)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH purged AS (
    DELETE FROM fnb_auth.session WHERE expires_at < p_expired_before RETURNING 1
  )
  SELECT count(*) FROM purged
$$;

CREATE FUNCTION fnb_auth.tenants_to_sweep() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT tenant_id FROM fnb_auth.account_tenant
  UNION
  SELECT tenant_id FROM fnb_auth.pairing_code_route
  ORDER BY 1
$$;
