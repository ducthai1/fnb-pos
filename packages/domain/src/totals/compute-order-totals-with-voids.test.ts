import { describe, expect, it } from "vitest";
import { percentRate, quantity, vnd } from "../money";
import type { OrderLine } from "../order";
import { order, sequentialIds } from "../order/order-line-test-fixtures";
import { buildOrderDiscountLines } from "./build-order-discount-lines";
import { computeOrderTotals } from "./compute-order-totals";
import {
  TAX_EXCLUSIVE,
  TAX_INCLUSIVE,
  VAT_10,
  VAT_8,
  itemLine,
  modifierLine,
  orderOf,
  withServiceCharge,
} from "./totals-test-helpers";
import { orderLevel, voidUnits } from "./totals-void-test-helpers";

// Two milk teas with a pearl portion each (8%), both already made by the bar, and a burger (10%).
const teas = (units: number) => [
  itemLine("tea", 35_000, VAT_8, quantity(units)),
  modifierLine("pearl", "tea", 7_000, VAT_8),
];
const burger = itemLine("burger", 65_000, VAT_10);
const sentTwoTeas = order([...teas(2), burger]);
const oneTeaVoided = voidUnits(sentTwoTeas, "tea", quantity(1), quantity(2));
const linesOf = (o: { lines: readonly OrderLine[] }) => o.lines;

describe("computeOrderTotals on an order with void lines", () => {
  it("voids one of two teas the bar already made and bills exactly an order of one tea", () => {
    expect(linesOf(oneTeaVoided).map((l) => [l.id, l.reversesLineId])).toEqual([
      ["tea", null],
      ["pearl", null],
      ["burger", null],
      ["void-1", "tea"],
      ["void-2", null],
    ]);
    const totals = computeOrderTotals(oneTeaVoided, TAX_EXCLUSIVE);
    const oneTea = computeOrderTotals(orderOf([...teas(1), burger]), TAX_EXCLUSIVE);
    expect(orderLevel(totals)).toEqual(orderLevel(oneTea));
    // 35.000 + 7.000 at 8% → 3.360; 65.000 at 10% → 6.500
    expect(totals.grossTotal).toBe(vnd(107_000));
    expect(totals.taxBreakdown).toEqual([
      { rate: VAT_8, base: vnd(42_000), tax: vnd(3_360) },
      { rate: VAT_10, base: vnd(65_000), tax: vnd(6_500) },
    ]);
    expect(totals.amountDue).toBe(vnd(116_860));
  });

  it("keeps what is still paid for on the sold lines and lists the void lines at zero", () => {
    const totals = computeOrderTotals(oneTeaVoided, TAX_EXCLUSIVE);
    expect(totals.lines.map((l) => [l.lineId, l.gross, l.net, l.tax])).toEqual([
      ["tea", vnd(35_000), vnd(35_000), vnd(2_800)],
      ["pearl", vnd(7_000), vnd(7_000), vnd(560)],
      ["burger", vnd(65_000), vnd(65_000), vnd(6_500)],
      ["void-1", vnd(0), vnd(0), vnd(0)],
      ["void-2", vnd(0), vnd(0), vnd(0)],
    ]);
  });

  it("bills nothing, and lists no rate, once every unit is voided", () => {
    const allVoided = voidUnits(order(teas(2)), "tea", quantity(2), quantity(2));
    const totals = computeOrderTotals(allVoided, withServiceCharge(TAX_EXCLUSIVE));
    expect(orderLevel(totals)).toEqual(orderLevel(computeOrderTotals(orderOf([]), TAX_EXCLUSIVE)));
    expect(totals.lines.every((l) => l.gross === 0n && l.tax === 0n)).toBe(true);
  });

  it("takes an order discount after a void off what is left, and charges service on that", () => {
    const profile = withServiceCharge(TAX_INCLUSIVE);
    const off = buildOrderDiscountLines(
      oneTeaVoided,
      { kind: "percent", rate: percentRate(10) },
      sequentialIds("off"),
    );
    // 10% of the 107.000 still due: 4.200 off the drinks, 6.500 off the burger
    expect(off.map((l) => [l.taxRate, l.unitPrice])).toEqual([
      [VAT_8, vnd(-4_200)],
      [VAT_10, vnd(-6_500)],
    ]);
    const totals = computeOrderTotals(
      { ...oneTeaVoided, lines: [...oneTeaVoided.lines, ...off] },
      profile,
    );
    const oneTea = computeOrderTotals(orderOf([...teas(1), burger, ...off]), profile);
    expect(orderLevel(totals)).toEqual(orderLevel(oneTea));
    expect(totals.netTotal).toBe(vnd(96_300));
    expect(totals.serviceCharge).toBe(vnd(4_815));
    expect(totals.amountDue).toBe(vnd(101_115));
  });

  it("keeps a discount taken before the void as it was, on what is left", () => {
    const off = buildOrderDiscountLines(
      sentTwoTeas,
      { kind: "fixed", amount: vnd(20_000) },
      sequentialIds("off"),
    );
    const discounted = order([...teas(2), burger, ...off]);
    const voided = voidUnits(discounted, "tea", quantity(1), quantity(2));
    const totals = computeOrderTotals(voided, TAX_EXCLUSIVE);
    const oneTea = computeOrderTotals(orderOf([...teas(1), burger, ...off]), TAX_EXCLUSIVE);
    expect(orderLevel(totals)).toEqual(orderLevel(oneTea));
    expect(totals.discountTotal).toBe(vnd(20_000));
    expect(totals.lines.every((l) => l.net >= 0n && l.discountAllocated >= 0n)).toBe(true);
  });
});
