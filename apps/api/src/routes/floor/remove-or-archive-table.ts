import type pg from "pg";
import type { CatalogWriteContext } from "../../catalog/catalog-row-writes";
import { FLOOR_API_ERROR_CODES } from "./floor-api-error-codes";
import { FloorRequestError } from "./floor-route-support";

/**
 * Takes a table off the floor plan; the caller holds its row lock, which a till seating
 * guests waits on, so no order can sit down between this check and the change. Guests
 * seated at it are a refusal: archiving the table would hide their open bill from the
 * floor screen. A table orders were ever seated at is archived, as they keep pointing at
 * it; one that never held an order is deleted.
 */
export async function removeOrArchiveTable(
  client: pg.PoolClient,
  writer: CatalogWriteContext,
  tableId: string,
): Promise<"deleted" | "archived"> {
  const orders = await client.query<{ open: boolean }>(
    "SELECT bool_or(status = 'draft') AS open FROM sales_order WHERE table_id = $1",
    [tableId],
  );
  const open = orders.rows[0]?.open ?? null;
  if (open === true) throw new FloorRequestError(409, FLOOR_API_ERROR_CODES.tableHasOpenOrder);
  if (open === null) {
    await client.query("DELETE FROM dining_table WHERE id = $1", [tableId]);
    return "deleted";
  }
  await client.query(
    "UPDATE dining_table SET archived_at = $2, updated_at = $2, version = version + 1 " +
      "WHERE id = $1 AND archived_at IS NULL",
    [tableId, writer.now],
  );
  return "archived";
}
