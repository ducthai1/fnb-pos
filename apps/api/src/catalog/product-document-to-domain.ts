import type { ProductDocumentInput } from "@fnb/contracts";
import {
  type BasisPoints,
  type ModifierGroupVariantRule,
  type Product,
  basisPoints,
  validateProductConfig,
  vnd,
} from "@fnb/domain";

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
  const product: Product = {
    id,
    categoryId: input.categoryId,
    kind: input.kind,
    name: input.name,
    basePrice: input.basePrice === null ? null : vnd(input.basePrice),
    pricingMode: input.pricingMode,
    variants: input.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price === null ? null : vnd(variant.price),
    })),
    modifierGroups: input.modifierGroups.map((group) => ({
      id: group.id,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      allowDuplicates: group.allowDuplicates,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: vnd(option.priceDelta),
        maxQuantity: option.maxQuantity,
      })),
      variantRules: Object.fromEntries(
        Object.entries(group.variantRules).map(([variantId, rule]) => [variantId, ruleOf(rule)]),
      ),
    })),
    combo:
      input.combo === null
        ? null
        : {
            slots: input.combo.slots.map((slot) => ({
              id: slot.id,
              name: slot.name,
              minSelect: slot.minSelect,
              maxSelect: slot.maxSelect,
              options: slot.options.map((option) => ({
                productId: option.productId,
                variantId: option.variantId,
                upcharge: vnd(option.upcharge),
              })),
            })),
          },
  };
  validateProductConfig(product);
  return { product, taxRate: basisPoints(input.taxRateBp) };
}

/** Only the fields the client set, so an unset limit keeps inheriting the group's. */
function ruleOf(rule: {
  minSelect?: number | undefined;
  maxSelect?: number | undefined;
  hidden?: boolean | undefined;
}): ModifierGroupVariantRule {
  return {
    ...(rule.minSelect === undefined ? {} : { minSelect: rule.minSelect }),
    ...(rule.maxSelect === undefined ? {} : { maxSelect: rule.maxSelect }),
    ...(rule.hidden === undefined ? {} : { hidden: rule.hidden }),
  };
}
