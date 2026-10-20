import {
  type ModifierSelectionInput,
  type OrderChargeProfile,
  type OrderLine,
  QUANTITY_SCALE,
  computeOrderTotals,
} from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine, CounterOrder, SeatedTable } from "../order/counter-order";
import { newCounterOrder } from "../order/counter-order";
import type { KeptLines, PricedCounterOrder } from "../order/price-counter-order";
import type { Recorded } from "../order/use-counter-order";
import type { StoredTableOrder } from "./stored-table-order";

/** Where an order at a table starts from when its screen opens. */
export interface TableOrderOpening {
  readonly order: CounterOrder;
  readonly recorded: Recorded & { readonly preBillPrinted: boolean };
  /** Items the kitchen has, kept as stored: they print and price as they went out. */
  readonly kept: KeptLines;
  /** The order as stored, priced as the server priced it; null for one not saved yet. */
  readonly priced: PricedCounterOrder | null;
}

/** A free table: a new dine-in order there, saved (and so seated) with its first item. */
export function openingForNewTable(
  orderId: string,
  deviceOrderNo: number,
  table: SeatedTable,
  chargeProfile: OrderChargeProfile,
): TableOrderOpening {
  return {
    order: { ...newCounterOrder(orderId, deviceOrderNo), serviceType: "dine_in", table },
    recorded: { chargeProfile, businessDate: null, version: 0, sent: [], preBillPrinted: false },
    kept: new Map(),
    priced: null,
  };
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
 * An order already seated at a table, from the copy the till holds: each item as the cart
 * line that saves it again (same id, same choices), and the items the kitchen already has
 * kept exactly as stored. Lines only commands make (cancels, discounts) are not the cart's:
 * the server keeps them whatever a save sends.
 */
export function openingFromStored(menu: TillMenu, stored: StoredTableOrder): TableOrderOpening {
  const items = stored.lines.filter(
    (line) =>
      line.lineType === "item" && line.parentLineId === null && line.reversesLineId === null,
  );
  const sentIds = new Set(stored.sent.map((line) => line.lineId));
  const kept = new Map<string, readonly OrderLine[]>();
  const asStored: OrderLine[] = [];
  const lines: CartLine[] = items.map((item) => {
    const options = stored.lines.filter(
      (line) => line.parentLineId === item.id && line.lineType !== "discount",
    );
    if (sentIds.has(item.id)) kept.set(item.id, [item, ...options]);
    asStored.push(item, ...options);
    return {
      lineId: item.id,
      productId: item.productId ?? "",
      variantId: item.variantId,
      modifiers: options
        .filter((line) => line.lineType === "modifier")
        .map((line) => modifierOf(menu, item, line)),
      quantity: Number(item.quantity / QUANTITY_SCALE),
      note: item.note,
    };
  });
  const table =
    stored.tableId === null ? null : { id: stored.tableId, name: stored.tableName ?? "" };
  return {
    order: {
      orderId: stored.orderId,
      deviceOrderNo: stored.deviceOrderNo,
      serviceType: "dine_in",
      tableTag: null,
      table,
      lines,
    },
    recorded: {
      chargeProfile: stored.chargeProfile,
      businessDate: stored.businessDate,
      version: stored.version,
      sent: stored.sent,
      preBillPrinted: stored.preBillPrinted,
    },
    kept,
    priced: {
      lines: asStored,
      totals: computeOrderTotals({ lines: asStored, serviceType: "dine_in" }, stored.chargeProfile),
    },
  };
}
