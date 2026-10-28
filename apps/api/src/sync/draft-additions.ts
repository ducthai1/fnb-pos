import type { OrderLine } from "@fnb/domain";
import type pg from "pg";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

const picksOf = (lines: readonly OrderLine[], itemId: string) =>
  lines.flatMap((line) =>
    line.parentLineId === itemId && line.lineType === "combo_component" && line.productId !== null
      ? [line.productId]
      : [],
  );

/**
 * The products `after` sells more of than `before` did: items new, regrown or swapped, with
 * every pick of such a combo, and the picks swapped into a combo that kept its units.
 */
export function productsAdding(before: readonly OrderLine[], after: readonly OrderLine[]) {
  const earlier = new Map(before.map((line) => [line.id, line]));
  return after.flatMap((line) => {
    if (line.lineType !== "item" || line.reversesLineId !== null || line.productId === null) {
      return [];
    }
    const was = earlier.get(line.id);
    const picks = picksOf(after, line.id);
    if (was === undefined || was.productId !== line.productId || line.quantity > was.quantity) {
      return [line.productId, ...picks];
    }
    const had = picksOf(before, line.id);
    return picks.filter((productId) => {
      const index = had.indexOf(productId);
      if (index === -1) return true;
      had.splice(index, 1);
      return false;
    });
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
 * so a table's order can still be edited after the kitchen runs out. A combo whose pick is
 * sold out is refused like the pick would be: the combo cannot be made with it.
 */
export async function refuseSoldOut(
  client: pg.ClientBase,
  branchId: string,
  channelKey: string | null,
  adding: readonly string[],
  recordedAt: Date,
) {
  const productIds = [...new Set(adding)];
  if (productIds.length === 0) return;
  const { rowCount } = await client.query(
    "SELECT 1 FROM product_availability WHERE branch_id = $1 AND product_id = ANY($2::uuid[]) " +
      "AND (channel_key IS NULL OR channel_key = $3) AND updated_at <= $4 " +
      "AND (unavailable_until IS NULL OR unavailable_until > $4) LIMIT 1",
    [branchId, productIds, channelKey, recordedAt],
  );
  if (rowCount === 1) throw new CommandRejection(SYNC_ERROR_CODES.productSoldOut);
}
