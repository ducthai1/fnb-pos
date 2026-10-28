import {
  CATALOG_ERROR_CODES,
  type ModifierGroup,
  type Product,
  validateComboConfig,
  validateModifierGroupConfig,
} from "../catalog";
import { DomainError } from "../errors";
import type { PriceListItem } from "./price-list-types";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { validatePriceList } from "./validate-price-list";

/**
 * Rejects a product the POS could not sell or price as configured: run on save, so a
 * till never meets a broken product mid-order. `priceList` holds the price list items
 * written for this product (variant and product scope); broader items are checked by
 * validatePriceList alone. Throws on the first problem found.
 */
export function validateProductConfig(
  product: Product,
  priceList: readonly PriceListItem[] = [],
): void {
  const variantIds = assertVariants(product);
  assertMeasureUnit(product);
  assertCombo(product);
  const groupIds = new Set<string>();
  for (const group of product.modifierGroups) {
    if (groupIds.has(group.id)) {
      fail(CATALOG_ERROR_CODES.duplicateModifierGroupId, product, { groupId: group.id });
    }
    groupIds.add(group.id);
    validateModifierGroupConfig(group);
    assertVariantRules(product, group, variantIds);
  }
  validatePriceList(priceList);
  for (const item of priceList) {
    const { scope } = item;
    if (scope.kind === "variant" && !variantIds.has(scope.variantId)) {
      fail(PRICING_ERROR_CODES.scopeVariantNotOnProduct, product, {
        priceListItemId: item.id,
        variantId: scope.variantId,
      });
    }
    if (scope.kind === "product" && scope.productId !== product.id) {
      fail(PRICING_ERROR_CODES.scopeProductMismatch, product, {
        priceListItemId: item.id,
        scopeProductId: scope.productId,
      });
    }
  }
}

function fail(code: string, product: Product, details: Record<string, unknown>): never {
  throw new DomainError(code, `product ${product.id}: ${code}`, {
    productId: product.id,
    ...details,
  });
}

function assertVariants(product: Product): ReadonlySet<string> {
  if (product.basePrice !== null && product.basePrice < 0n) {
    fail(CATALOG_ERROR_CODES.negativeProductPrice, product, { variantId: null });
  }
  // Without variants the product itself is the one form sold.
  if (product.variants.length === 0) assertPriced(product, null, product.basePrice);
  const ids = new Set<string>();
  for (const variant of product.variants) {
    if (ids.has(variant.id)) {
      fail(CATALOG_ERROR_CODES.duplicateVariantId, product, { variantId: variant.id });
    }
    ids.add(variant.id);
    if (variant.price !== null && variant.price < 0n) {
      fail(CATALOG_ERROR_CODES.negativeProductPrice, product, { variantId: variant.id });
    }
    assertPriced(product, variant.id, variant.price ?? product.basePrice);
  }
  return ids;
}

/** An open-price product is priced by the cashier; any other needs a catalog price. */
function assertPriced(product: Product, variantId: string | null, price: bigint | null): void {
  if (product.pricingMode !== "open_price" && price === null) {
    fail(PRICING_ERROR_CODES.missingBasePrice, product, { variantId });
  }
}

/** A weighed product says what its price is per; on any other a unit would mean nothing. */
function assertMeasureUnit(product: Product): void {
  const unit = product.measureUnit ?? null;
  if (product.pricingMode === "weighed" && unit === null) {
    fail(PRICING_ERROR_CODES.measureUnitMissing, product, {});
  }
  if (product.pricingMode !== "weighed" && unit !== null) {
    fail(PRICING_ERROR_CODES.measureUnitOnUnweighedProduct, product, { measureUnit: unit });
  }
}

function assertCombo(product: Product): void {
  if (product.kind === "combo") {
    if (product.combo === null) fail(CATALOG_ERROR_CODES.comboDefinitionMissing, product, {});
    validateComboConfig(product.combo);
  } else if (product.combo !== null) {
    // Slots on a plain product would be ignored at sale time, which hides a mistake.
    fail(CATALOG_ERROR_CODES.comboDefinitionOnNonCombo, product, { kind: product.kind });
  }
}

/** A rule keyed by another product's variant (or a deleted one) would silently never apply. */
function assertVariantRules(
  product: Product,
  group: ModifierGroup,
  variantIds: ReadonlySet<string>,
): void {
  for (const variantId of Object.keys(group.variantRules)) {
    if (!variantIds.has(variantId)) {
      fail(CATALOG_ERROR_CODES.variantRuleForUnknownVariant, product, {
        groupId: group.id,
        variantId,
      });
    }
  }
}
