import {
  type OrderLine,
  basisPoints,
  buildLineDiscount,
  buildOrderDiscountLines,
  quantity,
  vnd,
  voidLine,
} from "@fnb/domain";
import { orderHistory } from "../../src/features/history/order-history";
import { newId } from "../../src/features/ids/new-id";
import { commandMadeLines, itemTree } from "../../src/features/order/command-made-lines";
import { tillOrderSnapshot } from "../../src/features/order/order-snapshot-for-till";
import type { RefundableLine } from "../../src/features/refund/refund-plan";
import { tid } from "../../src/test-support/till-fixtures";
import { PROFILE } from "./pretty-menu";
import { ORDER, PRICED } from "./pretty-order";

// The sample order once worked on: a tenth off the milk teas, the salted coffee the bar
// made wrong cancelled, 5.000 đ off the whole order; and the day's orders.

const [first, second] = ORDER.lines;

function commandLines(): OrderLine[] {
  const lineOff = buildLineDiscount(
    { lines: PRICED.lines },
    first!.lineId,
    { kind: "percent", rate: basisPoints(1000) },
    newId,
  );
  const draft = {
    id: ORDER.orderId,
    status: "draft" as const,
    serviceType: "takeaway" as const,
    channelKey: null,
    businessDate: "2026-10-21",
    lines: [...PRICED.lines, ...lineOff],
    refundOfOrderId: null,
    refundAmounts: null,
    version: 3,
  };
  const voided = voidLine(draft, {
    lineId: second!.lineId,
    quantity: quantity(1),
    reasonCode: "made_wrong",
    staffId: "lan",
    approvedByStaffId: "hung",
    sentQuantity: quantity(1),
    newLineId: newId,
    requireApprovalAfterSent: true,
  }).order.lines;
  const orderOff = buildOrderDiscountLines({ lines: voided }, { kind: "fixed", amount: vnd(5_000) }, newId);
  return commandMadeLines([...voided, ...orderOff]);
}

export const ADJUSTED = {
  commandLines: commandLines(),
  kept: new Map([[first!.lineId, itemTree(PRICED.lines, first!.lineId)]]),
};

const DEVICE = tid(0xd001);

/** Twelve orders of the day: at the counter and at tables, paid, open, cancelled. */
export function dayHistory() {
  const statuses = ["paid", "paid", "draft", "paid", "cancelled", "paid"] as const;
  const views = Array.from({ length: 12 }, (_, i) => {
    const status = statuses[i % statuses.length]!;
    const order = {
      ...ORDER,
      orderId: tid(0x9700 + i),
      deviceOrderNo: 27 - i,
      table: i % 3 === 1 ? { id: `table-T0${(i % 6) + 1}`, name: `T0${(i % 6) + 1}` } : null,
    };
    const snapshot = tillOrderSnapshot(
      { deviceId: i % 4 === 3 ? tid(0xd002) : DEVICE, branchId: tid(1), utcOffsetMinutes: 420, businessDayStartMinute: 240 },
      order,
      PRICED,
      {
        status,
        version: 2,
        businessDate: "2026-10-21",
        chargeProfile: PROFILE,
        payments: status === "paid" ? [{ method: "cash", amount: PRICED.totals.amountDue }] : [],
        sent: [],
      },
    );
    return { entity: "order", entityId: order.orderId, snapshot, source: "server" as const, serverVersion: 2 };
  });
  return orderHistory(views, "2026-10-21", DEVICE);
}

/** What the guest of order 27 can give back. */
export const REFUND_LINES: RefundableLine[] = PRICED.lines
  .filter((line) => line.parentLineId === null)
  .map((item) => ({ item, sold: Number(item.quantity), refundable: Number(item.quantity) }));
