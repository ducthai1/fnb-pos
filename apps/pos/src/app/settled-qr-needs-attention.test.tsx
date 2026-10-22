import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  bankSettles,
  money,
  pushedOf,
  qrCafeServer,
  tap,
  twoCoffeesOnQr,
} from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const SETTLED_QR = "SYNC_ORDER_HAS_SETTLED_QR";
const entryWith = (code: string) => document.querySelector(`[data-rejected-code="${code}"]`);

/**
 * The cashier took the QR down just as the customer paid it, then took cash: the server
 * keeps the QR paid and refuses the cash, so the order is still open with the bank's money.
 * Left on the screen that says the sale is done.
 */
async function cashTakenOverAPaidQr(server: ReturnType<typeof qrCafeServer>) {
  await signedInTill(server);
  const paid = await twoCoffeesOnQr(server);
  server.state.refuseTypes.set("payment.cancel_intent", "DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION");
  tap(text.qr.cancel);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  await waitFor(() => expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1));
  bankSettles(server, "paid", 58_000);
  server.state.refuseTypes.set("order.pay", SETTLED_QR);
  tap(text.checkout.payment.quickCash(money(100_000)));
  tap(text.checkout.payment.finish);
  await screen.findByRole("heading", { name: text.checkout.done.title });
  await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
  server.state.refuseTypes.delete("order.pay");
  return paid;
}

const openNeedsAttention = async () => {
  fireEvent.click(await screen.findByRole("link", { name: text.sync.needsAttention(2) }));
  await screen.findByRole("heading", { name: text.needsAttention.title });
};

async function cashRefusedOverAPaidQr() {
  const server = qrCafeServer();
  const paid = await cashTakenOverAPaidQr(server);
  await openNeedsAttention();
  return { server, paid };
}

describe("an order the server would not take cash for, because its QR was paid", () => {
  it("explains it and closes the order with the paid QR from the needs-attention list", async () => {
    const { server, paid } = await cashRefusedOverAPaidQr();
    const entry = entryWith(SETTLED_QR);
    expect(entry?.textContent).toContain(text.errors[SETTLED_QR]);
    const shift = pushedOf(server, "shift.open")[0]?.payload;
    fireEvent.click(await screen.findByRole("button", { name: text.qr.closeWithSettledQr }));
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(2));
    expect(pushedOf(server, "order.pay")[1]?.payload).toEqual({
      orderId: pushedOf(server, "order.pay")[0]?.payload.orderId,
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: paid.id }],
      expectedAmountDue: 58_000,
      shiftId: shift?.shiftId,
    });
    // Closed: the order no longer waits on its QR, so the button goes.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: text.qr.closeWithSettledQr })).toBeNull(),
    );
  });

  it("offers no such close on a refusal about something else", async () => {
    await cashRefusedOverAPaidQr();
    const other = entryWith("DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION");
    expect(other?.textContent).toContain(text.errors.DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION);
    expect(other?.querySelector("button")).toBeNull();
    expect(await screen.findAllByRole("button", { name: text.qr.closeWithSettledQr })).toHaveLength(
      1,
    );
  });

  it("opens the shift first on a till that has none open, then closes the order into it", async () => {
    const server = qrCafeServer();
    const paid = await cashTakenOverAPaidQr(server);
    // The shift ends before anyone deals with the order: its drawer holds the empty float.
    tap(text.checkout.done.nextOrder);
    fireEvent.click(await screen.findByRole("button", { name: text.closeShift.open }));
    await screen.findByRole("heading", { name: text.closeShift.title });
    tap(text.closeShift.confirm);
    fireEvent.click(await screen.findByRole("button", { name: text.closeShift.openNext }));
    await screen.findByRole("heading", { name: text.checkout.openShift.title });
    await openNeedsAttention();

    fireEvent.click(await screen.findByRole("button", { name: text.qr.openShiftToClose }));
    await screen.findByText(text.needsAttention.openShiftFirst);
    expect(pushedOf(server, "order.pay")).toHaveLength(1);
    tap(text.checkout.openShift.open);
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(2));
    const opened = pushedOf(server, "shift.open")[1];
    expect(pushedOf(server, "order.pay")[1]?.payload).toMatchObject({
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: paid.id }],
      shiftId: opened?.payload.shiftId,
    });
    // Opened before the payment went: the server takes no payment outside a shift.
    const sent = server.state.pushed.map((command) => command.commandId);
    expect(sent.indexOf(opened?.commandId ?? "")).toBeLessThan(
      sent.indexOf(pushedOf(server, "order.pay")[1]?.commandId ?? ""),
    );
    await screen.findByRole("heading", { name: text.needsAttention.title });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: text.qr.openShiftToClose })).toBeNull(),
    );
  });
});
