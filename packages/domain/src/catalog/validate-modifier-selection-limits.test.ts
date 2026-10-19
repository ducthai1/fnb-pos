import { describe, expect, it } from "vitest";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import { SUGAR_AND_ICE, errorOf, ice, sugar, topping } from "./catalog-test-helpers";
import type { Product } from "./catalog-types";
import { PEARL_MILK_TEA, TOPPINGS } from "./pearl-milk-tea-test-fixture";
import {
  type ModifierSelectionInput,
  validateModifierSelection,
} from "./validate-modifier-selection";

const errorFor = (
  variantId: string,
  taps: readonly ModifierSelectionInput[],
  product: Product = PEARL_MILK_TEA,
) => errorOf(() => validateModifierSelection(product, variantId, taps));

describe("validateModifierSelection: how many may be chosen", () => {
  it("allows 3 toppings on M and rejects a 4th, counting quantities", () => {
    const three = [...SUGAR_AND_ICE, topping("pearl", 2), topping("jelly")];
    expect(() => validateModifierSelection(PEARL_MILK_TEA, "size-m", three)).not.toThrow();
    const error = errorFor("size-m", [...SUGAR_AND_ICE, topping("pearl", 2), topping("jelly", 2)]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.tooManyModifierSelections);
    expect(error.details).toMatchObject({
      groupId: "topping",
      variantId: "size-m",
      maxSelect: 3,
      selected: 4,
    });
  });

  it("allows 5 toppings on L and rejects a 6th", () => {
    const five = [...SUGAR_AND_ICE, topping("pearl", 3), topping("jelly", 2)];
    expect(() => validateModifierSelection(PEARL_MILK_TEA, "size-l", five)).not.toThrow();
    const error = errorFor("size-l", [...SUGAR_AND_ICE, topping("pearl", 3), topping("jelly", 3)]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.tooManyModifierSelections);
    expect(error.details).toMatchObject({ variantId: "size-l", maxSelect: 5, selected: 6 });
  });

  it("rejects picking two sugar levels at once", () => {
    const error = errorFor("size-m", [sugar(50), sugar(70), ice("ice-less")]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.tooManyModifierSelections);
    expect(error.details).toMatchObject({ groupId: "sugar", maxSelect: 1, selected: 2 });
  });

  it("rejects fewer choices than a group's minimum once something is chosen", () => {
    const pickTwo = { ...PEARL_MILK_TEA, modifierGroups: [{ ...TOPPINGS, minSelect: 2 }] };
    const two = [topping("pearl"), topping("jelly")];
    expect(() => validateModifierSelection(pickTwo, "size-m", two)).not.toThrow();
    const error = errorFor("size-m", [topping("pearl")], pickTwo);
    expect(error.code).toBe(CATALOG_ERROR_CODES.tooFewModifierSelections);
    expect(error.details).toMatchObject({ groupId: "topping", minSelect: 2, selected: 1 });
  });

  it("allows the same topping on two lines", () => {
    const taps = [...SUGAR_AND_ICE, topping("pearl"), topping("pearl")];
    expect(validateModifierSelection(PEARL_MILK_TEA, "size-m", taps)).toContainEqual(
      expect.objectContaining({ optionId: "pearl", quantity: 2 }),
    );
  });

  it("rejects the same sugar level on two lines or with quantity 2", () => {
    const twoLines = errorFor("size-m", [sugar(50), sugar(50), ice("ice-less")]);
    expect(twoLines.code).toBe(CATALOG_ERROR_CODES.duplicateModifierNotAllowed);
    expect(twoLines.details).toMatchObject({ groupId: "sugar", optionId: "sugar-50" });
    const doubled = errorFor("size-m", [{ ...sugar(50), quantity: 2 }, ice("ice-less")]);
    expect(doubled.code).toBe(CATALOG_ERROR_CODES.duplicateModifierNotAllowed);
  });

  it("caps pudding at 2 portions even when the size allows more toppings", () => {
    const two = [...SUGAR_AND_ICE, topping("pudding", 2)];
    expect(() => validateModifierSelection(PEARL_MILK_TEA, "size-l", two)).not.toThrow();
    const error = errorFor("size-l", [...SUGAR_AND_ICE, topping("pudding"), topping("pudding", 2)]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.optionMaxQuantityExceeded);
    expect(error.details).toMatchObject({
      groupId: "topping",
      optionId: "pudding",
      maxQuantity: 2,
      quantity: 3,
    });
  });

  it("accepts a drink without toppings and rejects one without its required sugar level", () => {
    expect(() => validateModifierSelection(PEARL_MILK_TEA, "size-m", SUGAR_AND_ICE)).not.toThrow();
    const error = errorFor("size-m", [ice("ice-less"), topping("jelly")]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.requiredModifierGroupMissing);
    expect(error.details).toMatchObject({ groupId: "sugar", minSelect: 1, selected: 0 });
  });
});
