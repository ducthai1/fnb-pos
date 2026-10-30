import type pg from "pg";

/** Tills of a branch that can hold a call index: the hundreds digit is 1 to 9. */
export const MAX_CALL_INDEX = 9;

/**
 * Gives the device the smallest call index no other till of its branch holds; one that has
 * an index keeps it. Null when all nine are taken (the till then keeps the plain numbers).
 * Serialised per branch, so two tills pairing at once cannot take the same index.
 */
export async function claimCallIndex(
  client: pg.ClientBase,
  deviceId: string,
  branchId: string,
): Promise<number | null> {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `call-index:${branchId}`,
  ]);
  const own = await client.query<{ call_index: number | null }>(
    "SELECT call_index FROM device WHERE id = $1",
    [deviceId],
  );
  const held = own.rows[0]?.call_index;
  if (held !== null && held !== undefined) return held;
  const free = await client.query<{ free: number | null }>(
    "SELECT min(n)::int AS free FROM generate_series(1, $2::int) AS n WHERE NOT EXISTS " +
      "(SELECT 1 FROM device WHERE branch_id = $1 AND call_index = n)",
    [branchId, MAX_CALL_INDEX],
  );
  const index = free.rows[0]?.free ?? null;
  if (index === null) return null;
  await client.query("UPDATE device SET call_index = $2 WHERE id = $1", [deviceId, index]);
  return index;
}

/** Takes the index back when the till is revoked, so the next till of the branch gets it. */
export async function releaseCallIndex(client: pg.ClientBase, deviceId: string): Promise<void> {
  await client.query("UPDATE device SET call_index = NULL WHERE id = $1", [deviceId]);
}

export interface CallNumbering {
  /** This till's index; null when the branch has more tills than indexes. */
  readonly deviceIndex: number | null;
  /** Tills of the branch holding an index: with two or more, calls carry the index. */
  readonly tillsInBranch: number;
}

/** What a till needs to call numbers that differ from its branch's other tills'. */
export async function readCallNumbering(
  client: pg.ClientBase,
  deviceId: string,
  branchId: string,
): Promise<CallNumbering> {
  const deviceIndex = await claimCallIndex(client, deviceId, branchId);
  const counted = await client.query<{ tills: number }>(
    "SELECT count(*)::int AS tills FROM device WHERE branch_id = $1 AND call_index IS NOT NULL",
    [branchId],
  );
  return { deviceIndex, tillsInBranch: Math.max(1, counted.rows[0]?.tills ?? 1) };
}
