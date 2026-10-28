import {
  type ModifierSelectionInput,
  type OrderChargeProfile,
  type OrderLine,
  QUANTITY_SCALE,
  computeOrderTotals,
  gramsOfWeighedQuantity,
  measureUnitOf,
} from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import { commandMadeLines, itemTree, referencedItemIds } from "./command-made-lines";
import { storedComboPicks } from "./combo-picks";
import type { CartLine, CounterOrder, CounterServiceType } from "./counter-order";
import type { Recorded } from "./order-session-types";
import type { KeptLines, PricedCounterOrder } from "./price-counter-order";
import type { StoredOrder } from "./stored-order";

/** Where an order's screen starts from: a new order, or one the till holds a copy of. */
export interface OrderOpening {
  readonly order: CounterOrder;
  readonly recorded: Recorded & { readonly preBillPrinted: boolean };
  /** Items held as stored: they print and price as they went out, and a save keeps them. */
  readonly kept: KeptLines;
  /** Discounts and cancel lines: the server keeps them whatever a save sends. */
  readonly commandLines: readonly OrderLine[];
  /** The order as stored, priced as the server priced it; null for one not saved yet. */
  readonly priced: PricedCounterOrder | null;
  /**
   * Cancel lines whose ids the till made and the server does not know yet: their tickets wait
   * until the server's copy names its own lines.
   */
  readonly unconfirmedCancels: ReadonlySet<string>;
}

/** A new order, saved with its first item. */
export function freshOpening(order: CounterOrder, chargeProfile: OrderChargeProfile) {
  return {
    order,
    recorded: { chargeProfile, businessDate: null, version: 0, sent: [], preBillPrinted: false },
    kept: new Map(),
    commandLines: [],
    priced: null,
    unconfirmedCancels: new Set(),
  } satisfies OrderOpening;
}

/** The option of the product a stored option line picked, with the group it belongs to. */
function modifierOf(menu: TillMenu, item: OrderLine, line: OrderLine): ModifierSelectionInput {
  const product = item.productId === null ? undefined : menu.productsById.get(item.productId);
  const group = product?.modifierGroups.find((candidate) =>
    candidate.options.some((option) => option.id === line.modifierOptionId),
  );
  return {
    // A group gone from the menu leaves the line unpriceable, which the screen then says.
    groupId: group?.id ?? "",
    optionId: line.modifierOptionId ?? "",
    quantity: Number(line.quantity / QUANTITY_SCALE),
  };
}

/**
 * What the cashier typed for a stored item, as its cart line carries it: the price of an
 * open-price item, the grams of a weighed one (its quantity, in the product's unit). A weight
 * the product's unit cannot read back in whole grams (the unit changed since) is left out,
 * and the line then cannot be priced until it is weighed again.
 */
export function entryOfStored(
  menu: TillMenu,
  item: Pick<OrderLine, "productId" | "quantity" | "unitPrice" | "priceSource">,
): Pick<CartLine, "quantity" | "enteredPrice" | "grams"> {
  const product = item.productId === null ? undefined : menu.productsById.get(item.productId);
  const per = product === undefined ? null : measureUnitOf(product);
  const typed = item.priceSource === "manual" ? { enteredPrice: item.unitPrice } : {};
  if (per === null) return { ...typed, quantity: Number(item.quantity / QUANTITY_SCALE) };
  try {
    return { ...typed, quantity: 1, grams: gramsOfWeighedQuantity(item.quantity, per) };
  } catch {
    return { ...typed, quantity: 1 };
  }
}

/**
 * An order from the copy the till holds: each item as the cart line that saves it again
 * (same id, same choices); the items the kitchen has, or a discount or cancel line points
 * at, kept exactly as stored; the lines only commands make held beside the cart.
 */
export function openingFromStored(menu: TillMenu, stored: StoredOrder): OrderOpening {
  const items = stored.lines.filter(
    (line) =>
      line.lineType === "item" && line.parentLineId === null && line.reversesLineId === null,
  );
  const held = new Set([
    ...stored.sent.map((line) => line.lineId),
    ...referencedItemIds(stored.lines),
  ]);
  const kept = new Map<string, readonly OrderLine[]>();
  const asStored: OrderLine[] = [];
  const lines: CartLine[] = items.map((item) => {
    const tree = itemTree(stored.lines, item.id);
    if (held.has(item.id)) kept.set(item.id, tree);
    asStored.push(...tree);
    const comboPicks = storedComboPicks(menu, item, tree);
    return {
      lineId: item.id,
      productId: item.productId ?? "",
      variantId: item.variantId,
      // The item's own options; a combo pick's options travel with the pick.
      modifiers: tree
        .filter((line) => line.lineType === "modifier" && line.parentLineId === item.id)
        .map((line) => modifierOf(menu, item, line)),
      ...(comboPicks === undefined ? {} : { comboPicks }),
      ...entryOfStored(menu, item),
      note: item.note,
    };
  });
  const commandLines = commandMadeLines(stored.lines);
  const priced = [...asStored, ...commandLines];
  const cancels = commandLines.filter((line) => line.reversesLineId !== null);
  const table =
    stored.tableId === null ? null : { id: stored.tableId, name: stored.tableName ?? "" };
  const serviceType: CounterServiceType = stored.serviceType === "dine_in" ? "dine_in" : "takeaway";
  return {
    order: {
      orderId: stored.orderId,
      deviceOrderNo: stored.deviceOrderNo,
      serviceType,
      tableTag: stored.tableTag,
      table,
      lines,
      openedOn: stored.deviceId,
      ...(stored.openedAt === null ? {} : { openedAt: stored.openedAt }),
    },
    recorded: {
      chargeProfile: stored.chargeProfile,
      businessDate: stored.businessDate,
      version: stored.version,
      sent: stored.sent,
      preBillPrinted: stored.preBillPrinted,
    },
    kept,
    commandLines,
    unconfirmedCancels: new Set(stored.heldOnTill === true ? cancels.map((line) => line.id) : []),
    priced: {
      lines: priced,
      totals: computeOrderTotals({ lines: priced, serviceType }, stored.chargeProfile),
    },
  };
}
