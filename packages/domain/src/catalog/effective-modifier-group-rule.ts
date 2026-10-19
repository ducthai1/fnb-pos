import type { ModifierGroup } from "./catalog-types";

export interface EffectiveModifierGroupRule {
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly hidden: boolean;
}

/**
 * The group's limits as they apply to one variant: a variant rule overrides only
 * the fields it sets, so "size L allows 5 toppings" does not have to repeat minSelect.
 * A null variant (product without variants) always gets the group's own limits.
 */
export function effectiveModifierGroupRule(
  group: ModifierGroup,
  variantId: string | null,
): EffectiveModifierGroupRule {
  const rule = variantId === null ? undefined : group.variantRules[variantId];
  return {
    minSelect: rule?.minSelect ?? group.minSelect,
    maxSelect: rule?.maxSelect ?? group.maxSelect,
    hidden: rule?.hidden ?? false,
  };
}
