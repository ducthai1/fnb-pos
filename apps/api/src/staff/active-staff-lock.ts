import type pg from "pg";

/**
 * The staff member's role, read under a share lock on their row if they are still active,
 * else null. Signing in and approving check the PIN between two transactions (the hash is
 * slow); a lock-out committed in between has already ended every session and is waiting
 * for no one, so whatever is written next must look again, in its own transaction, under
 * a lock a lock-out has to wait for. With it, the lock-out either comes first (and this
 * reads inactive) or comes after (and ends what this writes).
 */
export async function lockActiveStaff(
  client: pg.ClientBase,
  staffId: string,
): Promise<{ readonly roleId: string } | null> {
  const { rows } = await client.query<{ role_id: string }>(
    "SELECT role_id FROM staff WHERE id = $1 AND active FOR SHARE",
    [staffId],
  );
  return rows[0] === undefined ? null : { roleId: rows[0].role_id };
}
