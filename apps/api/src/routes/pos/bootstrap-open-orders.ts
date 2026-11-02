import type { EntitySnapshot } from "@fnb/contracts";
import type pg from "pg";
import { orderSnapshotOf } from "../../sync/order-snapshot";
import { readOpenDraftsOfBranch } from "../../sync/stored-order";

/**
 * The branch's drafts still open, as the change feed sends orders. A till sees changes
 * only from its bootstrap's cursor on, so an order opened before it was paired, and not
 * touched since, would never reach it: guests seated at a table it could not open. Read in a
 * fixed number of round trips, so a branch with many tables open does not slow every
 * till's start.
 */
export async function readOpenOrders(
  client: pg.ClientBase,
  branchId: string,
): Promise<EntitySnapshot[]> {
  const drafts = await readOpenDraftsOfBranch(client, branchId);
  // The same object the feed carries, typed as any snapshot: the till parses it as one.
  return drafts.map((stored) => ({ ...orderSnapshotOf(stored) }));
}
