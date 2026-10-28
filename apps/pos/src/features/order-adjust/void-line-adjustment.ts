import { voidLinePayloadSchema } from "@fnb/contracts";
import {
  type BasisPoints,
  QUANTITY_SCALE,
  type VoidRecord,
  discountRateOfOrder,
  quantity,
  quantityToDecimalString,
  voidLine,
} from "@fnb/domain";
import { newId } from "../ids/new-id";
import { hasOrderDiscount, itemTree } from "../order/command-made-lines";
import type { AdjustableOrder, Adjusted } from "../order/order-session-types";
import type { TillPlace } from "../order/till-command";
import { adjustedWith, draftOrderOf } from "./adjusted-order";
import { type ChosenReason, reasonOnWire } from "./reason-codes";

export interface VoidRequest {
  readonly lineId: string;
  /** Whole units of the item, as the cart counts them. */
  readonly units: number;
  readonly reason: ChosenReason;
  readonly staffId: string;
}

/** Who agreed to cancelling units the kitchen has, and the approval the server checks. */
export interface Approval {
  readonly approvalId: string;
  readonly approverStaffId: string;
}

function run(settled: AdjustableOrder, request: VoidRequest, approval: Approval | null) {
  const sent = settled.sent.find((line) => line.lineId === request.lineId)?.sentQuantity;
  return voidLine(draftOrderOf(settled), {
    lineId: request.lineId,
    quantity: quantity(request.units),
    reasonCode: request.reason.code,
    staffId: request.staffId,
    approvedByStaffId: approval?.approverStaffId ?? null,
    sentQuantity: sent ?? quantity(0),
    newLineId: newId,
    requireApprovalAfterSent: approval !== null,
  });
}

export interface VoidPlan {
  /** Units off the line (never made) and units the kitchen has (a cancel line, a ticket). */
  readonly record: VoidRecord;
  /**
   * The share of the bill an order discount would take once the goods are gone, when it
   * grows: the server refuses that past what the cashier may give alone.
   */
  readonly raisedOrderDiscountRate: BasisPoints | null;
}

/** What the void would do, by the domain, before anyone is asked; throws its refusal. */
export function planVoid(settled: AdjustableOrder, request: VoidRequest): VoidPlan {
  const { order, record } = run(settled, request, null);
  if (!hasOrderDiscount(settled.commandLines)) return { record, raisedOrderDiscountRate: null };
  const before = discountRateOfOrder({ lines: settled.priced.lines });
  const after = discountRateOfOrder({ lines: order.lines });
  return { record, raisedOrderDiscountRate: after > before ? after : null };
}

/**
 * order.void_line with the units and the reason; the server builds the cancel line itself.
 * Units the kitchen never saw come off the item, which is then held as it is (the void
 * record points at it); the rest become a cancel line, here and on the server.
 */
export function voidAdjustment(
  place: TillPlace,
  settled: AdjustableOrder,
  request: VoidRequest,
  approval: Approval | null,
  at: number,
): Adjusted & { readonly record: VoidRecord } {
  const { order, record } = run(settled, request, approval);
  const item = order.lines.find((line) => line.id === request.lineId);
  const lines = settled.order.lines.flatMap((line) => {
    if (line.lineId !== request.lineId) return [line];
    return item === undefined
      ? []
      : [{ ...line, quantity: Number(item.quantity / QUANTITY_SCALE) }];
  });
  const kept = new Map(settled.kept);
  kept.delete(request.lineId);
  if (item !== undefined) kept.set(request.lineId, itemTree(order.lines, request.lineId));
  const payload = {
    orderId: settled.order.orderId,
    lineId: request.lineId,
    quantity: quantityToDecimalString(quantity(request.units)),
    ...reasonOnWire(request.reason),
    ...(approval === null ? {} : { approvalId: approval.approvalId }),
  };
  const adjusted = adjustedWith(
    place,
    settled,
    { order: { ...settled.order, lines }, kept, lines: order.lines },
    { type: "order.void_line", contract: voidLinePayloadSchema, payload },
    at,
  );
  return { ...adjusted, record };
}
