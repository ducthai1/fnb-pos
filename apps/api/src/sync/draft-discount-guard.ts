import { type OrderLine, authorize, discountRateOfOrder } from "@fnb/domain";
import { grantsOfStaff } from "./staff-permission-check";
import type { SyncCommandContext } from "./sync-command-context";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/**
 * An order discount is a fixed amount once given, so taking goods off the draft makes it
 * a larger share of the bill: 10% of four teas becomes 40% of one. A save that raises the
 * share past what the staff member may give alone is refused; adding goods, or a share
 * still within their cap, goes through. Line discounts need no such check, since the item
 * under one cannot be changed by a save at all.
 */
export async function refuseRaisedOrderDiscount(
  context: SyncCommandContext,
  before: readonly OrderLine[],
  after: readonly OrderLine[],
) {
  const hasOrderDiscount = before.some(
    (line) => line.lineType === "discount" && line.parentLineId === null,
  );
  if (!hasOrderDiscount) return;
  const discountRate = discountRateOfOrder({ lines: after });
  if (discountRate <= discountRateOfOrder({ lines: before })) return;
  const grants = await grantsOfStaff(context.client, context.staffId);
  if (authorize({ key: "order_discount", discountRate }, grants) !== "allowed") {
    throw new CommandRejection(SYNC_ERROR_CODES.discountRateRaised);
  }
}
