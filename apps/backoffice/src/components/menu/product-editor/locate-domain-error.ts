import { CATALOG_ERROR_CODES, type DomainError, PRICING_ERROR_CODES } from "@fnb/domain";
import {
  groupPath,
  optionPath,
  productPath,
  rulePath,
  slotOptionPath,
  slotPath,
  variantPath,
} from "./draft-error-paths";
import type { DraftCombo } from "./product-draft";

const C = CATALOG_ERROR_CODES;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * Where a refusal of the domain belongs in the editor, from the ids it carries: an option,
 * a group's rule for one size, a group, a size, or the product itself. A limit problem with
 * a variant id is about that size's override; without one, about the group's own limits.
 * The same ids come back with a refusal the API made (its `details`), so a rule only the
 * server could check lands on the same field.
 */
export function locateDomainError(
  error: Pick<DomainError, "code" | "details">,
  combo: DraftCombo | null = null,
): string {
  const details = error.details ?? {};
  const slotId = text(details.slotId);
  if (slotId !== null) return locateSlotError(error.code, details, slotId, combo);
  const groupId = text(details.groupId);
  const optionId = text(details.optionId);
  const variantId = text(details.variantId);

  if (groupId !== null && optionId !== null) {
    const field =
      error.code === C.invalidOptionMaxQuantity
        ? "maxQuantity"
        : error.code === C.negativePriceDelta
          ? "priceDelta"
          : undefined;
    return optionPath(groupId, optionId, field);
  }
  if (groupId !== null && variantId !== null) return rulePath(groupId, variantId);
  if (groupId !== null) return groupPath(groupId);
  if (variantId !== null) {
    const priced = error.code === PRICING_ERROR_CODES.missingBasePrice || error.code === C.negativeProductPrice;
    return variantPath(variantId, priced ? "price" : undefined);
  }
  if (error.code === PRICING_ERROR_CODES.missingBasePrice || error.code === C.negativeProductPrice) {
    return productPath("basePrice");
  }
  if (
    error.code === PRICING_ERROR_CODES.measureUnitMissing ||
    error.code === PRICING_ERROR_CODES.measureUnitOnUnweighedProduct
  ) {
    return productPath("measureUnit");
  }
  return productPath();
}

/**
 * A combo refusal: on the row of the product it names (the second of two equal rows, the one
 * to remove), or on the slot's limits or the slot itself.
 */
function locateSlotError(
  code: string,
  details: Readonly<Record<string, unknown>>,
  slotId: string,
  combo: DraftCombo | null,
): string {
  const productId = text(details.productId);
  if (productId !== null) {
    const variantId = text(details.variantId);
    const rows = (combo?.slots.find((slot) => slot.id === slotId)?.options ?? []).filter(
      (option) => option.productId === productId && option.variantId === variantId,
    );
    const row = code === C.duplicateComboSlotOption ? rows.at(-1) : rows[0];
    if (row !== undefined) {
      return slotOptionPath(slotId, row.key, code === C.negativeComboUpcharge ? "upcharge" : undefined);
    }
  }
  if (code === C.invalidComboSlotLimits) return slotPath(slotId, "maxSelect");
  return slotPath(slotId);
}
