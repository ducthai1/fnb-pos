import type { PosProduct } from "@fnb/contracts";
import {
  CATALOG_ERROR_CODES,
  DomainError,
  type ModifierGroup,
  type ModifierSelectionInput,
  type ValidatedModifierSelection,
  effectiveModifierGroupRule,
  isDomainError,
  validateModifierSelection,
} from "@fnb/domain";

export type Choices = readonly ModifierSelectionInput[];
export type ChoiceResult =
  | { readonly ok: true; readonly choices: Choices }
  | { readonly ok: false; readonly error: DomainError };

/** Refusals a tap can cause; "too few" and "required" are only due when the cashier confirms. */
const TAP_REFUSALS: ReadonlySet<string> = new Set([
  CATALOG_ERROR_CODES.tooManyModifierSelections,
  CATALOG_ERROR_CODES.duplicateModifierNotAllowed,
  CATALOG_ERROR_CODES.optionMaxQuantityExceeded,
]);

/** One pick per group, like sugar level: tapping another option switches to it. */
export function isSingleChoice(group: ModifierGroup, variantId: string | null): boolean {
  return effectiveModifierGroupRule(group, variantId).maxSelect === 1 && !group.allowDuplicates;
}

export const unitsOf = (choices: Choices, optionId: string) =>
  choices.find((choice) => choice.optionId === optionId)?.quantity ?? 0;

function withUnits(choices: Choices, group: ModifierGroup, optionId: string, units: number) {
  const others = choices.filter((choice) => choice.optionId !== optionId);
  return units === 0 ? others : [...others, { groupId: group.id, optionId, quantity: units }];
}

/**
 * The group's limits checked by the domain alone, on that group alone, so a required group
 * further up the screen that is still empty does not hide "at most 2 toppings" here.
 */
function checkGroup(
  product: PosProduct,
  variantId: string | null,
  group: ModifierGroup,
  next: Choices,
): DomainError | null {
  try {
    validateModifierSelection(
      { ...product, modifierGroups: [group] },
      variantId,
      next.filter((choice) => choice.groupId === group.id),
    );
    return null;
  } catch (error) {
    if (isDomainError(error) && TAP_REFUSALS.has(error.code)) return error;
    if (isDomainError(error)) return null;
    throw error;
  }
}

/**
 * The choices after tapping an option: on a one-pick group it replaces the pick (tapping it
 * again clears it); elsewhere it adds a unit, or toggles when the group allows no repeats.
 * A tap past the group's limits is refused with the domain's error and changes nothing.
 */
export function tapOption(
  product: PosProduct,
  variantId: string | null,
  group: ModifierGroup,
  optionId: string,
  choices: Choices,
): ChoiceResult {
  const units = unitsOf(choices, optionId);
  let next: Choices;
  if (isSingleChoice(group, variantId)) {
    const cleared = choices.filter((choice) => choice.groupId !== group.id);
    next = units > 0 ? cleared : withUnits(cleared, group, optionId, 1);
  } else if (!group.allowDuplicates && units > 0) {
    next = withUnits(choices, group, optionId, 0);
  } else {
    next = withUnits(choices, group, optionId, units + 1);
  }
  const error = checkGroup(product, variantId, group, next);
  return error === null ? { ok: true, choices: next } : { ok: false, error };
}

/** One unit fewer of an option (gone at zero). */
export function dropOptionUnit(group: ModifierGroup, optionId: string, choices: Choices): Choices {
  return withUnits(choices, group, optionId, Math.max(0, unitsOf(choices, optionId) - 1));
}

/** Choosing a size drops what was chosen in groups that size does not offer. */
export function choicesForVariant(product: PosProduct, variantId: string | null, choices: Choices) {
  const hidden = new Set(
    product.modifierGroups
      .filter((group) => effectiveModifierGroupRule(group, variantId).hidden)
      .map((group) => group.id),
  );
  return choices.filter((choice) => !hidden.has(choice.groupId));
}

/** Every rule of every group, by the domain, as the server will check the line. */
export function confirmChoices(
  product: PosProduct,
  variantId: string | null,
  choices: Choices,
):
  | { ok: true; selections: readonly ValidatedModifierSelection[] }
  | { ok: false; error: DomainError } {
  try {
    return { ok: true, selections: validateModifierSelection(product, variantId, choices) };
  } catch (error) {
    if (error instanceof DomainError) return { ok: false, error };
    throw error;
  }
}
