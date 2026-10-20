import type { PosProduct } from "@fnb/contracts";
import { CATALOG_ERROR_CODES as C, type DomainError } from "@fnb/domain";
import { vi } from "../../messages/vi";

const M = vi.sale.modifierErrors;

const numberIn = (details: DomainError["details"], key: string): number => {
  const value = details?.[key];
  return typeof value === "number" ? value : 0;
};

/** The sentence for a refused choice, naming the group or option the cashier must fix. */
export function modifierErrorMessage(product: PosProduct, error: DomainError): string {
  const details = error.details;
  const group = product.modifierGroups.find((candidate) => candidate.id === details?.groupId);
  const option = group?.options.find((candidate) => candidate.id === details?.optionId);
  const groupName = group?.name ?? "";
  const optionName = option?.name ?? "";
  switch (error.code) {
    case C.requiredModifierGroupMissing:
      return M.required(groupName);
    case C.tooFewModifierSelections:
      return M.tooFew(groupName, numberIn(details, "minSelect"));
    case C.tooManyModifierSelections:
      return M.tooMany(groupName, numberIn(details, "maxSelect"));
    case C.duplicateModifierNotAllowed:
      return M.onlyOnce(optionName);
    case C.optionMaxQuantityExceeded:
      return M.optionMax(optionName, numberIn(details, "maxQuantity"));
    case C.modifierGroupHidden:
      return M.notForVariant(groupName);
    case C.variantRequired:
      return M.variantRequired;
    default:
      // An unknown variant, group or option: the menu changed under the open picker.
      return M.menuChanged;
  }
}
