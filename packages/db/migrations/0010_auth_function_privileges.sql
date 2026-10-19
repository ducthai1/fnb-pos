-- Who may call the sign-in functions, and when their index triggers fire.
--
-- Postgres lets PUBLIC execute every new function. The fnb_auth functions run as the owner
-- and hand out password hashes and sessions, so until now only the deployment's default
-- privileges stood between them and any role able to connect (a reporting role, a replica
-- tool, an admin console): a database migrated without that step let anyone mint a
-- backoffice session. The schema now takes execution away from PUBLIC itself. Which role
-- may call the functions is still granted by the deployment, so this file names no role.

-- Membership and pairing-code index triggers fired on any UPDATE that merely named their
-- columns, and rebuilt the index row even when nothing changed. Rebuilding the account
-- index deletes its row first, which cascades to every session of that account in that
-- organization: saving a membership with all of its columns signed the person out. A
-- WHEN clause on OLD and NEW is not allowed on INSERT or DELETE, hence two triggers each.
DROP TRIGGER membership_index ON membership;

CREATE TRIGGER membership_index_insert_or_delete
  AFTER INSERT OR DELETE ON membership
  FOR EACH ROW EXECUTE FUNCTION fnb_auth.index_membership();

CREATE TRIGGER membership_index_update
  AFTER UPDATE OF account_id, tenant_id ON membership
  FOR EACH ROW
  WHEN (OLD.account_id IS DISTINCT FROM NEW.account_id OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id)
  EXECUTE FUNCTION fnb_auth.index_membership();

DROP TRIGGER device_pairing_code_route ON device_pairing_code;

CREATE TRIGGER device_pairing_code_route_insert_or_delete
  AFTER INSERT OR DELETE ON device_pairing_code
  FOR EACH ROW EXECUTE FUNCTION fnb_auth.route_pairing_code();

CREATE TRIGGER device_pairing_code_route_update
  AFTER UPDATE OF code_hash, tenant_id ON device_pairing_code
  FOR EACH ROW
  WHEN (OLD.code_hash IS DISTINCT FROM NEW.code_hash OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id)
  EXECUTE FUNCTION fnb_auth.route_pairing_code();

-- Last, so it covers every function above. Trigger functions are revoked too: a trigger
-- does not need EXECUTE to fire, and nothing should call them directly.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA fnb_auth FROM PUBLIC;

-- Functions this role creates from now on start out closed as well, so a later migration
-- that adds a sign-in function cannot forget the revoke above.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
