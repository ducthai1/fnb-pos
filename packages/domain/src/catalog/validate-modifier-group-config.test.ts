import { describe, expect, it } from "vitest";
import { vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import { errorOf } from "./catalog-test-helpers";
import type { ModifierGroup } from "./catalog-types";
import { ICE_LEVEL, SUGAR_LEVEL, TOPPINGS } from "./pearl-milk-tea-test-fixture";
import { validateModifierGroupConfig } from "./validate-modifier-group-config";

const codeFor = (group: ModifierGroup) => errorOf(() => validateModifierGroupConfig(group)).code;

describe("validateModifierGroupConfig", () => {
  it.each([SUGAR_LEVEL, ICE_LEVEL, TOPPINGS])("accepts the milk tea group $name", (group) => {
    expect(() => validateModifierGroupConfig(group)).not.toThrow();
  });

  it("accepts an optional group with minSelect 0 and rejects a negative or fractional one", () => {
    expect(() => validateModifierGroupConfig({ ...TOPPINGS, minSelect: 0 })).not.toThrow();
    expect(codeFor({ ...TOPPINGS, minSelect: -1 })).toBe(CATALOG_ERROR_CODES.invalidMinSelect);
    expect(codeFor({ ...TOPPINGS, minSelect: 0.5 })).toBe(CATALOG_ERROR_CODES.invalidMinSelect);
  });

  it("accepts maxSelect 1 and rejects a group that allows nothing", () => {
    expect(() => validateModifierGroupConfig({ ...TOPPINGS, maxSelect: 1 })).not.toThrow();
    expect(codeFor({ ...TOPPINGS, maxSelect: 0 })).toBe(CATALOG_ERROR_CODES.invalidMaxSelect);
    expect(codeFor({ ...TOPPINGS, maxSelect: 2.5 })).toBe(CATALOG_ERROR_CODES.invalidMaxSelect);
  });

  it("accepts minSelect equal to maxSelect and rejects minSelect above it", () => {
    expect(() => validateModifierGroupConfig({ ...TOPPINGS, minSelect: 3 })).not.toThrow();
    expect(codeFor({ ...TOPPINGS, minSelect: 4 })).toBe(
      CATALOG_ERROR_CODES.minSelectAboveMaxSelect,
    );
  });

  it("rejects two options sharing an id", () => {
    const [pearl] = TOPPINGS.options;
    if (!pearl) throw new Error("fixture has no toppings");
    const error = errorOf(() =>
      validateModifierGroupConfig({
        ...TOPPINGS,
        options: [...TOPPINGS.options, { ...pearl, name: "Trân châu trắng" }],
      }),
    );
    expect(error.code).toBe(CATALOG_ERROR_CODES.duplicateOptionId);
    expect(error.details).toMatchObject({ groupId: "topping", optionId: "pearl" });
  });

  it("accepts an option capped at 1 or uncapped and rejects a cap below 1", () => {
    const withCap = (maxQuantity: number | null): ModifierGroup => ({
      ...TOPPINGS,
      options: [{ id: "pearl", name: "Trân châu", priceDelta: vnd(5_000), maxQuantity }],
    });
    expect(() => validateModifierGroupConfig(withCap(1))).not.toThrow();
    expect(() => validateModifierGroupConfig(withCap(null))).not.toThrow();
    expect(codeFor(withCap(0))).toBe(CATALOG_ERROR_CODES.invalidOptionMaxQuantity);
    expect(codeFor(withCap(1.5))).toBe(CATALOG_ERROR_CODES.invalidOptionMaxQuantity);
  });

  it("accepts a free option and rejects a negative price delta", () => {
    const withDelta = (priceDelta: bigint): ModifierGroup => ({
      ...TOPPINGS,
      options: [{ id: "pearl", name: "Trân châu", priceDelta: vnd(priceDelta), maxQuantity: null }],
    });
    expect(() => validateModifierGroupConfig(withDelta(0n))).not.toThrow();
    const error = errorOf(() => validateModifierGroupConfig(withDelta(-1_000n)));
    expect(error.code).toBe(CATALOG_ERROR_CODES.negativePriceDelta);
    expect(error.details).toMatchObject({ groupId: "topping", optionId: "pearl" });
  });

  it("rejects a variant rule whose minSelect overtakes the group's maxSelect", () => {
    // Size L raises the minimum to 4 but inherits the group's cap of 3.
    const error = errorOf(() =>
      validateModifierGroupConfig({ ...TOPPINGS, variantRules: { "size-l": { minSelect: 4 } } }),
    );
    expect(error.code).toBe(CATALOG_ERROR_CODES.minSelectAboveMaxSelect);
    expect(error.details).toMatchObject({
      groupId: "topping",
      variantId: "size-l",
      minSelect: 4,
      maxSelect: 3,
    });
  });

  it("accepts a variant rule that lowers the cap and rejects one that lowers it to zero", () => {
    const lowered = { ...TOPPINGS, variantRules: { "size-m": { maxSelect: 1 } } };
    expect(() => validateModifierGroupConfig(lowered)).not.toThrow();
    const zeroed = { ...TOPPINGS, variantRules: { "size-m": { maxSelect: 0 } } };
    expect(codeFor(zeroed)).toBe(CATALOG_ERROR_CODES.invalidMaxSelect);
  });

  it("accepts an optional group with no options yet and rejects a required one", () => {
    expect(() => validateModifierGroupConfig({ ...TOPPINGS, options: [] })).not.toThrow();
    expect(codeFor({ ...SUGAR_LEVEL, options: [] })).toBe(
      CATALOG_ERROR_CODES.requiredGroupWithoutOptions,
    );
  });

  it("rejects an empty group that only one variant makes required, unless that variant hides it", () => {
    const requiredOnL = { ...TOPPINGS, options: [], variantRules: { "size-l": { minSelect: 1 } } };
    const error = errorOf(() => validateModifierGroupConfig(requiredOnL));
    expect(error.code).toBe(CATALOG_ERROR_CODES.requiredGroupWithoutOptions);
    expect(error.details).toMatchObject({ variantId: "size-l" });

    const hiddenOnHot = {
      ...SUGAR_LEVEL,
      minSelect: 0,
      options: [],
      variantRules: { "hot-m": { minSelect: 1, hidden: true } },
    };
    expect(() => validateModifierGroupConfig(hiddenOnHot)).not.toThrow();
  });

  describe("a minimum the options cannot reach", () => {
    const capped = (caps: readonly (number | null)[]): ModifierGroup["options"] =>
      caps.map((maxQuantity, index) => ({
        id: `option-${index}`,
        name: `Lựa chọn ${index}`,
        priceDelta: vnd(0),
        maxQuantity,
      }));
    const group = (overrides: Partial<ModifierGroup>): ModifierGroup => ({
      ...TOPPINGS,
      minSelect: 0,
      maxSelect: 10,
      variantRules: {},
      ...overrides,
    });

    it("accepts picking every option once when repeats are refused, and rejects one more", () => {
      const options = capped([null, null, null]);
      const exact = group({ allowDuplicates: false, minSelect: 3, options });
      expect(() => validateModifierGroupConfig(exact)).not.toThrow();
      const error = errorOf(() => validateModifierGroupConfig({ ...exact, minSelect: 4 }));
      expect(error.code).toBe(CATALOG_ERROR_CODES.unsatisfiableModifierGroup);
      expect(error.details).toMatchObject({ groupId: "topping", minSelect: 4, reachable: 3 });
    });

    it("counts each option's cap when repeats are allowed, and rejects a minimum above their sum", () => {
      const options = capped([2, 1]);
      expect(() =>
        validateModifierGroupConfig(group({ allowDuplicates: true, minSelect: 3, options })),
      ).not.toThrow();
      expect(codeFor(group({ allowDuplicates: true, minSelect: 4, options }))).toBe(
        CATALOG_ERROR_CODES.unsatisfiableModifierGroup,
      );
    });

    it("treats an uncapped option as unlimited only when repeats are allowed", () => {
      const options = capped([1, null]);
      expect(() =>
        validateModifierGroupConfig(group({ allowDuplicates: true, minSelect: 9, options })),
      ).not.toThrow();
      expect(codeFor(group({ allowDuplicates: false, minSelect: 3, options }))).toBe(
        CATALOG_ERROR_CODES.unsatisfiableModifierGroup,
      );
    });

    it("checks the minimum a variant raises, unless that variant hides the group", () => {
      const options = capped([null, null]);
      const raisedOnL = group({
        allowDuplicates: false,
        options,
        variantRules: { "size-l": { minSelect: 3 } },
      });
      const error = errorOf(() => validateModifierGroupConfig(raisedOnL));
      expect(error.code).toBe(CATALOG_ERROR_CODES.unsatisfiableModifierGroup);
      expect(error.details).toMatchObject({ variantId: "size-l" });
      const hiddenOnL = {
        ...raisedOnL,
        variantRules: { "size-l": { minSelect: 3, hidden: true } },
      };
      expect(() => validateModifierGroupConfig(hiddenOnL)).not.toThrow();
    });
  });
});
