import { DomainError } from "../errors";
import { negateQuantity } from "../money";
import {
  ORDER_ERROR_CODES,
  type Order,
  type OrderLine,
  type RefundRequestLine,
  validateLineTree,
} from "../order";
import { buildRefund } from "./build-refund";
import type { OrderChargeProfile } from "./order-totals-types";
import { TOTALS_ERROR_CODES } from "./totals-error-codes";

/**
 * Checks a refund that arrives as a finished document (a till refunded while offline and syncs
 * it) against the sale it refunds. The server cannot trust its lines or its amounts: a forged
 * refund could give back 50 units of a line that was never sold, at any price. So the refund is
 * built again with buildRefund from what it asks for (each negative item: which sold line and
 * how many units) and must equal that rebuild exactly, every line and every amount.
 *
 * Rebuilding is chosen over checking fields one by one because it is complete: every field
 * buildRefund decides is compared, including any it decides in the future, so no forgery slips
 * through a rule nobody wrote. It does mean the document must be what buildRefund makes, line
 * order included, which a till using this domain always produces.
 *
 * `existingRefunds` are the sale's refunds as the server holds them; this refund may be among
 * them and is skipped. A refund's amounts depend on the refunds that counted when it was built,
 * so one built against another view (a draft cancelled since) is refused and must be built again;
 * applying the request on the server with buildRefund avoids that. `profile` is the sale's, as
 * for buildRefund. Throws the code of the first difference.
 */
export function validateRefundAgainstSale(
  refund: Order,
  sale: Order,
  existingRefunds: readonly Order[],
  profile: OrderChargeProfile,
): void {
  if (refund.refundOfOrderId !== sale.id) {
    throw new DomainError(
      ORDER_ERROR_CODES.refundOfAnotherOrder,
      `order ${refund.id} is not a refund of ${sale.id}`,
      { orderId: sale.id, refundId: refund.id, refundOfOrderId: refund.refundOfOrderId },
    );
  }
  validateLineTree(refund.lines, { refundOfOrderId: refund.refundOfOrderId });
  const others = existingRefunds.filter((other) => other.id !== refund.id);
  const ids = { orderId: refund.id, newLineId: replayIds(refund.lines) };
  const request = requestOf(refund, sale);
  const rebuilt = buildRefund(sale, request, others, ids, refund.businessDate, profile).order;
  assertSameLines(refund, rebuilt);
  assertSameAmounts(refund, rebuilt);
}

/** What the refund asks for: each negative item names a sold line and the units it takes back. */
function requestOf(refund: Order, sale: Order): RefundRequestLine[] {
  const soldIds = new Set(sale.lines.map((line) => line.id));
  return refund.lines.flatMap((line) => {
    if (line.reversesLineId === null) return [];
    if (!soldIds.has(line.reversesLineId)) {
      throw new DomainError(
        ORDER_ERROR_CODES.reversedLineNotFound,
        `refund line ${line.id} reverses ${line.reversesLineId}, which is not on the sale`,
        { lineId: line.id, reversesLineId: line.reversesLineId, orderId: sale.id },
      );
    }
    // restock is a stock instruction kept off the lines; it changes no line and no amount
    return [
      { lineId: line.reversesLineId, quantity: negateQuantity(line.quantity), restock: false },
    ];
  });
}

/**
 * Hands buildRefund the refund's own line ids in order, so a faithful document rebuilds with the
 * same ids. A rebuild that needs more ids than the document has lines gets ones no line can
 * carry, and then differs from the document in length.
 */
function replayIds(lines: readonly OrderLine[]): () => string {
  let next = 0;
  return () => lines[next++]?.id ?? `\u0000missing-${next}`;
}

function assertSameLines(refund: Order, rebuilt: Order): void {
  for (const field of ["serviceType", "channelKey"] as const) {
    if (refund[field] !== rebuilt[field]) throw linesMismatch(refund.id, field);
  }
  const length = Math.max(refund.lines.length, rebuilt.lines.length);
  for (let i = 0; i < length; i++) {
    const field = differingField(refund.lines[i], rebuilt.lines[i]);
    if (field !== undefined) throw linesMismatch(refund.lines[i]?.id ?? refund.id, field);
  }
}

function assertSameAmounts(refund: Order, rebuilt: Order): void {
  const given = refund.refundAmounts;
  const expected = rebuilt.refundAmounts;
  if (given === null || expected === null) throw amountsMismatch(refund.id, "refundAmounts");
  for (const field of ["pricesIncludeTax", "serviceChargeTaxRate"] as const) {
    if (given[field] !== expected[field]) throw amountsMismatch(refund.id, field);
  }
  const length = Math.max(given.lines.length, expected.lines.length);
  for (let i = 0; i < length; i++) {
    const field = differingField(given.lines[i], expected.lines[i]);
    if (field !== undefined) throw amountsMismatch(given.lines[i]?.lineId ?? refund.id, field);
  }
}

/** The first field two flat records disagree on, "missing" when only one exists. */
function differingField(a: object | undefined, b: object | undefined): string | undefined {
  if (a === undefined || b === undefined) return a === b ? undefined : "missing";
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].find((key) => left[key] !== right[key]);
}

function linesMismatch(lineId: string, field: string): DomainError {
  return new DomainError(
    ORDER_ERROR_CODES.reversalMismatch,
    `refund line ${lineId} differs from what the sale gives back: ${field}`,
    { lineId, field },
  );
}

function amountsMismatch(lineId: string, field: string): DomainError {
  return new DomainError(
    TOTALS_ERROR_CODES.refundAmountsMismatch,
    `refund amounts of ${lineId} differ from the share of the sale: ${field}`,
    { lineId, field },
  );
}
