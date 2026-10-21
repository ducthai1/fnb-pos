import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  bankSettles,
  pushedOf,
  qrCafeServer,
  qrPhaseShown,
  tap,
  twoCoffeesOnQr,
} from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const Q = text.qr;
const SETTLED_QR = "SYNC_ORDER_HAS_SETTLED_QR";

describe("a VietQR that runs out, is withdrawn or is refused", () => {
  it("offers a new QR once the server's expiry passed, taking the old one down first", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    // The till guesses 15 minutes; the server answers that the QR is already out of time.
    server.qr.lifetimeMs = -1_000;
    const old = await twoCoffeesOnQr(server, "expired");
    expect(screen.getByRole("status").textContent).toBe(Q.phases.expired);
    expect(document.querySelector("[data-qr-text]")).toBeNull();
    server.qr.lifetimeMs = 15 * 60_000;
    tap(Q.renew);
    await waitFor(() => expect(pushedOf(server, "payment.create_intent")).toHaveLength(2));
    await waitFor(() => expect(qrPhaseShown()).toBe("waiting"));
    const types = server.state.pushed.map((command) => command.type);
    expect(pushedOf(server, "payment.cancel_intent").map((c) => c.payload)).toEqual([
      { intentId: old.id },
    ]);
    expect(types.indexOf("payment.cancel_intent")).toBeLessThan(
      types.lastIndexOf("payment.create_intent"),
    );
    const [first, second] = pushedOf(server, "payment.create_intent").map((c) => c.payload);
    expect(second?.intentId).not.toBe(first?.intentId);
    expect(second?.contentCode).not.toBe(first?.contentCode);
  });

  it("warns of money that came after the expiry, and draws a new QR without a cancel", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    await twoCoffeesOnQr(server);
    bankSettles(server, "expired", null);
    await waitFor(() => expect(qrPhaseShown()).toBe("expired"));
    expect(screen.getByRole("status").textContent).toBe(Q.phases.expiredLate);
    tap(Q.renew);
    await waitFor(() => expect(pushedOf(server, "payment.create_intent")).toHaveLength(2));
    // An expired QR cannot be withdrawn; the server would refuse it.
    expect(pushedOf(server, "payment.cancel_intent")).toEqual([]);
  });

  it("says when the server took the QR down, and lets the cashier take money another way", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    await twoCoffeesOnQr(server);
    bankSettles(server, "cancelled", null);
    await waitFor(() => expect(qrPhaseShown()).toBe("withdrawn"));
    expect(screen.getByRole("status").textContent).toBe(Q.phases.withdrawn);
    tap(Q.otherMethod);
    // Back on the cash card of the drawer, the QR panel gone.
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    expect(pushedOf(server, "payment.cancel_intent")).toEqual([]);
  });

  it("closes the order with the QR the bank paid when the server refuses a second one", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    const paid = await twoCoffeesOnQr(server);
    // The cashier takes the QR down just as the customer pays it: the server keeps it paid.
    server.state.refuseTypes.set(
      "payment.cancel_intent",
      "DOMAIN_PAYMENT_INVALID_INTENT_TRANSITION",
    );
    tap(Q.cancel);
    // Back on the cash card of the drawer, the QR panel gone.
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    await waitFor(() => expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1));
    bankSettles(server, "paid", 58_000);
    const pulls = server.state.calls.pulls;
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(pulls + 1));

    server.state.refuseTypes.set("payment.create_intent", SETTLED_QR);
    tap(Q.title);
    await waitFor(() => expect(qrPhaseShown()).toBe("refused"));
    expect(screen.getByRole("status").textContent).toContain(text.errors[SETTLED_QR]);
    expect(pushedOf(server, "order.pay")).toEqual([]);
    tap(Q.closeWithSettledQr);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
    expect(pushedOf(server, "order.pay")[0]?.payload).toMatchObject({
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: paid.id }],
    });
  });

  it("does not offer to close with a QR when the refusal is about something else", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    server.state.refuseTypes.set("payment.create_intent", "SYNC_PAYMENT_CONTENT_CODE_TAKEN");
    await twoCoffeesOnQr(server, "refused");
    expect(screen.getByRole("status").textContent).toContain(
      text.errors.SYNC_PAYMENT_CONTENT_CODE_TAKEN,
    );
    expect(screen.queryByRole("button", { name: Q.closeWithSettledQr })).toBeNull();
    server.state.refuseTypes.clear();
    tap(Q.renew);
    await waitFor(() => expect(qrPhaseShown()).toBe("waiting"));
  });
});
