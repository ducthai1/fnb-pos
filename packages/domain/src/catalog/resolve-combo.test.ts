import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import { errorOf } from "./catalog-test-helpers";
import type { ComboSlot, Product } from "./catalog-types";
import { PEARL_MILK_TEA } from "./pearl-milk-tea-test-fixture";
import { type ComboSlotSelectionInput, resolveCombo } from "./resolve-combo";

const DRINK: ComboSlot = {
  id: "drink",
  name: "Đồ uống",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { productId: "pearl-milk-tea", variantId: "size-m", upcharge: vnd(0) },
    { productId: "pearl-milk-tea", variantId: "size-l", upcharge: vnd(10_000) },
    { productId: "peach-tea", variantId: null, upcharge: vnd(0) },
  ],
};
const SIDE: ComboSlot = {
  id: "side",
  name: "Món ăn kèm",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { productId: "fries", variantId: null, upcharge: vnd(0) },
    { productId: "fried-chicken", variantId: null, upcharge: vnd(15_000) },
  ],
};
const DESSERT: ComboSlot = {
  id: "dessert",
  name: "Tráng miệng",
  minSelect: 0,
  maxSelect: 2,
  options: [
    { productId: "flan", variantId: null, upcharge: vnd(8_000) },
    { productId: "pudding-cup", variantId: null, upcharge: vnd(12_000) },
  ],
};

const SNACK_COMBO: Product = {
  id: "snack-combo",
  categoryId: "combos",
  kind: "combo",
  name: "Combo trà sữa + ăn vặt",
  basePrice: vnd(55_000),
  pricingMode: "fixed",
  variants: [],
  modifierGroups: [],
  combo: { slots: [DRINK, SIDE, DESSERT] },
};

const pick = (slotId: string, productId: string, variantId: string | null = null) => ({
  slotId,
  productId,
  variantId,
});
const DEFAULTS = [pick("drink", "pearl-milk-tea", "size-m"), pick("side", "fries")];
const errorFor = (selections: readonly ComboSlotSelectionInput[], combo: Product = SNACK_COMBO) =>
  errorOf(() => resolveCombo(combo, selections));

describe("resolveCombo", () => {
  it("resolves the default choices with no upcharge, in slot order", () => {
    const result = resolveCombo(SNACK_COMBO, [
      pick("side", "fries"),
      pick("drink", "pearl-milk-tea", "size-m"),
    ]);
    expect(result).toEqual({
      components: [
        { slotId: "drink", productId: "pearl-milk-tea", variantId: "size-m", upcharge: 0n },
        { slotId: "side", productId: "fries", variantId: null, upcharge: 0n },
      ],
      totalUpcharge: 0n,
    });
  });

  it("adds the upcharge of every swap: size L, fried chicken and two desserts", () => {
    const result = resolveCombo(SNACK_COMBO, [
      pick("drink", "pearl-milk-tea", "size-l"),
      pick("side", "fried-chicken"),
      pick("dessert", "pudding-cup"),
      pick("dessert", "flan"),
    ]);
    // 10.000 + 15.000 + 8.000 + 12.000
    expect(result.totalUpcharge).toBe(45_000n);
    expect(result.components.map((c) => c.productId)).toEqual([
      "pearl-milk-tea",
      "fried-chicken",
      "flan",
      "pudding-cup",
    ]);
  });

  it("rejects a product that is not a combo, or a combo with no slots configured", () => {
    const notCombo = errorFor(DEFAULTS, PEARL_MILK_TEA);
    expect(notCombo.code).toBe(CATALOG_ERROR_CODES.notACombo);
    expect(notCombo.details).toMatchObject({ productId: "pearl-milk-tea" });
    const unconfigured = errorFor(DEFAULTS, { ...SNACK_COMBO, combo: null });
    expect(unconfigured.code).toBe(CATALOG_ERROR_CODES.comboDefinitionMissing);
  });

  it("rejects a slot the combo does not have", () => {
    const error = errorFor([...DEFAULTS, pick("soup", "miso")]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.unknownComboSlot);
    expect(error.details).toMatchObject({ slotId: "soup" });
  });

  it("rejects a product the slot does not offer", () => {
    const error = errorFor([pick("drink", "fried-chicken"), pick("side", "fries")]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.comboOptionNotInSlot);
    expect(error.details).toMatchObject({ slotId: "drink", productId: "fried-chicken" });
  });

  it("rejects a size of an offered drink that the slot does not list", () => {
    // Hot M is not on the combo menu, and a missing size must not fall back to the free M.
    for (const variantId of ["hot-m", null]) {
      const error = errorFor([pick("drink", "pearl-milk-tea", variantId), pick("side", "fries")]);
      expect(error.code).toBe(CATALOG_ERROR_CODES.comboOptionNotInSlot);
      expect(error.details).toMatchObject({ variantId });
    }
  });

  it("allows one drink and rejects a second", () => {
    const error = errorFor([...DEFAULTS, pick("drink", "peach-tea")]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.tooManyComboSelections);
    expect(error.details).toMatchObject({ slotId: "drink", maxSelect: 1, selected: 2 });
  });

  it("fills a 2-drink slot with the same drink twice and rejects a single drink", () => {
    const twoDrinks = {
      ...SNACK_COMBO,
      combo: { slots: [{ ...DRINK, minSelect: 2, maxSelect: 2 }] },
    };
    const same = pick("drink", "peach-tea");
    expect(resolveCombo(twoDrinks, [same, same]).components).toHaveLength(2);
    const error = errorFor([same], twoDrinks);
    expect(error.code).toBe(CATALOG_ERROR_CODES.tooFewComboSelections);
    expect(error.details).toMatchObject({ slotId: "drink", minSelect: 2, selected: 1 });
  });

  it("leaves the optional dessert empty but rejects a combo without its side", () => {
    expect(resolveCombo(SNACK_COMBO, DEFAULTS).components).toHaveLength(2);
    const error = errorFor([pick("drink", "peach-tea")]);
    expect(error.code).toBe(CATALOG_ERROR_CODES.requiredComboSlotMissing);
    expect(error.details).toMatchObject({ slotId: "side", minSelect: 1, selected: 0 });
  });

  it("charges the sum of the chosen options' upcharges, whatever order they were picked in", () => {
    const options = (slot: ComboSlot) => fc.constantFrom(...slot.options);
    fc.assert(
      fc.property(
        options(DRINK),
        options(SIDE),
        fc.array(options(DESSERT), { maxLength: 2 }),
        fc.array(fc.integer(), { minLength: 4, maxLength: 4 }),
        (drink, side, desserts, sortKeys) => {
          const chosen = [
            { slotId: "drink", option: drink },
            { slotId: "side", option: side },
            ...desserts.map((option) => ({ slotId: "dessert", option })),
          ];
          const picks = chosen.map(({ slotId, option }) =>
            pick(slotId, option.productId, option.variantId),
          );
          const shuffled = picks
            .map((selection, index) => ({ selection, key: sortKeys[index] ?? 0 }))
            .sort((a, b) => a.key - b.key)
            .map(({ selection }) => selection);
          const result = resolveCombo(SNACK_COMBO, shuffled);
          const expected = chosen.reduce((sum, { option }) => sum + option.upcharge, 0n);
          expect(result.totalUpcharge).toBe(expected);
          expect(result).toEqual(resolveCombo(SNACK_COMBO, picks));
        },
      ),
    );
  });
});
