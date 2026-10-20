import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { todaysBusinessDate, vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { dailySalesReport } from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { DailySalesScreen } from "./daily-sales-screen";

const T = vi.dailySales;
const Q1 = BRANCHES[0]!.id;
/** An amount as the page shows it, its no-break space read the way Testing Library reads text. */
const money = (amount: number) => vndText(amount).replace(/\s/g, " ");
const figure = (key: string) => document.querySelector(`tr[data-figure="${key}"]`)!;

describe("the daily sales report", () => {
  it("asks for today's business day and shows the server's totals in the domain's money format", async () => {
    const getDailySales = mock.fn(async () => ok(dailySalesReport()));
    await renderSignedIn(<DailySalesScreen />, { getDailySales });
    await screen.findByText(T.summaryTitle, { selector: "caption" });
    expect(getDailySales).toHaveBeenCalledWith(Q1, todaysBusinessDate());
    expect(within(figure("gross") as HTMLElement).getByText(money(1_234_567))).toBeTruthy();
    expect(within(figure("collected") as HTMLElement).getByText(money(1_260_000))).toBeTruthy();
    expect(within(figure("orderCount") as HTMLElement).getByText("42")).toBeTruthy();
    expect(within(figure("refundCollected") as HTMLElement).getByText(money(-29_000))).toBeTruthy();
    expect(screen.getByText(`${T.taxRate("8")} ${T.taxRow(money(1_166_667))}`)).toBeTruthy();
  });

  it("lists sales by payment method, by hour and by item", async () => {
    await renderSignedIn(<DailySalesScreen />, { getDailySales: async () => ok(dailySalesReport()) });
    const cash = (await screen.findByText(T.methods.cash!)).closest("tr")!;
    expect(within(cash).getByText(money(871_000))).toBeTruthy();
    expect(screen.getByText(T.methods.qr_transfer!)).toBeTruthy();
    expect(screen.getByText(T.hour(7))).toBeTruthy();
    const tea = screen.getByText("Trà sữa trân châu").closest("tr")!;
    expect(within(tea).getByText("12,5")).toBeTruthy();
    expect(screen.getByText(`Trân châu đen (${T.lineTypes.modifier})`)).toBeTruthy();
  });

  it("reads another day when one is picked, and none while the day is not a date", async () => {
    const getDailySales = mock.fn(async () => ok(dailySalesReport()));
    await renderSignedIn(<DailySalesScreen />, { getDailySales });
    await screen.findByText(T.summaryTitle, { selector: "caption" });
    fireEvent.change(screen.getByLabelText(T.dateLabel), { target: { value: "2026-10-18" } });
    await waitFor(() => expect(getDailySales).toHaveBeenLastCalledWith(Q1, "2026-10-18"));
    const calls = getDailySales.mock.calls.length;
    fireEvent.change(screen.getByLabelText(T.dateLabel), { target: { value: "" } });
    expect(await screen.findByText(T.dateInvalid)).toBeTruthy();
    expect(getDailySales.mock.calls.length).toBe(calls);
  });

  it("explains a role without view_reports instead of an empty report", async () => {
    await renderSignedIn(<DailySalesScreen />, { getDailySales: async () => refused(403, "API_PERMISSION_DENIED") });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
    expect(screen.queryByText(T.summaryTitle)).toBeNull();
  });
});
