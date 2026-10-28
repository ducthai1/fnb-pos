import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import { SUGAR_AND_ICE, errorOf, topping } from "./catalog-test-helpers";
import type { Product } from "./catalog-types";
import { PEARL_MILK_TEA } from "./pearl-milk-tea-test-fixture";
import { type ComboPickInput, resolveComboPicks } from "./resolve-combo-picks";

const CROISSANT: Product = {
  id: "croissant",
  categoryId: null,
  kind: "prepared_item",
  name: "Bánh sừng bò",
  basePrice: vnd(25_000),
  pricingMode: "fixed",
  variants: [],
  modifierGroups: [],
  combo: null,
};

const BREAKFAST: Product = {
  ...CROISSANT,
  id: "breakfast",
  kind: "combo",
  name: "Combo sáng",
  basePrice: vnd(55_000),
  combo: {
    slots: [
      {
        id: "drink",
        name: "Đồ uống",
        minSelect: 1,
        maxSelect: 1,
        options: [
          { productId: "pearl-milk-tea", variantId: "size-m", upcharge: vnd(0) },
          { productId: "pearl-milk-tea", variantId: "size-l", upcharge: vnd(10_000) },
        ],
      },
      {
        id: "bakery",
        name: "Bánh",
        minSelect: 0,
        maxSelect: 2,
        options: [{ productId: "croissant", variantId: null, upcharge: vnd(0) }],
      },
    ],
  },
};

const MENU = new Map([PEARL_MILK_TEA, CROISSANT, BREAKFAST].map((p) => [p.id, p]));
const productOf = (id: string) => MENU.get(id);

const pick = (
  slotId: string,
  productId: string,
  variantId: string | null,
  modifiers: ComboPickInput["modifiers"] = [],
): ComboPickInput => ({ slotId, productId, variantId, modifiers });

const TEA_L = pick("drink", "pearl-milk-tea", "size-l", [...SUGAR_AND_ICE, topping("pearl")]);
const CROISSANT_PICK = pick("bakery", "croissant", null);

describe("resolveComboPicks", () => {
  it("names each component, keeps its upcharge and prices its own options", () => {
    const resolved = resolveComboPicks(BREAKFAST, productOf, [TEA_L, CROISSANT_PICK]);
    expect(resolved.map((each) => [each.slotId, each.name, each.upcharge])).toEqual([
      ["drink", "Trà sữa trân châu (L)", vnd(10_000)],
      ["bakery", "Bánh sừng bò", vnd(0)],
    ]);
    expect(resolved[0]?.modifiers.map((m) => [m.optionId, m.unitPriceDelta])).toEqual([
      ["sugar-50", vnd(0)],
      ["ice-less", vnd(0)],
      ["pearl", vnd(5_000)],
    ]);
  });

  it("returns slot order whatever order the picks came in, each pick with its own options", () => {
    const plain = pick("bakery", "croissant", null);
    const resolved = resolveComboPicks(BREAKFAST, productOf, [plain, plain, TEA_L]);
    expect(resolved.map((each) => each.slotId)).toEqual(["drink", "bakery", "bakery"]);
    expect(resolved[0]?.modifiers).toHaveLength(3);
  });

  it("refuses a component missing an option its own product requires", () => {
    const noSugar = pick("drink", "pearl-milk-tea", "size-m");
    expect(errorOf(() => resolveComboPicks(BREAKFAST, productOf, [noSugar])).code).toBe(
      CATALOG_ERROR_CODES.requiredModifierGroupMissing,
    );
  });

  it("refuses a pick outside its slot and a slot over its limit, with resolveCombo's codes", () => {
    const outside = pick("drink", "croissant", null);
    expect(errorOf(() => resolveComboPicks(BREAKFAST, productOf, [outside])).code).toBe(
      CATALOG_ERROR_CODES.comboOptionNotInSlot,
    );
    const three = [TEA_L, CROISSANT_PICK, CROISSANT_PICK, CROISSANT_PICK];
    expect(errorOf(() => resolveComboPicks(BREAKFAST, productOf, three)).code).toBe(
      CATALOG_ERROR_CODES.tooManyComboSelections,
    );
  });

  it("refuses a component the menu no longer sells", () => {
    const gone = (id: string) => (id === "croissant" ? undefined : productOf(id));
    const error = errorOf(() => resolveComboPicks(BREAKFAST, gone, [TEA_L, CROISSANT_PICK]));
    expect(error.code).toBe(CATALOG_ERROR_CODES.comboComponentNotFound);
    expect(error.details).toEqual({ productId: "breakfast", componentProductId: "croissant" });
  });

  it("refuses a combo offered as a component of a combo", () => {
    const nested: Product = {
      ...BREAKFAST,
      id: "family",
      combo: {
        slots: [
          {
            id: "inner",
            name: "Combo",
            minSelect: 1,
            maxSelect: 1,
            options: [{ productId: "breakfast", variantId: null, upcharge: vnd(0) }],
          },
        ],
      },
    };
    const error = errorOf(() =>
      resolveComboPicks(nested, productOf, [pick("inner", "breakfast", null)]),
    );
    expect(error.code).toBe(CATALOG_ERROR_CODES.comboInCombo);
  });
});
