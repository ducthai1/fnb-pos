import type pg from "pg";

/**
 * manage_staff is the key that edits roles, so whoever holds it can restore every other
 * key; an organization where no active member holds it can never be administered again.
 * The rule is about that key rather than the "owner" template, because a template is
 * only a starting row the shop renames and edits like any other.
 *
 * Takes the organization row lock first: two edits that each strip the key from a
 * different administrator's role would otherwise both see the other one still holding
 * it, and both commit. Every change that can lower the number of administrators must
 * take this lock before counting.
 */
export async function lockAdministration(client: pg.ClientBase): Promise<void> {
  await client.query("SELECT 1 FROM organization FOR UPDATE");
}

/** Whether taking manage_staff away from `roleId` leaves some active member holding it. */
export async function administratorRemainsWithout(
  client: pg.ClientBase,
  roleId: string,
): Promise<boolean> {
  const result = await client.query<{ held: boolean; elsewhere: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM membership WHERE role_id = $1 AND status = 'active') AS held, " +
      "EXISTS (SELECT 1 FROM membership m JOIN role r ON r.tenant_id = m.tenant_id " +
      "AND r.id = m.role_id WHERE m.status = 'active' AND r.id <> $1 " +
      "AND 'manage_staff' = ANY (r.permission_keys)) AS elsewhere",
    [roleId],
  );
  const row = result.rows[0];
  return row === undefined || !row.held || row.elsewhere;
}
