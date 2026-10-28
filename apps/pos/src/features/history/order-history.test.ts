import { vnd } from "@fnb/domain";
import type { EntityView } from "@fnb/sync-client";
import { describe, expect, it } from "vitest";
import { PLACE, SALE_MENU, SOLD } from "../../test-support/paid-sale-fixture";
import { tid } from "../../test-support/till-fixtures";
import { tillOrderSnapshot } from "../order/order-snapshot-for-till";
import { priceCounterOrder } from "../order/price-counter-order";
import { readStoredOrder } from "../order/stored-order";
import { refundCommand } from "../refund/refund-command";
import { planRefund } from "../refund/refund-plan";
import { filterHistory, orderHistory } from "./order-history";

const AT = Date.UTC(2026, 9, 20, 3, 0);
const PROFILE = { pricesIncludeTax: true, serviceCharge: null };
const TODAY = "2026-10-20";

function row(no: number, status: "draft" | "paid" | "cancelled", day = TODAY) {
  const order = { ...SOLD, orderId: tid(0x8000 + no), deviceOrderNo: no };
  const priced = priceCounterOrder(SALE_MENU, order, PROFILE, AT);
  const payments = status === "paid" ? [{ method: "cash", amount: priced.totals.amountDue }] : [];
  return tillOrderSnapshot(PLACE, order, priced, {
    status,
    version: 2,
    businessDate: day,
    chargeProfile: PROFILE,
    payments,
    sent: [],
  });
}

const view = (snapshot: Record<string, unknown>): EntityView => ({
  entity: "order",
  entityId: String(snapshot.id),
  snapshot: snapshot as EntityView["snapshot"],
  source: "server",
  serverVersion: 2,
});

/** A refund of one coffee of sale `sale`, as the till records it. */
function refundOf(sale: Record<string, unknown>, no: number) {
  const stored = readStoredOrder(sale as EntityView["snapshot"])!;
  const coffee = SOLD.lines[1]!.lineId;
  const refund = planRefund({
    sale: stored,
    refunds: [],
    selection: new Map([[coffee, 1]]),
    refundOrderId: tid(0x8800 + no),
    businessDate: TODAY,
  });
  const command = refundCommand({
    place: PLACE,
    sale: stored,
    refund,
    deviceOrderNo: no,
    reason: { code: "customer_returned", note: null },
    method: "cash",
    approvalId: null,
    shiftId: tid(0x9999),
    at: AT,
  });
  return { snapshot: command.target.optimistic, payout: refund.payout };
}

describe("the day's orders the till holds", () => {
  const sale = row(3, "paid");
  const refund = refundOf(sale, 5);
  const views = [row(1, "draft"), row(2, "cancelled"), sale, row(4, "paid", "2026-10-19")].map(
    view,
  );
  const history = orderHistory([...views, view(refund.snapshot)], TODAY, PLACE.deviceId);

  it("lists the day's sales newest first, a refund under the sale it gives back", () => {
    expect(history.map((entry) => [entry.order.deviceOrderNo, entry.status])).toEqual([
      [3, "refunded"],
      [2, "cancelled"],
      [1, "draft"],
    ]);
    expect(refund.payout).toBe(vnd(29_000));
    expect(history[0]?.refunded).toBe(vnd(29_000));
    expect(history[0]?.refunds.map((one) => one.deviceOrderNo)).toEqual([5]);
  });

  it("counts a cancelled refund as giving nothing back", () => {
    const cancelled = { ...refund.snapshot, status: "cancelled" };
    const [first] = orderHistory([...views, view(cancelled)], TODAY, PLACE.deviceId);
    expect(first).toMatchObject({ status: "paid", refunded: 0n, refunds: [] });
  });

  it("shows one status at a time, and finds an order by its number", () => {
    expect(filterHistory(history, "draft", "").map((entry) => entry.order.deviceOrderNo)).toEqual([
      1,
    ]);
    expect(filterHistory(history, "all", " 3 ").map((entry) => entry.order.deviceOrderNo)).toEqual([
      3,
    ]);
    expect(filterHistory(history, "paid", "3")).toEqual([]);
    expect(filterHistory(history, "all", "")).toHaveLength(3);
  });

  it("marks orders another till opened", () => {
    const other = { ...row(7, "paid"), deviceId: tid(0xd999) };
    const [first] = orderHistory([view(other)], TODAY, PLACE.deviceId);
    expect(first?.ownTill).toBe(false);
  });
});
