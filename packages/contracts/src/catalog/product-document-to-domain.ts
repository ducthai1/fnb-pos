import { type ModifierGroupVariantRule, type Product, vnd } from "@fnb/domain";
import type { ProductDocumentInput } from "./product-document-schema";

/**
 * A product body as the domain sees it. This is the one conversion: the API checks a saved
 * product with it and the backoffice checks and previews a draft with it, so the editor,
 * the server and the tills judge a product by the same rules. It converts and checks
 * nothing (validateProductConfig does); amounts in whole đồng become Vnd.
 */
export function productDocumentToDomain(id: string, input: ProductDocumentInput): Product {
  return {
    id,
    categoryId: input.categoryId,
    kind: input.kind,
    name: input.name,
    basePrice: input.basePrice === null ? null : vnd(input.basePrice),
    pricingMode: input.pricingMode,
    measureUnit: input.measureUnit,
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
