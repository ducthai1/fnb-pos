import type { EntityView } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { PLACE, SALE_MENU, SOLD } from "../../test-support/paid-sale-fixture";
import { MENU, tid } from "../../test-support/till-fixtures";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { priceCounterOrder } from "../order/price-counter-order";
import { type StoredOrder, readStoredOrder } from "../order/stored-order";
import { bestSellers } from "./best-sellers";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };

/** An order of `units` of each product, stored as the till keeps it. */
function stored(
  no: number,
  units: readonly (readonly [string, number])[],
  status: "draft" | "paid" | "cancelled" = "paid",
  extra: Record<string, unknown> = {},
): StoredOrder {
  const order = {
    ...SOLD,
    orderId: tid(0x9000 + no),
    deviceOrderNo: no,
    lines: units.map(([productId, quantity], index) => ({
      lineId: tid(0x9100 + no * 16 + index),
      productId,
      variantId: null,
      modifiers: [],
      quantity,
      note: null,
    })),
  };
  const priced = priceCounterOrder(SALE_MENU, order, PROFILE, AT);
  const snapshot = tillOrderSnapshot(PLACE, order, priced, {
    status,
    version: 2,
    businessDate: "2026-10-20",
    chargeProfile: PROFILE,
    payments: [],
    sent: [],
  });
  return readStoredOrder({ ...snapshot, ...extra } as EntityView["snapshot"])!;
}

describe("the till's best sellers", () => {
  it("marks the products sold at least five times, most sold first", () => {
    const orders = [stored(1, [[MENU.coffee, 4]]), stored(2, [[MENU.coffee, 3], [MENU.cake, 5]])];
    expect(bestSellers(orders)).toEqual([MENU.coffee, MENU.cake]);
  });

  it("marks nothing sold fewer than five times, however it ranks", () => {
    expect(bestSellers([stored(1, [[MENU.coffee, 4], [MENU.cake, 1]])])).toEqual([]);
  });

  it("counts only paid sales: not drafts, cancelled orders or refunds", () => {
    const orders = [
      stored(1, [[MENU.coffee, 4]]),
      stored(2, [[MENU.coffee, 9]], "draft"),
      stored(3, [[MENU.coffee, 9]], "cancelled"),
      stored(4, [[MENU.coffee, 9]], "paid", { refundOfOrderId: tid(0x9001) }),
    ];
    expect(bestSellers(orders)).toEqual([]);
    expect(bestSellers([...orders, stored(5, [[MENU.coffee, 1]])])).toEqual([MENU.coffee]);
  });

  it("keeps three at most, and breaks a tie the same way on every read", () => {
    // Sales of four products, six of each: a coffee sale whose item stands for each of them.
    const products = [tid(0x9a03), tid(0x9a01), tid(0x9a04), tid(0x9a02)];
    const orders = products.map((productId, index) => {
      const sale = stored(10 + index, [[MENU.coffee, 6]]);
      return { ...sale, lines: sale.lines.map((line) => ({ ...line, productId })) };
    });
    expect(bestSellers(orders)).toEqual([tid(0x9a01), tid(0x9a02), tid(0x9a03)]);
    expect(bestSellers([...orders].reverse())).toEqual([tid(0x9a01), tid(0x9a02), tid(0x9a03)]);
  });
});
