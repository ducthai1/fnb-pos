import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_ERROR_CODES, type Product } from "../catalog";
import { errorOf } from "../catalog/catalog-test-helpers";
import { PEARL_MILK_TEA } from "../catalog/pearl-milk-tea-test-fixture";
import { multiplyVndByQuantity, quantity, vnd } from "../money";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { MAX_ENTERED_PRICE } from "./resolve-price";
import { percentOff, priceListItem, priceOf } from "./pricing-test-helpers";

const STRAWBERRIES: Product = {
  ...PEARL_MILK_TEA,
  id: "strawberries",
  categoryId: "fruit",
  kind: "retail_item",
  name: "Dâu tây Đà Lạt",
  basePrice: vnd(120_000), // per kg
  pricingMode: "weighed",
  variants: [],
  modifierGroups: [],
};
const CUSTOM_CAKE: Product = {
  ...STRAWBERRIES,
  id: "custom-cake",
  kind: "prepared_item",
  name: "Bánh kem theo yêu cầu",
  basePrice: null,
  pricingMode: "open_price",
};
const HALF_PRICE_EVERYTHING = [priceListItem({ id: "half-price", effect: percentOff(50) })];

describe("resolveUnitPrice: catalog price", () => {
  it("sells size M at the product's base price and size L at its own price", () => {
    expect(priceOf()).toEqual({ unitPrice: 35_000n, source: "base", priceListItemId: null });
    expect(priceOf({ variantId: "size-l" }).unitPrice).toBe(45_000n);
  });

  it("rejects a variant the product does not have", () => {
    expect(errorOf(() => priceOf({ variantId: "size-xl" })).code).toBe(
      CATALOG_ERROR_CODES.unknownVariant,
    );
  });

  it("prices a variant with its own price even when the product has no base price", () => {
    const noBase = { ...PEARL_MILK_TEA, basePrice: null };
    expect(priceOf({ product: noBase, variantId: "size-l" }).unitPrice).toBe(45_000n);
    const error = errorOf(() => priceOf({ product: noBase, variantId: "size-m" }));
    expect(error.code).toBe(PRICING_ERROR_CODES.missingBasePrice);
    expect(error.details).toMatchObject({ productId: "pearl-milk-tea", variantId: "size-m" });
  });

  it("takes a percentage off the base price with the item's rounding mode", () => {
    const odd = { ...PEARL_MILK_TEA, basePrice: vnd(35_555) };
    // 35.555 × 85% = 30.221,75 đ
    const up = [priceListItem({ id: "p", effect: percentOff(15, "half-up") })];
    const down = [priceListItem({ id: "p", effect: percentOff(15, "down") })];
    expect(priceOf({ product: odd, priceList: up })).toEqual({
      unitPrice: 30_222n,
      source: "price_list",
      priceListItemId: "p",
    });
    expect(priceOf({ product: odd, priceList: down }).unitPrice).toBe(30_221n);
  });

  it("returns the base price with source base whenever no price list item exists", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("size-m", "size-l", "hot-m"),
        fc.integer({ min: 0, max: 4_102_444_800_000 }),
        fc.integer({ min: -720, max: 840 }),
        fc.bigInt({ min: 0n, max: 10_000_000n }),
        (variantId, at, utcOffsetMinutes, base) => {
          const product = { ...PEARL_MILK_TEA, basePrice: vnd(base) };
          const expected = variantId === "size-l" ? 45_000n : base;
          expect(priceOf({ product, variantId, at, utcOffsetMinutes })).toEqual({
            unitPrice: expected,
            source: "base",
            priceListItemId: null,
          });
        },
      ),
    );
  });
});

describe("resolveUnitPrice: weighed and open-price products", () => {
  it("returns a weighed product's price per kg, discounted, for the line to multiply by weight", () => {
    const tenOff = [priceListItem({ id: "fruit-day", effect: percentOff(10) })];
    const { unitPrice } = priceOf({ product: STRAWBERRIES, variantId: null, priceList: tenOff });
    expect(unitPrice).toBe(108_000n);
    expect(multiplyVndByQuantity(unitPrice, quantity("0.35"), "half-up")).toBe(37_800n);
  });

  it("rejects a weighed product with no price per unit", () => {
    const unpriced = { ...STRAWBERRIES, basePrice: null };
    const error = errorOf(() => priceOf({ product: unpriced, variantId: null }));
    expect(error.code).toBe(PRICING_ERROR_CODES.missingBasePrice);
  });

  it("sells an open-price product at the typed price, untouched by the price list", () => {
    const sale = priceOf({
      product: CUSTOM_CAKE,
      variantId: null,
      enteredPrice: vnd(250_000),
      priceList: HALF_PRICE_EVERYTHING,
    });
    expect(sale).toEqual({ unitPrice: 250_000n, source: "manual", priceListItemId: null });
    expect(priceOf({ product: CUSTOM_CAKE, variantId: null, enteredPrice: vnd(0) }).unitPrice).toBe(
      0n,
    );
  });

  it("rejects an open-price sale without a typed price or with a negative one", () => {
    const missing = errorOf(() => priceOf({ product: CUSTOM_CAKE, variantId: null }));
    expect(missing.code).toBe(PRICING_ERROR_CODES.enteredPriceRequired);
    expect(missing.details).toMatchObject({ productId: "custom-cake" });
    const negative = errorOf(() =>
      priceOf({ product: CUSTOM_CAKE, variantId: null, enteredPrice: vnd(-1) }),
    );
    expect(negative.code).toBe(PRICING_ERROR_CODES.negativeEnteredPrice);
  });

  it("takes a typed price up to 100.000.000 đ and refuses one đồng more", () => {
    const at = (price: bigint) => () =>
      priceOf({ product: CUSTOM_CAKE, variantId: null, enteredPrice: vnd(price) });
    expect(at(MAX_ENTERED_PRICE)().unitPrice).toBe(100_000_000n);
    const error = errorOf(at(MAX_ENTERED_PRICE + 1n));
    expect(error.code).toBe(PRICING_ERROR_CODES.enteredPriceTooLarge);
    expect(error.details).toMatchObject({ enteredPrice: 100_000_001n });
  });

  it("rejects a typed price on a product that has a catalog price", () => {
    const error = errorOf(() => priceOf({ enteredPrice: vnd(20_000) }));
    expect(error.code).toBe(PRICING_ERROR_CODES.enteredPriceNotAllowed);
    expect(error.details).toMatchObject({ productId: "pearl-milk-tea", pricingMode: "fixed" });
  });
});
