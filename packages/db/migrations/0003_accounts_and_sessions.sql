-- Backoffice accounts and sessions.
--
-- An account is global, not a tenant row: a person signs in before anyone knows which
-- organization they work for, and one person may work for several organizations. It holds
-- only what signing in needs (identifier, password hash, lockout counters); everything
-- else about the person lives in the tenant as an app_user, linked by membership.
--
-- The global tables live in their own schema, fnb_auth, for the same reason as the
-- migration ledger: the app role is granted DML on every `public` table by default
-- privileges, and it must not be able to list accounts or read password hashes. The app
-- role gets no privilege on these tables at all; it reaches them only through the narrow
-- SECURITY DEFINER functions below, which answer for one exact identifier or token and
-- never return a list. USAGE on the schema only lets a role name the functions; who may
-- execute them is decided by the deployment's default privileges, not by this file.
--
-- Times are passed in by the caller instead of read from now(), so the API's clock is the
-- only clock and tests can move it.

CREATE SCHEMA fnb_auth;
GRANT USAGE ON SCHEMA fnb_auth TO PUBLIC;

CREATE TABLE fnb_auth.account (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  phone text UNIQUE,
  password_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT account_has_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CONSTRAINT account_email_is_normalized CHECK (email = lower(btrim(email)) AND email LIKE '_%@_%'),
  CONSTRAINT account_phone_is_vietnam_e164 CHECK (phone ~ '^\+84[35789][0-9]{8}$'),
  CONSTRAINT account_failed_attempts_not_negative CHECK (failed_attempts >= 0)
);

-- Which tenants an account belongs to, kept by a trigger on membership. Membership itself
-- is a tenant row behind row level security, so without this index nobody could find an
-- account's organizations before a tenant is chosen. It holds ids only.
CREATE TABLE fnb_auth.account_tenant (
  account_id uuid NOT NULL REFERENCES fnb_auth.account (id),
  tenant_id uuid NOT NULL REFERENCES organization (id),
  PRIMARY KEY (account_id, tenant_id)
);

-- Global because it is found from a cookie before the tenant is known. The foreign key to
-- account_tenant means a session can only be working in an organization the account is a
-- member of, and removing the membership ends those sessions.
CREATE TABLE fnb_auth.session (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  account_id uuid NOT NULL,
  active_tenant_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  CONSTRAINT session_membership_fkey FOREIGN KEY (account_id, active_tenant_id)
    REFERENCES fnb_auth.account_tenant (account_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT session_token_hash_is_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX session_account_id_idx ON fnb_auth.session (account_id, active_tenant_id);

-- One membership per account and organization. Two accounts may share one app_user (a
-- person who signs in by phone and by email is still one person in the shop).
CREATE TABLE membership (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  account_id uuid NOT NULL,
  app_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT membership_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT membership_tenant_id_account_id_key UNIQUE (tenant_id, account_id),
  CONSTRAINT membership_app_user_fkey FOREIGN KEY (tenant_id, app_user_id)
    REFERENCES app_user (tenant_id, id),
  CONSTRAINT membership_account_fkey FOREIGN KEY (account_id) REFERENCES fnb_auth.account (id),
  CONSTRAINT membership_status_known CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX membership_tenant_id_app_user_id_idx ON membership (tenant_id, app_user_id);

ALTER TABLE membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership FORCE ROW LEVEL SECURITY;
CREATE POLICY membership_tenant_isolation ON membership
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Runs as the owner so the app role can keep the index without any privilege on it. Row
-- level security has already checked the membership row against the current tenant.
CREATE FUNCTION fnb_auth.index_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM fnb_auth.account_tenant
    WHERE account_id = OLD.account_id AND tenant_id = OLD.tenant_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO fnb_auth.account_tenant (account_id, tenant_id)
    VALUES (NEW.account_id, NEW.tenant_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER membership_index
  AFTER INSERT OR DELETE OR UPDATE OF account_id, tenant_id ON membership
  FOR EACH ROW EXECUTE FUNCTION fnb_auth.index_membership();

CREATE FUNCTION fnb_auth.create_account(
  p_id uuid, p_email text, p_phone text, p_password_hash text, p_now timestamptz
) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  INSERT INTO fnb_auth.account (id, email, phone, password_hash, created_at, updated_at)
  VALUES (p_id, p_email, p_phone, p_password_hash, p_now, p_now)
  RETURNING id
$$;

-- Counts the attempt BEFORE the password is checked, under a row lock, so parallel guesses
-- cannot all slip in while the first ones are still being verified: at most max_attempts
-- passwords are ever checked per lock window. The attempt that reaches the limit is still
-- allowed (it may be the right password); the next one is refused until the lock expires,
-- and an expired lock starts a fresh run. The hash is returned only for an allowed attempt.
CREATE FUNCTION fnb_auth.claim_login_attempt(
  p_email text, p_phone text, p_now timestamptz, p_max_attempts integer, p_lock interval
) RETURNS TABLE (account_id uuid, password_hash text, allowed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  found_account fnb_auth.account%ROWTYPE;
  attempts integer;
BEGIN
  SELECT * INTO found_account FROM fnb_auth.account a
  WHERE (p_email IS NOT NULL AND a.email = p_email) OR (p_phone IS NOT NULL AND a.phone = p_phone)
  ORDER BY a.id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF found_account.locked_until IS NOT NULL AND found_account.locked_until > p_now THEN
    RETURN QUERY SELECT found_account.id, NULL::text, false;
    RETURN;
  END IF;
  attempts := CASE WHEN found_account.locked_until IS NULL
                   THEN found_account.failed_attempts + 1 ELSE 1 END;
  UPDATE fnb_auth.account
  SET failed_attempts = attempts,
      locked_until = CASE WHEN attempts >= p_max_attempts THEN p_now + p_lock END,
      updated_at = p_now
  WHERE id = found_account.id;
  RETURN QUERY SELECT found_account.id, found_account.password_hash, true;
END $$;

CREATE FUNCTION fnb_auth.record_login_success(p_account_id uuid, p_now timestamptz)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE fnb_auth.account
  SET failed_attempts = 0, locked_until = NULL, updated_at = p_now
  WHERE id = p_account_id
$$;

CREATE FUNCTION fnb_auth.account_tenants(p_account_id uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT tenant_id FROM fnb_auth.account_tenant WHERE account_id = p_account_id ORDER BY tenant_id
$$;

CREATE FUNCTION fnb_auth.create_session(
  p_id uuid, p_token_hash text, p_account_id uuid, p_tenant_id uuid,
  p_expires_at timestamptz, p_now timestamptz
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  INSERT INTO fnb_auth.session (id, token_hash, account_id, active_tenant_id, expires_at, created_at)
  VALUES (p_id, p_token_hash, p_account_id, p_tenant_id, p_expires_at, p_now)
$$;

CREATE FUNCTION fnb_auth.find_session(p_token_hash text, p_now timestamptz)
RETURNS TABLE (session_id uuid, account_id uuid, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT id, account_id, active_tenant_id FROM fnb_auth.session
  WHERE token_hash = p_token_hash AND revoked_at IS NULL AND expires_at > p_now
$$;

CREATE FUNCTION fnb_auth.revoke_session(p_token_hash text, p_now timestamptz)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  WITH revoked AS (
    UPDATE fnb_auth.session SET revoked_at = p_now
    WHERE token_hash = p_token_hash AND revoked_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM revoked)
$$;
