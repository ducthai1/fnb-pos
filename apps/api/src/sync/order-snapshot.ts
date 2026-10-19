import { type OrderLine, quantityToDecimalString } from "@fnb/domain";
import { chargeProfileToSnapshot } from "./charge-profile-snapshot";
import type { StoredOrder } from "./stored-order";
import type { OrderLineSnapshot, OrderSnapshot } from "./sync-wire-types";

/** Money leaves as a JSON number; an amount past 2^53 would be rounded, so it is refused. */
export function moneyToWire(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount out of safe range: ${amount}`);
  return value;
}

function lineSnapshotOf(line: OrderLine): OrderLineSnapshot {
  return {
    id: line.id,
    parentLineId: line.parentLineId,
    lineType: line.lineType,
    productId: line.productId,
    variantId: line.variantId,
    modifierOptionId: line.modifierOptionId,
    nameSnapshot: line.nameSnapshot,
    unitPrice: moneyToWire(line.unitPrice),
    quantity: quantityToDecimalString(line.quantity),
    taxRate: line.taxRate,
    note: line.note,
    priceSource: line.priceSource,
    reversesLineId: line.reversesLineId,
  };
}

/** The order as a till stores it, sent in command results and in the change feed. */
export function orderSnapshotOf(stored: StoredOrder): OrderSnapshot {
  const { order } = stored;
  return {
    id: order.id,
    branchId: stored.branchId,
    deviceId: stored.deviceId,
    deviceOrderNo: stored.deviceOrderNo,
    status: order.status,
    serviceType: order.serviceType,
    channelKey: order.channelKey,
    businessDate: order.businessDate,
    version: order.version,
    refundOfOrderId: order.refundOfOrderId,
    officialNo: stored.officialNo,
    callNumber: stored.callNumber,
    tableId: stored.tableId,
    chargeProfile: chargeProfileToSnapshot(stored.chargeProfile),
    lines: order.lines.map(lineSnapshotOf),
    payments: stored.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: moneyToWire(payment.amount),
      receivedByStaffId: payment.receivedByStaffId,
    })),
  };
}
