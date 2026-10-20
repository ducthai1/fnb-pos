import { posProductSchema } from "@fnb/contracts";
import { computeOrderTotals, quantity, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { buildTillMenu, NO_MENU_COPIES } from "../menu/till-menu";
import { COFFEE, MENU, tillBootstrap } from "../../test-support/till-fixtures";
import { type CounterOrder, newCounterOrder } from "./counter-order";
import { ProductGoneError, priceCounterOrder } from "./price-counter-order";

const menu = buildTillMenu(tillBootstrap(), NO_MENU_COPIES, new Set());
const INCLUSIVE = { pricesIncludeTax: true, serviceCharge: null };
const AT = Date.UTC(2026, 9, 20, 3, 0);
const order: CounterOrder = {
  ...newCounterOrder("0199f000-0000-7000-8000-00000000aaaa", 7),
  lines: [
    {
      lineId: "0199f000-0000-7000-8000-00000000aaa1",
      productId: MENU.milkTea,
      variantId: MENU.sizeL,
      modifiers: [
        { groupId: MENU.sugar, optionId: MENU.sugarFull, quantity: 1 },
        { groupId: MENU.toppings, optionId: MENU.pearl, quantity: 2 },
      ],
      quantity: 2,
      note: null,
    },
    {
      lineId: "0199f000-0000-7000-8000-00000000aaa2",
      productId: MENU.coffee,
      variantId: null,
      modifiers: [],
      quantity: 1,
      note: null,
    },
  ],
};

describe("pricing the counter order", () => {
  it("prices options per cup of their item, as the server stores them, and totals by the domain", () => {
    const priced = priceCounterOrder(menu, order, INCLUSIVE, AT);
    const pearls = priced.lines.find((line) => line.modifierOptionId === MENU.pearl);
    expect(pearls).toMatchObject({
      unitPrice: vnd(5_000),
      quantity: quantity(2),
      parentLineId: order.lines[0]?.lineId,
    });
    expect(priced.lines.find((line) => line.id === order.lines[0]?.lineId)).toMatchObject({
      nameSnapshot: "Trà sữa trân châu (L)",
      unitPrice: vnd(45_000),
      quantity: quantity(2),
      taxRate: 800,
    });
    // 2 × (45.000 + 2 × 5.000) + 29.000, VAT inside the prices.
    expect(priced.totals.amountDue).toBe(vnd(139_000));
    expect(priced.totals).toEqual(
      computeOrderTotals({ lines: priced.lines, serviceType: "takeaway" }, INCLUSIVE),
    );
  });

  it("adds VAT on top when the shop's prices are without it", () => {
    const priced = priceCounterOrder(
      menu,
      order,
      { pricesIncludeTax: false, serviceCharge: null },
      AT,
    );
    expect(priced.totals.amountDue).toBe(vnd(150_120));
  });

  it("prices at the moment asked: a price list item for that hour wins", () => {
    const repriced = buildTillMenu(
      tillBootstrap(),
      {
        ...NO_MENU_COPIES,
        catalog_product: new Map([
          [MENU.coffee, posProductSchema.parse({ ...COFFEE, version: 11, basePrice: 25_000 })],
        ]),
      },
      new Set(),
    );
    expect(priceCounterOrder(repriced, order, INCLUSIVE, AT).totals.amountDue).toBe(vnd(135_000));
  });

  it("refuses to price a line whose product left the menu", () => {
    const gone = {
      ...order,
      lines: [{ ...order.lines[1]!, productId: MENU.combo.replace(/0$/, "e") }],
    };
    expect(() => priceCounterOrder(menu, gone, INCLUSIVE, AT)).toThrow(ProductGoneError);
  });
});
