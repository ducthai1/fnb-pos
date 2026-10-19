import { DomainError } from "../errors";
import { type Quantity, QUANTITY_SCALE, divideRounded, quantityFromThousandths } from "../money";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import {
  type LineTreeOptions,
  assertLineQuantity,
  assertNotOverReversed,
  isRefund,
} from "./order-line-reversal-rules";
import { assertReversalsMirrorTargets } from "./order-line-reversal-mirror";
import type { OrderLine, OrderLineType } from "./order-types";

type LineIndex = ReadonlyMap<string, OrderLine>;

/**
 * Which parent each line type may hang under; `null` means "may be a root line".
 * A discount at the root reduces the whole order, a discount under an item reduces that line.
 * Children only ever point at an item or a combo component, so a valid tree is at most
 * item → combo_component → modifier deep.
 */
const ALLOWED_PARENTS: Readonly<Record<OrderLineType, readonly (OrderLineType | null)[]>> = {
  item: [null],
  modifier: ["item", "combo_component"],
  combo_component: ["item"],
  discount: [null, "item"],
};

const WRONG_PARENT_CODE: Readonly<Record<OrderLineType, string>> = {
  item: ORDER_ERROR_CODES.itemNotRoot,
  modifier: ORDER_ERROR_CODES.invalidModifierParent,
  combo_component: ORDER_ERROR_CODES.invalidComboComponentParent,
  discount: ORDER_ERROR_CODES.invalidDiscountParent,
};

/**
 * Throws a DomainError for the first rule a line breaks. Structure (unique ids, parents
 * exist, no cycles) is checked before line types, and line types before quantities and
 * reversals, so a corrupt tree reports what is actually wrong instead of a misleading error.
 * On an ordinary order a negative item must copy the item it reverses (see
 * assertReversalsMirrorTargets). Pass `refundOfOrderId` for a refund's lines: they reverse lines
 * of another order, which validateRefundAgainstSale compares them with.
 */
export function validateLineTree(lines: readonly OrderLine[], options: LineTreeOptions = {}): void {
  const byId = indexLines(lines);
  for (const line of lines) pathToRoot(byId, line);
  for (const line of lines) {
    const parent = parentOf(byId, line);
    const parentType = parent === null ? null : parent.lineType;
    if (!ALLOWED_PARENTS[line.lineType].includes(parentType)) {
      throw new DomainError(
        WRONG_PARENT_CODE[line.lineType],
        `${line.lineType} line ${line.id} cannot hang under ${parentType ?? "the order root"}`,
        { lineId: line.id, parentLineId: line.parentLineId },
      );
    }
    assertWholeLineOnlyOnLineDiscount(line, parentType);
    assertLineQuantity(line, byId, options);
  }
  assertNotOverReversed(lines, byId, options);
  if (!isRefund(options)) assertReversalsMirrorTargets(lines, byId);
}

/** Direct children of a line, in the order they appear in `lines`. */
export function childrenOf(lines: readonly OrderLine[], lineId: string): OrderLine[] {
  lineById(indexLines(lines), lineId);
  return lines.filter((line) => line.parentLineId === lineId);
}

/** The line itself and every descendant, in the order they appear in `lines`. */
export function subtreeOf(lines: readonly OrderLine[], lineId: string): OrderLine[] {
  const byId = indexLines(lines);
  lineById(byId, lineId);
  return lines.filter((line) => pathToRoot(byId, line).some((ancestor) => ancestor.id === lineId));
}

/**
 * How many units a line really stands for. A child line's quantity is per ONE unit of its
 * parent, the way Toast and Square apply modifiers per item: two milk teas with two pearl
 * portions each is an item of 2 and a pearl line of 2, and 4 portions are used. So the
 * quantities along the path to the root multiply. They are thousandths, so the product is
 * rescaled once at the end; that is only inexact when two fractional quantities meet
 * (1.5 kg × 0.333), and half-up keeps it symmetric for negative (void and refund) lines.
 * A whole-line discount (wholeParentLine) is the exception: it stands for its own quantity.
 */
export function effectiveQuantity(lines: readonly OrderLine[], lineId: string): Quantity {
  const byId = indexLines(lines);
  return effectiveOf(byId, lineById(byId, lineId));
}

/**
 * effectiveQuantity of every line, keyed by id, indexing the lines once: pricing an order asks
 * for all of them, and re-indexing per line made that quadratic in the number of lines.
 */
export function effectiveQuantities(lines: readonly OrderLine[]): ReadonlyMap<string, Quantity> {
  const byId = indexLines(lines);
  return new Map(lines.map((line) => [line.id, effectiveOf(byId, line)]));
}

function effectiveOf(byId: LineIndex, line: OrderLine): Quantity {
  // a whole-line discount is for its item's line as a whole, not per unit of it
  if (line.wholeParentLine === true) return line.quantity;
  const path = pathToRoot(byId, line);
  const product = path.reduce<bigint>((acc, l) => acc * l.quantity, 1n);
  const scale = QUANTITY_SCALE ** BigInt(path.length - 1);
  return quantityFromThousandths(divideRounded(product, scale, "half-up"));
}

/** Anywhere else "the whole parent line" would mean nothing, or a topping priced once per line. */
function assertWholeLineOnlyOnLineDiscount(line: OrderLine, parentType: OrderLineType | null) {
  if (line.wholeParentLine === undefined || line.wholeParentLine === false) return;
  if (line.lineType === "discount" && parentType === "item") return;
  throw new DomainError(
    ORDER_ERROR_CODES.wholeLineDiscountMisplaced,
    `${line.lineType} line ${line.id} under ${parentType ?? "the order root"} cannot be whole-line`,
    { lineId: line.id, parentLineId: line.parentLineId },
  );
}

function indexLines(lines: readonly OrderLine[]): LineIndex {
  const byId = new Map<string, OrderLine>();
  for (const line of lines) {
    if (byId.has(line.id)) {
      throw new DomainError(
        ORDER_ERROR_CODES.duplicateLineId,
        `duplicate order line id: ${line.id}`,
        { lineId: line.id },
      );
    }
    byId.set(line.id, line);
  }
  return byId;
}

function lineById(byId: LineIndex, lineId: string): OrderLine {
  const line = byId.get(lineId);
  if (!line) {
    throw new DomainError(ORDER_ERROR_CODES.lineNotFound, `no order line ${lineId}`, { lineId });
  }
  return line;
}

function parentOf(byId: LineIndex, line: OrderLine): OrderLine | null {
  if (line.parentLineId === null) return null;
  const parent = byId.get(line.parentLineId);
  if (!parent) {
    throw new DomainError(
      ORDER_ERROR_CODES.parentLineNotFound,
      `order line ${line.id} points at missing parent ${line.parentLineId}`,
      { lineId: line.id, parentLineId: line.parentLineId },
    );
  }
  return parent;
}

/** The line followed by its ancestors up to the root; refuses to loop on a cycle. */
function pathToRoot(byId: LineIndex, line: OrderLine): OrderLine[] {
  const path = [line];
  const seen = new Set([line.id]);
  for (let parent = parentOf(byId, line); parent !== null; parent = parentOf(byId, parent)) {
    if (seen.has(parent.id)) {
      throw new DomainError(
        ORDER_ERROR_CODES.lineCycle,
        `the parent chain of order line ${line.id} loops back on itself`,
        { lineId: line.id },
      );
    }
    seen.add(parent.id);
    path.push(parent);
  }
  return path;
}
