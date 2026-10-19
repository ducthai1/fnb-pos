import { describe, expect, it } from "vitest";
import { quantity, vnd } from "../money";
import { computeOrderTotals } from "./compute-order-totals";
import {
  TAX_EXCLUSIVE,
  TAX_INCLUSIVE,
  VAT_10,
  VAT_8,
  componentLine,
  discountLine,
  itemLine,
  modifierLine,
  orderOf,
  withServiceCharge,
} from "./totals-test-helpers";

const lineTax = (totals: ReturnType<typeof computeOrderTotals>) =>
  Object.fromEntries(totals.lines.map((l) => [l.lineId, l.tax]));

// Two milk teas with a pearl portion each (drinks, 8%) and a burger (food, 10%).
const teaAndBurger = [
  itemLine("tea", 45_000, VAT_8, quantity(2)),
  modifierLine("pearl", "tea", 7_000, VAT_8),
  itemLine("burger", 65_000, VAT_10),
];

describe("computeOrderTotals", () => {
  it("returns zero everywhere for an empty order", () => {
    expect(computeOrderTotals(orderOf([]), withServiceCharge(TAX_EXCLUSIVE))).toEqual({
      lines: [],
      grossTotal: vnd(0),
      discountTotal: vnd(0),
      netTotal: vnd(0),
      serviceCharge: vnd(0),
      serviceChargeTax: vnd(0),
      taxBreakdown: [],
      taxTotal: vnd(0),
      amountDue: vnd(0),
    });
  });

  it("adds VAT per rate on top of the prices: 8% on drinks, 10% on food", () => {
    const totals = computeOrderTotals(orderOf(teaAndBurger), TAX_EXCLUSIVE);
    // tea 2 × 45.000 = 90.000; pearl per tea → 2 × 7.000 = 14.000; burger 65.000
    expect(totals.lines.map((l) => [l.lineId, l.gross, l.net])).toEqual([
      ["tea", vnd(90_000), vnd(90_000)],
      ["pearl", vnd(14_000), vnd(14_000)],
      ["burger", vnd(65_000), vnd(65_000)],
    ]);
    expect(totals.taxBreakdown).toEqual([
      { rate: VAT_8, base: vnd(104_000), tax: vnd(8_320) },
      { rate: VAT_10, base: vnd(65_000), tax: vnd(6_500) },
    ]);
    expect(lineTax(totals)).toEqual({ tea: vnd(7_200), pearl: vnd(1_120), burger: vnd(6_500) });
    expect(totals.grossTotal).toBe(vnd(169_000));
    expect(totals.taxTotal).toBe(vnd(14_820));
    expect(totals.amountDue).toBe(vnd(183_820));
  });

  it("carves VAT out of tax-inclusive prices and the bill stays at the menu total", () => {
    const totals = computeOrderTotals(orderOf(teaAndBurger), TAX_INCLUSIVE);
    // 104.000 × 8/108 = 7.703,7 → 7.704; 65.000 × 10/110 = 5.909,09 → 5.909
    expect(totals.taxBreakdown).toEqual([
      { rate: VAT_8, base: vnd(96_296), tax: vnd(7_704) },
      { rate: VAT_10, base: vnd(59_091), tax: vnd(5_909) },
    ]);
    // 7.704 spread 90:14 → 6.666,9 and 1.037,1; the leftover đồng goes to the tea
    expect(lineTax(totals)).toEqual({ tea: vnd(6_667), pearl: vnd(1_037), burger: vnd(5_909) });
    expect(totals.taxTotal).toBe(vnd(13_613));
    expect(totals.amountDue).toBe(vnd(169_000));
  });

  it("rounds tax once per rate group, not once per line", () => {
    const lines = ["a", "b", "c"].map((id) => itemLine(id, 10_000, VAT_8));
    const totals = computeOrderTotals(orderOf(lines), TAX_INCLUSIVE);
    // 30.000 × 8/108 = 2.222,2 → 2.222; rounding each line (740,7 → 741) would give 2.223
    expect(totals.taxTotal).toBe(vnd(2_222));
    expect(lineTax(totals)).toEqual({ a: vnd(741), b: vnd(741), c: vnd(740) });
  });

  it("prices child lines by effective quantity and keeps a number for each of them", () => {
    const lines = [
      itemLine("combo", 89_000, VAT_10, quantity(2)),
      componentLine("burger", "combo", 0, VAT_10),
      modifierLine("cheese", "burger", 5_000, VAT_10, quantity(2)),
      componentLine("beer", "combo", 10_000, VAT_10),
    ];
    const totals = computeOrderTotals(orderOf(lines), TAX_EXCLUSIVE);
    expect(totals.lines.map((l) => [l.lineId, l.gross])).toEqual([
      ["combo", vnd(178_000)],
      ["burger", vnd(0)],
      ["cheese", vnd(20_000)], // 2 combos × 1 burger × 2 slices
      ["beer", vnd(20_000)],
    ]);
    expect(totals.grossTotal).toBe(vnd(218_000));
  });

  it("rounds a weighed line half-up", () => {
    // 0,125 kg × 100.004 đ = 12.500,5 đ
    const totals = computeOrderTotals(
      orderOf([itemLine("prawns", 100_004, VAT_8, quantity("0.125"))]),
      TAX_EXCLUSIVE,
    );
    expect(totals.grossTotal).toBe(vnd(12_501));
  });
});

