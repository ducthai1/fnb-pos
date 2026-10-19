import { DomainError } from "../errors";
import { CATALOG_ERROR_CODES } from "./catalog-error-codes";
import type { Product, Variant } from "./catalog-types";

/**
 * The variant being sold. A product with variants must name one of its own (a
 * size picked from another product would price and validate against the wrong
 * rules); a product without variants must be sold with variantId null.
 */
export function findProductVariant(product: Product, variantId: string | null): Variant | null {
  if (variantId === null) {
    if (product.variants.length > 0) {
      throw new DomainError(
        CATALOG_ERROR_CODES.variantRequired,
        `product ${product.id} is sold by variant; one must be chosen`,
        { productId: product.id },
      );
    }
    return null;
  }
  const variant = product.variants.find((candidate) => candidate.id === variantId);
  if (!variant) {
    throw new DomainError(
      CATALOG_ERROR_CODES.unknownVariant,
      `variant ${variantId} does not belong to product ${product.id}`,
      { productId: product.id, variantId },
    );
  }
  return variant;
}
