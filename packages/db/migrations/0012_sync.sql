-- The server side of till sync: the outcome of every command a till sent, where each till
-- is in its own command sequence, and the feed of changes tills pull by cursor.

-- Every outcome is kept, rejections included: a command sent again (the response was lost,
-- the till retried) must get the answer it got the first time, not a fresh evaluation
-- against state that has moved on. Rows are evidence of what the server decided, so they
-- are only ever added.
CREATE TABLE applied_command (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  command_id uuid NOT NULL,
  device_seq bigint NOT NULL,
  type text NOT NULL,
  status text NOT NULL,
  code text,
  -- What the till sent, kept for support ("what did the till ask for?").
  payload jsonb NOT NULL DEFAULT '{}',
  -- The answer, exactly as it was sent back, snapshot included.
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT applied_command_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT applied_command_once UNIQUE (tenant_id, command_id),
  CONSTRAINT applied_command_device_seq_once UNIQUE (tenant_id, device_id, device_seq),
  CONSTRAINT applied_command_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT applied_command_status_known CHECK (status IN ('accepted', 'rejected')),
  CONSTRAINT applied_command_code_on_rejection CHECK ((status = 'rejected') = (code IS NOT NULL)),
  CONSTRAINT applied_command_device_seq_positive CHECK (device_seq > 0)
);

-- The last device_seq applied per till. Commands of one till depend on each other, so the
-- server takes them strictly in order and tells the till to resend from a gap.
CREATE TABLE device_sync_state (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  device_id uuid NOT NULL,
  last_seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT device_sync_state_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT device_sync_state_once_per_device UNIQUE (tenant_id, device_id),
  CONSTRAINT device_sync_state_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  CONSTRAINT device_sync_state_last_seq_not_negative CHECK (last_seq >= 0)
);

-- What tills pull: one full snapshot of an entity per change, in change_seq order. A
-- bigserial is handed out in BEGIN order but becomes visible in COMMIT order, so a puller
-- could see a later number, move its cursor past an earlier one still uncommitted, and
-- never see it. Writers therefore hold a per-tenant advisory lock from before they draw a
-- change_seq until they commit, which makes change_seq order commit order within a tenant.
CREATE TABLE change_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  change_seq bigserial NOT NULL,
  branch_id uuid NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  -- The command that made the change. No foreign key: a reference into applied_command
  -- would make TRUNCATE of it fail on the reference instead of on its append-only trigger.
  command_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT change_log_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT change_log_change_seq_key UNIQUE (change_seq),
  CONSTRAINT change_log_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT change_log_entity_not_empty CHECK (entity <> '')
);

CREATE INDEX change_log_tenant_id_branch_id_change_seq_idx ON change_log (tenant_id, branch_id, change_seq);

ALTER TABLE applied_command ENABLE ROW LEVEL SECURITY;
ALTER TABLE applied_command FORCE ROW LEVEL SECURITY;
CREATE POLICY applied_command_tenant_isolation ON applied_command
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE device_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sync_state FORCE ROW LEVEL SECURITY;
CREATE POLICY device_sync_state_tenant_isolation ON device_sync_state
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log FORCE ROW LEVEL SECURITY;
CREATE POLICY change_log_tenant_isolation ON change_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Whoever may add to the feed may draw its numbers; default privileges cover tables only.
-- Append-only, as the audit trail: privileges stop the app role, the statement trigger
-- (refuse_append_only_change, from the audit migration) stops the owner as well.
REVOKE UPDATE, DELETE, TRUNCATE ON applied_command, change_log FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid = 'change_log'::regclass AND acl.privilege_type = 'INSERT' AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE change_log_change_seq_seq TO %I', grantee_name);
  END LOOP;
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid IN ('applied_command'::regclass, 'change_log'::regclass)
      AND acl.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON applied_command, change_log FROM %I', grantee_name);
  END LOOP;
END
$$;

CREATE TRIGGER applied_command_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON applied_command
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
CREATE TRIGGER change_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON change_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
