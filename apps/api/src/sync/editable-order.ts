import { assertLinesEditable } from "@fnb/domain";
import { type StoredOrder, readStoredOrder } from "./stored-order";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * The order a command changes, locked for the rest of the command. One of another branch
 * reads as missing: a till never learns what another branch sells.
 */
export async function orderOfBranch(
  context: SyncCommandContext,
  orderId: string,
): Promise<StoredOrder> {
  const stored = await readStoredOrder(context.client, orderId, true);
  if (stored === null || stored.branchId !== context.device.branchId) {
    throw new CommandRejection(SYNC_ERROR_CODES.orderNotFound);
  }
  return stored;
}

/** orderOfBranch, for a command that changes lines: only a draft's lines may change. */
export async function draftOfBranch(
  context: SyncCommandContext,
  orderId: string,
): Promise<StoredOrder> {
  const stored = await orderOfBranch(context, orderId);
  assertLinesEditable(stored.order);
  return stored;
}
