import type { PosProduct } from "@fnb/contracts";
import { type OrderLine, QUANTITY_SCALE, reversedQuantityOf, subtractQuantity } from "@fnb/domain";
import type { TillMenu } from "../menu/till-menu";
import type { CartLine, CounterOrder } from "../order/counter-order";
import { entryNeeded } from "../order/plain-cart-line";

/** A sent item whose options can be changed: what it is now, with the units still on the order. */
export interface OptionsChange {
  readonly product: PosProduct;
  readonly line: CartLine;
}

/**
 * Whether a sent line can have its options changed in one go, and the line to start from.
 * Only a plain item: a combo, a weighing and an item with a typed price each ask for more
 * than the options picker holds (slots, a weight, a price a manager may have to approve), so
 * they keep the two steps (cancel, then order again). Units already cancelled are not
 * brought back: the new line has the count still on the order.
 */
export function optionsChangeOf(
  menu: TillMenu,
  order: CounterOrder,
  priced: readonly OrderLine[],
  sentLineIds: ReadonlySet<string>,
  lineId: string,
): OptionsChange | null {
  if (!sentLineIds.has(lineId)) return null;
  const line = order.lines.find((candidate) => candidate.lineId === lineId);
  const product = line === undefined ? undefined : menu.productsById.get(line.productId);
  const item = priced.find((candidate) => candidate.id === lineId);
  if (line === undefined || product === undefined || item === undefined) return null;
  if (product.kind === "combo" || line.comboPicks !== undefined) return null;
  if (entryNeeded(product) !== null || line.grams !== undefined) return null;
  if (line.enteredPrice !== undefined) return null;
  const left = subtractQuantity(item.quantity, reversedQuantityOf(priced, lineId));
  if (left < QUANTITY_SCALE) return null;
  return { product, line: { ...line, quantity: Number(left / QUANTITY_SCALE) } };
}
