import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { PrintFailure } from "../../lib/api/reports-api";
import { firstOfLastDays, todaysBusinessDate } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { fixtureId } from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { PrintFailuresScreen } from "./print-failures-screen";

const T = vi.printFailures;

const failure = (n: number, change: Partial<PrintFailure> = {}): PrintFailure => ({
  jobId: fixtureId(n),
  kind: "bill",
  printerKey: "quay-chinh",
  attempts: 3,
  errorCode: "PRINTER_OFFLINE",
  occurredAt: "2026-10-20T03:00:00.000Z",
  deviceId: fixtureId(60),
  staffId: fixtureId(61),
  orderId: fixtureId(62),
  deviceOrderNo: 17,
  callNumber: "A17",
  shiftId: fixtureId(63),
  ...change,
});

describe("slips the tills could not print", () => {
  it("asks for today's whole business day on the shop's clock and lists what is still missing", async () => {
    const getPrintFailures = mock.fn(async () =>
      ok({ failures: [failure(1), failure(2, { kind: "kitchen", deviceOrderNo: null, callNumber: null })], truncated: false }),
    );
    await renderSignedIn(<PrintFailuresScreen />, { getPrintFailures });
    const bill = (await screen.findByText(T.kinds.bill!)).closest("tr")!;
    expect(within(bill).getByText(T.order(17, "A17"))).toBeTruthy();
    expect(within(bill).getByText("PRINTER_OFFLINE")).toBeTruthy();
    expect(screen.getByText(T.kinds.kitchen!)).toBeTruthy();
    const today = todaysBusinessDate();
    const [branchId, from, to] = getPrintFailures.mock.calls[0]! as unknown as [string, string, string];
    expect(branchId).toBe(BRANCHES[0]!.id);
    expect(Date.parse(from)).toBe(Date.parse(`${today}T04:00:00+07:00`));
    expect(Date.parse(to) - Date.parse(from)).toBe(24 * 60 * 60_000);
    expect(screen.queryByText(T.truncated)).toBeNull();
  });

  it("says when the list holds only the newest failures", async () => {
    await renderSignedIn(<PrintFailuresScreen />, { getPrintFailures: async () => ok({ failures: [failure(1)], truncated: true }) });
    expect(await screen.findByText(T.truncated)).toBeTruthy();
  });

  it("asks nothing for a range that runs backwards, and says why", async () => {
    const getPrintFailures = mock.fn(async () => ok({ failures: [], truncated: false }));
    await renderSignedIn(<PrintFailuresScreen />, { getPrintFailures });
    await screen.findByText(T.empty);
    const calls = getPrintFailures.mock.calls.length;
    // The end first: the range starts today, so an end in the past already runs backwards,
    // whatever day the test runs on.
    fireEvent.change(screen.getByLabelText(T.toLabel), { target: { value: "2026-10-19" } });
    fireEvent.change(screen.getByLabelText(T.fromLabel), { target: { value: "2026-10-21" } });
    expect((await screen.findByRole("alert")).textContent).toBe(T.rangeInvalid);
    expect(getPrintFailures.mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText(T.toLabel), { target: { value: "2026-10-22" } });
    await waitFor(() =>
      expect(getPrintFailures).toHaveBeenLastCalledWith(BRANCHES[0]!.id, "2026-10-20T21:00:00.000Z", "2026-10-22T21:00:00.000Z"),
    );
  });

  it("explains a role without view_reports instead of an empty list", async () => {
    await renderSignedIn(<PrintFailuresScreen />, { getPrintFailures: async () => refused(403, "API_PERMISSION_DENIED") });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
  });

  it("picks the last seven business days in one tap, ending today, and marks it", async () => {
    const getPrintFailures = mock.fn(async () => ok({ failures: [], truncated: false }));
    await renderSignedIn(<PrintFailuresScreen />, { getPrintFailures });
    await screen.findByText(T.empty);
    const week = screen.getByRole("button", { name: T.ranges.week });
    expect(screen.getByRole("button", { name: T.ranges.today }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(week);
    const today = todaysBusinessDate();
    await mock.waitFor(() => expect(getPrintFailures).toHaveBeenCalledTimes(2));
    const [, from, to] = getPrintFailures.mock.calls[1]! as unknown as [string, string, string];
    expect(Date.parse(to) - Date.parse(from)).toBe(7 * 24 * 60 * 60_000);
    expect(Date.parse(to)).toBe(Date.parse(`${today}T04:00:00+07:00`) + 24 * 60 * 60_000);
    expect(week.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText(T.fromLabel) as HTMLInputElement).value).toBe(firstOfLastDays(today, 7));
  });
});
