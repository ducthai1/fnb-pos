import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { ApiFailure } from "../../lib/api/api-result";
import type { DayStatus } from "../../lib/api/day-close-api";
import { formatBusinessDate, todaysBusinessDate } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { BRANCHES, OWNER, ok, refused } from "../../test-support/fake-backoffice-api";
import { dayStatus, fixtureId } from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { DayCloseScreen } from "./day-close-screen";

const T = vi.dayClose;
const Q1 = BRANCHES[0]!.id;
const SHIFT = fixtureId(70);
const DRAFT = { id: fixtureId(71), deviceId: fixtureId(72), deviceOrderNo: 17 };
const QR = fixtureId(73);
const list = (name: string) => document.querySelector<HTMLElement>(`[data-day-list="${name}"]`);

const blocked = (code: string, details: Record<string, unknown>): ApiFailure => ({
  ok: false,
  status: 409,
  code,
  body: { code, ...details },
});

function server(initial: DayStatus) {
  let status = initial;
  const getDayStatus = mock.fn(async () => ok(status));
  const closeDay = mock.fn(async () => {
    status = { ...status, dayClose: { closedByAppUserId: OWNER.appUserId, closedAt: "2026-10-20T16:00:00.000Z" } };
    return ok(status);
  });
  return { getDayStatus, closeDay };
}

/** The refusal shown next to the close button, once it is there. */
const refusalBox = () =>
  waitFor(() => {
    const box = document.querySelector<HTMLElement>("[data-close-refused]");
    if (box === null) throw new Error("no refusal shown yet");
    return box;
  });

const confirmClose = async () => {
  fireEvent.click(await screen.findByRole("button", { name: T.close }));
  const dialog = screen.getByRole("alertdialog", { name: T.closeTitle(formatBusinessDate(todaysBusinessDate())) });
  fireEvent.click(within(dialog).getByRole("button", { name: T.close }));
};

