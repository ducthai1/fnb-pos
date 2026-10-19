import { describe, expect, it } from "vitest";
import { basisPoints, quantity, vnd } from "../money";
import { buildRefundLines } from "./build-refund-order";
import { earlierRefund, paidMilkTea, teas } from "./build-refund-order-test-fixtures";
import { codeOf, item, linesTotal, sequentialIds } from "./order-line-test-fixtures";
import { effectiveQuantity, validateLineTree } from "./order-line-tree";
import type { Order } from "./order-types";

const ids = () => ({ orderId: "refund-1", newLineId: sequentialIds() });
const refund = (paid: Order, request = [teas(1)], existing: readonly Order[] = []) =>
  buildRefundLines(paid, request, existing, ids(), "2026-10-21");

describe("buildRefundLines", () => {
  it("refunds one of two paid teas with its pearls, as a draft on today's business day", () => {
    const { order: built, restockByLineId } = refund(paidMilkTea());
    expect(built).toMatchObject({
      id: "refund-1",
      status: "draft",
      refundOfOrderId: "order-1",
      serviceType: "takeaway",
      channelKey: "grab",
      businessDate: "2026-10-21",
      version: 1,
    });
    expect(built.lines.map((l) => [l.id, l.parentLineId, l.reversesLineId])).toEqual([
      ["new-1", null, "tea"],
      ["new-2", "new-1", null],
    ]);
    expect(effectiveQuantity(built.lines, "new-2")).toBe(quantity(-2));
    expect(linesTotal(built.lines)).toBe(vnd(-20_000));
    expect(restockByLineId).toEqual({ "new-1": true });
    const asRefund = { refundOfOrderId: built.refundOfOrderId };
    expect(codeOf(() => validateLineTree(built.lines, asRefund))).toBeUndefined();
  });

  it("gives back the price and tax rate the line was sold at, not today's menu", () => {
    const promo = { ...item("promo-tea"), unitPrice: vnd(7_500), taxRate: basisPoints(1_000) };
    const request = [{ lineId: "promo-tea", quantity: quantity(1), restock: false }];
    const paid = paidMilkTea([{ ...promo, priceSource: "promotion" }]);
    const [line] = refund(paid, request).order.lines;
    expect(line).toMatchObject({
      unitPrice: vnd(7_500),
      taxRate: basisPoints(1_000),
      priceSource: "promotion",
      nameSnapshot: "line promo-tea",
    });
  });

  it("refunds the same tea twice in one request, one restocked and one written off", () => {
    const { order: built, restockByLineId } = refund(paidMilkTea(), [teas(1), teas(1, false)]);
    expect(restockByLineId).toEqual({ "new-1": true, "new-3": false });
    expect(linesTotal(built.lines)).toBe(vnd(-40_000));
  });

  it("refunds a posted order, whose shift is already closed", () => {
    const posted = { ...paidMilkTea(), status: "posted" as const };
    expect(codeOf(() => refund(posted))).toBeUndefined();
  });

  it("refunds what an earlier draft refund left", () => {
    expect(codeOf(() => refund(paidMilkTea(), [teas(1)], [earlierRefund(1)]))).toBeUndefined();
  });

  it("counts a cancelled refund draft as nothing given back", () => {
    const cancelled = earlierRefund(2, "cancelled");
    expect(codeOf(() => refund(paidMilkTea(), [teas(2)], [cancelled]))).toBeUndefined();
  });

  it("leaves the paid order as it was", () => {
    const paid = paidMilkTea();
    refund(paid, [teas(2)]);
    expect(paid.status).toBe("paid");
    expect(effectiveQuantity(paid.lines, "tea")).toBe(quantity(2));
  });
});
