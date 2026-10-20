import {
  type OrderChargeProfile,
  type OrderLine,
  type OrderTotals,
  computeOrderTotals,
  findProductVariant,
  quantity,
  validateModifierSelection,
} from "@fnb/domain";
import type { PosProduct } from "@fnb/contracts";
import { newId } from "../ids/new-id";
import { unitPriceOf } from "../menu/menu-prices";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine, CounterOrder } from "./counter-order";

export interface PricedCounterOrder {
  /** Each item followed by its option lines, as the server stores the draft. */
  readonly lines: readonly OrderLine[];
  readonly totals: OrderTotals;
}

/** A line the menu no longer sells (removed since it was rung up). */
export class ProductGoneError extends Error {
  constructor(readonly lineId: string) {
    super(`line ${lineId}: its product is no longer on the menu`);
    this.name = "ProductGoneError";
  }
}

function productOf(menu: TillMenu, line: CartLine): PosProduct {
  const product = menu.productsById.get(line.productId);
  if (product === undefined) throw new ProductGoneError(line.lineId);
  return product;
}

/**
 * The cart's lines priced the way the server prices the draft: the unit price the domain
 * resolves at `at`, each option at its own price per unit of the item, every line taxed at
 * its product's rate. A domain error (an option the menu dropped) is thrown as it is.
 */
export function pricedLines(menu: TillMenu, line: CartLine, at: number): OrderLine[] {
  const product = productOf(menu, line);
  const unit = unitPriceOf(menu, product, line.variantId, at);
  const variant = findProductVariant(product, line.variantId);
  const options = new Map(
    product.modifierGroups.flatMap((group) => group.options.map((option) => [option.id, option])),
  );
  const common = { variantId: null, reversesLineId: null, taxRate: product.taxRate } as const;
  return [
    {
      ...common,
      id: line.lineId,
      parentLineId: null,
      lineType: "item",
      productId: product.id,
      variantId: line.variantId,
      modifierOptionId: null,
      nameSnapshot: variant === null ? product.name : `${product.name} (${variant.name})`,
      unitPrice: unit.unitPrice,
      quantity: quantity(line.quantity),
      note: line.note,
      priceSource: unit.source,
    },
    ...validateModifierSelection(product, line.variantId, line.modifiers).map(
      (choice): OrderLine => ({
        ...common,
        id: newId(),
        parentLineId: line.lineId,
        lineType: "modifier",
        productId: null,
        modifierOptionId: choice.optionId,
        nameSnapshot: options.get(choice.optionId)?.name ?? "",
        unitPrice: choice.unitPriceDelta,
        quantity: quantity(choice.quantity),
        note: null,
        priceSource: "base",
      }),
    ),
  ];
}

/** Items the server keeps exactly as stored (the kitchen has them), with their option lines. */
export type KeptLines = ReadonlyMap<string, readonly OrderLine[]>;

const NOTHING_KEPT: KeptLines = new Map();

/**
 * The whole cart with the domain's totals: the screen shows these and adds nothing up. A
 * kept item is not priced again: the server keeps the price it had when it went to the bar.
 */
export function priceCounterOrder(
  menu: TillMenu,
  order: CounterOrder,
  chargeProfile: OrderChargeProfile,
  at: number,
  kept: KeptLines = NOTHING_KEPT,
): PricedCounterOrder {
  const lines = order.lines.flatMap((line) => kept.get(line.lineId) ?? pricedLines(menu, line, at));
  return {
    lines,
    totals: computeOrderTotals({ lines, serviceType: order.serviceType }, chargeProfile),
  };
}
