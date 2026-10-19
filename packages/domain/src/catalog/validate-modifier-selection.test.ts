import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import { SUGAR_AND_ICE, errorOf, ice, sugar, topping } from "./catalog-test-helpers";
import type { Product } from "./catalog-types";
import { PEARL_MILK_TEA, TOPPINGS } from "./pearl-milk-tea-test-fixture";
import { validateModifierSelection } from "./validate-modifier-selection";

const BOTTLED_WATER: Product = {
  ...PEARL_MILK_TEA,
  id: "water",
  kind: "retail_item",
  name: "Nước suối",
  variants: [],
  modifierGroups: [],
};

describe("validateModifierSelection: lookup and normalisation", () => {
  it("merges repeated topping lines and returns choices in catalog order with their price", () => {
    const taps = [topping("pearl"), topping("jelly"), ice("ice-less"), topping("pearl"), sugar(50)];
    expect(validateModifierSelection(PEARL_MILK_TEA, "size-m", taps)).toEqual([
      { groupId: "sugar", optionId: "sugar-50", quantity: 1, unitPriceDelta: 0n, priceDelta: 0n },
      { groupId: "ice", optionId: "ice-less", quantity: 1, unitPriceDelta: 0n, priceDelta: 0n },
      {
        groupId: "topping",
        optionId: "pearl",
        quantity: 2,
        unitPriceDelta: 5_000n,
        priceDelta: 10_000n,
      },
      {
        groupId: "topping",
        optionId: "jelly",
        quantity: 1,
        unitPriceDelta: 5_000n,
        priceDelta: 5_000n,
      },
    ]);
  });

  it("accepts a variant of the product and rejects one it does not have", () => {
    expect(() => validateModifierSelection(PEARL_MILK_TEA, "size-l", SUGAR_AND_ICE)).not.toThrow();
    const error = errorOf(() =>
      validateModifierSelection(PEARL_MILK_TEA, "size-xl", SUGAR_AND_ICE),
    );
    expect(error.code).toBe(CATALOG_ERROR_CODES.unknownVariant);
    expect(error.details).toMatchObject({ productId: "pearl-milk-tea", variantId: "size-xl" });
  });

  it("requires a variant on a sized drink but sells a product without variants with none", () => {
    const noSize = errorOf(() => validateModifierSelection(PEARL_MILK_TEA, null, SUGAR_AND_ICE));
    expect(noSize.code).toBe(CATALOG_ERROR_CODES.variantRequired);
    expect(validateModifierSelection(BOTTLED_WATER, null, [])).toEqual([]);
    const strayVariant = errorOf(() => validateModifierSelection(BOTTLED_WATER, "size-m", []));
    expect(strayVariant.code).toBe(CATALOG_ERROR_CODES.unknownVariant);
  });

  it("rejects a group that is not on the product", () => {
    const taps = [...SUGAR_AND_ICE, { groupId: "sauce", optionId: "chili", quantity: 1 }];
    const error = errorOf(() => validateModifierSelection(PEARL_MILK_TEA, "size-m", taps));
    expect(error.code).toBe(CATALOG_ERROR_CODES.unknownModifierGroup);
    expect(error.details).toMatchObject({ groupId: "sauce", optionId: "chili" });
  });

  it("rejects an option sent under a group it does not belong to", () => {
    // "pearl" exists on the product, but as a topping, not as a sugar level.
    const taps = [ice("ice-less"), { groupId: "sugar", optionId: "pearl", quantity: 1 }];
    const error = errorOf(() => validateModifierSelection(PEARL_MILK_TEA, "size-m", taps));
    expect(error.code).toBe(CATALOG_ERROR_CODES.unknownModifierOption);
    expect(error.details).toMatchObject({ groupId: "sugar", optionId: "pearl" });
  });

  it("skips the ice level on a hot drink and rejects an ice choice sent for it", () => {
    expect(validateModifierSelection(PEARL_MILK_TEA, "hot-m", [sugar(30)])).toHaveLength(1);
    const error = errorOf(() =>
      validateModifierSelection(PEARL_MILK_TEA, "hot-m", [sugar(30), ice("ice-less")]),
    );
    expect(error.code).toBe(CATALOG_ERROR_CODES.modifierGroupHidden);
    expect(error.details).toMatchObject({
      groupId: "ice",
      optionId: "ice-less",
      variantId: "hot-m",
    });
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects a selection quantity of %d", (quantity) => {
    const taps = [...SUGAR_AND_ICE, topping("pearl", quantity)];
    const error = errorOf(() => validateModifierSelection(PEARL_MILK_TEA, "size-m", taps));
    expect(error.code).toBe(CATALOG_ERROR_CODES.invalidSelectionQuantity);
  });

  it("gives the same result whatever order the choices were tapped in", () => {
    const taps = [
      sugar(70),
      ice("ice-normal"),
      topping("pearl"),
      topping("pearl"),
      topping("jelly"),
      topping("pudding"),
      topping("pudding"),
    ];
    const expected = validateModifierSelection(PEARL_MILK_TEA, "size-l", taps);
    fc.assert(
      fc.property(fc.shuffledSubarray(taps, { minLength: taps.length }), (shuffled) => {
        expect(validateModifierSelection(PEARL_MILK_TEA, "size-l", shuffled)).toEqual(expected);
      }),
    );
  });

  it("adds up to the sum of every tapped topping's price", () => {
    const priceOf = new Map(TOPPINGS.options.map((option) => [option.id, option.priceDelta]));
    fc.assert(
      fc.property(fc.array(fc.constantFrom("pearl", "jelly"), { maxLength: 5 }), (tapped) => {
        const taps = [...SUGAR_AND_ICE, ...tapped.map((id) => topping(id))];
        const result = validateModifierSelection(PEARL_MILK_TEA, "size-l", taps);
        const total = result.reduce((sum, choice) => sum + choice.priceDelta, 0n);
        expect(total).toBe(tapped.reduce((sum, id) => sum + (priceOf.get(id) ?? 0n), 0n));
      }),
    );
  });
});
