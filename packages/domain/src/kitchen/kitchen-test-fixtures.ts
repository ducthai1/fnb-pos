import { type Quantity, quantity } from "../money";
import { item, line, sequentialIds } from "../order/order-line-test-fixtures";
import type { Order, OrderLine } from "../order/order-types";
import { voidLine } from "../order/void-order-line";
import { diffKitchenTicket } from "./diff-kitchen-ticket";
import type { KitchenTicketDiff, SentLineState, StationRouting } from "./kitchen-ticket-types";

const STATIONS: Readonly<Record<string, string>> = {
  "product-tea": "bar",
  "product-coffee": "bar",
  "product-cake": "kitchen",
  "product-noodle": "kitchen",
};

/** Drinks to the bar, food to the kitchen, bottled water nowhere. */
export const byProduct: StationRouting = (l) => STATIONS[l.productId ?? ""] ?? null;

export const send = (order: Order, state: readonly SentLineState[]): KitchenTicketDiff =>
  diffKitchenTicket(order, state, byProduct);

/** A root item with a readable name and an optional note. */
export function dish(id: string, qty: number, note: string | null = null): OrderLine {
  return { ...item(id, quantity(qty)), nameSnapshot: `dish ${id}`, note };
}

export const topping = (id: string, parent: string, qty = 1): OrderLine => ({
  ...line(id, "modifier", parent, quantity(qty)),
  nameSnapshot: `topping ${id}`,
});

export function withLines(order: Order, lines: readonly OrderLine[]): Order {
  return { ...order, lines, version: order.version + 1 };
}

/** Changes one line, as editing the order on the till does. */
export function editLine(order: Order, id: string, change: Partial<OrderLine>): Order {
  return withLines(
    order,
    order.lines.map((l) => (l.id === id ? { ...l, ...change } : l)),
  );
}

export function sentOf(state: readonly SentLineState[], lineId: string): Quantity | undefined {
  return state.find((s) => s.lineId === lineId)?.sentQuantity;
}

/** Cancels units of a line the way the till does, passing what the kitchen layer says was sent. */
export function cancel(
  order: Order,
  state: readonly SentLineState[],
  lineId: string,
  units: number,
) {
  return voidLine(order, {
    lineId,
    quantity: quantity(units),
    reasonCode: "customer_changed_mind",
    staffId: "cashier-1",
    approvedByStaffId: "manager-1",
    sentQuantity: sentOf(state, lineId) ?? quantity(0),
    newLineId: sequentialIds(`cancel-${lineId}-${order.version}`),
    requireApprovalAfterSent: true,
  });
}
