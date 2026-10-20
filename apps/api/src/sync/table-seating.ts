import type pg from "pg";
import { CommandRejection } from "./sync-error-codes";
import { TABLE_SYNC_ERROR_CODES } from "./table-sync-error-codes";

const UNIQUE_VIOLATION = "23505";
const ONE_DRAFT_PER_TABLE = "sales_order_one_draft_per_table";

/**
 * A table of the till's branch that guests can sit at, as the order will remember it. It
 * is share-locked for the command, so a manager archiving it at this moment either waits
 * for this order (and then refuses, the table being taken) or is seen here as archived.
 */
export async function seatableTable(
  client: pg.ClientBase,
  branchId: string,
  tableId: string,
): Promise<{ id: string; name: string }> {
  const found = await client.query<{ name: string; branch_id: string; archived: boolean }>(
    "SELECT t.name, a.branch_id, (t.archived_at IS NOT NULL OR a.archived_at IS NOT NULL) " +
      "AS archived FROM dining_table t JOIN area a ON a.id = t.area_id WHERE t.id = $1 " +
      "FOR SHARE OF t",
    [tableId],
  );
  const table = found.rows[0];
  if (table === undefined || table.branch_id !== branchId) {
    throw new CommandRejection(TABLE_SYNC_ERROR_CODES.tableNotFound);
  }
  if (table.archived) throw new CommandRejection(TABLE_SYNC_ERROR_CODES.tableArchived);
  return { id: tableId, name: table.name };
}

/**
 * Runs a write that seats an order at a table. The database keeps one open order per
 * table; when another order got there first, even a moment ago on another till, the write
 * fails on that index and the command is refused, never merged into or overwriting it.
 * The failed statement aborts the command's savepoint, which the caller rolls back.
 */
export async function seatingAtTable<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const { code, constraint } = error as { code?: unknown; constraint?: unknown };
    if (code === UNIQUE_VIOLATION && constraint === ONE_DRAFT_PER_TABLE) {
      throw new CommandRejection(TABLE_SYNC_ERROR_CODES.tableOccupied);
    }
    throw error;
  }
}
