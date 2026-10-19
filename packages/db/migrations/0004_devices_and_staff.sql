-- Pairing tills to a branch, and the credentials they then sign in with.
--
-- A new till knows nothing: no tenant, no token. A manager creates a short pairing code
-- in the backoffice and types it into the till. The code is a tenant row; the till finds
-- its tenant through fnb_auth.pairing_code_route, a global index from the code's hash to
-- the tenant, kept by a trigger and read only through a function taking the exact hash.
-- Only hashes are stored; the code and the device token are shown once, never kept.

CREATE TABLE device_pairing_code (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  code_hash text NOT NULL,
  created_by_app_user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT device_pairing_code_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT device_pairing_code_tenant_id_code_hash_key UNIQUE (tenant_id, code_hash),
  CONSTRAINT device_pairing_code_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT device_pairing_code_created_by_app_user_fkey FOREIGN KEY (tenant_id, created_by_app_user_id)
    REFERENCES app_user (tenant_id, id),
  CONSTRAINT device_pairing_code_code_hash_is_sha256 CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX device_pairing_code_tenant_id_branch_id_idx ON device_pairing_code (tenant_id, branch_id);
CREATE INDEX device_pairing_code_tenant_id_created_by_app_user_id_idx ON device_pairing_code (tenant_id, created_by_app_user_id);

-- The device token is `<tenant id>.<secret>`; the secret's hash must exist in the named
-- tenant, under row level security, so naming another tenant finds nothing. Revoking sets
-- revoked_at and never deletes; a device may hold several credentials over time.
CREATE TABLE device_credential (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  token_hash text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT device_credential_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT device_credential_tenant_id_token_hash_key UNIQUE (tenant_id, token_hash),
  CONSTRAINT device_credential_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT device_credential_token_hash_is_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX device_credential_tenant_id_device_id_idx ON device_credential (tenant_id, device_id);

ALTER TABLE device_pairing_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_pairing_code FORCE ROW LEVEL SECURITY;
CREATE POLICY device_pairing_code_tenant_isolation ON device_pairing_code
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE device_credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_credential FORCE ROW LEVEL SECURITY;
CREATE POLICY device_credential_tenant_isolation ON device_credential
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Global, outside `public`, as the accounts are. The key makes a code unique across
-- tenants, so a hash never routes to two; the API draws a new code on a collision.
CREATE TABLE fnb_auth.pairing_code_route (
  code_hash text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES organization (id),
  CONSTRAINT pairing_code_route_code_hash_is_sha256 CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

CREATE FUNCTION fnb_auth.route_pairing_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    DELETE FROM fnb_auth.pairing_code_route
    WHERE code_hash = OLD.code_hash AND tenant_id = OLD.tenant_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    INSERT INTO fnb_auth.pairing_code_route (code_hash, tenant_id)
    VALUES (NEW.code_hash, NEW.tenant_id);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER device_pairing_code_route
  AFTER INSERT OR DELETE OR UPDATE OF code_hash, tenant_id ON device_pairing_code
  FOR EACH ROW EXECUTE FUNCTION fnb_auth.route_pairing_code();

CREATE FUNCTION fnb_auth.pairing_code_tenant(p_code_hash text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT tenant_id FROM fnb_auth.pairing_code_route WHERE code_hash = p_code_hash
$$;

-- Staff sign in on a paired till with a PIN. They are not accounts: most cashiers never
-- use the backoffice and many have no email. Permission keys are stored as given and are
-- checked against the permission catalog later; thresholds holds limits such as discount.
CREATE TABLE role (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  permission_keys text[] NOT NULL DEFAULT '{}',
  thresholds jsonb NOT NULL DEFAULT '{}',
  is_template boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT role_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT role_organization_fkey FOREIGN KEY (tenant_id) REFERENCES organization (id),
  CONSTRAINT role_permission_keys_have_no_null CHECK (array_position(permission_keys, NULL) IS NULL),
  CONSTRAINT role_thresholds_is_object CHECK (jsonb_typeof(thresholds) = 'object')
);

CREATE TABLE staff (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  display_name text NOT NULL,
  role_id uuid NOT NULL,
  pin_hash text NOT NULL,
  pin_failed_attempts integer NOT NULL DEFAULT 0, -- lockout state on the server, not staff data
  pin_locked_until timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT staff_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT staff_role_fkey FOREIGN KEY (tenant_id, role_id) REFERENCES role (tenant_id, id),
  CONSTRAINT staff_pin_failed_attempts_not_negative CHECK (pin_failed_attempts >= 0)
);

CREATE INDEX staff_tenant_id_role_id_idx ON staff (tenant_id, role_id);

CREATE TABLE staff_branch (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT staff_branch_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT staff_branch_tenant_id_staff_id_branch_id_key UNIQUE (tenant_id, staff_id, branch_id),
  CONSTRAINT staff_branch_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
  CONSTRAINT staff_branch_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id)
);

CREATE INDEX staff_branch_tenant_id_branch_id_idx ON staff_branch (tenant_id, branch_id);

-- One shift on one till. Useless on any other till, and ends with the device: every use
-- also needs the device's own live credential.
CREATE TABLE staff_session (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT staff_session_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT staff_session_tenant_id_token_hash_key UNIQUE (tenant_id, token_hash),
  CONSTRAINT staff_session_staff_fkey FOREIGN KEY (tenant_id, staff_id) REFERENCES staff (tenant_id, id),
  CONSTRAINT staff_session_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT staff_session_token_hash_is_sha256 CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX staff_session_tenant_id_staff_id_idx ON staff_session (tenant_id, staff_id);
CREATE INDEX staff_session_tenant_id_device_id_idx ON staff_session (tenant_id, device_id);

ALTER TABLE role ENABLE ROW LEVEL SECURITY;
ALTER TABLE role FORCE ROW LEVEL SECURITY;
CREATE POLICY role_tenant_isolation ON role
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_tenant_isolation ON staff
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE staff_branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_branch FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_branch_tenant_isolation ON staff_branch
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE staff_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_session FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_session_tenant_isolation ON staff_session
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
