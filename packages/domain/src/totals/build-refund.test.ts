import { describe, expect, it } from "vitest";
import { percentRate, quantity, vnd } from "../money";
import type { Order, RefundRequestLine } from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { buildOrderDiscountLines } from "./build-order-discount-lines";
import { buildRefund } from "./build-refund";
import { computeOrderTotals } from "./compute-order-totals";
import { TAX_EXCLUSIVE, VAT_10, VAT_8, itemLine, withServiceCharge } from "./totals-test-helpers";
import { negated, paid, units } from "./totals-refund-test-helpers";
import { orderLevel } from "./totals-void-test-helpers";

// Three teas at 25.000 (8%) and a burger at 60.000 (10%), 10% off the order, 5% service charge
// after discount taxed at 10%, VAT on top. Worked by hand:
//   discount 13.500 = 7.500 off the teas + 6.000 off the burger; net 67.500 + 54.000 = 121.500
//   service charge 6.075, shared 3.375 teas / 2.700 burger
//   VAT 8%: 5.400 on the teas; 10%: 6.008 on 60.075 = 5.400 burger + 608 service charge
//   (service charge tax shared 338 teas / 270 burger); due 121.500 + 6.075 + 11.408 = 138.983
const profile = withServiceCharge(TAX_EXCLUSIVE);
const goods = [itemLine("tea", 25_000, VAT_8, quantity(3)), itemLine("burger", 60_000, VAT_10)];
const offIds = sequentialIds("off");
const sale: Order = paid(
  order([
    ...goods,
    ...buildOrderDiscountLines(order(goods), { kind: "percent", rate: percentRate(10) }, offIds),
  ]),
);
const totalsOf = (refund: Order) => computeOrderTotals(refund, profile);
const refundOf = (request: RefundRequestLine[], existing: readonly Order[] = [], id = "r1") =>
  buildRefund(
    sale,
    request,
    existing,
    { orderId: id, newLineId: sequentialIds(id) },
    "2026-10-21",
    profile,
  ).order;

describe("buildRefund gives back what the customer paid", () => {
  it("has the sale worked out as above", () => {
    const t = totalsOf(sale);
    expect([t.discountTotal, t.netTotal, t.serviceCharge, t.taxTotal, t.amountDue]).toEqual(
      [13_500n, 121_500n, 6_075n, 11_408n, 138_983n].map(vnd),
    );
  });

  it("refunds one of three discounted teas at its discounted price and its share of charges", () => {
    const refund = refundOf([units("tea", 1)]);
    const t = totalsOf(refund);
    // a third of the teas' 67.500 net, 5.400 VAT, 3.375 service charge and 338 of its tax
    expect([
      t.grossTotal,
      t.discountTotal,
      t.netTotal,
      t.serviceCharge,
      t.serviceChargeTax,
    ]).toEqual([-25_000n, -2_500n, -22_500n, -1_125n, -112n].map(vnd));
    expect(t.taxBreakdown).toEqual([
      { rate: VAT_8, base: vnd(-22_500), tax: vnd(-1_800) },
      { rate: VAT_10, base: vnd(-1_125), tax: vnd(-112) },
    ]);
    expect(t.amountDue).toBe(vnd(-25_537));
    // the lines at their full price would give back the 2.500 discount and charges on it too
    const atFullPrice = totalsOf({ ...refund, refundAmounts: null });
    expect(atFullPrice.amountDue).toBe(vnd(-28_375));
  });

  it("refunds the teas one at a time, then the burger, and gives back the sale to the đồng", () => {
    const first = refundOf([units("tea", 1)], [], "r1");
    const second = refundOf([units("tea", 1)], [first], "r2");
    const last = refundOf([units("tea", 1), units("burger", 1)], [first, second], "r3");
    const all = [first, second, last].map(totalsOf);
    // the third tea takes the đồng the first two rounded down: 113 and 113 of service charge tax
    expect(all.map((t) => t.amountDue)).toEqual([-25_537n, -25_538n, -87_908n].map(vnd));
    const s = totalsOf(sale);
    const sum = (pick: (t: (typeof all)[number]) => bigint) =>
      all.reduce((n, t) => n + pick(t), 0n);
    expect(sum((t) => t.amountDue)).toBe(-s.amountDue);
    expect(sum((t) => t.discountTotal)).toBe(-s.discountTotal);
    expect(sum((t) => t.taxTotal)).toBe(-s.taxTotal);
    expect(sum((t) => t.serviceCharge)).toBe(-s.serviceCharge);
    expect(sum((t) => t.serviceChargeTax)).toBe(-s.serviceChargeTax);
  });

  it("refunds the whole order at once as the exact negative of the sale", () => {
    const refund = refundOf([units("tea", 3), units("burger", 1)]);
    expect(orderLevel(totalsOf(refund))).toEqual(negated(totalsOf(sale)));
  });

  it("counts what an earlier draft took, and not what a cancelled one would have", () => {
    const draft = refundOf([units("tea", 1)], [], "r1");
    const rest = refundOf([units("tea", 2)], [draft], "r2");
    expect(totalsOf(rest).amountDue).toBe(vnd(-25_538 - 25_538));
    const cancelled = { ...draft, status: "cancelled" as const };
    const allTeas = refundOf([units("tea", 3)], [cancelled], "r2");
    expect(totalsOf(allTeas).amountDue).toBe(vnd(-25_537 - 25_538 - 25_538));
  });

  it("stores the amounts on the refund with the sold line each one gives back", () => {
    const refund = refundOf([units("tea", 1)]);
    expect(refund.refundAmounts).toEqual({
      pricesIncludeTax: false,
      serviceChargeTaxRate: VAT_10,
      lines: [
        {
          lineId: "r1-1",
          soldLineId: "tea",
          gross: vnd(-25_000),
          discountAllocated: vnd(-2_500),
          tax: vnd(-1_800),
          serviceCharge: vnd(-1_125),
          serviceChargeTax: vnd(-112),
        },
      ],
    });
  });
});
