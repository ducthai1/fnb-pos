import { CATALOG_ERROR_CODES as C, type ModifierGroup } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { vi as text } from "../../messages/vi";
import { RULES, RULES_TEA } from "../../test-support/rule-products";
import { MENU } from "../../test-support/till-fixtures";
import { type Choices, choicesForVariant, confirmChoices, tapOption } from "./modifier-choices";
import { modifierErrorMessage } from "./modifier-error-message";

const group = (id: string): ModifierGroup => {
  const found = RULES_TEA.modifierGroups.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no group ${id}`);
  return found;
};
const M = MENU.sizeM;
const L = MENU.sizeL;
const SUGAR: Choices = [{ groupId: MENU.sugar, optionId: MENU.sugarFull, quantity: 1 }];

function taps(variantId: string, groupId: string, optionIds: string[], from: Choices = []) {
  let choices = from;
  for (const optionId of optionIds) {
    const result = tapOption(RULES_TEA, variantId, group(groupId), optionId, choices);
    if (!result.ok) return { choices, error: result.error };
    choices = result.choices;
  }
  return { choices, error: null };
}

describe("tapping options by the group's rules", () => {
  it("switches the pick of a pick-one group instead of adding a second", () => {
    const { choices, error } = taps(M, MENU.sugar, [MENU.sugarFull, MENU.sugarHalf]);
    expect(error).toBeNull();
    expect(choices).toEqual([{ groupId: MENU.sugar, optionId: MENU.sugarHalf, quantity: 1 }]);
  });

  it("allows two toppings in M and refuses a third, which L allows, and refuses a fourth in L", () => {
    const three = [MENU.jelly, MENU.jelly, MENU.pearl];
    const inM = taps(M, MENU.toppings, three);
    expect(inM.error?.code).toBe(C.tooManyModifierSelections);
    expect(inM.choices).toEqual([{ groupId: MENU.toppings, optionId: MENU.jelly, quantity: 2 }]);
    expect(modifierErrorMessage(RULES_TEA, inM.error!)).toBe(
      text.sale.modifierErrors.tooMany("Topping", 2),
    );
    expect(taps(L, MENU.toppings, three).error).toBeNull();
    expect(taps(L, MENU.toppings, [...three, MENU.jelly]).error?.code).toBe(
      C.tooManyModifierSelections,
    );
  });

  it("allows pearls twice and refuses a third portion of them", () => {
    expect(taps(L, MENU.toppings, [MENU.pearl, MENU.pearl]).error).toBeNull();
    const third = taps(L, MENU.toppings, [MENU.pearl, MENU.pearl, MENU.pearl]);
    expect(third.error?.code).toBe(C.optionMaxQuantityExceeded);
    expect(modifierErrorMessage(RULES_TEA, third.error!)).toBe(
      text.sale.modifierErrors.optionMax("Trân châu đen", 2),
    );
  });

  it("toggles an option of a group without repeats, so it is never chosen twice", () => {
    expect(taps(M, RULES.ice, [RULES.lessIce]).choices).toHaveLength(1);
    expect(taps(M, RULES.ice, [RULES.lessIce, RULES.lessIce]).choices).toEqual([]);
  });

  it("drops what was chosen in a group the new size does not offer", () => {
    const cheese: Choices = [{ groupId: RULES.cream, optionId: RULES.cheese, quantity: 1 }];
    expect(choicesForVariant(RULES_TEA, M, [...SUGAR, ...cheese])).toEqual(SUGAR);
    expect(choicesForVariant(RULES_TEA, L, [...SUGAR, ...cheese])).toEqual([...SUGAR, ...cheese]);
  });
});

describe("confirming the item, by every rule the server checks", () => {
  const refusal = (variantId: string, choices: Choices) => {
    const result = confirmChoices(RULES_TEA, variantId, choices);
    return result.ok
      ? null
      : { code: result.error.code, message: modifierErrorMessage(RULES_TEA, result.error) };
  };

  it("refuses an item whose required group is empty, naming the group", () => {
    expect(refusal(M, [])).toEqual({
      code: C.requiredModifierGroupMissing,
      message: text.sale.modifierErrors.required("Đường"),
    });
    expect(refusal(M, SUGAR)).toBeNull();
  });

  it("refuses too few sides in L, where at least two are required, and takes two", () => {
    const one: Choices = [...SUGAR, { groupId: RULES.sides, optionId: RULES.cookie, quantity: 1 }];
    expect(refusal(L, one)).toEqual({
      code: C.tooFewModifierSelections,
      message: text.sale.modifierErrors.tooFew("Bánh kèm", 2),
    });
    const two: Choices = [...one, { groupId: RULES.sides, optionId: RULES.wafer, quantity: 1 }];
    expect(refusal(L, two)).toBeNull();
    expect(refusal(M, one)).toBeNull();
  });

  it("refuses an option repeated where the group allows no repeats", () => {
    const twice: Choices = [...SUGAR, { groupId: RULES.ice, optionId: RULES.noIce, quantity: 2 }];
    expect(refusal(M, twice)).toEqual({
      code: C.duplicateModifierNotAllowed,
      message: text.sale.modifierErrors.onlyOnce("Không đá"),
    });
  });

  it("refuses an option of a group the size does not offer", () => {
    const cheese: Choices = [
      ...SUGAR,
      { groupId: RULES.cream, optionId: RULES.cheese, quantity: 1 },
    ];
    expect(refusal(M, cheese)).toEqual({
      code: C.modifierGroupHidden,
      message: text.sale.modifierErrors.notForVariant("Kem"),
    });
    expect(
      refusal(L, [
        ...cheese,
        { groupId: RULES.sides, optionId: RULES.cookie, quantity: 1 },
        { groupId: RULES.sides, optionId: RULES.wafer, quantity: 1 },
      ]),
    ).toBeNull();
  });

  it("returns the choices in the catalog's order, however they were tapped", () => {
    const result = confirmChoices(RULES_TEA, M, [
      { groupId: MENU.toppings, optionId: MENU.jelly, quantity: 1 },
      { groupId: MENU.toppings, optionId: MENU.pearl, quantity: 1 },
      ...SUGAR,
    ]);
    expect(result.ok && result.selections.map((choice) => choice.optionId)).toEqual([
      MENU.sugarFull,
      MENU.pearl,
      MENU.jelly,
    ]);
  });
});
