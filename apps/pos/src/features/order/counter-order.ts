import type { ModifierSelectionInput, Vnd } from "@fnb/domain";

export type CounterServiceType = "takeaway" | "dine_in";

/** One item the cashier rang up: what was chosen, never what it costs. */
export interface CartLine {
  readonly lineId: string;
  readonly productId: string;
  readonly variantId: string | null;
  /** As validateModifierSelection returned them: catalog order, one entry per option. */
  readonly modifiers: readonly ModifierSelectionInput[];
  /** Whole units: cups, cakes. A line sold by weight is one weighing: always 1. */
  readonly quantity: number;
  readonly note: string | null;
  /** On a product sold at an open price: the price the cashier typed for one unit. */
  readonly enteredPrice?: Vnd;
  /** On a product sold by weight: what it weighed, in whole grams. */
  readonly grams?: number;
  /**
   * A manager's approval of `enteredPrice` on this very line, for a cashier who may not type
   * prices alone. The server uses it the first time the price reaches it; a later save of the
   * same price needs none.
   */
  readonly priceApprovalId?: string;
}

/** What the cashier typed for a line: its price, or what it weighed. */
export type LineEntry =
  | { readonly kind: "price"; readonly price: Vnd; readonly approvalId: string | null }
  | { readonly kind: "weight"; readonly grams: number };

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
  /** When the server says the order was opened, kept in the till's copies of it. */
  readonly openedAt?: string | null;
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

/**
 * 1 to MAX_LINE_QUANTITY: taking a line to nothing is removing it, a separate act. A line
 * sold by weight keeps its one weighing: more of it is weighed again, not counted.
 */
export function setLineQuantity(order: CounterOrder, lineId: string, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return order;
  return {
    ...order,
    lines: order.lines.map((line) =>
      line.lineId === lineId && line.grams === undefined ? { ...line, quantity } : line,
    ),
  };
}

/** `line` with what the cashier typed: a price (and its approval, if one was needed) or a weight. */
export function withEntry(line: CartLine, entry: LineEntry): CartLine {
  if (entry.kind === "weight") return { ...line, grams: entry.grams, quantity: 1 };
  // Built afresh: an approval of an older price must not ride along with the new one.
  const { lineId, productId, variantId, modifiers, quantity, note } = line;
  return {
    lineId,
    productId,
    variantId,
    modifiers,
    quantity,
    note,
    enteredPrice: entry.price,
    ...(entry.approvalId === null ? {} : { priceApprovalId: entry.approvalId }),
  };
}

/** Puts `line` in place of the line of the same id: a price typed again, a new weighing. */
export function replaceCartLine(order: CounterOrder, line: CartLine): CounterOrder {
  return {
    ...order,
    lines: order.lines.map((each) => (each.lineId === line.lineId ? line : each)),
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
