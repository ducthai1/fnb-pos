import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { ApiFailure } from "../../lib/api/api-result";
import type { DayOpenShift, DayStatus } from "../../lib/api/day-close-api";
import { vi } from "../../messages/vi";
import { OWNER, ok } from "../../test-support/fake-backoffice-api";
import { dayStatus, fixtureId } from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { DayCloseScreen } from "./day-close-screen";

const T = vi.dayClose;
// As long as a till name gets (80), with no space to wrap at.
const LONG_NAME = "QuầyThuNgânTầngHaiCạnhCửaSổNhìnRaHồGươmBuổiTốiCuốiTuần".repeat(2).slice(0, 80);
const REVOKED: DayOpenShift = {
  id: fixtureId(80),
  deviceId: fixtureId(81),
  deviceName: LONG_NAME,
  deviceRevoked: true,
  openedAt: "2026-10-20T01:00:00.000Z",
  version: 7,
  expectedCash: 999_999_000,
};
const LIVE: DayOpenShift = { ...REVOKED, id: fixtureId(82), deviceId: fixtureId(83), deviceName: "Quầy 1", deviceRevoked: false };
const money = (amount: number) => formatVnd(vnd(BigInt(amount)));
const card = (shiftId: string) => document.querySelector<HTMLElement>(`[data-shift="${shiftId}"]`);
const conflict = (code: string): ApiFailure => ({ ok: false, status: 409, code, body: { code } });

function server(initial: DayStatus, answer?: () => Promise<ApiFailure>) {
  let status = initial;
  const getDayStatus = mock.fn(async () => ok(status));
  const closeShiftOnBehalf = mock.fn(async (shiftId: string, countedCash: number) => {
    if (answer !== undefined) return answer();
    const shift = status.openShifts.find((each) => each.id === shiftId)!;
    const difference = countedCash - shift.expectedCash;
    status = {
      ...status,
      openShiftIds: status.openShiftIds.filter((id) => id !== shiftId),
      openShifts: status.openShifts.filter((each) => each.id !== shiftId),
      closedOnBehalf: [
        {
          id: shiftId,
          deviceName: shift.deviceName,
          closedAt: "2026-10-20T15:00:00.000Z",
          countedCash,
          expectedCash: shift.expectedCash,
          difference,
          cashAfterClose: 0,
        },
      ],
    };
    return ok({ shiftId, countedCash, expectedCash: shift.expectedCash, difference });
  });
  return { getDayStatus, closeShiftOnBehalf };
}

const withShifts = (...openShifts: DayOpenShift[]) =>
  dayStatus({ openShiftIds: openShifts.map((shift) => shift.id), openShifts });

async function openPanel() {
  fireEvent.click(await screen.findByRole("button", { name: T.closeOnBehalfLabel(LONG_NAME) }));
  return screen.getByRole("alertdialog", { name: T.closeOnBehalfTitle(LONG_NAME) });
}

