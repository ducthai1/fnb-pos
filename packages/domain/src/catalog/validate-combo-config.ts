import { DomainError } from "../errors";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { ComboDefinition, ComboSlot } from "./catalog-types";

/**
 * Rejects a combo that resolveCombo could not price unambiguously or that no order
 * could fill. Run when the backoffice saves a combo; throws on the first problem.
 */
export function validateComboConfig(combo: ComboDefinition): void {
  const slotIds = new Set<string>();
  for (const slot of combo.slots) {
    // Picks name their slot by id; two slots with one id would make a pick ambiguous.
    if (slotIds.has(slot.id)) {
      throw new DomainError(
        CATALOG_ERROR_CODES.duplicateComboSlotId,
        `slot ${slot.id} appears twice in the combo`,
        { slotId: slot.id },
      );
    }
    slotIds.add(slot.id);
    assertSlotLimits(slot);
    assertSlotOptions(slot);
  }
}

function assertSlotLimits(slot: ComboSlot): void {
  const context = { slotId: slot.id, minSelect: slot.minSelect, maxSelect: slot.maxSelect };
  const limitsValid =
    Number.isSafeInteger(slot.minSelect) &&
    slot.minSelect >= 0 &&
    Number.isSafeInteger(slot.maxSelect) &&
    slot.maxSelect >= 1 &&
    slot.minSelect <= slot.maxSelect;
  if (!limitsValid) {
    throw new DomainError(
      CATALOG_ERROR_CODES.invalidComboSlotLimits,
      `slot ${slot.id} needs whole limits with 0 ≤ minSelect ≤ maxSelect and maxSelect ≥ 1`,
      context,
    );
  }
  // An option may fill a slot several times, so one option is enough to satisfy any minimum.
  if (slot.minSelect >= 1 && slot.options.length === 0) {
    throw new DomainError(
      CATALOG_ERROR_CODES.requiredComboSlotWithoutOptions,
      `slot ${slot.id} must be filled but offers nothing`,
      context,
    );
  }
}

function assertSlotOptions(slot: ComboSlot): void {
  const seen = new Set<string>();
  for (const option of slot.options) {
    const context = { slotId: slot.id, productId: option.productId, variantId: option.variantId };
    // A pick matches the first option with its product and variant, so a second one
    // with a different upcharge would never be charged: refuse it instead.
    const key = JSON.stringify([option.productId, option.variantId]);
    if (seen.has(key)) {
      throw new DomainError(
        CATALOG_ERROR_CODES.duplicateComboSlotOption,
        `product ${option.productId} (variant ${option.variantId}) is offered twice in slot ${slot.id}`,
        context,
      );
    }
    seen.add(key);
    // Same reasoning as modifier price deltas: a cheaper swap is a promotion, not a combo setting.
    if (option.upcharge < 0n) {
      throw new DomainError(
        CATALOG_ERROR_CODES.negativeComboUpcharge,
        `upcharge must not be negative in slot ${slot.id}`,
        { ...context, upcharge: option.upcharge },
      );
    }
  }
}
