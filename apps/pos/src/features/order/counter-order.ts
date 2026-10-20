import type { ModifierSelectionInput } from "@fnb/domain";

export type CounterServiceType = "takeaway" | "dine_in";

/** One item the cashier rang up: what was chosen, never what it costs. */
export interface CartLine {
  readonly lineId: string;
  readonly productId: string;
  readonly variantId: string | null;
  /** As validateModifierSelection returned them: catalog order, one entry per option. */
  readonly modifiers: readonly ModifierSelectionInput[];
  /** Whole units: cups, cakes. */
  readonly quantity: number;
  readonly note: string | null;
}

/** The order open on the counter, before it is paid. */
export interface CounterOrder {
  readonly orderId: string;
  /** The till's own running number, on the bill before the order ever syncs. */
  readonly deviceOrderNo: number;
  readonly serviceType: CounterServiceType;
  /** The table number a dine-in order is brought to; a takeaway has none. */
  readonly tableTag: string | null;
  /** The table the order is seated at, which it holds until paid; null at the counter. */
  readonly table: SeatedTable | null;
  readonly lines: readonly CartLine[];
  /**
   * The till that opened the order, when another one did (a table's order follows the
   * table, not the till): its number is that till's, never one of this till's own.
   */
  readonly openedOn?: string;
}

export interface SeatedTable {
  readonly id: string;
  readonly name: string;
}

/** The draft contract's limit is 9 digits; no counter sells a thousand of one thing. */
export const MAX_LINE_QUANTITY = 999;
/** The longest note the draft contract carries, and the longest table number. */
export const MAX_NOTE_LENGTH = 500;
export const MAX_TABLE_TAG_LENGTH = 20;

export function newCounterOrder(orderId: string, deviceOrderNo: number): CounterOrder {
  return {
    orderId,
    deviceOrderNo,
    serviceType: "takeaway",
    tableTag: null,
    table: null,
    lines: [],
  };
}

export function addCartLine(order: CounterOrder, line: CartLine): CounterOrder {
  return { ...order, lines: [...order.lines, line] };
}

/** 1 to MAX_LINE_QUANTITY: taking a line to nothing is removing it, a separate act. */
export function setLineQuantity(order: CounterOrder, lineId: string, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return order;
  return {
    ...order,
    lines: order.lines.map((line) => (line.lineId === lineId ? { ...line, quantity } : line)),
  };
}

/**
 * Every line of a counter order is unsent: the drinks go to the bar once it is paid. A
 * line already printed would need a void, which leaves a cancel ticket, not a removal.
 */
export function removeCartLine(order: CounterOrder, lineId: string): CounterOrder {
  return { ...order, lines: order.lines.filter((line) => line.lineId !== lineId) };
}

/** A note as the draft carries it: trimmed, null when empty, within the contract's limit. */
export function cleanNote(text: string): string | null {
  const trimmed = text.trim().slice(0, MAX_NOTE_LENGTH).trim();
  return trimmed === "" ? null : trimmed;
}

/** Takeaway carries no table; dine-in carries the number typed, if any. */
export function setServiceType(
  order: CounterOrder,
  serviceType: CounterServiceType,
  tableTag: string,
): CounterOrder {
  const tag = tableTag.trim().slice(0, MAX_TABLE_TAG_LENGTH).trim();
  return {
    ...order,
    serviceType,
    tableTag: serviceType === "dine_in" && tag !== "" ? tag : null,
  };
}
