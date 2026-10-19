import { DomainError } from "../errors";
import { type Quantity, QUANTITY_SCALE, divideRounded, quantityFromThousandths } from "../money";
import { ORDER_ERROR_CODES } from "./order-error-codes";
import {
  type LineTreeOptions,
  assertLineQuantity,
  assertNotOverReversed,
} from "./order-line-reversal-rules";
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
 * Pass `refundOfOrderId` for a refund's lines: they reverse lines of another order.
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
    assertLineQuantity(line, byId, options);
  }
  assertNotOverReversed(lines, byId, options);
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
 */
export function effectiveQuantity(lines: readonly OrderLine[], lineId: string): Quantity {
  const byId = indexLines(lines);
  const path = pathToRoot(byId, lineById(byId, lineId));
  const product = path.reduce<bigint>((acc, line) => acc * line.quantity, 1n);
  const scale = QUANTITY_SCALE ** BigInt(path.length - 1);
  return quantityFromThousandths(divideRounded(product, scale, "half-up"));
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
