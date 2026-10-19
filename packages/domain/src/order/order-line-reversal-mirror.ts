import { DomainError } from "../errors";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import type { OrderLine } from "./order-types";

/** What a negative item must share with the item it takes back: what was sold, at what price. */
const HEAD_FIELDS = [
  "productId",
  "variantId",
  "modifierOptionId",
  "unitPrice",
  "taxRate",
  "priceSource",
] as const;

type ChildrenIndex = ReadonlyMap<string, readonly OrderLine[]>;

/**
 * A negative item must be an exact negative copy of the item it reverses: same product, variant,
 * unit price, tax rate and price source, and under it a copy of the item's toppings, combo picks
 * and line discounts (same type, product, variant, option, unit price, tax rate and quantity per
 * unit of the parent, nested the same way). Without this, a till could cancel one 10.000 đ tea
 * with a line priced at 100.000 đ, or hang a 500.000 đ topping under the cancel line, and every
 * total computed from the order would follow the forged line.
 *
 * The comparison is against the item as it is now, so once some of its units are taken back the
 * item's subtree is fixed. The order keeps no history, so "a copy of the toppings as they were
 * when it was cancelled" is only provable if they have not changed since; and the cancelled units
 * were made with those toppings, so changing them in place would rewrite what the kitchen ticket
 * showed, which is why a sent line is never shrunk either. Serving the rest differently means
 * voiding it and ringing it up again. Children are compared as a multiset, since their position
 * in `lines` carries no meaning. The name and the note are not compared: they are display text,
 * never priced, and the product, variant and option already say what was sold.
 */
export function assertReversalsMirrorTargets(
  lines: readonly OrderLine[],
  byId: ReadonlyMap<string, OrderLine>,
): void {
  const children = indexChildren(lines);
  const shapes = new Map<string, string>();
  for (const line of lines) {
    if (line.reversesLineId === null) continue;
    const target = byId.get(line.reversesLineId);
    if (!target) continue; // assertLineQuantity already refused a reversal of a missing line
    const field = HEAD_FIELDS.find((name) => line[name] !== target[name]);
    if (field !== undefined) throw mismatch(line, field);
    if (childrenShape(children, shapes, line.id) !== childrenShape(children, shapes, target.id)) {
      throw mismatch(line, "children");
    }
  }
}

function mismatch(line: OrderLine, field: string): DomainError {
  return new DomainError(
    ORDER_ERROR_CODES.reversalMismatch,
    `line ${line.id} does not copy ${field} of the line it reverses, ${line.reversesLineId}`,
    { lineId: line.id, reversesLineId: line.reversesLineId, field },
  );
}

function indexChildren(lines: readonly OrderLine[]): ChildrenIndex {
  const index = new Map<string, OrderLine[]>();
  for (const line of lines) {
    if (line.parentLineId === null) continue;
    index.set(line.parentLineId, [...(index.get(line.parentLineId) ?? []), line]);
  }
  return index;
}

/** A canonical text of the subtree under `lineId`, ids left out; the tree has no cycles. */
function childrenShape(
  children: ChildrenIndex,
  shapes: Map<string, string>,
  lineId: string,
): string {
  const known = shapes.get(lineId);
  if (known !== undefined) return known;
  const shape: string = JSON.stringify(
    (children.get(lineId) ?? [])
      .map((child): string =>
        JSON.stringify([
          child.lineType,
          child.productId,
          child.variantId,
          child.modifierOptionId,
          String(child.unitPrice),
          child.taxRate,
          child.priceSource,
          String(child.quantity),
          childrenShape(children, shapes, child.id),
        ]),
      )
      .sort(),
  );
  shapes.set(lineId, shape);
  return shape;
}
