import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { dayBefore, todaysBusinessDate } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { BRANCHES, OWNER, ok, refused } from "../../test-support/fake-backoffice-api";
import {
  dailySalesReport,
  dayStatus,
  unmatchedPayments,
} from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { HomeScreen } from "../shell/home-screen";

mock.mock("next/navigation", () => ({ usePathname: () => "/" }));

const T = vi.home;
const figure = (name: string) =>
  document.querySelector(`[data-figure="${name}"]`)?.textContent ?? "";
const empty = () => ({ ...unmatchedPayments(), transfers: [], refundDue: [] });
const quietDay = () => ({
  ...dailySalesReport(),
  sales: { ...dailySalesReport().sales, orderCount: 0 },
  refunds: { ...dailySalesReport().refunds, orderCount: 0 },
});

function reportsApi(change: Record<string, unknown> = {}) {
  return {
    getDailySales: mock.fn(async () => ok(dailySalesReport())),
    listUnmatched: mock.fn(async () => ok(empty())),
    getPrintFailures: mock.fn(async () => ok({ failures: [], truncated: false })),
    getDayStatus: mock.fn(async () => ok(dayStatus())),
    ...change,
  };
}

describe("the home page of a member who may read reports", () => {
  it("shows today's figures of the branch as the report gives them, the average by the domain", async () => {
    const api = reportsApi();
    await renderSignedIn(<HomeScreen />, api);
    await screen.findByRole("heading", { name: T.hoursTitle });
    expect(figure("collected")).toContain("1.260.000");
    expect(figure("orderCount")).toContain("42");
    expect(figure("average")).toContain("30.000");
    expect(figure("cash")).toContain("871.000");
    expect(figure("qr")).toContain("360.000");
    expect(api.getDailySales).toHaveBeenCalledWith(BRANCHES[0]!.id, todaysBusinessDate());
  });

  it("names the busiest hour in words and lists what sold most, toppings left out", async () => {
    await renderSignedIn(<HomeScreen />, reportsApi());
    const chart = await screen.findByRole("img");
    expect(chart.getAttribute("aria-label")).toContain(
      T.busiest(vi.dailySales.hour(7), 12, "410.000 ₫").slice(0, 30),
    );
    const top = screen.getByRole("heading", { name: T.topTitle }).closest("section")!;
    expect(within(top).getByText("Trà sữa trân châu")).toBeTruthy();
    expect(within(top).queryByText("Trân châu đen")).toBeNull();
  });

  it("lists QR money owed back, unmatched transfers, failed slips and an unclosed yesterday", async () => {
    const failure = {
      jobId: "j",
      kind: "bill",
      printerKey: "p",
      attempts: 3,
      errorCode: "E",
      occurredAt: "2026-10-20T03:00:00.000Z",
      deviceId: "d",
      staffId: "s",
      orderId: null,
      deviceOrderNo: null,
      callNumber: null,
      shiftId: null,
    };
    const api = reportsApi({
      listUnmatched: mock.fn(async () => ok(unmatchedPayments())),
      getPrintFailures: mock.fn(async () => ok({ failures: [failure], truncated: true })),
    });
    await renderSignedIn(<HomeScreen />, api);
    const todo = (text: string) => screen.findByRole("link", { name: text });
    expect((await todo(T.todo.refundDue(1))).getAttribute("href")).toBe("/payments");
    expect((await todo(T.todo.unmatched(2))).getAttribute("href")).toBe("/payments");
    expect((await todo(T.todo.printFailures(1, true))).getAttribute("href")).toBe(
      "/reports/print-failures",
    );
    const yesterday = dayBefore(todaysBusinessDate());
    expect(api.getDayStatus).toHaveBeenCalledWith(BRANCHES[0]!.id, yesterday);
    const [y, m, d] = yesterday.split("-");
    expect((await todo(T.todo.dayOpen(`${d}/${m}/${y}`))).getAttribute("href")).toBe("/day-close");
    expect(screen.queryByText(T.todoClear)).toBeNull();
  });

  it("says nothing needs doing when yesterday is closed or sold nothing, and nothing is owed", async () => {
    await renderSignedIn(
      <HomeScreen />,
      reportsApi({
        getDayStatus: mock.fn(async () =>
          ok(dayStatus({ dayClose: { closedByAppUserId: "u", closedAt: "x" } })),
        ),
      }),
    );
    await screen.findByText(T.todoClear);
    await renderSignedIn(
      <HomeScreen />,
      reportsApi({ getDailySales: mock.fn(async () => ok(quietDay())) }),
    );
    await mock.waitFor(() => expect(screen.getAllByText(T.todoClear)).toHaveLength(2));
  });

  it("says a check it could not make instead of all clear, and still lists the others", async () => {
    const failure = {
      jobId: "j",
      kind: "bill",
      printerKey: "p",
      attempts: 1,
      errorCode: "E",
      occurredAt: "2026-10-20T03:00:00.000Z",
      deviceId: "d",
      staffId: "s",
      orderId: null,
      deviceOrderNo: null,
      callNumber: null,
      shiftId: null,
    };
    await renderSignedIn(
      <HomeScreen />,
      reportsApi({ listUnmatched: mock.fn(async () => refused(500, "API_INTERNAL")) }),
    );
    await screen.findByText(T.todoFailed);
    expect(screen.queryByText(T.todoClear)).toBeNull();
    await renderSignedIn(
      <HomeScreen />,
      reportsApi({
        listUnmatched: mock.fn(async () => refused(500, "API_INTERNAL")),
        getPrintFailures: mock.fn(async () => ok({ failures: [failure], truncated: false })),
      }),
    );
    await screen.findByRole("link", { name: T.todo.printFailures(1, false) });
  });
});

describe("the home page of a member without reports", () => {
  it("asks for no figure and offers only the pages the member's keys open", async () => {
    const api = reportsApi();
    await renderSignedIn(<HomeScreen />, {
      ...api,
      me: async () => ok({ ...OWNER, permissionKeys: [] }),
    });
    await screen.findByRole("heading", { name: T.shortcutsTitle });
    expect(api.getDailySales).not.toHaveBeenCalled();
    expect(api.listUnmatched).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: T.todoTitle })).toBeNull();
  });
});
