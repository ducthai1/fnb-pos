-- Who may call the sign-in functions, when their index triggers fire, and what a right
-- password may clear.
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

-- A right password used to clear the count unconditionally, wiping the failures, and the
-- lock, that parallel guesses had claimed while it was being checked. The claim now also
-- returns the count it wrote and the lock it set, and a success clears the count only if
-- it is still that one. The lock a claim sets is how the API knows to audit it. Changing
-- a function's result columns or arguments takes a drop.
DROP FUNCTION fnb_auth.claim_login_attempt(text, text, timestamptz, integer, interval);
DROP FUNCTION fnb_auth.record_login_success(uuid, timestamptz);

-- Counts the attempt BEFORE the password is checked, under a row lock, so parallel guesses
-- cannot all slip in while the first ones are still being verified: at most max_attempts
-- passwords are ever checked per lock window. The attempt that reaches the limit is still
-- allowed (it may be the right password); the next one is refused until the lock expires,
-- and an expired lock starts a fresh run. The hash is returned only for an allowed attempt.
CREATE FUNCTION fnb_auth.claim_login_attempt(
  p_email text, p_phone text, p_now timestamptz, p_max_attempts integer, p_lock interval
) RETURNS TABLE (
  account_id uuid, password_hash text, allowed boolean,
  claimed_attempts integer, lock_expires_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  found_account fnb_auth.account%ROWTYPE;
  attempts integer;
  new_lock timestamptz;
BEGIN
  SELECT * INTO found_account FROM fnb_auth.account a
  WHERE (p_email IS NOT NULL AND a.email = p_email) OR (p_phone IS NOT NULL AND a.phone = p_phone)
  ORDER BY a.id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF found_account.locked_until IS NOT NULL AND found_account.locked_until > p_now THEN
    RETURN QUERY SELECT found_account.id, NULL::text, false,
      found_account.failed_attempts, found_account.locked_until;
    RETURN;
  END IF;
  attempts := CASE WHEN found_account.locked_until IS NULL
                   THEN found_account.failed_attempts + 1 ELSE 1 END;
  new_lock := CASE WHEN attempts >= p_max_attempts THEN p_now + p_lock END;
  UPDATE fnb_auth.account
  SET failed_attempts = attempts, locked_until = new_lock, updated_at = p_now
  WHERE id = found_account.id;
  RETURN QUERY SELECT found_account.id, found_account.password_hash, true, attempts, new_lock;
END $$;

-- The UPDATE takes the row lock and re-reads the count under it, so an attempt claimed
-- while this password was being checked keeps its count and any lock it set.
CREATE FUNCTION fnb_auth.record_login_success(
  p_account_id uuid, p_claimed_attempts integer, p_now timestamptz
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  UPDATE fnb_auth.account
  SET failed_attempts = 0, locked_until = NULL, updated_at = p_now
  WHERE id = p_account_id AND failed_attempts = p_claimed_attempts
$$;

-- Last, so it covers every function above. Trigger functions are revoked too: a trigger
-- does not need EXECUTE to fire, and nothing should call them directly.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA fnb_auth FROM PUBLIC;

-- Functions this role creates from now on start out closed as well, so a later migration
-- that adds a sign-in function cannot forget the revoke above.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
