import { QUANTITY_SCALE } from "@fnb/domain";
import type { StoredOrder } from "../order/stored-order";

/** How many products are marked at most, and the fewest units sold to be one of them. */
export const BEST_SELLER_LIMIT = 3;
export const BEST_SELLER_MIN_UNITS = 5;

const SOLD: ReadonlySet<string> = new Set(["paid", "posted"]);

/**
 * The products this till's sales sold most of, for the "bán chạy" mark on their tiles: the
 * orders it holds that were paid (drafts, cancelled orders and refunds left out), units of
 * each product's item lines net of what was voided. At most three, each with at least five
 * units sold, most first; a tie goes to the product id, so the marks never swap places
 * between two reads of the same sales.
 */
export function bestSellers(orders: readonly StoredOrder[]): readonly string[] {
  const units = new Map<string, bigint>();
  for (const order of orders) {
    if (!SOLD.has(order.status) || order.refundOfOrderId !== null) continue;
    for (const line of order.lines) {
      if (line.lineType !== "item" || line.productId === null) continue;
      units.set(line.productId, (units.get(line.productId) ?? 0n) + line.quantity);
    }
  }
  const least = BigInt(BEST_SELLER_MIN_UNITS) * QUANTITY_SCALE;
  return [...units]
    .filter(([, sold]) => sold >= least)
    .sort(([a, soldA], [b, soldB]) => (soldA === soldB ? (a < b ? -1 : 1) : soldA > soldB ? -1 : 1))
    .slice(0, BEST_SELLER_LIMIT)
    .map(([productId]) => productId);
}
