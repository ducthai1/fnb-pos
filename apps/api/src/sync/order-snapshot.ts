import {
  type OrderLine,
  type Quantity,
  type RefundAmounts,
  quantity,
  quantityToDecimalString,
} from "@fnb/domain";
import { chargeProfileToSnapshot } from "./charge-profile-snapshot";
import type { StoredOrder } from "./stored-order";
import type { OrderLineSnapshot, OrderSnapshot, RefundAmountsSnapshot } from "./sync-wire-types";

/** Money leaves as a JSON number; an amount past 2^53 would be rounded, so it is refused. */
export function moneyToWire(amount: bigint): number {
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new RangeError(`amount out of safe range: ${amount}`);
  return value;
}

const NOTHING_SENT: Quantity = quantity(0);

function lineSnapshotOf(line: OrderLine, stored: StoredOrder): OrderLineSnapshot {
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
    wholeParentLine: line.wholeParentLine === true,
    sentQuantity: quantityToDecimalString(stored.sentQuantityByLineId.get(line.id) ?? NOTHING_SENT),
    restock: stored.restockByLineId.get(line.id) ?? null,
  };
}

function refundAmountsSnapshotOf(amounts: RefundAmounts | null): RefundAmountsSnapshot | null {
  if (amounts === null) return null;
  return {
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
    reasonCode: stored.reasonCode,
    chargeProfile: chargeProfileToSnapshot(stored.chargeProfile),
    // A refund's totals are read from these amounts, so a till needs them to show it.
    refundAmounts: refundAmountsSnapshotOf(order.refundAmounts),
    lines: order.lines.map((line) => lineSnapshotOf(line, stored)),
    payments: stored.payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      amount: moneyToWire(payment.amount),
      receivedByStaffId: payment.receivedByStaffId,
    })),
  };
}