describe("computeOrderTotals with discounts and a service charge", () => {
  // 10% off the whole order, split per rate; and 5.000 off the burger itself.
  const discounted = [
    ...teaAndBurger,
    discountLine("burger-off", "burger", 5_000, VAT_10),
    discountLine("order-off-8", null, 10_400, VAT_8),
    discountLine("order-off-10", null, 6_000, VAT_10),
  ];

  it("spreads each discount over the goods of its rate and taxes the base after discount", () => {
    const totals = computeOrderTotals(orderOf(discounted), withServiceCharge(TAX_EXCLUSIVE));
    expect(totals.lines.map((l) => [l.lineId, l.discountAllocated, l.net, l.tax])).toEqual([
      ["tea", vnd(9_000), vnd(81_000), vnd(6_480)],
      ["pearl", vnd(1_400), vnd(12_600), vnd(1_008)],
      ["burger", vnd(11_000), vnd(54_000), vnd(5_400)],
    ]);
    expect(totals.discountTotal).toBe(vnd(21_400));
    expect(totals.netTotal).toBe(vnd(147_600));
    // 5% of 147.600 after discount, taxed at 10% together with the burger
    expect(totals.serviceCharge).toBe(vnd(7_380));
    expect(totals.serviceChargeTax).toBe(vnd(738));
    expect(totals.taxBreakdown).toEqual([
      { rate: VAT_8, base: vnd(93_600), tax: vnd(7_488) },
      { rate: VAT_10, base: vnd(61_380), tax: vnd(6_138) },
    ]);
    expect(totals.taxTotal).toBe(vnd(13_626));
    expect(totals.amountDue).toBe(vnd(168_606));
  });

  it("charges service on the total before discount when the profile says so", () => {
    const profile = withServiceCharge(TAX_EXCLUSIVE, { base: "before_discount" });
    const totals = computeOrderTotals(orderOf(discounted), profile);
    expect(totals.serviceCharge).toBe(vnd(8_450)); // 5% of 169.000
    expect(totals.taxBreakdown[1]).toEqual({ rate: VAT_10, base: vnd(62_450), tax: vnd(6_245) });
    expect(totals.amountDue).toBe(vnd(169_783));
  });

  it("charges no service on a service type the rule does not list", () => {
    const totals = computeOrderTotals(
      orderOf(discounted, "takeaway"),
      withServiceCharge(TAX_EXCLUSIVE),
    );
    expect(totals.serviceCharge).toBe(vnd(0));
    expect(totals.serviceChargeTax).toBe(vnd(0));
    expect(totals.taxBreakdown[1]).toEqual({ rate: VAT_10, base: vnd(54_000), tax: vnd(5_400) });
    expect(totals.amountDue).toBe(vnd(160_488));
  });

  it("keeps the service charge inside the bill when prices include tax", () => {
    const totals = computeOrderTotals(orderOf(discounted), withServiceCharge(TAX_INCLUSIVE));
    // 10% group: 54.000 + 7.380 = 61.380 inclusive → 61.380 × 10/110 = 5.580
    expect(totals.taxBreakdown[1]).toEqual({ rate: VAT_10, base: vnd(55_800), tax: vnd(5_580) });
    expect(totals.serviceChargeTax).toBe(vnd(671)); // 5.580 × 7.380/61.380 = 670,9
    expect(totals.amountDue).toBe(vnd(154_980));
  });
});
