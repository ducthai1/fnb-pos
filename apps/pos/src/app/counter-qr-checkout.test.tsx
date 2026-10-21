import { parseVietQrPayload } from "@fnb/domain/payment";
import { vnd } from "@fnb/domain";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  SHOP_ACCOUNT,
  bankSettles,
  money,
  pushedOf,
  qrCafeServer,
  qrPhaseShown,
  tap,
  twoCoffeesOnQr,
} from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const Q = text.qr;
const shownData = (attribute: string) =>
  document.querySelector(`[data-${attribute}]`)?.getAttribute(`data-${attribute}`);

describe("paying by VietQR at the counter", () => {
  it("shows a QR a bank app reads as the order's total into the shop's account, with its code", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    const intent = await twoCoffeesOnQr(server);
    const create = pushedOf(server, "payment.create_intent")[0]?.payload;
    expect(create).toEqual({
      intentId: intent.id,
      orderId: expect.any(String),
      amount: 58_000,
      contentCode: expect.stringMatching(/^FNB[0-9A-HJKMNP-TV-Z]{8}$/),
    });
    // The draft the server prices is saved before the QR asking for its total.
    const types = server.state.pushed.map((command) => command.type);
    expect(types.indexOf("payment.create_intent")).toBeGreaterThan(
      types.lastIndexOf("order.save_draft"),
    );
    const read = parseVietQrPayload(shownData("qr-text") ?? "");
    expect(read).toMatchObject({
      initiation: "dynamic",
      bankBin: SHOP_ACCOUNT.bankBin,
      accountNumber: SHOP_ACCOUNT.accountNumber,
      amount: vnd(58_000),
      content: create?.contentCode,
    });
    expect(shownData("qr-content")).toBe(create?.contentCode);
    expect(screen.getByText(SHOP_ACCOUNT.accountName)).toBeTruthy();
  });

  it("counts down to the expiry the server decided, not the till's own guess", async () => {
    const server = qrCafeServer();
    server.qr.lifetimeMs = 10 * 60_000;
    await signedInTill(server);
    await twoCoffeesOnQr(server);
    await waitFor(() => expect(Number(shownData("qr-seconds-left"))).toBeLessThanOrEqual(600));
    expect(Number(shownData("qr-seconds-left"))).toBeGreaterThan(590);
  });

  it("closes the order by itself once the bank's notice paid the QR exactly", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    const intent = await twoCoffeesOnQr(server);
    bankSettles(server, "paid", 58_000);
    await screen.findByRole("heading", { name: text.checkout.done.title });
    await waitFor(() => expect(pushedOf(server, "order.pay")).toHaveLength(1));
    expect(pushedOf(server, "order.pay")[0]?.payload).toMatchObject({
      payments: [{ method: "qr_transfer", amount: 58_000, paymentIntentId: intent.id }],
      expectedAmountDue: 58_000,
    });
    expect(pushedOf(server, "payment.cancel_intent")).toEqual([]);
  });

  it("takes the QR down when the cashier cancels it, and goes back to taking money", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    const intent = await twoCoffeesOnQr(server);
    tap(Q.cancel);
    // Back on the cash card of the drawer, the QR panel gone.
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    await waitFor(() => expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1));
    expect(pushedOf(server, "payment.cancel_intent")[0]?.payload).toEqual({ intentId: intent.id });
    expect(pushedOf(server, "order.pay")).toEqual([]);
  });

  it.each([
    ["short", "partial", 50_000, Q.phases.short(money(8_000))],
    ["over", "overpaid", 60_000, Q.phases.over(money(2_000))],
  ])(
    "says the customer paid %s by how much, and leaves the order open for the counter",
    async (phase, status, received, sentence) => {
      const server = qrCafeServer();
      await signedInTill(server);
      await twoCoffeesOnQr(server);
      bankSettles(server, status, received);
      await waitFor(() => expect(qrPhaseShown()).toBe(phase));
      expect(screen.getByRole("status").textContent).toBe(sentence);
      const pulls = server.state.calls.pulls;
      await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(pulls + 2));
      expect(pushedOf(server, "order.pay")).toEqual([]);
      tap(Q.otherMethod);
      // Back on the cash card of the drawer, the QR panel gone.
      await screen.findByLabelText(text.checkout.payment.cashTyped);
      // The bank's money is matched for good: nothing to take down, a person settles it.
      expect(pushedOf(server, "payment.cancel_intent")).toEqual([]);
    },
  );
});
