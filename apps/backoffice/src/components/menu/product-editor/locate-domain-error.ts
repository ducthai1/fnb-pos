import { CATALOG_ERROR_CODES, type DomainError, PRICING_ERROR_CODES } from "@fnb/domain";
import { groupPath, optionPath, productPath, rulePath, variantPath } from "./draft-error-paths";

const C = CATALOG_ERROR_CODES;

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/**
 * Where a refusal of the domain belongs in the editor, from the ids it carries: an option,
 * a group's rule for one size, a group, a size, or the product itself. A limit problem with
 * a variant id is about that size's override; without one, about the group's own limits.
 * The same ids come back with a refusal the API made (its `details`), so a rule only the
 * server could check lands on the same field.
 */
export function locateDomainError(error: Pick<DomainError, "code" | "details">): string {
  const details = error.details ?? {};
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
  return productPath();
}
