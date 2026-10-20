import {
  type OrderLine,
  basisPoints,
  buildLineDiscount,
  buildOrderDiscountLines,
  quantity,
  vnd,
  voidLine,
} from "@fnb/domain";
import { newId } from "../../../src/features/ids/new-id";
import { orderHistory } from "../../../src/features/history/order-history";
import { commandMadeLines, itemTree } from "../../../src/features/order/command-made-lines";
import { tillOrderSnapshot } from "../../../src/features/order/order-snapshot-for-till";
import { priceCounterOrder } from "../../../src/features/order/price-counter-order";
import type { RefundableLine } from "../../../src/features/refund/refund-plan";
import { hostileTillMenu } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { HOSTILE_ORDER } from "../../../src/test-support/hostile-order";
import { tid } from "../../../src/test-support/till-fixtures";

// The worst an order can carry once it is worked on: discounts, a cancel, refunds of 40
// items, nine-digit amounts. See operations-screens.tsx.

export const operationsMenu = hostileTillMenu();
export const profile = { pricesIncludeTax: false, serviceCharge: null };
const now = Date.now();
const priced = priceCounterOrder(operationsMenu, HOSTILE_ORDER, profile, now);
const [first, second] = HOSTILE_ORDER.lines;
export const NINE_DIGITS = vnd(987_654_321);

/** A fifth off the 999 cups, a cancel of the coffee the bar had, a fixed amount off it all. */
function commandLines(): OrderLine[] {
  const order = { lines: priced.lines };
  const lineOff = buildLineDiscount(
    order,
    first!.lineId,
    { kind: "percent", rate: basisPoints(2000) },
    newId,
  );
  const draft = {
    id: HOSTILE_ORDER.orderId,
    status: "draft" as const,
    serviceType: "dine_in" as const,
    channelKey: null,
    businessDate: "2026-10-20",
    lines: [...priced.lines, ...lineOff],
    refundOfOrderId: null,
    refundAmounts: null,
    version: 3,
  };
  const voided = voidLine(draft, {
    lineId: second!.lineId,
    quantity: quantity(1),
    reasonCode: "made_wrong",
    staffId: "lan",
    approvedByStaffId: "minh",
    sentQuantity: quantity(1),
    newLineId: newId,
    requireApprovalAfterSent: true,
  }).order.lines;
  const orderOff = buildOrderDiscountLines(
    { lines: voided },
    { kind: "fixed", amount: vnd(1_000) },
    newId,
  );
  return commandMadeLines([...voided, ...orderOff]);
}

export const ADJUSTED = {
  commandLines: commandLines(),
  kept: new Map([[first!.lineId, itemTree(priced.lines, first!.lineId)]]),
};

/** Forty orders of the day, every status, the hostile order's nine-digit amounts. */
export function hostileHistory() {
  const statuses = ["draft", "paid", "cancelled", "paid"] as const;
  const views = Array.from({ length: 40 }, (_, i) => {
    const order = {
      ...HOSTILE_ORDER,
      orderId: tid(0x7000 + i),
      deviceOrderNo: 999_999_900 + i,
      tableTag: i % 2 === 0 ? HOSTILE_NAMES.branch : null,
    };
    const status = statuses[i % statuses.length]!;
    const snapshot = tillOrderSnapshot(
      {
        deviceId: i % 3 === 0 ? tid(0xd999) : tid(0xd001),
        branchId: tid(1),
        utcOffsetMinutes: 420,
        businessDayStartMinute: 240,
      },
      order,
      priced,
      {
        status,
        version: 2,
        businessDate: "2026-10-20",
        chargeProfile: profile,
        payments: status === "paid" ? [{ method: "cash", amount: priced.totals.amountDue }] : [],
        sent: [],
      },
    );
    return {
      entity: "order",
      entityId: order.orderId,
      snapshot,
      source: "server" as const,
      serverVersion: 2,
    };
  });
  return orderHistory(views, "2026-10-20", tid(0xd001));
}

/** Forty sold items to give back, each of nine hundred thousand units. */
export const HOSTILE_REFUND_LINES: RefundableLine[] = Array.from({ length: 40 }, (_, i) => ({
  item: {
    ...priced.lines[0]!,
    id: tid(0x7100 + i),
    nameSnapshot: i % 2 === 0 ? HOSTILE_NAMES.staff : HOSTILE_NAMES.emoji,
  },
  sold: 999_999,
  refundable: 999_999 - i,
}));
