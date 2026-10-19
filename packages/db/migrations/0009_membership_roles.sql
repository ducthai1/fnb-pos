-- What a backoffice member may do. Members get their rights from the same role rows as
-- staff do, so one permission catalog and one grant check cover the till and the
-- backoffice alike, and a shop edits "Quản lý" once for both.
--
-- One role per membership, and never none: a member with no role would be a third state
-- every permission check has to remember to refuse. NOT NULL without a default assumes no
-- membership rows exist yet, which holds before the first release; a later change of this
-- kind must backfill first.
--
-- The key is (tenant_id, role_id), like every other child row, so a member of tenant A
-- can never be handed a role of tenant B by someone who knows its id.

ALTER TABLE membership ADD COLUMN role_id uuid NOT NULL;

ALTER TABLE membership ADD CONSTRAINT membership_role_fkey
  FOREIGN KEY (tenant_id, role_id) REFERENCES role (tenant_id, id);

CREATE INDEX membership_tenant_id_role_id_idx ON membership (tenant_id, role_id);
