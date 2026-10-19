import { DomainError } from "../errors";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { ModifierGroup, ModifierOption } from "./catalog-types";
import {
  type EffectiveModifierGroupRule,
  effectiveModifierGroupRule,
} from "./effective-modifier-group-rule";

/**
 * Rejects a modifier group that no order could satisfy or that would let a
 * selection be priced ambiguously. Run when the backoffice saves a group, so the
 * POS never meets a broken one mid-order. Throws on the first problem found.
 */
export function validateModifierGroupConfig(group: ModifierGroup): void {
  assertLimits(group, effectiveModifierGroupRule(group, null), null);
  assertOptions(group);
  for (const variantId of Object.keys(group.variantRules)) {
    assertLimits(group, effectiveModifierGroupRule(group, variantId), variantId);
  }
}

function assertLimits(
  group: ModifierGroup,
  rule: EffectiveModifierGroupRule,
  variantId: string | null,
): void {
  const context = {
    groupId: group.id,
    variantId,
    minSelect: rule.minSelect,
    maxSelect: rule.maxSelect,
  };
  if (!Number.isSafeInteger(rule.minSelect) || rule.minSelect < 0) {
    throw new DomainError(
      CATALOG_ERROR_CODES.invalidMinSelect,
      `minSelect must be a whole number ≥ 0 in group ${group.id}`,
      context,
    );
  }
  // A group that allows nothing is not a group; a variant that must not see it uses `hidden`.
  if (!Number.isSafeInteger(rule.maxSelect) || rule.maxSelect < 1) {
    throw new DomainError(
      CATALOG_ERROR_CODES.invalidMaxSelect,
      `maxSelect must be a whole number ≥ 1 in group ${group.id}`,
      context,
    );
  }
  if (rule.minSelect > rule.maxSelect) {
    throw new DomainError(
      CATALOG_ERROR_CODES.minSelectAboveMaxSelect,
      `minSelect exceeds maxSelect in group ${group.id}`,
      context,
    );
  }
  if (!rule.hidden && rule.minSelect >= 1 && group.options.length === 0) {
    throw new DomainError(
      CATALOG_ERROR_CODES.requiredGroupWithoutOptions,
      `group ${group.id} is required but has no options`,
      context,
    );
  }
}

function assertOptions(group: ModifierGroup): void {
  const seen = new Set<string>();
  for (const option of group.options) {
    if (seen.has(option.id)) {
      throw new DomainError(
        CATALOG_ERROR_CODES.duplicateOptionId,
        `option ${option.id} appears twice in group ${group.id}`,
        { groupId: group.id, optionId: option.id },
      );
    }
    seen.add(option.id);
    assertOption(group, option);
  }
}

function assertOption(group: ModifierGroup, option: ModifierOption): void {
  const context = { groupId: group.id, optionId: option.id };
  if (
    option.maxQuantity !== null &&
    (!Number.isSafeInteger(option.maxQuantity) || option.maxQuantity < 1)
  ) {
    throw new DomainError(
      CATALOG_ERROR_CODES.invalidOptionMaxQuantity,
      `maxQuantity must be a whole number ≥ 1 or null on option ${option.id}`,
      { ...context, maxQuantity: option.maxQuantity },
    );
  }
  // Options only ever add to the price. A cheaper choice is a promotion, which the
  // promotion engine applies, reports and caps; a negative delta would bypass all that.
  if (option.priceDelta < 0n) {
    throw new DomainError(
      CATALOG_ERROR_CODES.negativePriceDelta,
      `priceDelta must not be negative on option ${option.id}`,
      { ...context, priceDelta: option.priceDelta },
    );
  }
}
