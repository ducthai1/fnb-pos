import {
  CATALOG_ERROR_CODES,
  type DomainError,
  type ModifierSelectionInput,
  type Product,
  type Vnd,
  addVnd,
  effectiveModifierGroupRule,
  isDomainError,
  resolveUnitPrice,
  validateModifierSelection,
} from "@fnb/domain";
import { messageForCode } from "../../../lib/errors/failure-message";
import { vi } from "../../../messages/vi";

const T = vi.menu.preview;
const C = CATALOG_ERROR_CODES;
// Every branch is in Vietnam; the base price before price lists does not depend on it.
const VIETNAM_UTC_OFFSET_MINUTES = 420;

export type PreviewOutcome =
  | { readonly ok: true; readonly unitPrice: Vnd | null; readonly extras: Vnd }
  | { readonly ok: false; readonly error: DomainError };

/** Units chosen per option, keyed `${groupId}/${optionId}`. */
export type PreviewCounts = Readonly<Record<string, number>>;

export const countKey = (groupId: string, optionId: string) => `${groupId}/${optionId}`;

/**
 * What a till would make of these choices: the domain's own check of the selection, then
 * the base price plus what the options add (an open-price product has no base price). A
 * group hidden for the size is left out, as the till never shows it.
 */
export function previewOutcome(
  product: Product,
  variantId: string | null,
  counts: PreviewCounts,
  branchId: string,
  at: number,
): PreviewOutcome {
  const selections: ModifierSelectionInput[] = [];
  for (const group of product.modifierGroups) {
    if (effectiveModifierGroupRule(group, variantId).hidden) continue;
    for (const option of group.options) {
      const quantity = counts[countKey(group.id, option.id)] ?? 0;
      if (quantity > 0) selections.push({ groupId: group.id, optionId: option.id, quantity });
    }
  }
  try {
    const lines = validateModifierSelection(product, variantId, selections);
    const extras = addVnd(...lines.map((line) => line.priceDelta));
    const unitPrice =
      product.pricingMode === "open_price"
        ? null
        : resolveUnitPrice({
            product,
            variantId,
            branchId,
            channelKey: null,
            at,
            utcOffsetMinutes: VIETNAM_UTC_OFFSET_MINUTES,
            priceList: [],
          }).unitPrice;
    return { ok: true, unitPrice: unitPrice === null ? null : addVnd(unitPrice, extras), extras };
  } catch (error) {
    if (!isDomainError(error)) throw error;
    return { ok: false, error };
  }
}

const numberIn = (details: Readonly<Record<string, unknown>>, key: string): number | null => {
  const value = details[key];
  return typeof value === "number" ? value : null;
};

/** The sentence for a refused choice, with the limit and the count when the rule gives them. */
export function previewMessage(error: DomainError): string {
  const details = error.details ?? {};
  const min = numberIn(details, "minSelect");
  const max = numberIn(details, "maxSelect");
  const selected = numberIn(details, "selected");
  const optionMax = numberIn(details, "maxQuantity");
  if (error.code === C.requiredModifierGroupMissing && min !== null) return T.requiredMissing(min);
  if (error.code === C.tooFewModifierSelections && min !== null && selected !== null) {
    return T.tooFew(min, selected);
  }
  if (error.code === C.tooManyModifierSelections && max !== null && selected !== null) {
    return T.tooMany(max, selected);
  }
  if (error.code === C.optionMaxQuantityExceeded && optionMax !== null) return T.optionMax(optionMax);
  return messageForCode(error.code);
}
