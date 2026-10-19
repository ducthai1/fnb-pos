-- Approvals and the audit trail. Both are evidence (a refund a manager approved at the
-- till, a drawer opened without a sale, a setting changed in the backoffice), so rows are
-- only ever added. Nothing may edit or remove them, not even the schema owner, or the
-- trail would prove nothing. That is also why neither table has updated_at or version.
--
-- Staff ids are plain uuids without a foreign key, like created_by: an audit row must never
-- be refused, or wait for a sync, because the staff row is missing or was removed later.
-- The log has to outlive the people named in it.

CREATE TABLE approval_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  action_key text NOT NULL,
  requested_by_staff_id uuid NOT NULL,
  approved_by_staff_id uuid NOT NULL,
  device_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_log_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT approval_log_branch_fkey FOREIGN KEY (tenant_id, branch_id) REFERENCES branch (tenant_id, id),
  CONSTRAINT approval_log_device_fkey FOREIGN KEY (tenant_id, device_id) REFERENCES device (tenant_id, id),
  -- Someone allowed to do the action alone never asks for approval, so a row approved by
  -- its own requester is a bug or a forgery.
  CONSTRAINT approval_log_not_self_approved CHECK (approved_by_staff_id <> requested_by_staff_id)
);

CREATE INDEX approval_log_tenant_id_branch_id_created_at_idx ON approval_log (tenant_id, branch_id, created_at);
CREATE INDEX approval_log_tenant_id_device_id_idx ON approval_log (tenant_id, device_id);

-- actor_id and entity_id point at rows of different tables depending on their kind, so
-- they carry no foreign key either.
CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  actor_kind text NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_kind text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT audit_log_organization_fkey FOREIGN KEY (tenant_id) REFERENCES organization (id),
  CONSTRAINT audit_log_actor_kind_known CHECK (actor_kind IN ('app_user', 'staff', 'device', 'system')),
  -- Scheduled work (closing a business day) acts as the system and has no id; every other
  -- actor must be named, or the entry says nothing about who did it.
  CONSTRAINT audit_log_actor_id_matches_kind CHECK ((actor_kind = 'system') = (actor_id IS NULL))
);

CREATE INDEX audit_log_tenant_id_entity_idx ON audit_log (tenant_id, entity_kind, entity_id, created_at);

ALTER TABLE approval_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_log FORCE ROW LEVEL SECURITY;
CREATE POLICY approval_log_tenant_isolation ON approval_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- First line: privileges. Default privileges hand the app role UPDATE and DELETE on every
-- new table; take them back from every role except the owner, so the app role can only
-- read and append. The roles are looked up rather than named, so the migration does not
-- depend on what a deployment calls its app role.
REVOKE UPDATE, DELETE, TRUNCATE ON approval_log, audit_log FROM PUBLIC;
DO $$
DECLARE
  grantee_name text;
BEGIN
  FOR grantee_name IN
    SELECT DISTINCT r.rolname
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) acl
    JOIN pg_roles r ON r.oid = acl.grantee
    WHERE c.oid IN ('approval_log'::regclass, 'audit_log'::regclass)
      AND acl.privilege_type IN ('UPDATE', 'DELETE', 'TRUNCATE')
      AND acl.grantee <> c.relowner
  LOOP
    EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON approval_log, audit_log FROM %I', grantee_name);
  END LOOP;
END
$$;

-- Second line: a statement trigger, which binds the owner too (privileges do not, since an
-- owner can grant itself anything back). It fires even when no row matches, and on
-- TRUNCATE, which ignores row level security and would wipe every tenant's trail at once.
-- Getting past it takes deliberate DDL by the owner, never a stray query or job.
CREATE FUNCTION refuse_append_only_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER approval_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON approval_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_append_only_change();
