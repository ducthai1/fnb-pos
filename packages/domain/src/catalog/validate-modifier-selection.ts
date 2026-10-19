import { DomainError } from "../errors";
import { type Vnd, vnd } from "../money";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { ModifierGroup, ModifierOption, Product } from "./catalog-types";
import { effectiveModifierGroupRule } from "./effective-modifier-group-rule";
import { findProductVariant } from "./find-product-variant";

export interface ModifierSelectionInput {
  readonly groupId: string;
  readonly optionId: string;
  /** Units of this option on one item, a whole number ≥ 1 (2 = double pearls). */
  readonly quantity: number;
}

export interface ValidatedModifierSelection {
  readonly groupId: string;
  readonly optionId: string;
  readonly quantity: number;
  /** What one unit of the option adds to the item's unit price. */
  readonly unitPriceDelta: Vnd;
  /** unitPriceDelta × quantity: what this option adds to the item's unit price in total. */
  readonly priceDelta: Vnd;
}

interface OptionTally {
  lines: number;
  quantity: number;
}

/**
 * Checks the options chosen for one item against the product's modifier groups
 * as they apply to the chosen variant, and returns them normalised: repeated
 * lines for the same option are merged, and the result follows the catalog's
 * group and option order, so the same choices made in a different order produce
 * an identical line (and kitchen ticket, and receipt).
 */
export function validateModifierSelection(
  product: Product,
  variantId: string | null,
  selections: readonly ModifierSelectionInput[],
): readonly ValidatedModifierSelection[] {
  findProductVariant(product, variantId);
  const tallies = tallySelections(product, variantId, selections);

  const result: ValidatedModifierSelection[] = [];
  for (const group of product.modifierGroups) {
    const rule = effectiveModifierGroupRule(group, variantId);
    if (rule.hidden) continue; // tallySelections already refused any choice in it
    const chosen = tallies.get(group.id);
    let total = 0;
    for (const option of group.options) {
      const tally = chosen?.get(option.id);
      if (!tally) continue;
      assertOptionTally(group, option, tally);
      total += tally.quantity;
      result.push({
        groupId: group.id,
        optionId: option.id,
        quantity: tally.quantity,
        unitPriceDelta: option.priceDelta,
        priceDelta: vnd(option.priceDelta * BigInt(tally.quantity)),
      });
    }
    const context = {
      groupId: group.id,
      variantId,
      minSelect: rule.minSelect,
      maxSelect: rule.maxSelect,
      selected: total,
    };
    if (total === 0 && rule.minSelect >= 1) {
      throw new DomainError(
        CATALOG_ERROR_CODES.requiredModifierGroupMissing,
        `group ${group.id} is required`,
        context,
      );
    }
    if (total < rule.minSelect) {
      throw new DomainError(
        CATALOG_ERROR_CODES.tooFewModifierSelections,
        `group ${group.id} needs at least ${rule.minSelect}, got ${total}`,
        context,
      );
    }
    if (total > rule.maxSelect) {
      throw new DomainError(
        CATALOG_ERROR_CODES.tooManyModifierSelections,
        `group ${group.id} allows at most ${rule.maxSelect}, got ${total}`,
        context,
      );
    }
  }
  return result;
}

function tallySelections(
  product: Product,
  variantId: string | null,
  selections: readonly ModifierSelectionInput[],
): Map<string, Map<string, OptionTally>> {
  const tallies = new Map<string, Map<string, OptionTally>>();
  for (const line of selections) {
    const context = { groupId: line.groupId, optionId: line.optionId };
    const group = product.modifierGroups.find((candidate) => candidate.id === line.groupId);
    if (!group) {
      throw new DomainError(
        CATALOG_ERROR_CODES.unknownModifierGroup,
        `group ${line.groupId} does not belong to product ${product.id}`,
        { ...context, productId: product.id },
      );
    }
    if (!group.options.some((option) => option.id === line.optionId)) {
      throw new DomainError(
        CATALOG_ERROR_CODES.unknownModifierOption,
        `option ${line.optionId} does not belong to group ${group.id}`,
        context,
      );
    }
    if (effectiveModifierGroupRule(group, variantId).hidden) {
      throw new DomainError(
        CATALOG_ERROR_CODES.modifierGroupHidden,
        `group ${group.id} does not apply to variant ${variantId}`,
        { ...context, variantId },
      );
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
      throw new DomainError(
        CATALOG_ERROR_CODES.invalidSelectionQuantity,
        `quantity must be a whole number ≥ 1: ${line.quantity}`,
        { ...context, quantity: line.quantity },
      );
    }
    const byOption = tallies.get(group.id) ?? new Map<string, OptionTally>();
    tallies.set(group.id, byOption);
    const tally = byOption.get(line.optionId) ?? { lines: 0, quantity: 0 };
    byOption.set(line.optionId, {
      lines: tally.lines + 1,
      quantity: tally.quantity + line.quantity,
    });
  }
  return tallies;
}

function assertOptionTally(group: ModifierGroup, option: ModifierOption, tally: OptionTally): void {
  const context = { groupId: group.id, optionId: option.id, quantity: tally.quantity };
  // "50% sugar" twice is a mistake, not a double portion: refuse rather than merge silently.
  if (!group.allowDuplicates && (tally.lines > 1 || tally.quantity > 1)) {
    throw new DomainError(
      CATALOG_ERROR_CODES.duplicateModifierNotAllowed,
      `option ${option.id} can be chosen only once in group ${group.id}`,
      context,
    );
  }
  if (option.maxQuantity !== null && tally.quantity > option.maxQuantity) {
    throw new DomainError(
      CATALOG_ERROR_CODES.optionMaxQuantityExceeded,
      `option ${option.id} allows at most ${option.maxQuantity}, got ${tally.quantity}`,
      { ...context, maxQuantity: option.maxQuantity },
    );
  }
}
