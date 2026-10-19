import { withTenant } from "@fnb/db";
import type pg from "pg";
import { readBranchPricing } from "../../../src/sync/sellable-catalog";
import type { SyncSender } from "../../../src/sync/sync-command-context";
import type { SyncShop, Till } from "./sync-shop";

/** What the API would build for `till`, for a test that applies a command in its own transaction. */
export async function senderOf(pool: pg.Pool, s: SyncShop, till: Till): Promise<SyncSender> {
  const branch = await withTenant(pool, s.shop.tenantId, (client) =>
    readBranchPricing(client, s.shop.branchId),
  );
  return {
    device: { deviceId: till.deviceId, tenantId: s.shop.tenantId, branchId: s.shop.branchId },
    staffId: till.staffId,
    branch,
  };
}

/**
 * Resolves once `pending` has settled or some session is waiting on an advisory lock,
 * whichever comes first: the point where a second writer has either finished or queued
 * behind the first. Polls the database instead of sleeping.
 */
export async function untilSettledOrWaitingOnLock(pool: pg.Pool, pending: Promise<unknown>) {
  let settled = false;
  pending.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let attempt = 0; attempt < 2_000; attempt++) {
    if (settled) return;
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM pg_stat_activity " +
        "WHERE wait_event_type = 'Lock' AND wait_event = 'advisory'",
    );
    if (rows[0].n > 0) return;
  }
  throw new Error("the second writer neither finished nor waited on the lock");
}

/**
 * Draws change_seq numbers nobody uses until the next one is a few short of a power of ten,
 * so the changes made next cross from one digit count to the next ("998" → "1001").
 */
export async function moveChangeSeqBelowADigitBoundary(pool: pg.Pool, margin: number) {
  const sequence = "pg_get_serial_sequence('change_log', 'change_seq')";
  const { rows } = await pool.query(`SELECT nextval(${sequence})::text AS value`);
  const current = Number(rows[0].value);
  let boundary = 10 ** String(current).length;
  if (boundary - current <= margin) boundary *= 10;
  await pool.query(`SELECT nextval(${sequence}) FROM generate_series(1, $1)`, [
    boundary - margin - current,
  ]);
}
