import { describe, expect, it } from "vitest";
import { CATALOG_ERROR_CODES } from "../catalog/catalog-error-codes";
import { errorOf } from "../catalog/catalog-test-helpers";
import type { Product } from "../catalog/catalog-types";
import { PEARL_MILK_TEA, TOPPINGS } from "../catalog/pearl-milk-tea-test-fixture";
import { vnd } from "../money";
import type { PriceListItem } from "./price-list-types";
import { fixedPrice, priceListItem } from "./pricing-test-helpers";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { validateProductConfig } from "./validate-product-config";

const codeFor = (product: Product, priceList: readonly PriceListItem[] = []) =>
  errorOf(() => validateProductConfig(product, priceList)).code;

const COMBO: Product = {
  id: "breakfast-combo",
  categoryId: null,
  kind: "combo",
  name: "Combo sáng",
  basePrice: vnd(59_000),
  pricingMode: "fixed",
  variants: [],
  modifierGroups: [],
  combo: {
    slots: [
      {
        id: "drink",
        name: "Đồ uống",
        minSelect: 1,
        maxSelect: 1,
        options: [{ productId: "pearl-milk-tea", variantId: "size-m", upcharge: vnd(0) }],
      },
    ],
  },
};

describe("validateProductConfig: the product itself", () => {
  it("accepts the milk tea and the breakfast combo", () => {
    expect(() => validateProductConfig(PEARL_MILK_TEA)).not.toThrow();
    expect(() => validateProductConfig(COMBO)).not.toThrow();
  });

  it("rejects two variants sharing an id", () => {
    const variants = [...PEARL_MILK_TEA.variants, { id: "size-m", name: "M lớn", price: null }];
    expect(codeFor({ ...PEARL_MILK_TEA, variants })).toBe(CATALOG_ERROR_CODES.duplicateVariantId);
  });

  it("accepts a free product and rejects a negative base or variant price", () => {
    expect(() => validateProductConfig({ ...COMBO, basePrice: vnd(0) })).not.toThrow();
    expect(codeFor({ ...COMBO, basePrice: vnd(-1) })).toBe(
      CATALOG_ERROR_CODES.negativeProductPrice,
    );
    const variants = [{ id: "size-m", name: "M", price: vnd(-5_000) }];
    const error = errorOf(() => validateProductConfig({ ...PEARL_MILK_TEA, variants }));
    expect(error.code).toBe(CATALOG_ERROR_CODES.negativeProductPrice);
    expect(error.details).toMatchObject({ variantId: "size-m" });
  });

  it("requires a catalog price for every form sold, except at an open price", () => {
    const unpriced = { ...COMBO, basePrice: null };
    expect(codeFor(unpriced)).toBe(PRICING_ERROR_CODES.missingBasePrice);
    expect(() => validateProductConfig({ ...unpriced, pricingMode: "open_price" })).not.toThrow();
    // Size L carries its own price, size M falls back to the missing base price.
    const error = errorOf(() => validateProductConfig({ ...PEARL_MILK_TEA, basePrice: null }));
    expect(error.code).toBe(PRICING_ERROR_CODES.missingBasePrice);
    expect(error.details).toMatchObject({ variantId: "size-m" });
  });

  it("requires a weighed product to say what its price is per, and no other product to", () => {
    const fruit: Product = { ...PEARL_MILK_TEA, pricingMode: "weighed", modifierGroups: [] };
    expect(codeFor(fruit)).toBe(PRICING_ERROR_CODES.measureUnitMissing);
    expect(codeFor({ ...fruit, measureUnit: null })).toBe(PRICING_ERROR_CODES.measureUnitMissing);
    expect(() => validateProductConfig({ ...fruit, measureUnit: "kg" })).not.toThrow();
    expect(() => validateProductConfig({ ...fruit, measureUnit: "100g" })).not.toThrow();
    const perKgTea = { ...PEARL_MILK_TEA, measureUnit: "kg" } as const;
    expect(codeFor(perKgTea)).toBe(PRICING_ERROR_CODES.measureUnitOnUnweighedProduct);
    expect(() => validateProductConfig({ ...PEARL_MILK_TEA, measureUnit: null })).not.toThrow();
  });

  it("requires slots on a combo and refuses them on any other product", () => {
    expect(codeFor({ ...COMBO, combo: null })).toBe(CATALOG_ERROR_CODES.comboDefinitionMissing);
    expect(codeFor({ ...PEARL_MILK_TEA, combo: COMBO.combo })).toBe(
      CATALOG_ERROR_CODES.comboDefinitionOnNonCombo,
    );
  });

  it("checks the combo's slots", () => {
    const combo = { slots: [{ id: "drink", name: "x", minSelect: 1, maxSelect: 1, options: [] }] };
    expect(codeFor({ ...COMBO, combo })).toBe(CATALOG_ERROR_CODES.requiredComboSlotWithoutOptions);
  });
});

