import type { EntitySnapshot } from "@fnb/contracts";
import type pg from "pg";
import { orderSnapshotOf } from "../../sync/order-snapshot";
import { readStoredOrder } from "../../sync/stored-order";

/**
 * The branch's drafts still open, as the change feed sends orders. A till sees changes
 * only from its bootstrap's cursor on, so an order opened before it was paired, and not
 * touched since, would never reach it: guests seated at a table it could not open.
 */
export async function readOpenOrders(
  client: pg.ClientBase,
  branchId: string,
): Promise<EntitySnapshot[]> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM sales_order WHERE branch_id = $1 AND status = 'draft' ORDER BY created_at, id",
    [branchId],
  );
  const orders: EntitySnapshot[] = [];
  for (const { id } of rows) {
    const stored = await readStoredOrder(client, id, false);
    // The same object the feed carries, typed as any snapshot: the till parses it as one.
    if (stored !== null) orders.push({ ...orderSnapshotOf(stored) });
  }
  return orders;
}