describe("closing a revoked till's shift from the day close page", () => {
  it("marks the revoked till's shift and offers the close only there", async () => {
    await renderSignedIn(<DayCloseScreen />, server(withShifts(REVOKED, LIVE)));
    await waitFor(() => expect(card(REVOKED.id)).not.toBeNull());
    const revoked = card(REVOKED.id)!;
    expect(within(revoked).getByText(T.revokedBadge)).toBeTruthy();
    expect(within(revoked).getByText(LONG_NAME)).toBeTruthy();
    expect(revoked.textContent).toContain(money(999_999_000));
    expect(within(revoked).getByText(T.shift(REVOKED.id))).toBeTruthy();
    const live = card(LIVE.id)!;
    expect(within(live).queryByText(T.revokedBadge)).toBeNull();
    expect(within(live).queryByRole("button")).toBeNull();
  });

  it("counts against the server's figure, shows the difference as typed, and closes on the second tap", async () => {
    const api = server(withShifts(REVOKED));
    await renderSignedIn(<DayCloseScreen />, api);
    const panel = await openPanel();
    expect(panel.textContent).toContain(T.closeOnBehalfHint);
    expect(panel.textContent).toContain(T.expectedLine(money(999_999_000)));
    const field = within(panel).getByLabelText(T.countedLabel);
    fireEvent.change(field, { target: { value: "1.000.000.999" } });
    expect(panel.textContent).toContain(T.difference(1_999, money(1_999)));
    fireEvent.change(field, { target: { value: "999.998.999" } });
    expect(panel.textContent).toContain(T.difference(-1, money(1)));
    expect(api.closeShiftOnBehalf).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole("button", { name: T.closeOnBehalf }));
    await waitFor(() =>
      expect(document.body.textContent).toContain(T.closedOnBehalfDone(LONG_NAME, T.difference(-1, money(1)))),
    );
    expect(api.closeShiftOnBehalf).toHaveBeenCalledWith(REVOKED.id, 999_998_999, 7);
    await waitFor(() => expect(card(REVOKED.id)?.closest('[data-day-list="closed-on-behalf"]')).toBeTruthy());
    expect(document.querySelector('[data-day-list="open-shifts"]')).toBeNull();
  });

  it.each(["", "abc", "-5", "1,5", "12.34", "9".repeat(17)])("refuses %j as a count, without asking the server", async (typed) => {
    const api = server(withShifts(REVOKED));
    await renderSignedIn(<DayCloseScreen />, api);
    const panel = await openPanel();
    fireEvent.change(within(panel).getByLabelText(T.countedLabel), { target: { value: typed } });
    fireEvent.click(within(panel).getByRole("button", { name: T.closeOnBehalf }));
    await within(panel).findByText(T.countedInvalid);
    expect(api.closeShiftOnBehalf).not.toHaveBeenCalled();
  });

  it.each(["API_SHIFT_VERSION_CONFLICT", "API_SHIFT_ALREADY_CLOSED"])(
    "says why %s refused it and reads the day again",
    async (code) => {
      const api = server(withShifts(REVOKED), async () => conflict(code));
      await renderSignedIn(<DayCloseScreen />, api);
      const panel = await openPanel();
      fireEvent.change(within(panel).getByLabelText(T.countedLabel), { target: { value: "0" } });
      fireEvent.click(within(panel).getByRole("button", { name: T.closeOnBehalf }));
      await within(panel).findByText(vi.errors.byCode[code as keyof typeof vi.errors.byCode]!);
      await waitFor(() => expect(api.getDayStatus).toHaveBeenCalledTimes(2));
    },
  );

  it("tells a manager without the key why there is no close", async () => {
    await renderSignedIn(<DayCloseScreen />, {
      ...server(withShifts(REVOKED)),
      me: async () => ok({ ...OWNER, permissionKeys: ["view_reports"] }),
    });
    await waitFor(() => expect(card(REVOKED.id)).not.toBeNull());
    expect(within(card(REVOKED.id)!).getByText(T.needsKeyOnBehalf)).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.closeOnBehalfLabel(LONG_NAME) })).toBeNull();
  });

  it("lists cash a till sent after its shift was closed, beside the close", async () => {
    await renderSignedIn(
      <DayCloseScreen />,
      server(
        dayStatus({
          closedOnBehalf: [
            {
              id: REVOKED.id,
              deviceName: LONG_NAME,
              closedAt: "2026-10-20T15:00:00.000Z",
              countedCash: 29_000,
              expectedCash: 0,
              difference: 29_000,
              cashAfterClose: 29_000,
            },
          ],
          cashAfterShiftClose: [{ id: LIVE.id, deviceName: null, amount: 35_000 }],
        }),
      ),
    );
    await waitFor(() => expect(document.querySelector('[data-day-list="closed-on-behalf"]')).not.toBeNull());
    const onBehalf = document.querySelector<HTMLElement>('[data-day-list="closed-on-behalf"]')!;
    expect(onBehalf.querySelector("[data-cash-after-close]")?.textContent).toBe(T.cashAfterCloseNote(money(29_000)));
    const list = document.querySelector<HTMLElement>('[data-day-list="cash-after-shift-close"]')!;
    expect(list.textContent).toContain(T.cashAfterShiftCloseRow(T.tillName(null), money(35_000)));
  });
});