describe("validateProductConfig: modifier groups", () => {
  it("rejects a group attached twice", () => {
    const modifierGroups = [...PEARL_MILK_TEA.modifierGroups, TOPPINGS];
    expect(codeFor({ ...PEARL_MILK_TEA, modifierGroups })).toBe(
      CATALOG_ERROR_CODES.duplicateModifierGroupId,
    );
  });

  it("checks each group's own configuration", () => {
    const modifierGroups = [{ ...TOPPINGS, minSelect: 4 }];
    expect(codeFor({ ...PEARL_MILK_TEA, modifierGroups })).toBe(
      CATALOG_ERROR_CODES.minSelectAboveMaxSelect,
    );
  });

  it("accepts rules for the product's own variants and rejects a rule for any other", () => {
    const ruled = (variantId: string) => ({
      ...PEARL_MILK_TEA,
      modifierGroups: [{ ...TOPPINGS, variantRules: { [variantId]: { maxSelect: 5 } } }],
    });
    expect(() => validateProductConfig(ruled("hot-m"))).not.toThrow();
    const error = errorOf(() => validateProductConfig(ruled("size-xl")));
    expect(error.code).toBe(CATALOG_ERROR_CODES.variantRuleForUnknownVariant);
    expect(error.details).toMatchObject({ groupId: "topping", variantId: "size-xl" });
  });

  it("rejects any variant rule on a product sold without variants", () => {
    const product = { ...COMBO, modifierGroups: [TOPPINGS] };
    expect(codeFor(product)).toBe(CATALOG_ERROR_CODES.variantRuleForUnknownVariant);
  });
});

describe("validateProductConfig: the product's price list items", () => {
  const grabPriceOfL = priceListItem({
    id: "grab-l",
    scope: { kind: "variant", variantId: "size-l" },
    channelKey: "grab",
    effect: fixedPrice(52_000),
  });
  const happyHour = priceListItem({
    id: "happy-hour",
    scope: { kind: "product", productId: "pearl-milk-tea" },
  });

  it("accepts items aimed at its variants, at itself and at broader scopes", () => {
    const menuWide = priceListItem({ id: "menu-wide" });
    expect(() =>
      validateProductConfig(PEARL_MILK_TEA, [grabPriceOfL, happyHour, menuWide]),
    ).not.toThrow();
  });

  it("rejects an item aimed at a variant the product does not have", () => {
    const item = { ...grabPriceOfL, scope: { kind: "variant", variantId: "size-xl" } as const };
    const error = errorOf(() => validateProductConfig(PEARL_MILK_TEA, [item]));
    expect(error.code).toBe(PRICING_ERROR_CODES.scopeVariantNotOnProduct);
    expect(error.details).toMatchObject({ priceListItemId: "grab-l", variantId: "size-xl" });
  });

  it("rejects an item aimed at another product", () => {
    const item = { ...happyHour, scope: { kind: "product", productId: "peach-tea" } as const };
    expect(codeFor(PEARL_MILK_TEA, [item])).toBe(PRICING_ERROR_CODES.scopeProductMismatch);
  });

  it("rejects two items sharing an id, and checks each item's own rules", () => {
    expect(codeFor(PEARL_MILK_TEA, [happyHour, { ...grabPriceOfL, id: "happy-hour" }])).toBe(
      PRICING_ERROR_CODES.duplicatePriceListItemId,
    );
    expect(codeFor(PEARL_MILK_TEA, [{ ...happyHour, priority: 0.5 }])).toBe(
      PRICING_ERROR_CODES.invalidPriority,
    );
  });
});
