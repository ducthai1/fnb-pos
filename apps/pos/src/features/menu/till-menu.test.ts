import { posAvailabilitySchema, posProductSchema } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { COFFEE, MENU, MILK_TEA, tillBootstrap } from "../../test-support/till-fixtures";
import { type MenuCopies, NO_MENU_COPIES, buildTillMenu, removedKey } from "./till-menu";

const product = (wire: object) => posProductSchema.parse(wire);
const withProducts = (...rows: ReturnType<typeof product>[]): MenuCopies => ({
  ...NO_MENU_COPIES,
  catalog_product: new Map(rows.map((row) => [row.id, row])),
});
const priceOf = (menu: ReturnType<typeof buildTillMenu>, id: string) =>
  menu.productsById.get(id)?.basePrice;

describe("the menu a till sells from", () => {
  it("takes a product copy from the feed when its version is newer than the bootstrap's", () => {
    const repriced = product({ ...COFFEE, version: 11, basePrice: 31_000 });
    const menu = buildTillMenu(tillBootstrap(), withProducts(repriced), new Set());
    expect(priceOf(menu, MENU.coffee)).toBe(31_000n);
  });

  it("keeps the bootstrap's copy over a feed copy of the same or an older version", () => {
    for (const version of [10, 9]) {
      const stale = product({ ...COFFEE, version, basePrice: 1_000 });
      const menu = buildTillMenu(tillBootstrap(), withProducts(stale), new Set());
      expect(priceOf(menu, MENU.coffee)).toBe(29_000n);
    }
  });

  it("adds a product created after the bootstrap and drops one the feed removed", () => {
    const fresh = product({ ...COFFEE, id: MENU.combo.replace(/0$/, "f"), version: 12 });
    const removed = new Set([removedKey("catalog_product", MENU.milkTea)]);
    const menu = buildTillMenu(tillBootstrap(), withProducts(fresh), removed);
    expect(menu.productsById.has(fresh.id)).toBe(true);
    expect(menu.productsById.has(MENU.milkTea)).toBe(false);
    expect(
      buildTillMenu(tillBootstrap(), NO_MENU_COPIES, new Set()).productsById.has(MENU.milkTea),
    ).toBe(true);
  });

  it("offers typed-price, weighed and combo products, but no combo stored without its slots", () => {
    const menu = buildTillMenu(tillBootstrap(), NO_MENU_COPIES, new Set());
    expect(menu.products.map((row) => row.name)).toEqual([
      "Bánh croissant",
      "Cà phê sữa",
      "Trà sữa trân châu",
    ]);
    const sold = (change: Record<string, unknown>) =>
      buildTillMenu(
        tillBootstrap(),
        withProducts(product({ ...MILK_TEA, version: 11, ...change })),
        new Set(),
      ).products.map((row) => row.id);
    expect(sold({ pricingMode: "open_price" })).toContain(MENU.milkTea);
    expect(sold({ pricingMode: "weighed", measureUnit: "100g" })).toContain(MENU.milkTea);
    // A copy from before units cannot say what its price is per: not sold until a newer one.
    expect(sold({ pricingMode: "weighed" })).not.toContain(MENU.milkTea);
    expect(sold({ kind: "combo", combo: { slots: [] } })).not.toContain(MENU.milkTea);
    const drink = { id: MENU.coffee, name: "Đồ uống", minSelect: 1, maxSelect: 1 };
    const options = [{ productId: MENU.coffee, variantId: null, upcharge: 0 }];
    expect(sold({ kind: "combo", combo: { slots: [{ ...drink, options }] } })).toContain(
      MENU.milkTea,
    );
  });

  it("takes sold-out state from the feed, newest version only", () => {
    const back = posAvailabilitySchema.parse({ productId: MENU.cake, version: 11, entries: [] });
    const copies = { ...NO_MENU_COPIES, catalog_availability: new Map([[MENU.cake, back]]) };
    expect(
      buildTillMenu(tillBootstrap(), copies, new Set()).availability.get(MENU.cake)?.entries,
    ).toEqual([]);
    const older = { ...back, version: 3 };
    const stale = { ...NO_MENU_COPIES, catalog_availability: new Map([[MENU.cake, older]]) };
    expect(
      buildTillMenu(tillBootstrap(), stale, new Set()).availability.get(MENU.cake)?.entries,
    ).toHaveLength(1);
  });

  it("takes the till's settings from the feed only when they are newer", () => {
    const bootstrap = tillBootstrap();
    const newer = { ...bootstrap.config, version: 11, flags: { pay_first_counter: false } };
    const copies = { ...NO_MENU_COPIES, device_config: new Map([[newer.id, newer]]) };
    expect(buildTillMenu(bootstrap, copies, new Set()).config.flags).toEqual({
      pay_first_counter: false,
    });
    const older = {
      ...NO_MENU_COPIES,
      device_config: new Map([[newer.id, { ...newer, version: 10 }]]),
    };
    expect(buildTillMenu(bootstrap, older, new Set()).config.flags).toEqual({
      pay_first_counter: true,
    });
  });
});
