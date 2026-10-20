-- A role nobody holds any more is archived instead of deleted: the audit trail and the
-- approvals of the past name it, and the backoffice still shows what it was. An archived
-- role is given to no one; the API refuses it for new staff and for a change of role.
ALTER TABLE role ADD COLUMN archived_at timestamptz;
