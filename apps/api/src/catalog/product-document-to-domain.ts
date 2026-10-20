import { type ProductDocumentInput, productDocumentToDomain } from "@fnb/contracts";
import { type BasisPoints, type Product, basisPoints, validateProductConfig } from "@fnb/domain";

export interface CheckedProductDocument {
  product: Product;
  taxRate: BasisPoints;
}

/**
 * The body as the domain sees it, checked with the same rules the POS relies on. Throws
 * the domain's error, which the route answers as 400 with its code.
 */
export function checkProductDocument(
  id: string,
  input: ProductDocumentInput,
): CheckedProductDocument {
  const product = productDocumentToDomain(id, input);
  validateProductConfig(product);
  return { product, taxRate: basisPoints(input.taxRateBp) };
}
