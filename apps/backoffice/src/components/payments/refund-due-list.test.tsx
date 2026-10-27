import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { QrRefund } from "../../lib/api/payments-api";
import { vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { OWNER, ok, refused } from "../../test-support/fake-backoffice-api";
import { fixtureId, unmatchedPayments } from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { TransfersScreen } from "./transfers-screen";

const T = vi.transfers;
/** What the page says, as Testing Library reads it: any run of spaces is one space. */
const said = (text: string) => text.replace(/\s+/g, " ");
const OWED = unmatchedPayments().refundDue[0]!;
const REFUND: QrRefund = {
  intentId: OWED.id,
  branchId: OWED.branchId,
  amount: 70_000,
  method: "cash",
  note: "Trả lại chị Lan",
  businessDate: "2026-10-20",
  refundedAt: "2026-10-20T04:00:00.000Z",
  refundedByAppUserId: fixtureId(9),
};

async function openOwed(more = {}) {
  const listUnmatched = mock.fn(async () => ok(unmatchedPayments()));
  const view = await renderSignedIn(<TransfersScreen />, { listUnmatched, ...more });
  const row = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-intent="${OWED.id}"]`);
    if (found === null) throw new Error("the owed QR is not listed yet");
    return found;
  });
  return { ...view, listUnmatched, row };
}

const startHandBack = (row: HTMLElement) => {
  fireEvent.click(within(row).getByRole("button", { name: T.handBack }));
  return within(row).getByRole("alertdialog", {
    name: T.handBackTitle(OWED.contentCode, vndText(70_000)),
  });
};

const fill = (panel: HTMLElement, method: string | null, note: string) => {
  if (method !== null) fireEvent.click(within(panel).getByRole("radio", { name: method }));
  fireEvent.change(within(panel).getByLabelText(T.handBackNote), { target: { value: note } });
  fireEvent.click(within(panel).getByRole("button", { name: T.handBackConfirm }));
};

describe("marking QR money handed back to the customer", () => {
  it("sends how and the note after the confirming tap, says so, and reads the list again", async () => {
    const handBackQrMoney = mock.fn(async () => ok(REFUND));
    const { row, listUnmatched } = await openOwed({ handBackQrMoney });
    const panel = startHandBack(row);
    expect(handBackQrMoney).not.toHaveBeenCalled();
    fill(panel, T.handBackMethods.bank_transfer!, "  CK lại VCB 0123  ");
    await screen.findByText(said(T.handedBack(OWED.contentCode, vndText(70_000))));
    expect(handBackQrMoney).toHaveBeenCalledWith(OWED.id, {
      method: "bank_transfer",
      note: "CK lại VCB 0123",
    });
    await waitFor(() => expect(listUnmatched).toHaveBeenCalledTimes(2));
  });

  it("names the open shift whose drawer the cash came out of", async () => {
    const handBackQrMoney = mock.fn(async () => ok({ ...REFUND, method: "cash_from_drawer" }));
    const { row } = await openOwed({ handBackQrMoney });
    const panel = startHandBack(row);
    fireEvent.click(
      within(panel).getByRole("radio", { name: T.handBackMethods.cash_from_drawer! }),
    );
    expect(within(panel).getByLabelText(T.handBackShift)).toBeTruthy();
    expect(within(panel).getByText(T.handBackFromDrawerHint)).toBeTruthy();
    fill(panel, null, "Trả lại chị Lan");
    await waitFor(() =>
      expect(handBackQrMoney).toHaveBeenCalledWith(OWED.id, {
        method: "cash_from_drawer",
        note: "Trả lại chị Lan",
        fromShiftId: fixtureId(40),
      }),
    );
  });

  it("keeps the row and the form while the server has not answered", async () => {
    let answer: (value: ReturnType<typeof ok<QrRefund>>) => void = () => {};
    const handBackQrMoney = mock.fn(
      () => new Promise<ReturnType<typeof ok<QrRefund>>>((resolve) => (answer = resolve)),
    );
    const { row } = await openOwed({ handBackQrMoney });
    const panel = startHandBack(row);
    fill(panel, T.handBackMethods.cash!, "Trả lại chị Lan");
    const busy = within(panel).getByRole("button", { name: T.handingBack });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector(`[data-intent="${OWED.id}"]`)).not.toBeNull();
    expect(screen.queryByText(said(T.handedBack(OWED.contentCode, vndText(70_000))))).toBeNull();
    answer(ok(REFUND));
    await screen.findByText(said(T.handedBack(OWED.contentCode, vndText(70_000))));
  });

  it("asks how and why before anything is sent", async () => {
    const handBackQrMoney = mock.fn();
    const { row } = await openOwed({ handBackQrMoney });
    const panel = startHandBack(row);
    fill(panel, null, "Trả lại chị Lan");
    expect(within(panel).getByRole("alert").textContent).toBe(T.handBackChooseMethod);
    fill(panel, T.handBackMethods.cash!, "   ");
    expect(within(panel).getByText(T.handBackNeedsNote)).toBeTruthy();
    expect(handBackQrMoney).not.toHaveBeenCalled();
  });

  it("shows a refusal inside the form with its reason, and marks nothing", async () => {
    const { row } = await openOwed({
      handBackQrMoney: async () => refused(409, "API_PAYMENT_ALREADY_HANDED_BACK"),
    });
    const panel = startHandBack(row);
    fill(panel, T.handBackMethods.cash!, "Trả lại chị Lan");
    const alert = await within(panel).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_PAYMENT_ALREADY_HANDED_BACK);
    expect(screen.queryByText(said(T.handedBack(OWED.contentCode, vndText(70_000))))).toBeNull();
  });

  it("offers no button to a role without manage_settings, and says why", async () => {
    const keys = OWNER.permissionKeys.filter((key) => key !== "manage_settings");
    const { row } = await openOwed({ me: async () => ok({ ...OWNER, permissionKeys: keys }) });
    expect(within(row).queryByRole("button", { name: T.handBack })).toBeNull();
    expect(screen.getByText(T.handBackNeedsKey)).toBeTruthy();
  });
});
