import { DomainError } from "../errors";
import type { PriceListItem } from "./price-list-types";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { validatePriceListItem } from "./validate-price-list-item";

/**
 * Every item of one price list, as the backoffice saves it. Item ids must be unique
 * within it: a resolved price names the item it came from, and a receipt or report
 * that cannot tell two items apart cannot explain the price.
 */
export function validatePriceList(items: readonly PriceListItem[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      throw new DomainError(
        PRICING_ERROR_CODES.duplicatePriceListItemId,
        `price list item ${item.id} appears twice`,
        { priceListItemId: item.id },
      );
    }
    seen.add(item.id);
    validatePriceListItem(item);
  }
}
