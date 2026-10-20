import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { dailySalesReport } from "../../test-support/fake-reports-and-day";
import { DailySalesOverview } from "./daily-sales-overview";

const card = (name: string) => document.querySelector(`[data-figure="${name}"]`)?.textContent ?? "";

describe("the day at a glance over the report", () => {
  it("shows the report's own figures, and the average through the domain's division", () => {
    render(<DailySalesOverview report={dailySalesReport()} />);
    expect(card("collected")).toContain("1.260.000");
    expect(card("orderCount")).toContain("42");
    expect(card("orderCount")).toContain(vi.dailySales.cards.cancelled(3));
    expect(card("average")).toContain("30.000");
    expect(card("discount")).toContain("34.567");
    expect(card("refunds")).toContain("-29.000");
    expect(card("voids")).toContain("58.000");
    expect(card("voids")).toContain(vi.dailySales.cards.voidsNote(2));
  });

  it("has no average on a day without an order, and an empty chart that says so", () => {
    const report = dailySalesReport();
    render(
      <DailySalesOverview
        report={{ ...report, sales: { ...report.sales, orderCount: 0, collected: 0 }, byHour: [] }}
      />,
    );
    expect(card("average")).toContain(vi.dailySales.cards.averageNone);
    expect(screen.getByText(vi.home.hoursEmpty)).toBeTruthy();
  });
});