describe("closing a business day", () => {
  it("lists what is still open on the day before anyone tries to close it", async () => {
    const api = server(dayStatus({ openShiftIds: [SHIFT], openDrafts: [DRAFT] }));
    await renderSignedIn(<DayCloseScreen />, api);
    await screen.findByText(T.open);
    expect(api.getDayStatus).toHaveBeenCalledWith(Q1, todaysBusinessDate());
    expect(within(list("open-shifts")!).getByText(T.shift(SHIFT))).toBeTruthy();
    expect(within(list("open-drafts")!).getByText(T.order(DRAFT.deviceId, 17))).toBeTruthy();
  });

  it("closes the day only after the second, confirming tap", async () => {
    const api = server(dayStatus());
    await renderSignedIn(<DayCloseScreen />, api);
    fireEvent.click(await screen.findByRole("button", { name: T.close }));
    expect(api.closeDay).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: vi.common.cancel }));
    expect(api.closeDay).not.toHaveBeenCalled();
    await confirmClose();
    await screen.findByText(T.closedDone(formatBusinessDate(todaysBusinessDate())));
    expect(api.closeDay).toHaveBeenCalledWith(Q1, todaysBusinessDate());
    await screen.findByText(T.closedAt("23:00 20/10/2026"));
    expect(screen.queryByRole("button", { name: T.close })).toBeNull();
  });

  it("shows the shifts a refused close names, under the refusal, and reads the day again", async () => {
    const api = server(dayStatus());
    const lateShift = fixtureId(73);
    await renderSignedIn(<DayCloseScreen />, {
      ...api,
      closeDay: async () => blocked("API_DAY_CLOSE_SHIFTS_OPEN", { shiftIds: [lateShift] }),
    });
    await confirmClose();
    const refusal = await refusalBox();
    expect(within(refusal).getByRole("alert").textContent).toBe(vi.errors.byCode.API_DAY_CLOSE_SHIFTS_OPEN);
    expect(within(refusal).getByText(T.shift(lateShift))).toBeTruthy();
    await waitFor(() => expect(api.getDayStatus).toHaveBeenCalledTimes(2));
  });

  it.each([
    ["drafts", "API_DAY_CLOSE_DRAFTS_OPEN", { drafts: [DRAFT] }, T.order(DRAFT.deviceId, 17)],
    [
      "invoices",
      "API_DAY_CLOSE_INVOICES_UNISSUED",
      { invoices: [{ id: fixtureId(74), orderId: fixtureId(75), status: "pending", attempts: 2, lastErrorCode: null }] },
      T.invoice(fixtureId(75), "pending", null),
    ],
  ])("lists the %s a refused close names", async (_kind, code, details, shown) => {
    await renderSignedIn(<DayCloseScreen />, { ...server(dayStatus()), closeDay: async () => blocked(code, details) });
    await confirmClose();
    const refusal = await refusalBox();
    expect(within(refusal).getByText(shown)).toBeTruthy();
  });

  it("shows a closed day as closed, with what was paid after the close", async () => {
    const closed = dayStatus({
      dayClose: { closedByAppUserId: OWNER.appUserId, closedAt: "2026-10-20T16:00:00.000Z" },
      paidAfterClose: [DRAFT],
      qrRefundedAfterClose: [{ intentId: QR, amount: 40_000 }],
    });
    await renderSignedIn(<DayCloseScreen />, server(closed));
    await screen.findByText(T.closedAt("23:00 20/10/2026"));
    expect(within(list("paid-after-close")!).getByText(T.order(DRAFT.deviceId, 17))).toBeTruthy();
    // Money carries a no-break space, which text matchers fold away: read the list's text.
    expect(list("qr-refunded-after-close")?.textContent).toContain(
      T.qrRefund(QR, formatVnd(vnd(40_000))),
    );
    expect(screen.queryByRole("button", { name: T.close })).toBeNull();
  });

  it("offers no close to a role that may read the day but not settle it", async () => {
    const keys = OWNER.permissionKeys.filter((key) => key !== "accept_close_difference");
    await renderSignedIn(<DayCloseScreen />, { ...server(dayStatus()), me: async () => ok({ ...OWNER, permissionKeys: keys }) });
    await screen.findByText(T.needsKey);
    expect(screen.queryByRole("button", { name: T.close })).toBeNull();
  });

  it("explains a role without view_reports instead of an empty day", async () => {
    await renderSignedIn(<DayCloseScreen />, { getDayStatus: async () => refused(403, "API_PERMISSION_DENIED") });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
  });
});

describe("what a close waits for, at a glance", () => {
  const check = (key: string) => document.querySelector<HTMLElement>(`[data-check="${key}"]`)!;

  it("ticks what is done and counts what is left, on a day not closed", async () => {
    await renderSignedIn(<DayCloseScreen />, server(dayStatus({ openShiftIds: [SHIFT], openDrafts: [DRAFT, { ...DRAFT, id: fixtureId(73) }] })));
    await screen.findByRole("list", { name: T.checklistTitle });
    expect(check("shifts").dataset.done).toBe("false");
    expect(check("shifts").textContent).toContain(T.checkLeft(1));
    expect(check("drafts").textContent).toContain(T.checkLeft(2));
    expect(check("invoices").dataset.done).toBe("true");
    expect(check("invoices").textContent).toContain(T.checkDone);
    expect(document.querySelector('[data-state="open"]')).not.toBeNull();
  });

  it("drops the checklist once the day is closed, and says when", async () => {
    await renderSignedIn(<DayCloseScreen />, server(dayStatus({ dayClose: { closedByAppUserId: OWNER.appUserId, closedAt: "2026-10-20T16:00:00.000Z" } })));
    await screen.findByText(/^Đã chốt lúc/);
    expect(screen.queryByRole("list", { name: T.checklistTitle })).toBeNull();
    expect(document.querySelector('[data-state="closed"]')).not.toBeNull();
  });
});
