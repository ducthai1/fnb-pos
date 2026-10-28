import {
  type OrderChargeProfile,
  type OrderLine,
  type OrderTotals,
  computeOrderTotals,
  type Quantity,
  findProductVariant,
  measureUnitOf,
  quantity,
  resolveComboPicks,
  validateModifierSelection,
  weighedQuantity,
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

const optionNames = (product: PosProduct) =>
  new Map(
    product.modifierGroups.flatMap((group) =>
      group.options.map((option) => [option.id, option.name]),
    ),
  );

/** Option lines under `parentLineId`, each at its own price per one unit of that parent. */
function optionLines(
  parentLineId: string,
  product: PosProduct,
  selections: ReturnType<typeof validateModifierSelection>,
  taxRate: PosProduct["taxRate"],
): OrderLine[] {
  const names = optionNames(product);
  return selections.map((choice): OrderLine => ({
    id: newId(),
    parentLineId,
    lineType: "modifier",
    productId: null,
    variantId: null,
    modifierOptionId: choice.optionId,
    nameSnapshot: names.get(choice.optionId) ?? "",
    unitPrice: choice.unitPriceDelta,
    quantity: quantity(choice.quantity),
    taxRate,
    note: null,
    priceSource: "base",
    reversesLineId: null,
  }));
}

/**
 * A combo's picks as the server stores them under it: one unit per combo at the slot's
 * upcharge, then the pick's own options, all at the combo's tax rate. A pick the menu no
 * longer has is refused by the domain, which makes the line unpriceable.
 */
function pickLines(menu: TillMenu, product: PosProduct, line: CartLine): OrderLine[] {
  const picks = line.comboPicks ?? [];
  if (product.kind !== "combo" && picks.length === 0) return [];
  const productOfPick = (id: string) => menu.productsById.get(id);
  return resolveComboPicks(product, productOfPick, picks).flatMap((pick) => {
    const id = newId();
    const component: OrderLine = {
      id,
      parentLineId: line.lineId,
      lineType: "combo_component",
      productId: pick.product.id,
      variantId: pick.variantId,
      modifierOptionId: null,
      nameSnapshot: pick.name,
      unitPrice: pick.upcharge,
      quantity: quantity(1),
      taxRate: product.taxRate,
      note: null,
      priceSource: "base",
      reversesLineId: null,
    };
    const own = menu.productsById.get(pick.product.id);
    return [
      component,
      ...(own === undefined ? [] : optionLines(id, own, pick.modifiers, product.taxRate)),
    ];
  });
}

/**
 * The cart's lines priced the way the server prices the draft: the unit price the domain
 * resolves at `at`, each option at its own price per unit of the item, a combo's picks at
 * their upcharges, every line taxed at its product's rate. A domain error (an option the
 * menu dropped) is thrown as it is.
 */
export function pricedLines(menu: TillMenu, line: CartLine, at: number): OrderLine[] {
  const product = productOf(menu, line);
  const unit = unitPriceOf(menu, product, line.variantId, at, line.enteredPrice);
  const variant = findProductVariant(product, line.variantId);
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
      quantity: unitsOf(product, line),
      note: line.note,
      priceSource: unit.source,
    },
    ...optionLines(
      line.lineId,
      product,
      validateModifierSelection(product, line.variantId, line.modifiers),
      product.taxRate,
    ),
    ...pickLines(menu, product, line),
  ];
}

/**
 * How many units the item line stands for: the cups rung up, or, sold by weight, the grams
 * weighed counted in the unit its price is per (a line not weighed yet is refused).
 */
function unitsOf(product: PosProduct, line: CartLine): Quantity {
  const per = measureUnitOf(product);
  return per === null ? quantity(line.quantity) : weighedQuantity(line.grams ?? 0, per);
}

/** Items the server keeps exactly as stored (the kitchen has them), with their option lines. */
export type KeptLines = ReadonlyMap<string, readonly OrderLine[]>;

const NOTHING_KEPT: KeptLines = new Map();

/**
 * The whole cart with the domain's totals: the screen shows these and adds nothing up. A
 * kept item is not priced again: the server keeps the price it had when it went to the bar.
 * Lines commands made (discounts, cancel lines) follow the cart's, as the server stores them.
 */
export function priceCounterOrder(
  menu: TillMenu,
  order: CounterOrder,
  chargeProfile: OrderChargeProfile,
  at: number,
  kept: KeptLines = NOTHING_KEPT,
  commandLines: readonly OrderLine[] = [],
): PricedCounterOrder {
  const cart = order.lines.flatMap((line) => kept.get(line.lineId) ?? pricedLines(menu, line, at));
  const lines = [...cart, ...commandLines];
  return {
    lines,
    totals: computeOrderTotals({ lines, serviceType: order.serviceType }, chargeProfile),
  };
}
