import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import { errorOf } from "./catalog-test-helpers";
import type { ComboDefinition, ComboSlot } from "./catalog-types";
import { validateComboConfig } from "./validate-combo-config";

const DRINK: ComboSlot = {
  id: "drink",
  name: "Đồ uống",
  minSelect: 1,
  maxSelect: 1,
  options: [
    { productId: "pearl-milk-tea", variantId: "size-m", upcharge: vnd(0) },
    { productId: "pearl-milk-tea", variantId: "size-l", upcharge: vnd(10_000) },
  ],
};
const DESSERT: ComboSlot = {
  id: "dessert",
  name: "Tráng miệng",
  minSelect: 0,
  maxSelect: 2,
  options: [{ productId: "flan", variantId: null, upcharge: vnd(8_000) }],
};

const comboOf = (...slots: ComboSlot[]): ComboDefinition => ({ slots });
const codeFor = (combo: ComboDefinition) => errorOf(() => validateComboConfig(combo)).code;

describe("validateComboConfig", () => {
  it("accepts a drink-and-dessert combo", () => {
    expect(() => validateComboConfig(comboOf(DRINK, DESSERT))).not.toThrow();
  });

  it("accepts minSelect equal to maxSelect and rejects minSelect above it", () => {
    expect(() => validateComboConfig(comboOf({ ...DESSERT, minSelect: 2 }))).not.toThrow();
    const error = errorOf(() => validateComboConfig(comboOf({ ...DESSERT, minSelect: 3 })));
    expect(error.code).toBe(CATALOG_ERROR_CODES.invalidComboSlotLimits);
    expect(error.details).toMatchObject({ slotId: "dessert", minSelect: 3, maxSelect: 2 });
  });

  it.each([
    { minSelect: -1, maxSelect: 1 },
    { minSelect: 0.5, maxSelect: 1 },
    { minSelect: 0, maxSelect: 0 },
    { minSelect: 0, maxSelect: 1.5 },
  ])("rejects the slot limits %o", (limits) => {
    expect(codeFor(comboOf({ ...DESSERT, ...limits }))).toBe(
      CATALOG_ERROR_CODES.invalidComboSlotLimits,
    );
  });

  it("accepts an optional slot with no options yet and rejects a required one", () => {
    expect(() => validateComboConfig(comboOf({ ...DESSERT, options: [] }))).not.toThrow();
    expect(codeFor(comboOf({ ...DRINK, options: [] }))).toBe(
      CATALOG_ERROR_CODES.requiredComboSlotWithoutOptions,
    );
  });

  it("accepts one product in two sizes and rejects the same product and size twice", () => {
    const [sizeM] = DRINK.options;
    if (!sizeM) throw new Error("fixture has no drink");
    const error = errorOf(() =>
      validateComboConfig(
        comboOf({ ...DRINK, options: [...DRINK.options, { ...sizeM, upcharge: vnd(3_000) }] }),
      ),
    );
    expect(error.code).toBe(CATALOG_ERROR_CODES.duplicateComboSlotOption);
    expect(error.details).toMatchObject({
      slotId: "drink",
      productId: "pearl-milk-tea",
      variantId: "size-m",
    });
  });

  it("allows the same product in two different slots but rejects two slots sharing an id", () => {
    const secondDrink = { ...DRINK, id: "second-drink" };
    expect(() => validateComboConfig(comboOf(DRINK, secondDrink))).not.toThrow();
    const error = errorOf(() => validateComboConfig(comboOf(DRINK, { ...DESSERT, id: "drink" })));
    expect(error.code).toBe(CATALOG_ERROR_CODES.duplicateComboSlotId);
    expect(error.details).toMatchObject({ slotId: "drink" });
  });

  it("accepts a free swap and rejects a negative upcharge", () => {
    const withUpcharge = (upcharge: bigint) =>
      comboOf({
        ...DESSERT,
        options: [{ productId: "flan", variantId: null, upcharge: vnd(upcharge) }],
      });
    expect(() => validateComboConfig(withUpcharge(0n))).not.toThrow();
    expect(codeFor(withUpcharge(-1n))).toBe(CATALOG_ERROR_CODES.negativeComboUpcharge);
  });
});
