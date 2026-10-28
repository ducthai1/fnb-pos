import type { PosProduct } from "@fnb/contracts";
import type { TillMenu } from "../features/menu/till-menu";
import type { CartLine, CounterOrder } from "../features/order/counter-order";
import { entryNeeded, needsNoChoice, plainLine } from "../features/order/plain-cart-line";
import type { PendingEntry } from "./line-entry-flow";

/** What a line becomes once chosen: added at once, or held for its price or weight. */
export type ChosenLine =
  | { readonly kind: "add"; readonly line: CartLine }
  | { readonly kind: "enter"; readonly pending: PendingEntry };

/** A line chosen for `product` (one tap, or the picker's "add"): added, or typed first. */
export function chosenLine(product: PosProduct, line: CartLine): ChosenLine {
  const kind = entryNeeded(product);
  return kind === null
    ? { kind: "add", line }
    : { kind: "enter", pending: { kind, product, line, editing: false } };
}

/** A tap on a product: the picker when it has sizes or options, else its one plain line. */
export const tapped = (product: PosProduct): ChosenLine | "pick" =>
  needsNoChoice(product) ? chosenLine(product, plainLine(product)) : "pick";

/** A line on the order typed again (its price, its weight); null for a line that has none. */
export function retyped(menu: TillMenu, order: CounterOrder, lineId: string): PendingEntry | null {
  const line = order.lines.find((candidate) => candidate.lineId === lineId);
  const product = line === undefined ? undefined : menu.productsById.get(line.productId);
  const kind = product === undefined ? null : entryNeeded(product);
  if (line === undefined || product === undefined || kind === null) return null;
  return { kind, product, line, editing: true };
}
