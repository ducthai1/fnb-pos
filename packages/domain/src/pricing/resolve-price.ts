import { type Product, findProductVariant } from "../catalog";
import { DomainError } from "../errors";
import { FULL_RATE, type Vnd, applyRate, basisPoints } from "../money";
import { localClockParts } from "../time";
import type { PriceListEffect, PriceListItem } from "./price-list-types";
import { PRICING_ERROR_CODES } from "./pricing-error-codes";
import { selectPriceListItem } from "./select-price-list-item";
import { validatePriceListItem } from "./validate-price-list-item";

export interface ResolveUnitPriceInput {
  readonly product: Product;
  readonly variantId: string | null;
  readonly branchId: string;
  readonly channelKey: string | null;
  /** Epoch ms of the sale; passed in because the domain never reads the clock. */
  readonly at: number;
  /** The branch's fixed offset from UTC (Vietnam: 420). */
  readonly utcOffsetMinutes: number;
  readonly priceList: readonly PriceListItem[];
  /** Typed by the cashier: required for open-price products, refused for every other product. */
  readonly enteredPrice?: Vnd;
}

export type UnitPriceSource = "base" | "price_list" | "manual";

/**
 * The most a cashier may type for one unit of an open-price product: 100.000.000 đ. A custom
 * cake or a catering tray costs a few million; nine digits typed is a slip of the finger.
 */
export const MAX_ENTERED_PRICE = 100_000_000n;

export interface ResolvedUnitPrice {
  readonly unitPrice: Vnd;
  readonly source: UnitPriceSource;
  /** The winning price list item when source is "price_list", otherwise null. */
  readonly priceListItemId: string | null;
}

/**
 * The price of one unit of a product before modifiers, combo upcharges and
 * promotions. For a weighed product this is the price per unit of measure (per
 * kg, per 100 g…); the line amount is multiplyVndByQuantity(unitPrice, weight)
 * at the line, where the rounding mode is chosen.
 *
 * Open-price products skip the catalog and price list entirely: the cashier's
 * price is the price. Who may sell at an open price is checked by the caller.
 */
export function resolveUnitPrice(input: ResolveUnitPriceInput): ResolvedUnitPrice {
  const { product } = input;
  const variant = findProductVariant(product, input.variantId);

  if (product.pricingMode === "open_price") {
    return { unitPrice: enteredPriceOf(input), source: "manual", priceListItemId: null };
  }
  if (input.enteredPrice !== undefined) {
    // Silently ignoring it would let the screen show one price and the receipt another.
    throw new DomainError(
      PRICING_ERROR_CODES.enteredPriceNotAllowed,
      `product ${product.id} has a catalog price; a typed price is not accepted`,
      { productId: product.id, pricingMode: product.pricingMode },
    );
  }

  const basePrice = variant?.price ?? product.basePrice;
  if (basePrice === null) {
    throw new DomainError(
      PRICING_ERROR_CODES.missingBasePrice,
      `product ${product.id} has no price for variant ${input.variantId}`,
      { productId: product.id, variantId: input.variantId },
    );
  }

  input.priceList.forEach(validatePriceListItem);
  const winner = selectPriceListItem(input.priceList, {
    productId: product.id,
    categoryId: product.categoryId,
    variantId: input.variantId,
    branchId: input.branchId,
    channelKey: input.channelKey,
    at: input.at,
    clock: localClockParts(input.at, input.utcOffsetMinutes),
  });
  if (winner === null) return { unitPrice: basePrice, source: "base", priceListItemId: null };
  return {
    unitPrice: applyEffect(winner.effect, basePrice),
    source: "price_list",
    priceListItemId: winner.id,
  };
}

function enteredPriceOf(input: ResolveUnitPriceInput): Vnd {
  const { product, enteredPrice } = input;
  if (enteredPrice === undefined) {
    throw new DomainError(
      PRICING_ERROR_CODES.enteredPriceRequired,
      `product ${product.id} is sold at an open price; the cashier must enter it`,
      { productId: product.id },
    );
  }
  if (enteredPrice < 0n) {
    throw new DomainError(
      PRICING_ERROR_CODES.negativeEnteredPrice,
      `an entered price cannot be negative: ${enteredPrice}`,
      { productId: product.id, enteredPrice },
    );
  }
  if (enteredPrice > MAX_ENTERED_PRICE) {
    throw new DomainError(
      PRICING_ERROR_CODES.enteredPriceTooLarge,
      `an entered price above ${MAX_ENTERED_PRICE}: ${enteredPrice}`,
      { productId: product.id, enteredPrice, maxEnteredPrice: MAX_ENTERED_PRICE },
    );
  }
  return enteredPrice;
}

/**
 * A percentage always comes off the catalog price, never off another rule's
 * price: only one item applies, so discounts cannot stack here. The rounding
 * mode applies to the resulting price (what the menu shows and the customer pays).
 */
function applyEffect(effect: PriceListEffect, basePrice: Vnd): Vnd {
  switch (effect.kind) {
    case "fixed_price":
      return effect.price;
    case "percent_off":
      return applyRate(basePrice, basisPoints(FULL_RATE - effect.rate), effect.rounding);
  }
}
