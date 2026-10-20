import type { ModifierGroupVariantRule, Product } from "@fnb/domain";
import { vnd } from "@fnb/domain";
import type { ProductBody } from "../../../lib/catalog/product-document";

/**
 * The body as the domain sees it — the same conversion the API makes before it checks a
 * saved product — so the editor and the preview judge the product by the rules the server
 * and the tills apply.
 */
export function productBodyToDomain(id: string, body: ProductBody): Product {
  return {
    id,
    categoryId: body.categoryId,
    kind: body.kind,
    name: body.name,
    basePrice: body.basePrice === null ? null : vnd(body.basePrice),
    pricingMode: body.pricingMode,
    variants: body.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price === null ? null : vnd(variant.price),
    })),
    modifierGroups: body.modifierGroups.map((group) => ({
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
      body.combo === null
        ? null
        : {
            slots: body.combo.slots.map((slot) => ({
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

/** Only the fields set, so an unset limit keeps inheriting the group's. */
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
