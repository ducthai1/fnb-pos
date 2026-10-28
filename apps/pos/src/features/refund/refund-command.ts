import { refundOrderPayloadSchema } from "@fnb/contracts";
import { type RefundAmounts, quantityToDecimalString } from "@fnb/domain";
import type { LocalCommand } from "@fnb/sync-client";
import { type ChosenReason, reasonOnWire } from "../order-adjust/reason-codes";
import { lineRowsOf } from "../order/order-snapshot-for-till";
import type { StoredOrder } from "../order/stored-order";
import { type TillPlace, businessDateAt, moneyToWire, tillCommand } from "../order/till-command";
import type { TillRefund } from "./refund-plan";

/** How the money goes back: from the drawer of the open shift, or by a transfer the shop makes. */
export const REFUND_METHODS = { cash: "cash", bankTransfer: "bank_transfer" } as const;
export type RefundMethod = (typeof REFUND_METHODS)[keyof typeof REFUND_METHODS];

const amountsOnWire = (amounts: RefundAmounts | null) =>
  amounts === null
    ? null
    : {
        pricesIncludeTax: amounts.pricesIncludeTax,
        serviceChargeTaxRate: amounts.serviceChargeTaxRate,
        lines: amounts.lines.map((line) => ({
          lineId: line.lineId,
          soldLineId: line.soldLineId,
          gross: moneyToWire(line.gross),
          discountAllocated: moneyToWire(line.discountAllocated),
          tax: moneyToWire(line.tax),
          serviceCharge: moneyToWire(line.serviceCharge),
          serviceChargeTax: moneyToWire(line.serviceChargeTax),
        })),
      };

/**
 * order.refund: the sold items and units, the reason, and what left the till (the refund's
 * negative amount due, which the server requires to the đồng). The server builds the refund
 * itself; the till expects the row the domain built here, paid at once.
 */
export function refundCommand(input: {
  place: TillPlace;
  sale: StoredOrder;
  refund: TillRefund;
  deviceOrderNo: number;
  reason: ChosenReason;
  method: RefundMethod;
  approvalId: string | null;
  shiftId: string;
  at: number;
}): LocalCommand {
  const { place, sale, refund } = input;
  const order = refund.built.order;
  const payout = { method: input.method, amount: moneyToWire(refund.amountDue) };
  const payload = {
    refundOrderId: order.id,
    saleOrderId: sale.orderId,
    deviceOrderNo: input.deviceOrderNo,
    lines: refund.request.map((line) => ({
      lineId: line.lineId,
      quantity: quantityToDecimalString(line.quantity),
      restock: line.restock,
    })),
    ...reasonOnWire(input.reason),
    payouts: [payout],
    shiftId: input.shiftId,
    ...(input.approvalId === null ? {} : { approvalId: input.approvalId }),
  };
  return tillCommand(place, "order.refund", refundOrderPayloadSchema, payload, input.at, {
    entity: "order",
    entityId: order.id,
    optimistic: {
      id: order.id,
      branchId: place.branchId,
      deviceId: place.deviceId,
      deviceOrderNo: input.deviceOrderNo,
      status: "paid",
      serviceType: sale.serviceType,
      channelKey: null,
      businessDate: businessDateAt(place, input.at),
      version: 1,
      refundOfOrderId: sale.orderId,
      officialNo: null,
      callNumber: null,
      tableId: null,
      tableName: null,
      tableTag: null,
      preBillPrinted: false,
      reasonCode: input.reason.code,
      chargeProfile: sale.chargeProfile,
      refundAmounts: amountsOnWire(order.refundAmounts),
      lines: lineRowsOf(order.lines, []),
      payments: [{ ...payout, paymentIntentId: null }],
    },
  });
}
