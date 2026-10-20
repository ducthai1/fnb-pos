import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import { vndText } from "../../lib/format/business-day";
import { vi } from "../../messages/vi";
import { BRANCHES, OWNER, ok, refused } from "../../test-support/fake-backoffice-api";
import { unmatchedPayments } from "../../test-support/fake-reports-and-day";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { TransfersScreen } from "./transfers-screen";

const T = vi.transfers;
const PAYMENTS = unmatchedPayments();
const TRANSFER = PAYMENTS.transfers[0]!;
const INTENT = PAYMENTS.openIntents[0]!;
const money = (amount: number) => vndText(amount).replace(/\s/g, " ");

const choose = (id: string) =>
  fireEvent.click(within(document.querySelector<HTMLElement>(`[data-choice="${id}"]`)!).getByRole("radio"));

async function openTransfers(more = {}) {
  const listUnmatched = mock.fn(async () => ok(unmatchedPayments()));
  const view = await renderSignedIn(<TransfersScreen />, { listUnmatched, ...more });
  await screen.findByRole("heading", { name: new RegExp(T.refundTitle) });
  return { ...view, listUnmatched };
}

describe("transfers nobody matched", () => {
  it("lists money owed back to customers, said plainly", async () => {
    const { listUnmatched } = await openTransfers();
    expect(listUnmatched).toHaveBeenCalledWith(BRANCHES[0]!.id);
    const owed = PAYMENTS.refundDue[0]!;
    expect(screen.getByText(T.refundRow(owed.contentCode, money(70_000), money(50_000)))).toBeTruthy();
  });

  it("matches a chosen transfer to a chosen QR after a confirming tap, then reads the list again", async () => {
    const matchTransfer = mock.fn(async () => ok({ ...INTENT, status: "paid", receivedAmount: 35_000, version: 2 }));
    const { listUnmatched } = await openTransfers({ matchTransfer });
    choose(TRANSFER.id);
    choose(INTENT.id);
    fireEvent.click(screen.getByRole("button", { name: T.match }));
    const dialog = screen.getByRole("alertdialog", { name: T.matchTitle(vndText(35_000), INTENT.contentCode) });
    expect(matchTransfer).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: T.match }));
    await screen.findByText(T.matched(INTENT.contentCode));
    expect(matchTransfer).toHaveBeenCalledWith(TRANSFER.id, INTENT.id);
    await waitFor(() => expect(listUnmatched).toHaveBeenCalledTimes(2));
  });

  it("keeps the confirmation open with a clear reason when the QR's order cannot take the money", async () => {
    await openTransfers({ matchTransfer: async () => refused(409, "API_PAYMENT_ORDER_NOT_PAYABLE") });
    choose(TRANSFER.id);
    choose(INTENT.id);
    fireEvent.click(screen.getByRole("button", { name: T.match }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: T.match }));
    const alert = await within(screen.getByRole("alertdialog")).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_PAYMENT_ORDER_NOT_PAYABLE);
    expect(alert.textContent).toContain("cần hoàn lại cho khách");
  });

  it("asks for both a transfer and a QR before anything is sent", async () => {
    const matchTransfer = mock.fn();
    await openTransfers({ matchTransfer });
    choose(TRANSFER.id);
    fireEvent.click(screen.getByRole("button", { name: T.match }));
    expect((await screen.findByRole("alert")).textContent).toBe(T.chooseBoth);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(matchTransfer).not.toHaveBeenCalled();
  });

  it("lets a role without manage_settings see the lists but not match", async () => {
    const keys = OWNER.permissionKeys.filter((key) => key !== "manage_settings");
    await openTransfers({ me: async () => ok({ ...OWNER, permissionKeys: keys }) });
    expect(screen.getByText(T.needsKey)).toBeTruthy();
    expect(screen.queryByRole("button", { name: T.match })).toBeNull();
  });

  it("explains a role without view_reports instead of empty lists", async () => {
    await renderSignedIn(<TransfersScreen />, { listUnmatched: async () => refused(403, "API_PERMISSION_DENIED") });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
  });
});
