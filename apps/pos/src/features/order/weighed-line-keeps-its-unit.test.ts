import { saveDraftPayloadSchema } from "@fnb/contracts";
import { quantity, vnd } from "@fnb/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PLACE } from "../../test-support/paid-sale-fixture";
import { tid } from "../../test-support/till-fixtures";
import {
  BEANS,
  STRAWBERRIES,
  typedAndWeighedBootstrap,
} from "../../test-support/typed-and-weighed-menu";
import { NO_MENU_COPIES, buildTillMenu } from "../menu/till-menu";
import { billLinesOf } from "../printing/bill-slip";
import { kitchenSlips } from "../printing/kitchen-slips";
import { readStoredTableOrder } from "../table-order/stored-table-order";
import { cartView } from "./cart-view";
import type { CounterOrder } from "./counter-order";
import { openingFromStored } from "./order-opening";
import { tillOrderSnapshot } from "./order-snapshot-for-till";
import { priceCounterOrder } from "./price-counter-order";
import { draftPayload } from "./save-draft-command";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };
const MENU = buildTillMenu(typedAndWeighedBootstrap(), NO_MENU_COPIES, new Set());

/** The same menu after the backoffice moved strawberries to 100 g, at the same price per gram. */
function menuWithStrawberriesPer100g() {
  const bootstrap = typedAndWeighedBootstrap();
  const products = bootstrap.menu.products.map((product) =>
    product.id === STRAWBERRIES.id ? { ...product, measureUnit: "100g" as const, basePrice: vnd(20_000) } : product,
  );
  return buildTillMenu({ ...bootstrap, menu: { ...bootstrap.menu, products } }, NO_MENU_COPIES, new Set());
}

const order = (grams: number, productId = STRAWBERRIES.id): CounterOrder => ({
  orderId: tid(0x950),
  deviceOrderNo: 12,
  serviceType: "takeaway",
  tableTag: null,
  table: null,
  lines: [
    { lineId: tid(0x951), productId, grams, variantId: null, modifiers: [], quantity: 1, note: null },
  ],
});

/** The server's copy of `sold` priced on `menu`, as a till reads it back the next day. */
function storedCopy(menu: typeof MENU, sold: CounterOrder) {
  const row = tillOrderSnapshot(PLACE, sold, priceCounterOrder(menu, sold, PROFILE, AT), {
    status: "paid",
    version: 4,
    businessDate: "2026-10-20",
    chargeProfile: PROFILE,
    payments: [],
    sent: [],
  });
  return readStoredTableOrder(row)!;
}

describe("a weighed line on the till keeps the unit it was priced per", () => {
  it("names its unit beside the weight it sends, so a server with another unit reads the same grams", () => {
    const sold = order(350);
    const payload = draftPayload(sold, priceCounterOrder(MENU, sold, PROFILE, AT));
    expect(saveDraftPayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.lines[0]).toMatchObject({ quantity: "0.35", measureUnit: "kg" });
  });

  it("reprints yesterday's 350 g per kg after the menu moved to 100 g, as it was charged", () => {
    const yesterday = storedCopy(MENU, order(350));
    expect(yesterday.lines[0]).toMatchObject({ quantity: quantity("0.35"), measureUnit: "kg" });
    const today = menuWithStrawberriesPer100g();
    const opened = openingFromStored(today, yesterday);
    expect(opened.order.lines[0]?.grams).toBe(350);
    const kept = new Map([[tid(0x951), yesterday.lines]]);
    const repriced = priceCounterOrder(today, opened.order, PROFILE, AT, kept);
    expect(billLinesOf(today, repriced).map((line) => [line.weighed, line.unitPrice])).toEqual([
      [{ grams: 350, per: "kg" }, 200_000n],
    ]);
    expect(cartView(today, opened.order, PROFILE, AT, kept).unitOf(opened.order.lines[0]!)).toBe("kg");
  });

  it("prints the bar ticket of a line priced per kg in grams, whatever the menu says now", () => {
    const today = menuWithStrawberriesPer100g();
    const yesterday = storedCopy(MENU, order(1_250));
    const sold = openingFromStored(today, yesterday).order;
    const kept = new Map([[tid(0x951), yesterday.lines]]);
    const sale = {
      order: sold,
      priced: priceCounterOrder(today, sold, PROFILE, AT, kept),
      businessDate: "2026-10-20",
      version: 4,
    };
    const preview = (kitchenSlips(today, sale, AT)[0]?.job.preview ?? "").replace(/\u00a0/g, " ");
    expect(preview).toContain("1.250 g x Dâu tây Đà Lạt");
  });

  it("re-prices an unsent weighing on the new unit, and sends the grams in it", () => {
    const today = menuWithStrawberriesPer100g();
    const opened = openingFromStored(today, storedCopy(MENU, order(350)));
    const priced = priceCounterOrder(today, opened.order, PROFILE, AT);
    expect(priced.lines[0]).toMatchObject({ quantity: quantity("3.5"), measureUnit: "100g" });
    expect(priced.totals.amountDue).toBe(70_000n);
    expect(draftPayload(opened.order, priced).lines[0]).toMatchObject({
      quantity: "3.5",
      measureUnit: "100g",
    });
  });

  it("reads any weight back to its grams across a unit change, to three decimals of either unit", () => {
    const today = menuWithStrawberriesPer100g();
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), fc.boolean(), (grams, beans) => {
        const productId = beans ? BEANS.id : STRAWBERRIES.id;
        const stored = storedCopy(MENU, order(grams, productId));
        const opened = openingFromStored(today, stored);
        expect(opened.order.lines[0]?.grams).toBe(grams);
        const kept = new Map([[tid(0x951), stored.lines]]);
        const bill = billLinesOf(today, priceCounterOrder(today, opened.order, PROFILE, AT, kept));
        expect(bill[0]?.weighed).toEqual({ grams, per: beans ? "100g" : "kg" });
      }),
      { numRuns: 200 },
    );
  });
});
