import type { OrderLine } from "@fnb/domain";
import type pg from "pg";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/** The till's items of `after` that sell more than `before` did: new, regrown or swapped. */
export function itemsAdding(before: readonly OrderLine[], after: readonly OrderLine[]) {
  const earlier = new Map(before.map((line) => [line.id, line]));
  return after.filter((line) => {
    if (line.lineType !== "item" || line.reversesLineId !== null) return false;
    const was = earlier.get(line.id);
    return was === undefined || was.productId !== line.productId || line.quantity > was.quantity;
  });
}

/** The till's items whose price the cashier typed and the order did not already carry. */
export function newlyTypedPrices(before: readonly OrderLine[], after: readonly OrderLine[]) {
  const earlier = new Map(before.map((line) => [line.id, line]));
  return after.filter((line) => {
    if (line.lineType !== "item" || line.priceSource !== "manual") return false;
    const was = earlier.get(line.id);
    return was?.productId !== line.productId || was.unitPrice !== line.unitPrice;
  });
}

/**
 * Refuses a draft that sells more of a product the branch marked sold out ("86"), on all
 * channels or the order's own, at the moment the till recorded the command. A mark set
 * after that moment does not count: a till that sold the last cup offline and synced late
 * must not have the sale it already made refused. Units already on the order stay sellable,
 * so a table's order can still be edited after the kitchen runs out.
 */
export async function refuseSoldOut(
  client: pg.ClientBase,
  branchId: string,
  channelKey: string | null,
  adding: readonly OrderLine[],
  recordedAt: Date,
) {
  const productIds = [...new Set(adding.flatMap((line) => line.productId ?? []))];
  if (productIds.length === 0) return;
  const { rowCount } = await client.query(
    "SELECT 1 FROM product_availability WHERE branch_id = $1 AND product_id = ANY($2::uuid[]) " +
      "AND (channel_key IS NULL OR channel_key = $3) AND updated_at <= $4 " +
      "AND (unavailable_until IS NULL OR unavailable_until > $4) LIMIT 1",
    [branchId, productIds, channelKey, recordedAt],
  );
  if (rowCount === 1) throw new CommandRejection(SYNC_ERROR_CODES.productSoldOut);
}
