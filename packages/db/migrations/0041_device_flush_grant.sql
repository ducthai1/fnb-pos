-- A one-time permission for a revoked till to send what it still holds. The server refuses
-- every call of a revoked device, so commands the till recorded and never sent (cash it
-- took among them) would only be wiped when it is paired again. A manager issues a grant
-- for exactly that device; the till types its code and its outbox goes through the usual
-- command checks once. The device stays revoked: the grant opens no other route and ends
-- with the till's last batch or after its few minutes, whichever comes first. Stored as
-- the code's SHA-256 only, as pairing codes are.
CREATE TABLE device_flush_grant (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  code_hash text NOT NULL,
  created_by_app_user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  -- The first batch the till sent under the grant, and its last one: a grant is spent once
  -- finished_at is set, and cannot be spent again.
  first_used_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT device_flush_grant_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT device_flush_grant_tenant_id_code_hash_key UNIQUE (tenant_id, code_hash),
  CONSTRAINT device_flush_grant_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT device_flush_grant_created_by_app_user_fkey FOREIGN KEY (tenant_id, created_by_app_user_id)
    REFERENCES app_user (tenant_id, id),
  CONSTRAINT device_flush_grant_code_hash_is_sha256 CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT device_flush_grant_finished_after_use CHECK (finished_at IS NULL OR first_used_at IS NOT NULL)
);

CREATE INDEX device_flush_grant_tenant_id_device_id_idx ON device_flush_grant (tenant_id, device_id);
CREATE INDEX device_flush_grant_tenant_id_created_by_app_user_id_idx
  ON device_flush_grant (tenant_id, created_by_app_user_id);

ALTER TABLE device_flush_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_flush_grant FORCE ROW LEVEL SECURITY;
CREATE POLICY device_flush_grant_tenant_isolation ON device_flush_grant
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
