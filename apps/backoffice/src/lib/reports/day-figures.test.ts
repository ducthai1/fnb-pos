import { describe, expect, it } from "vitest";
import { dailySalesReport } from "../../test-support/fake-reports-and-day";
import { averageOrder, busiestHour, hourBars, methodNet, topItems } from "./day-figures";

const item = (name: string, quantity: string, lineType = "item") => ({
  lineType,
  productId: null,
  variantId: null,
  modifierOptionId: null,
  name,
  quantity,
  gross: 0,
  discount: 0,
  net: 0,
  tax: 0,
});

describe("the figures of the day's cards", () => {
  it("averages what customers paid over the orders, in whole đồng rounded half up", () => {
    const report = dailySalesReport();
    expect(averageOrder(report)).toBe(30_000n);
    const odd = { ...report, sales: { ...report.sales, orderCount: 4, collected: 100_002 } };
    expect(averageOrder(odd)).toBe(25_001n);
    expect(
      averageOrder({ ...report, sales: { ...report.sales, orderCount: 4, collected: 10 } }),
    ).toBe(3n);
  });

  it("has no average on a day without an order", () => {
    const report = dailySalesReport();
    expect(
      averageOrder({ ...report, sales: { ...report.sales, orderCount: 0, collected: 0 } }),
    ).toBeNull();
  });

  it("reads a method's net from the report, and 0 for a method nobody used", () => {
    expect(methodNet(dailySalesReport(), "cash")).toBe(871_000);
    expect(methodNet(dailySalesReport(), "card")).toBe(0);
  });

  it("ranks goods by units, leaves toppings out, and breaks ties by name", () => {
    const report = {
      ...dailySalesReport(),
      items: [
        item("Bạc xỉu", "3"),
        item("Trân châu", "40", "modifier"),
        item("Ăn vặt", "3"),
        item("Trà đào", "12.5"),
        item("Cacao", "1"),
      ],
    };
    expect(topItems(report, 3).map((row) => row.name)).toEqual(["Trà đào", "Ăn vặt", "Bạc xỉu"]);
    expect(topItems(report, 10)).toHaveLength(4);
  });
});

describe("the bars of the day by hour", () => {
  it("runs from 06:00 to 22:00 on a day sold inside those hours, empty hours as empty bars", () => {
    const bars = hourBars([{ hour: 7, orderCount: 12, collected: 410_000 }]);
    expect(bars.map((bar) => bar.hour)).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
    ]);
    expect(bars[1]).toEqual({ hour: 7, orderCount: 12, collected: 410_000 });
    expect(bars[0]).toEqual({ hour: 6, orderCount: 0, collected: 0 });
  });

  it("widens to a sale after midnight, which still belongs to the business day before 04:00", () => {
    const bars = hourBars([
      { hour: 1, orderCount: 1, collected: 50_000 },
      { hour: 5, orderCount: 1, collected: 1 },
    ]);
    expect(bars[0]?.hour).toBe(5);
    expect(bars.at(-1)?.hour).toBe(1);
    expect(bars.map((bar) => bar.hour)).not.toContain(4);
  });

  it("names the hour that brought in most, the earlier on a tie, and none on an empty day", () => {
    const rows = [
      { hour: 9, orderCount: 3, collected: 90_000 },
      { hour: 12, orderCount: 5, collected: 150_000 },
      { hour: 18, orderCount: 6, collected: 150_000 },
    ];
    expect(busiestHour(rows)?.hour).toBe(12);
    expect(busiestHour([])).toBeNull();
    expect(busiestHour([{ hour: 3, orderCount: 1, collected: 0 }])).toBeNull();
  });
});
